#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 全局变量
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

# 日志函数
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

# 检测网络环境
detect_network_environment() {
    log_info "检测网络环境..."

    resolve_local_ip

    if [[ -z "$LOCAL_IP" ]]; then
        LOCAL_IP="127.0.0.1"
        log_warning "无法自动检测本机IP，使用默认值: $LOCAL_IP"
    fi

    if [[ "$FORCED_MODE" == "private" ]]; then
        NETWORK_MODE="private"
        PUBLIC_IP=""
        log_info "已通过参数指定网络模式: $NETWORK_MODE"
        echo "   本机IP: $LOCAL_IP"
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
                log_warning "检测到测试或保留网段公网IP，按内网环境处理"
            fi
        else
            log_warning "公网连接不稳定，按内网环境处理"
        fi
    fi

    if [[ -z "$FORCED_MODE" ]]; then
        if [[ "$mode_guess" == "public" ]]; then
            echo "   本机IP: $LOCAL_IP"
            echo "   公网IP: $PUBLIC_IP"
            printed_prompt_info="true"
            read -r -p "是否按公网模式继续？(Y/n): " confirm </dev/tty 2>/dev/null || confirm="Y"
            confirm=${confirm:-Y}
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                NETWORK_MODE="public"
            else
                NETWORK_MODE="private"
                PUBLIC_IP=""
                log_warning "按用户选择，已切换为内网模式"
            fi
        else
            NETWORK_MODE="private"
        fi
    else
        NETWORK_MODE="$FORCED_MODE"
        if [[ "$FORCED_MODE" == "public" && -z "$PUBLIC_IP" ]]; then
            log_warning "未能检测到公网IP，仍按公网模式继续，请确认网络配置"
        fi
    fi

    if [[ "$NETWORK_MODE" != "public" ]]; then
        PUBLIC_IP=""
    fi

    if [[ "$FORCED_MODE" == "public" ]]; then
        log_info "已通过参数指定网络模式: $NETWORK_MODE"
    elif [[ "$NETWORK_MODE" == "public" ]]; then
        log_success "检测到公网环境"
    else
        log_success "检测到内网环境"
    fi

    if [[ "$printed_prompt_info" == "false" ]]; then
        echo "   本机IP: $LOCAL_IP"
        if [[ "$NETWORK_MODE" == "public" && -n "$PUBLIC_IP" ]]; then
            echo "   公网IP: $PUBLIC_IP"
        fi
    fi
}

# 检查系统资源
check_system_resources() {
    log_info "检查系统资源..."
    
    local warnings=0
    
    # 检查内存
    if command -v free >/dev/null 2>&1; then
        TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
        if [[ $TOTAL_MEM -lt 512 ]]; then
            log_error "内存不足: ${TOTAL_MEM}MB (建议至少512MB)"
            return 1
        elif [[ $TOTAL_MEM -lt 1024 ]]; then
            log_warning "内存较少: ${TOTAL_MEM}MB (建议至少1GB)"
            warnings=$((warnings + 1))
        else
            log_success "内存充足: ${TOTAL_MEM}MB"
        fi
    else
        log_warning "无法检测内存使用情况"
        warnings=$((warnings + 1))
    fi
    
    # 检查磁盘空间
    DISK_USAGE=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
    if [[ $DISK_USAGE -gt 95 ]]; then
        log_error "磁盘空间不足: ${DISK_USAGE}%已使用"
        return 1
    elif [[ $DISK_USAGE -gt 80 ]]; then
        log_warning "磁盘空间紧张: ${DISK_USAGE}%已使用"
        warnings=$((warnings + 1))
    else
        log_success "磁盘空间充足: ${DISK_USAGE}%已使用"
    fi
    
    # 检查可用磁盘空间
    AVAILABLE_SPACE=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [[ $AVAILABLE_SPACE -lt 2 ]]; then
        log_error "可用磁盘空间不足: ${AVAILABLE_SPACE}GB (建议至少2GB)"
        return 1
    fi
    
    if [[ $warnings -gt 0 ]]; then
        log_warning "系统资源检查通过，但有 $warnings 个警告"
    else
        log_success "系统资源检查通过"
    fi
    
    return 0
}

# 验证Docker环境
verify_docker_installation() {
    log_info "检查Docker环境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装"
        echo "请安装Docker: https://docs.docker.com/get-docker/"
        return 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose未安装"
        echo "请安装Docker Compose: https://docs.docker.com/compose/install/"
        return 1
    fi
    
    # 检查Docker服务状态
    if ! docker info &> /dev/null; then
        log_error "Docker服务未运行"
        echo "请启动Docker服务"
        return 1
    fi
    
    # 检查Docker版本
    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    log_success "Docker版本: $DOCKER_VERSION"
    
    # 检查Docker Compose版本
    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        log_success "Docker Compose版本: $COMPOSE_VERSION"
    else
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "内置")
        log_success "Docker Compose版本: $COMPOSE_VERSION"
    fi
    
    return 0
}

# 检查端口占用
check_port_availability() {
    local ports="$1"
    log_info "检查端口占用..."
    
    local occupied_ports=()
    
    IFS=',' read -ra PORT_ARRAY <<< "$ports"
    for port in "${PORT_ARRAY[@]}"; do
        port=$(echo "$port" | xargs) # 去除空格
        if command -v ss >/dev/null 2>&1; then
            if ss -tuln | grep -q ":$port "; then
                occupied_ports+=("$port")
            fi
        elif command -v netstat >/dev/null 2>&1; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                occupied_ports+=("$port")
            fi
        else
            log_warning "无法检查端口占用情况 (缺少ss和netstat命令)"
            return 0
        fi
    done
    
    if [[ ${#occupied_ports[@]} -gt 0 ]]; then
        log_warning "以下端口已被占用: ${occupied_ports[*]}"
        log_info "可以通过修改 .env 中的端口，或先执行 './deploy.sh --clean' / 'docker-compose down' 清理旧容器"
    else
        log_success "所有端口都可用"
    fi
}

# 检测部署模式
detect_deployment_mode() {
    log_info "确定部署模式..."
    
    if [[ "$NETWORK_MODE" == "public" ]] && [[ -n "$DOMAIN_NAME" ]]; then
        DEPLOYMENT_MODE="full"
        log_success "部署模式: 完整模式 (HTTPS + TURN服务器)"
    elif [[ "$NETWORK_MODE" == "public" ]]; then
        DEPLOYMENT_MODE="public"
        log_success "部署模式: 公网模式 (HTTP + 自签证书)"
    else
        DEPLOYMENT_MODE="basic"
        log_success "部署模式: 基础模式 (内网HTTP)"
    fi
}

# 主函数
main() {
    echo -e "${BLUE}=== PrivyDrop Docker 环境检测 ===${NC}\n"
    
    # 读取命令行参数
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
    
    # 执行检测
    detect_network_environment
    echo ""
    
    if ! check_system_resources; then
        log_error "系统资源检查失败，请解决资源问题后重试"
        exit 1
    fi
    echo ""
    
    if ! verify_docker_installation; then
        log_error "Docker环境检查失败，请安装并启动Docker"
        exit 1
    fi
    echo ""
    
    check_port_availability "80,443,3002,3001,3478,5349,6379"
    echo ""
    
    detect_deployment_mode
    echo ""
    
    log_success "环境检测完成！"
    echo -e "${BLUE}检测结果:${NC}"
    echo "  网络模式: $NETWORK_MODE"
    echo "  本机IP: $LOCAL_IP"
    [[ -n "$PUBLIC_IP" ]] && echo "  公网IP: $PUBLIC_IP"
    echo "  部署模式: $DEPLOYMENT_MODE"
    
    # 导出环境变量供其他脚本使用
    export NETWORK_MODE
    export LOCAL_IP
    export PUBLIC_IP
    export DEPLOYMENT_MODE
    export DOMAIN_NAME
    export LOCAL_IP_OVERRIDE
    
    return 0
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
