#!/bin/bash

set -e  # Exit immediately on error

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_SCRIPTS_DIR="$SCRIPT_DIR/docker/scripts"

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

# Show help
show_help() {
    cat << EOF
PrivyDrop Docker Deployment Script

Usage: $0 [options]

Options:
  --domain DOMAIN     Specify domain (for HTTPS deployments)
  --mode MODE         Deployment mode: basic|public|full|private
                      basic/private: Intranet HTTP (default; private skips network detection)
                      public: Public HTTP + TURN server
                      full:   Full HTTPS + TURN server
  --with-nginx        Enable Nginx reverse proxy
  --with-turn         Enable TURN server
  --with-sni443       Enable 443 SNI routing (enabled by default in full mode)
  --le-email EMAIL    Email for Let's Encrypt (recommended in full mode)
  --clean             Clean existing containers and data
  --help              Show help

Examples:
  $0                                    # Basic deployment
  $0 --mode public --with-turn          # Public deployment + TURN server
  $0 --domain example.com --mode full   # Full HTTPS deployment
  $0 --clean                            # Clean deployment

Requirements:
  - Docker Engine and Docker Compose V2 (command `docker compose`)

EOF
}

# Parse command-line arguments
parse_arguments() {
    DOMAIN_NAME=""
    DEPLOYMENT_MODE=""
    WITH_NGINX=false
    WITH_TURN=false
    CLEAN_MODE=false
    LE_EMAIL=""
    WITH_SNI443=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            --mode)
                DEPLOYMENT_MODE="$2"
                shift 2
                ;;
            --with-nginx)
                WITH_NGINX=true
                shift
                ;;
            --with-turn)
                WITH_TURN=true
                shift
                ;;
            --with-sni443)
                WITH_SNI443=true
                shift
                ;;
            --le-email)
                LE_EMAIL="$2"
                shift 2
                ;;
            --clean)
                CLEAN_MODE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Export variables for other scripts
    export DOMAIN_NAME
    export DEPLOYMENT_MODE
    export WITH_NGINX
    export WITH_TURN
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! docker compose version &> /dev/null; then
        missing_deps+=("docker compose (V2)")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v openssl &> /dev/null; then
        missing_deps+=("openssl")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        echo ""
        echo "Please install the missing dependencies:"
        for dep in "${missing_deps[@]}"; do
            case $dep in
                docker)
                    echo "  Docker: https://docs.docker.com/get-docker/"
                    ;;
                "docker compose (V2)")
                    echo "  Docker Compose V2 plugin: https://docs.docker.com/compose/install/"
                    ;;
                curl)
                    echo "  curl: sudo apt-get install curl (Ubuntu/Debian)"
                    ;;
                openssl)
                    echo "  openssl: sudo apt-get install openssl (Ubuntu/Debian)"
                    ;;
            esac
        done
        exit 1
    fi
    
    log_success "Dependency checks passed"
}

# Install and prepare Let's Encrypt (certbot)
ensure_certbot() {
    if command -v certbot >/dev/null 2>&1; then
        return 0
    fi
    log_info "Installing certbot (requires sudo)..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y certbot
    else
        log_error "apt-get not found. Please install certbot manually or run on a supported system"
        exit 1
    fi
}

# Write certbot deploy hook: copy certs and hot-reload services after renewal
install_certbot_deploy_hook() {
    local repo_dir="$SCRIPT_DIR"
    local hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
    local hook_file="$hook_dir/privydrop-reload.sh"
    local compose_file="$repo_dir/docker-compose.yml"

    sudo mkdir -p "$hook_dir"
    sudo bash -c "cat > '$hook_file'" << EOF
#!/bin/bash
set -e
REPO_DIR="$repo_dir"
COMPOSE_FILE="$compose_file"

# RENEWED_LINEAGE is provided by certbot and points to live/<domain>
if [[ -z "\$RENEWED_LINEAGE" ]]; then
  exit 0
fi

cp "\$RENEWED_LINEAGE/fullchain.pem" "\$REPO_DIR/docker/ssl/server-cert.pem"
cp "\$RENEWED_LINEAGE/privkey.pem" "\$REPO_DIR/docker/ssl/server-key.pem"
chmod 600 "\$REPO_DIR/docker/ssl/server-key.pem" || true

# Hot-reload nginx; restart if it fails
docker compose -f "\$COMPOSE_FILE" exec -T nginx nginx -s reload 2>/dev/null || \
docker compose -f "\$COMPOSE_FILE" restart nginx || true

# Prefer sending HUP to coturn; restart if needed (ignore if disabled)
docker compose -f "\$COMPOSE_FILE" exec -T coturn sh -c 'kill -HUP 1' 2>/dev/null || \
docker compose -f "\$COMPOSE_FILE" restart coturn || true
EOF
    sudo chmod +x "$hook_file"

    # Attempt to enable systemd timer
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl enable --now certbot.timer 2>/dev/null || true
    fi
}

# Issue via webroot and enable 443 config
provision_letsencrypt_cert() {
    # Only in full mode with nginx enabled and domain set
    if [[ "$DEPLOYMENT_MODE" != "full" || "$WITH_NGINX" != "true" ]]; then
        return 0
    fi
    if [[ -z "$DOMAIN_NAME" ]]; then
        log_warning "Full mode without --domain; skipping Let's Encrypt"
        return 0
    fi
    if [[ -z "$LE_EMAIL" ]]; then
        log_warning "No --le-email specified; using --register-unsafely-without-email"
    fi

    ensure_certbot
    install_certbot_deploy_hook

    mkdir -p docker/letsencrypt-www docker/ssl

    # If certificates already exist (including -0001 lineage), skip issuance
    if [[ -f "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" ]] || ls -1d /etc/letsencrypt/live/${DOMAIN_NAME}* >/dev/null 2>&1; then
        log_info "Detected existing certificates/lineage; skipping initial issuance"
    else
        log_info "Issuing Let's Encrypt certificate via webroot..."
        local email_args="--email $LE_EMAIL"
        if [[ -z "$LE_EMAIL" ]]; then
            email_args="--register-unsafely-without-email"
        fi
        # Requires port 80 reachable and nginx running
        sudo certbot certonly --webroot -w "$(pwd)/docker/letsencrypt-www" \
            -d "$DOMAIN_NAME" -d "turn.$DOMAIN_NAME" \
            $email_args --agree-tos --non-interactive || {
              log_error "Certificate issuance failed; please check certbot output"
              return 1
            }
    fi

    # Resolve lineage directory (supports -0001/-0002 suffixes) and copy to docker/ssl
    local lineage_dir
    lineage_dir=$(readlink -f "/etc/letsencrypt/live/$DOMAIN_NAME" 2>/dev/null || true)
    if [[ -z "$lineage_dir" || ! -d "$lineage_dir" ]]; then
        lineage_dir=$(ls -1d /etc/letsencrypt/live/${DOMAIN_NAME}* 2>/dev/null | sort | tail -1)
    fi
    if [[ -z "$lineage_dir" || ! -f "$lineage_dir/fullchain.pem" ]]; then
        log_error "No valid certificate lineage directory found. Check /etc/letsencrypt/live/${DOMAIN_NAME}*"
        return 1
    fi

    sudo cp "$lineage_dir/fullchain.pem" docker/ssl/server-cert.pem
    sudo cp "$lineage_dir/privkey.pem" docker/ssl/server-key.pem
    sudo chmod 600 docker/ssl/server-key.pem || true

    # Enable 443 config (certs ready): append only; pass SNI flag (enabled by default in full)
    local gen_args=(--mode full --domain "$DOMAIN_NAME" --no-clean --ssl-mode letsencrypt)
    [[ "$WITH_SNI443" == "true" ]] && gen_args+=(--enable-sni443)
    bash "$DOCKER_SCRIPTS_DIR/generate-config.sh" "${gen_args[@]}" || true

    # Hot-reload nginx to enable 443
    docker compose exec -T nginx nginx -s reload || docker compose restart nginx
}

# Clean existing deployment
clean_deployment() {
    if [[ "$CLEAN_MODE" == "true" ]]; then
        log_warning "Cleaning existing deployment..."
        
        # Stop and remove containers
        if [[ -f "docker-compose.yml" ]]; then
            docker compose down -v --remove-orphans 2>/dev/null || true
        fi
        # After graceful stop, force-clean named containers as fallback
        docker stop -t 10 privydrop-nginx privydrop-coturn 2>/dev/null || true
        docker rm -f privydrop-nginx privydrop-coturn 2>/dev/null || true
        # Fallback: remove project network (if present)
        docker network rm privydrop_privydrop-network 2>/dev/null || true
        
        # Remove images
        docker images | grep privydrop | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
        
        # Clean configuration files
        rm -rf docker/nginx/conf.d/*.conf docker/ssl/* logs/* .env 2>/dev/null || true
        
        log_success "Cleanup complete"
        
        if [[ $# -eq 1 ]]; then  # If only --clean parameter
            exit 0
        fi
    fi
}

# Ensure TURN service starts when requested (--with-turn)
ensure_turn_running() {
    if [[ "$WITH_TURN" != "true" ]]; then
        return 0
    fi
    # If not running, start coturn via profile
    if ! docker compose ps | grep -q "privydrop-coturn"; then
        log_info "Starting TURN service (profile: turn)..."
        docker compose --profile turn up -d coturn || true
    fi
}

# Environment detection and configuration generation
setup_environment() {
    log_info "Setting up environment..."
    
    # Ensure scripts are executable
    chmod +x "$DOCKER_SCRIPTS_DIR"/*.sh 2>/dev/null || true
    
    # Run environment detection
    local detect_args=""
    [[ -n "$DOMAIN_NAME" ]] && detect_args="--domain $DOMAIN_NAME"
    [[ -n "$DEPLOYMENT_MODE" ]] && detect_args="$detect_args --mode $DEPLOYMENT_MODE"
    [[ "$WITH_SNI443" == "true" ]] && detect_args="$detect_args --enable-sni443"
    
    if ! bash "$DOCKER_SCRIPTS_DIR/detect-environment.sh" $detect_args; then
        log_error "Environment detection failed"
        exit 1
    fi
    
    # Generate configuration files
    if ! bash "$DOCKER_SCRIPTS_DIR/generate-config.sh" $detect_args; then
        log_error "Configuration generation failed"
        exit 1
    fi
    
    log_success "Environment setup complete"
}

# Build and start services
deploy_services() {
    log_info "Building and starting services..."

    # Ensure log directories exist and relax permissions so containers (coturn/nginx etc.) can write logs
    mkdir -p logs logs/nginx logs/backend logs/frontend logs/coturn 2>/dev/null || true
    chmod 777 -R logs 2>/dev/null || true
    log_info "Log directories prepared and permissions set: ./logs (mode 777)"

    # Stop existing services
    if docker compose ps | grep -q "Up"; then
        log_info "Stopping existing services..."
        docker compose down
    fi
    
    # Determine enabled services (Compose V2 requires --profile before the subcommand)
    local profiles=""
    if [[ "$WITH_NGINX" == "true" ]]; then
        profiles="$profiles --profile nginx"
    fi
    if [[ "$WITH_TURN" == "true" ]]; then
        profiles="$profiles --profile turn"
    fi
    
    # Build images (parallel first, fall back to serial on failure)
    log_info "Building Docker images..."
    set +e
    docker compose build --parallel
    local build_status=$?
    set -e
    if [[ $build_status -ne 0 ]]; then
        log_warning "Parallel build failed; falling back to serial build..."
        docker compose build
    fi
    
    # Start services (--profile must precede up)
    log_info "Starting services..."
    # shellcheck disable=SC2086
    docker compose $profiles up -d
    
    log_success "Services started"
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    local max_attempts=60
    local attempt=0
    local services_ready=false
    
    while [[ $attempt -lt $max_attempts ]]; do
        local backend_ready=false
        local frontend_ready=false
        
        # Check backend health
        if curl -f http://localhost:3001/health &> /dev/null; then
            backend_ready=true
        fi
        
        # Check frontend health
        if curl -f http://localhost:3002/api/health &> /dev/null; then
            frontend_ready=true
        fi
        
        if [[ "$backend_ready" == "true" ]] && [[ "$frontend_ready" == "true" ]]; then
            services_ready=true
            break
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    
    if [[ "$services_ready" == "true" ]]; then
        log_success "All services are ready"
        return 0
    else
        log_error "Service startup timed out"
        log_info "View service status: docker compose ps"
        log_info "View service logs: docker compose logs -f"
        return 1
    fi
}

# Run post-deployment checks
post_deployment_checks() {
    log_info "Running post-deployment checks..."
    
    # Check container status
    log_info "Checking container status..."
    docker compose ps
    
    # In full+nginx, add HTTPS health check (if domain defined)
    if [[ -f ".env" ]]; then
        local dep_mode="$(grep "DEPLOYMENT_MODE=" .env | cut -d'=' -f2)"
        local dname="$(grep "DOMAIN_NAME=" .env | cut -d'=' -f2)"
        if [[ "$dep_mode" == "full" && -n "$dname" ]]; then
            log_info "Test: HTTPS health check https://$dname/api/health"
            if curl -fsS "https://$dname/api/health" >/dev/null; then
                log_success "HTTPS health check passed"
            else
                log_warning "HTTPS health check failed. If the certificate was just issued, wait a bit or run: bash docker/scripts/generate-config.sh --mode full --domain $dname --no-clean && docker compose exec -T nginx nginx -s reload"
            fi
        fi
    fi
    
    # Run health-check tests
    if [[ -f "test-health-apis.sh" ]]; then
        log_info "Running health-check tests..."
        if bash test-health-apis.sh; then
            log_success "Health-check tests passed"
        else
            log_warning "Health-check tests failed, but services may still be working"
        fi
    fi
    
    log_success "Post-deployment checks complete"
}

# Show deployment results
show_deployment_info() {
    echo ""
    echo -e "${GREEN}🎉 PrivyDrop deployment complete!${NC}"
    echo ""
    
    # Read configuration
    local local_ip=""
    local public_ip=""
    local frontend_port=""
    local backend_port=""
    local deployment_mode=""
    local network_mode=""
    local domain_name=""
    local turn_enabled_env=""
    
    if [[ -f ".env" ]]; then
        local_ip=$(grep "LOCAL_IP=" .env | cut -d'=' -f2)
        public_ip=$(grep "PUBLIC_IP=" .env | cut -d'=' -f2)
        frontend_port=$(grep "FRONTEND_PORT=" .env | cut -d'=' -f2)
        backend_port=$(grep "BACKEND_PORT=" .env | cut -d'=' -f2)
        deployment_mode=$(grep "DEPLOYMENT_MODE=" .env | cut -d'=' -f2)
        network_mode=$(grep "NETWORK_MODE=" .env | cut -d'=' -f2)
        domain_name=$(grep "DOMAIN_NAME=" .env | cut -d'=' -f2)
        turn_enabled_env=$(grep "TURN_ENABLED=" .env | cut -d'=' -f2)
    fi
    
    echo -e "${BLUE}📋 Access Info:${NC}"

    # Determine if public scenario (public/full)
    local is_public="false"
    if [[ "$deployment_mode" == "public" || "$deployment_mode" == "full" || "$network_mode" == "public" ]]; then
        is_public="true"
    fi

    if [[ "$is_public" == "true" ]]; then
        # For public scenarios, prefer domain, then public IP
        if [[ -n "$domain_name" ]]; then
            if [[ "$WITH_NGINX" == "true" || "$deployment_mode" == "full" ]]; then
                echo "   Public access: https://$domain_name"
                echo "   API: https://$domain_name"
            else
                echo "   Public access: http://$domain_name:${frontend_port:-3002}"
                echo "   API: http://$domain_name:${backend_port:-3001}"
            fi
        elif [[ -n "$public_ip" ]]; then
            echo "   Public access: http://$public_ip:${frontend_port:-3002}"
            echo "   API: http://$public_ip:${backend_port:-3001}"
        else
            # Fallback: show LAN and localhost if public IP is unavailable
            echo "   Frontend: http://localhost:${frontend_port:-3002}"
            echo "   Backend API: http://localhost:${backend_port:-3001}"
        fi
    else
        # Private/basic: localhost + LAN
        echo "   Frontend: http://localhost:${frontend_port:-3002}"
        echo "   Backend API: http://localhost:${backend_port:-3001}"
        if [[ -n "$local_ip" ]] && [[ "$local_ip" != "127.0.0.1" ]]; then
            echo ""
            echo -e "${BLUE}🌐 LAN Access:${NC}"
            echo "   Frontend: http://$local_ip:${frontend_port:-3002}"
            echo "   Backend API: http://$local_ip:${backend_port:-3001}"
        fi
    fi
    
    if [[ "$WITH_NGINX" == "true" ]]; then
        echo ""
        echo -e "${BLUE}🔀 Nginx Proxy:${NC}"
        if [[ -n "$domain_name" ]]; then
            echo "   HTTP: http://$domain_name"
            [[ -f "docker/ssl/server-cert.pem" ]] && echo "   HTTPS: https://$domain_name"
        elif [[ -n "$public_ip" ]]; then
            echo "   HTTP: http://$public_ip"
            [[ -f "docker/ssl/server-cert.pem" ]] && echo "   HTTPS: https://$public_ip"
        else
            echo "   HTTP: http://localhost"
            [[ -f "docker/ssl/server-cert.pem" ]] && echo "   HTTPS: https://localhost"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}🔧 Management Commands:${NC}"
    echo "   Status: docker compose ps"
    echo "   Logs: docker compose logs -f [service]"
    echo "   Restart: docker compose restart [service]"
    echo "   Stop: docker compose down"
    echo "   Full cleanup: $0 --clean"
    
    if [[ -f "docker/ssl/ca-cert.pem" ]]; then
        echo ""
        echo -e "${BLUE}🔒 SSL Certificates:${NC}"
        echo "   CA certificate: docker/ssl/ca-cert.pem"
        echo "   To trust HTTPS, import the CA certificate into your browser"
    fi
    
    if [[ "$WITH_TURN" == "true" || "$turn_enabled_env" == "true" ]]; then
        local turn_username=""
        local turn_realm=""
        if [[ -f ".env" ]]; then
            turn_username=$(grep "TURN_USERNAME=" .env | cut -d'=' -f2)
            turn_realm=$(grep "TURN_REALM=" .env | cut -d'=' -f2)
        fi
        
        echo ""
        echo -e "${BLUE}🔄 TURN Server:${NC}"
        # Prefer domain for TURN info; otherwise show public IP
        if [[ -n "$domain_name" ]]; then
            echo "   STUN: stun:${domain_name}:3478"
            echo "   TURN (UDP): turn:${domain_name}:3478"
            echo "   TURN (TLS): turns:turn.${domain_name}:443 (if 443 SNI split is configured)"
        elif [[ -n "$public_ip" ]]; then
            echo "   STUN: stun:${public_ip}:3478"
            echo "   TURN: turn:${public_ip}:3478"
        else
            echo "   STUN: stun:${local_ip}:3478"
            echo "   TURN: turn:${local_ip}:3478"
        fi
        echo "   Username: ${turn_username:-privydrop}"
        echo "   Password: (stored in .env)"
    fi
    
    echo ""
    echo -e "${YELLOW}💡 Tips:${NC}"
    echo "   - First run may take several minutes to download and build images"
    echo "   - If issues occur, check logs: docker compose logs -f"
    echo "   - More help: $0 --help"
    echo ""

    # Public scenario: how to test a domain (HTTPS+Nginx)
    if [[ "$is_public" == "true" && -z "$domain_name" ]]; then
        echo -e "${BLUE}🌍 Public domain deployment (HTTPS + Nginx) quick test:${NC}"
        echo "   1) Point your domain A record to ${public_ip:-<server-ip>}"
        echo "      Optional: also point turn.<your-domain> to the same IP for TURN hostname"
        echo "   2) Run: ./deploy.sh --mode full --domain <your-domain> --with-nginx --with-turn"
        echo "   3) Open ports: 80, 443, 3478/udp, 5349/tcp, 5349/udp"
        echo "   4) Verify: https://<your-domain> opens, /api/health returns 200"
        echo "      WebRTC: open chrome://webrtc-internals and check for relay candidates (TURN)"
        echo "   Note: The Docker setup does not enable 443 SNI to coturn by default; enable stream SNI if you need turns:443."
        echo ""
    fi
}

# Main function
main() {
    echo -e "${BLUE}=== PrivyDrop Docker One-Click Deployment ===${NC}"
    echo ""
    
    # Parse command-line arguments
    parse_arguments "$@"
    
    # Check dependencies
    check_dependencies
    echo ""
    
    # Clean mode
    clean_deployment
    # If only cleaning (no other args), exit early to skip env detection
    if [[ "$CLEAN_MODE" == "true" && -z "$DEPLOYMENT_MODE" && "$WITH_NGINX" == "false" && "$WITH_TURN" == "false" && -z "$DOMAIN_NAME" ]]; then
        log_success "Cleanup complete (clean-only mode). Exiting."
        exit 0
    fi
    
    # Environment setup
    setup_environment
    echo ""
    
    # Deploy services
    deploy_services
    echo ""

    # If full + nginx, automatically issue certs and enable 443
    provision_letsencrypt_cert || true
    # Ensure TURN is running (when requested with --with-turn)
    ensure_turn_running || true
    
    # Wait for services to be ready
    if wait_for_services; then
        echo ""
        post_deployment_checks
        show_deployment_info
    else
        log_error "Deployment failed. Please check logs: docker compose logs"
        exit 1
    fi
}

# Trap interrupt signals
trap 'log_warning "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"
