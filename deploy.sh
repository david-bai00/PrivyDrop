#!/bin/bash

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_SCRIPTS_DIR="$SCRIPT_DIR/docker/scripts"

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

# 显示帮助信息
show_help() {
    cat << EOF
PrivyDrop Docker 一键部署脚本

用法: $0 [选项]

选项:
  --domain DOMAIN     指定域名 (用于HTTPS部署)
  --mode MODE         部署模式: basic|public|full|private
                      basic/private: 内网HTTP部署 (默认，private 将跳过网络检测)
                      public: 公网HTTP部署 + TURN服务器
                      full: 完整HTTPS部署 + TURN服务器
  --with-nginx        启用Nginx反向代理
  --with-turn         启用TURN服务器
  --clean             清理现有容器和数据
  --help              显示帮助信息

示例:
  $0                                    # 基础部署
  $0 --mode public --with-turn          # 公网部署 + TURN服务器
  $0 --domain example.com --mode full   # 完整HTTPS部署
  $0 --clean                            # 清理部署

EOF
}

# 解析命令行参数
parse_arguments() {
    DOMAIN_NAME=""
    DEPLOYMENT_MODE=""
    WITH_NGINX=false
    WITH_TURN=false
    CLEAN_MODE=false
    
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
            --clean)
                CLEAN_MODE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 导出变量供其他脚本使用
    export DOMAIN_NAME
    export DEPLOYMENT_MODE
    export WITH_NGINX
    export WITH_TURN
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v openssl &> /dev/null; then
        missing_deps+=("openssl")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "缺少依赖: ${missing_deps[*]}"
        echo ""
        echo "请安装缺少的依赖:"
        for dep in "${missing_deps[@]}"; do
            case $dep in
                docker)
                    echo "  Docker: https://docs.docker.com/get-docker/"
                    ;;
                docker-compose)
                    echo "  Docker Compose: https://docs.docker.com/compose/install/"
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
    
    log_success "依赖检查通过"
}

# 清理现有部署
clean_deployment() {
    if [[ "$CLEAN_MODE" == "true" ]]; then
        log_warning "清理现有部署..."
        
        # 停止并删除容器
        if [[ -f "docker-compose.yml" ]]; then
            docker-compose down -v --remove-orphans 2>/dev/null || true
        fi
        
        # 删除镜像
        docker images | grep privydrop | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
        
        # 清理配置文件
        rm -rf docker/nginx/conf.d/*.conf docker/ssl/* logs/* .env 2>/dev/null || true
        
        log_success "清理完成"
        
        if [[ $# -eq 1 ]]; then  # 如果只有--clean参数
            exit 0
        fi
    fi
}

# 环境检测和配置生成
setup_environment() {
    log_info "设置环境..."
    
    # 确保脚本可执行
    chmod +x "$DOCKER_SCRIPTS_DIR"/*.sh 2>/dev/null || true
    
    # 运行环境检测
    local detect_args=""
    [[ -n "$DOMAIN_NAME" ]] && detect_args="--domain $DOMAIN_NAME"
    [[ -n "$DEPLOYMENT_MODE" ]] && detect_args="$detect_args --mode $DEPLOYMENT_MODE"
    
    if ! bash "$DOCKER_SCRIPTS_DIR/detect-environment.sh" $detect_args; then
        log_error "环境检测失败"
        exit 1
    fi
    
    # 生成配置文件
    if ! bash "$DOCKER_SCRIPTS_DIR/generate-config.sh" $detect_args; then
        log_error "配置生成失败"
        exit 1
    fi
    
    log_success "环境设置完成"
}

# 构建和启动服务
deploy_services() {
    log_info "构建和启动服务..."
    
    # 停止现有服务
    if docker-compose ps | grep -q "Up"; then
        log_info "停止现有服务..."
        docker-compose down
    fi
    
    # 确定启用的服务
    local profiles=""
    if [[ "$WITH_NGINX" == "true" ]]; then
        profiles="$profiles --profile nginx"
    fi
    if [[ "$WITH_TURN" == "true" ]]; then
        profiles="$profiles --profile turn"
    fi
    
    # 构建镜像
    log_info "构建Docker镜像..."
    docker-compose build --parallel
    
    # 启动服务
    log_info "启动服务..."
    docker-compose up -d $profiles
    
    log_success "服务启动完成"
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    local max_attempts=60
    local attempt=0
    local services_ready=false
    
    while [[ $attempt -lt $max_attempts ]]; do
        local backend_ready=false
        local frontend_ready=false
        
        # 检查后端健康状态
        if curl -f http://localhost:3001/health &> /dev/null; then
            backend_ready=true
        fi
        
        # 检查前端健康状态
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
        log_success "所有服务已就绪"
        return 0
    else
        log_error "服务启动超时"
        log_info "查看服务状态: docker-compose ps"
        log_info "查看服务日志: docker-compose logs -f"
        return 1
    fi
}

# 运行部署后检查
post_deployment_checks() {
    log_info "运行部署后检查..."
    
    # 检查容器状态
    log_info "检查容器状态..."
    docker-compose ps
    
    # 运行健康检查测试
    if [[ -f "test-health-apis.sh" ]]; then
        log_info "运行健康检查测试..."
        if bash test-health-apis.sh; then
            log_success "健康检查测试通过"
        else
            log_warning "健康检查测试失败，但服务可能仍然正常"
        fi
    fi
    
    log_success "部署后检查完成"
}

# 显示部署结果
show_deployment_info() {
    echo ""
    echo -e "${GREEN}🎉 PrivyDrop 部署完成！${NC}"
    echo ""
    
    # 读取配置信息
    local local_ip=""
    local frontend_port=""
    local backend_port=""
    
    if [[ -f ".env" ]]; then
        local_ip=$(grep "LOCAL_IP=" .env | cut -d'=' -f2)
        frontend_port=$(grep "FRONTEND_PORT=" .env | cut -d'=' -f2)
        backend_port=$(grep "BACKEND_PORT=" .env | cut -d'=' -f2)
    fi
    
    echo -e "${BLUE}📋 访问信息：${NC}"
    echo "   前端应用: http://localhost:${frontend_port:-3002}"
    echo "   后端API: http://localhost:${backend_port:-3001}"
    
    if [[ -n "$local_ip" ]] && [[ "$local_ip" != "127.0.0.1" ]]; then
        echo ""
        echo -e "${BLUE}🌐 局域网访问：${NC}"
        echo "   前端应用: http://$local_ip:${frontend_port:-3002}"
        echo "   后端API: http://$local_ip:${backend_port:-3001}"
    fi
    
    if [[ "$WITH_NGINX" == "true" ]]; then
        echo ""
        echo -e "${BLUE}🔀 Nginx代理：${NC}"
        echo "   HTTP: http://localhost"
        [[ -f "docker/ssl/server-cert.pem" ]] && echo "   HTTPS: https://localhost"
    fi
    
    echo ""
    echo -e "${BLUE}🔧 管理命令：${NC}"
    echo "   查看状态: docker-compose ps"
    echo "   查看日志: docker-compose logs -f [服务名]"
    echo "   重启服务: docker-compose restart [服务名]"
    echo "   停止服务: docker-compose down"
    echo "   完全清理: $0 --clean"
    
    if [[ -f "docker/ssl/ca-cert.pem" ]]; then
        echo ""
        echo -e "${BLUE}🔒 SSL证书：${NC}"
        echo "   CA证书: docker/ssl/ca-cert.pem"
        echo "   要信任HTTPS连接，请将CA证书导入浏览器"
    fi
    
    if [[ "$WITH_TURN" == "true" ]]; then
        local turn_username=""
        local turn_realm=""
        if [[ -f ".env" ]]; then
            turn_username=$(grep "TURN_USERNAME=" .env | cut -d'=' -f2)
            turn_realm=$(grep "TURN_REALM=" .env | cut -d'=' -f2)
        fi
        
        echo ""
        echo -e "${BLUE}🔄 TURN服务器：${NC}"
        echo "   STUN: stun:$local_ip:3478"
        echo "   TURN: turn:$local_ip:3478"
        echo "   用户名: ${turn_username:-privydrop}"
        echo "   密码: (保存在.env文件中)"
    fi
    
    echo ""
    echo -e "${YELLOW}💡 提示：${NC}"
    echo "   - 首次启动可能需要几分钟来下载和构建镜像"
    echo "   - 如遇问题，请查看日志: docker-compose logs -f"
    echo "   - 更多帮助: $0 --help"
    echo ""
}

# 主函数
main() {
    echo -e "${BLUE}=== PrivyDrop Docker 一键部署 ===${NC}"
    echo ""
    
    # 解析命令行参数
    parse_arguments "$@"
    
    # 检查依赖
    check_dependencies
    echo ""
    
    # 清理模式
    clean_deployment
    
    # 环境设置
    setup_environment
    echo ""
    
    # 部署服务
    deploy_services
    echo ""
    
    # 等待服务就绪
    if wait_for_services; then
        echo ""
        post_deployment_checks
        show_deployment_info
    else
        log_error "部署失败，请检查日志: docker-compose logs"
        exit 1
    fi
}

# 捕获中断信号
trap 'log_warning "部署被中断"; exit 1' INT TERM

# 运行主函数
main "$@"
