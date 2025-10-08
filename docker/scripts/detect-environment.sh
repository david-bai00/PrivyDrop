#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
NETWORK_MODE=""
LOCAL_IP=""
PUBLIC_IP=""
DEPLOYMENT_MODE="basic"
FORCED_MODE=""
LOCAL_IP_OVERRIDE=""

declare -a IP_CANDIDATES=()
declare -A __SEEN_IPS=()

add_ip_candidate() {
    local ip="$1"
    [[ -z "$ip" ]] && return
    [[ "$ip" == "127."* ]] && return
    [[ "$ip" == "0.0.0.0" ]] && return
    if [[ -z "${__SEEN_IPS[$ip]}" ]]; then
        IP_CANDIDATES+=("$ip")
        __SEEN_IPS[$ip]=1
    fi
}

is_rfc1918_ip() {
    local ip="$1"
    case "$ip" in
        10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_cgnat_ip() {
    local ip="$1"
    case "$ip" in
        100.*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_reserved_benchmark_ip() {
    local ip="$1"
    case "$ip" in
        198.18.*|198.19.*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_link_local_ip() {
    local ip="$1"
    case "$ip" in
        169.254.*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_routable_public_ip() {
    local ip="$1"
    if [[ -z "$ip" ]]; then
        return 1
    fi
    if is_rfc1918_ip "$ip"; then
        return 1
    fi
    if is_cgnat_ip "$ip"; then
        return 1
    fi
    if is_reserved_benchmark_ip "$ip"; then
        return 1
    fi
    case "$ip" in
        127.*|169.254.*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

collect_ip_candidates() {
    IP_CANDIDATES=()
    unset __SEEN_IPS
    declare -A __SEEN_IPS=()

    if command -v hostname >/dev/null 2>&1; then
        local host_ips
        host_ips=$(hostname -I 2>/dev/null || true)
        for ip in $host_ips; do
            add_ip_candidate "$ip"
        done
    fi

    if command -v ip >/dev/null 2>&1; then
        while IFS= read -r ip; do
            add_ip_candidate "$ip"
        done < <(ip -o -4 addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
    fi

    if command -v ifconfig >/dev/null 2>&1; then
        while IFS= read -r ip; do
            add_ip_candidate "$ip"
        done < <(ifconfig 2>/dev/null | awk '/inet / {print $2}' | grep -E '^[0-9]+(\.[0-9]+){3}$')
    fi

    if command -v ip >/dev/null 2>&1; then
        local route_ip
        route_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')
        add_ip_candidate "$route_ip"
    fi

    if [[ ${#IP_CANDIDATES[@]} -eq 0 ]]; then
        local fallback
        fallback=$(hostname -I 2>/dev/null | awk '{print $1}')
        add_ip_candidate "$fallback"
    fi
}

resolve_local_ip() {
    if [[ -n "$LOCAL_IP_OVERRIDE" ]]; then
        LOCAL_IP="$LOCAL_IP_OVERRIDE"
        return
    fi

    collect_ip_candidates

    if [[ ${#IP_CANDIDATES[@]} -eq 0 ]]; then
        LOCAL_IP=""
        return
    fi

    local ip
    for ip in "${IP_CANDIDATES[@]}"; do
        if is_rfc1918_ip "$ip"; then
            LOCAL_IP="$ip"
            return
        fi
    done

    for ip in "${IP_CANDIDATES[@]}"; do
        if is_cgnat_ip "$ip"; then
            LOCAL_IP="$ip"
            return
        fi
    done

    for ip in "${IP_CANDIDATES[@]}"; do
        if is_reserved_benchmark_ip "$ip"; then
            continue
        fi
        if is_link_local_ip "$ip"; then
            continue
        fi
        LOCAL_IP="$ip"
        return
    done

    LOCAL_IP="${IP_CANDIDATES[0]}"
}

# Logging helpers
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Detect network environment
detect_network_environment() {
    log_info "Detecting network environment..."

    resolve_local_ip

    if [[ -z "$LOCAL_IP" ]]; then
        LOCAL_IP="127.0.0.1"
        log_warning "Unable to detect host IP; using default: $LOCAL_IP"
    fi

    if [[ "$FORCED_MODE" == "private" ]]; then
        NETWORK_MODE="private"
        PUBLIC_IP=""
        log_info "Network mode set via parameters: $NETWORK_MODE"
        echo "   Local IP: $LOCAL_IP"
        return 0
    fi

    local mode_guess="private"
    local printed_prompt_info="false"
    PUBLIC_IP=""

    if curl -s --connect-timeout 5 --max-time 10 ifconfig.me > /dev/null 2>&1; then
        PUBLIC_IP=$(curl -s --connect-timeout 5 --max-time 10 ifconfig.me 2>/dev/null || echo "")
        if [[ -n "$PUBLIC_IP" ]]; then
            if is_routable_public_ip "$PUBLIC_IP"; then
                mode_guess="public"
            else
                log_warning "Public IP is test/reserved range; treating as private"
            fi
        else
            log_warning "Public connectivity unstable; treating as private"
        fi
    fi

    if [[ -z "$FORCED_MODE" ]]; then
        if [[ "$mode_guess" == "public" ]]; then
            NETWORK_MODE="public"
        else
            NETWORK_MODE="private"
        fi
    else
        NETWORK_MODE="$FORCED_MODE"
        if [[ "$FORCED_MODE" == "public" && -z "$PUBLIC_IP" ]]; then
            log_warning "Could not detect public IP; continuing as public mode. Please verify network config"
        fi
    fi

    if [[ "$NETWORK_MODE" != "public" ]]; then
        PUBLIC_IP=""
    fi

    if [[ "$FORCED_MODE" == "public" ]]; then
        log_info "Network mode set via parameters: $NETWORK_MODE"
    elif [[ "$NETWORK_MODE" == "public" ]]; then
        log_success "Public network detected"
    else
        log_success "Private network detected"
    fi

    if [[ "$printed_prompt_info" == "false" ]]; then
        echo "   Local IP: $LOCAL_IP"
        if [[ "$NETWORK_MODE" == "public" && -n "$PUBLIC_IP" ]]; then
            echo "   Public IP: $PUBLIC_IP"
        fi
    fi
}

# Check system resources
check_system_resources() {
    log_info "Checking system resources..."
    
    local warnings=0
    
    # Check memory
    if command -v free >/dev/null 2>&1; then
        TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
        if [[ $TOTAL_MEM -lt 512 ]]; then
            log_error "Insufficient memory: ${TOTAL_MEM}MB (512MB+ recommended)"
            return 1
        elif [[ $TOTAL_MEM -lt 1024 ]]; then
            log_warning "Low memory: ${TOTAL_MEM}MB (1GB+ recommended)"
            warnings=$((warnings + 1))
        else
            log_success "Memory OK: ${TOTAL_MEM}MB"
        fi
    else
        log_warning "Unable to read memory usage"
        warnings=$((warnings + 1))
    fi
    
    # Check disk usage
    DISK_USAGE=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
    if [[ $DISK_USAGE -gt 95 ]]; then
        log_error "Insufficient disk space: ${DISK_USAGE}% used"
        return 1
    elif [[ $DISK_USAGE -gt 80 ]]; then
        log_warning "Disk space tight: ${DISK_USAGE}% used"
        warnings=$((warnings + 1))
    else
        log_success "Disk space OK: ${DISK_USAGE}% used"
    fi
    
    # Check available disk space
    AVAILABLE_SPACE=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [[ $AVAILABLE_SPACE -lt 2 ]]; then
        log_error "Not enough free disk space: ${AVAILABLE_SPACE}GB (2GB+ recommended)"
        return 1
    fi
    
    if [[ $warnings -gt 0 ]]; then
        log_warning "System resource check passed with $warnings warning(s)"
    else
        log_success "System resource check passed"
    fi
    
    return 0
}

# Validate Docker environment
verify_docker_installation() {
    log_info "Checking Docker environment..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        echo "Please install Docker: https://docs.docker.com/get-docker/"
        return 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
        return 1
    fi
    
    # Check Docker service status
    if ! docker info &> /dev/null; then
        log_error "Docker service is not running"
        echo "Please start the Docker service"
        return 1
    fi
    
    # Check Docker version
    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    log_success "Docker version: $DOCKER_VERSION"
    
    # Check Docker Compose version
    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        log_success "Docker Compose version: $COMPOSE_VERSION"
    else
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "built-in")
        log_success "Docker Compose version: $COMPOSE_VERSION"
    fi
    
    return 0
}

# Check port usage
check_port_availability() {
    local ports="$1"
    log_info "Checking port usage..."
    
    local occupied_ports=()
    
    IFS=',' read -ra PORT_ARRAY <<< "$ports"
    for port in "${PORT_ARRAY[@]}"; do
        port=$(echo "$port" | xargs) # Trim spaces
        if command -v ss >/dev/null 2>&1; then
            if ss -tuln | grep -q ":$port "; then
                occupied_ports+=("$port")
            fi
        elif command -v netstat >/dev/null 2>&1; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                occupied_ports+=("$port")
            fi
        else
            log_warning "Unable to check port usage (missing ss and netstat)"
            return 0
        fi
    done
    
    if [[ ${#occupied_ports[@]} -gt 0 ]]; then
        log_warning "Ports in use: ${occupied_ports[*]}"
        log_info "Change ports in .env, or run './deploy.sh --clean' / 'docker-compose down' to clean old containers"
    else
        log_success "All ports available"
    fi
}

# Detect deployment mode
detect_deployment_mode() {
    log_info "Determining deployment mode..."
    
    if [[ "$NETWORK_MODE" == "public" ]] && [[ -n "$DOMAIN_NAME" ]]; then
        DEPLOYMENT_MODE="full"
        log_success "Deployment mode: full (HTTPS + TURN server)"
    elif [[ "$NETWORK_MODE" == "public" ]]; then
        DEPLOYMENT_MODE="public"
        log_success "Deployment mode: public (HTTP + TURN)"
    else
        DEPLOYMENT_MODE="basic"
        log_success "Deployment mode: basic (intranet HTTP)"
    fi
}

# Main function
main() {
    echo -e "${BLUE}=== PrivyDrop Docker Environment Check ===${NC}\n"
    
    # Parse command-line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            --mode)
                DEPLOYMENT_MODE="$2"
                case "$2" in
                    private|basic)
                        FORCED_MODE="private"
                        ;;
                    public|full)
                        FORCED_MODE="public"
                        ;;
                    *)
                        FORCED_MODE=""
                        ;;
                esac
                shift 2
                ;;
            --local-ip)
                LOCAL_IP_OVERRIDE="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Run checks
    detect_network_environment
    echo ""
    
    if ! check_system_resources; then
        log_error "System resource check failed; resolve resource issues and retry"
        exit 1
    fi
    echo ""
    
    if ! verify_docker_installation; then
        log_error "Docker environment check failed; please install and start Docker"
        exit 1
    fi
    echo ""
    
    check_port_availability "80,443,3002,3001,3478,5349,6379"
    echo ""
    
    detect_deployment_mode
    echo ""
    
    log_success "Environment check complete!"
    echo -e "${BLUE}Results:${NC}"
    echo "  Network mode: $NETWORK_MODE"
    echo "  Local IP: $LOCAL_IP"
    [[ -n "$PUBLIC_IP" ]] && echo "  Public IP: $PUBLIC_IP"
    echo "  Deployment mode: $DEPLOYMENT_MODE"
    
    # Export env vars for other scripts
    export NETWORK_MODE
    export LOCAL_IP
    export PUBLIC_IP
    export DEPLOYMENT_MODE
    export DOMAIN_NAME
    export LOCAL_IP_OVERRIDE
    
    return 0
}

# If the script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
