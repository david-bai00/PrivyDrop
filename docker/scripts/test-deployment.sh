#!/bin/bash

# PrivyDrop Docker 部署测试脚本
# 用于验证部署的完整性和功能

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试结果统计
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "测试: $test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Docker环境测试
test_docker_environment() {
    echo -e "${BLUE}=== Docker环境测试 ===${NC}"
    
    run_test "Docker已安装" "command -v docker"
    run_test "Docker服务运行中" "docker info"
    run_test "Docker Compose可用" "docker-compose --version || docker compose version"
    
    echo ""
}

# 容器状态测试
test_container_status() {
    echo -e "${BLUE}=== 容器状态测试 ===${NC}"
    
    # 检查容器是否存在和运行
    local containers=("privydrop-redis" "privydrop-backend" "privydrop-frontend")
    
    for container in "${containers[@]}"; do
        run_test "容器 $container 运行中" "docker ps | grep -q $container"
    done
    
    # 检查容器健康状态
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container.*healthy"; then
            log_success "容器 $container 健康状态正常"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_warning "容器 $container 健康状态未知或不健康"
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done
    
    echo ""
}

# 网络连接测试
test_network_connectivity() {
    echo -e "${BLUE}=== 网络连接测试 ===${NC}"
    
    # 测试端口连通性
    local ports=("3000:前端" "3001:后端" "6379:Redis")
    
    for port_info in "${ports[@]}"; do
        local port=$(echo "$port_info" | cut -d':' -f1)
        local service=$(echo "$port_info" | cut -d':' -f2)
        
        run_test "$service 端口 $port 可访问" "nc -z localhost $port"
    done
    
    # 测试容器间网络
    run_test "后端可连接Redis" "docker-compose exec -T backend sh -c 'nc -z redis 6379'"
    run_test "前端可连接后端" "curl -f http://localhost:3001/health"
    
    echo ""
}

# API功能测试
test_api_functionality() {
    echo -e "${BLUE}=== API功能测试 ===${NC}"
    
    # 健康检查API
    run_test "后端健康检查API" "curl -f http://localhost:3001/health"
    run_test "前端健康检查API" "curl -f http://localhost:3000/api/health"
    
    # 后端详细健康检查
    if curl -f http://localhost:3001/health/detailed >/dev/null 2>&1; then
        local redis_status=$(curl -s http://localhost:3001/health/detailed | jq -r '.dependencies.redis.status' 2>/dev/null)
        if [[ "$redis_status" == "connected" ]]; then
            log_success "Redis连接状态正常"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "Redis连接状态异常"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "详细健康检查API不可用"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # 业务API测试
    run_test "获取房间API" "curl -f http://localhost:3001/api/get_room"
    run_test "创建房间API" "curl -f -X POST -H 'Content-Type: application/json' -d '{\"roomId\":\"test123\"}' http://localhost:3001/api/create_room"
    
    echo ""
}

# WebRTC功能测试
test_webrtc_functionality() {
    echo -e "${BLUE}=== WebRTC功能测试 ===${NC}"
    
    # 测试前端页面加载
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        log_success "前端页面可访问"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "前端页面不可访问"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # 测试Socket.IO连接 (简单测试)
    if curl -f http://localhost:3001/socket.io/socket.io.js >/dev/null 2>&1; then
        log_success "Socket.IO客户端脚本可访问"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Socket.IO客户端脚本不可访问"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# 性能测试
test_performance() {
    echo -e "${BLUE}=== 性能测试 ===${NC}"
    
    # 内存使用测试
    local backend_memory=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep privydrop-backend | awk '{print $2}' | cut -d'/' -f1)
    local frontend_memory=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep privydrop-frontend | awk '{print $2}' | cut -d'/' -f1)
    
    if [[ -n "$backend_memory" ]]; then
        log_info "后端内存使用: $backend_memory"
    fi
    
    if [[ -n "$frontend_memory" ]]; then
        log_info "前端内存使用: $frontend_memory"
    fi
    
    # 响应时间测试
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:3001/health)
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "API响应时间正常: ${response_time}s"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "API响应时间较慢: ${response_time}s"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# 安全测试
test_security() {
    echo -e "${BLUE}=== 安全测试 ===${NC}"
    
    # 检查容器用户
    local backend_user=$(docker-compose exec -T backend whoami 2>/dev/null || echo "unknown")
    local frontend_user=$(docker-compose exec -T frontend whoami 2>/dev/null || echo "unknown")
    
    if [[ "$backend_user" != "root" ]]; then
        log_success "后端容器使用非root用户: $backend_user"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "后端容器使用root用户"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [[ "$frontend_user" != "root" ]]; then
        log_success "前端容器使用非root用户: $frontend_user"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "前端容器使用root用户"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # 检查敏感信息泄露
    if curl -s http://localhost:3001/health/detailed | grep -q "password\|secret\|key" >/dev/null 2>&1; then
        log_warning "健康检查API可能泄露敏感信息"
    else
        log_success "健康检查API未泄露敏感信息"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# 日志测试
test_logging() {
    echo -e "${BLUE}=== 日志测试 ===${NC}"
    
    # 检查日志目录
    if [[ -d "logs" ]]; then
        log_success "日志目录存在"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "日志目录不存在"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # 检查日志文件
    local log_files=("logs/backend" "logs/frontend")
    for log_dir in "${log_files[@]}"; do
        if [[ -d "$log_dir" ]]; then
            log_success "日志目录 $log_dir 存在"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_info "日志目录 $log_dir 不存在 (可能正常)"
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done
    
    echo ""
}

# 配置文件测试
test_configuration() {
    echo -e "${BLUE}=== 配置文件测试 ===${NC}"
    
    # 检查环境变量文件
    if [[ -f ".env" ]]; then
        log_success ".env 文件存在"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # 检查关键配置项
        local required_vars=("LOCAL_IP" "CORS_ORIGIN" "NEXT_PUBLIC_API_URL")
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" .env; then
                log_success "配置项 $var 已设置"
                TESTS_PASSED=$((TESTS_PASSED + 1))
            else
                log_error "配置项 $var 未设置"
                TESTS_FAILED=$((TESTS_FAILED + 1))
            fi
            TOTAL_TESTS=$((TOTAL_TESTS + 1))
        done
    else
        log_error ".env 文件不存在"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # 检查Docker Compose文件
    if [[ -f "docker-compose.yml" ]]; then
        log_success "docker-compose.yml 文件存在"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "docker-compose.yml 文件不存在"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# 清理测试
test_cleanup() {
    echo -e "${BLUE}=== 清理功能测试 ===${NC}"
    
    # 测试清理命令是否可用
    if [[ -f "deploy.sh" ]]; then
        log_success "部署脚本存在"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # 测试帮助命令
        if bash deploy.sh --help >/dev/null 2>&1; then
            log_success "部署脚本帮助功能正常"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "部署脚本帮助功能异常"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "部署脚本不存在"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    
    echo ""
}

# 生成测试报告
generate_report() {
    echo -e "${BLUE}=== 测试报告 ===${NC}"
    echo ""
    
    echo "📊 测试统计:"
    echo "   总测试数: $TOTAL_TESTS"
    echo -e "   通过: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "   失败: ${RED}$TESTS_FAILED${NC}"
    
    local success_rate=$((TESTS_PASSED * 100 / TOTAL_TESTS))
    echo "   成功率: $success_rate%"
    
    echo ""
    echo "📋 系统信息:"
    echo "   Docker版本: $(docker --version)"
    echo "   Docker Compose版本: $(docker-compose --version 2>/dev/null || docker compose version 2>/dev/null || echo '未知')"
    echo "   操作系统: $(uname -s) $(uname -r)"
    echo "   测试时间: $(date)"
    
    echo ""
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}🎉 所有测试通过！PrivyDrop 部署成功！${NC}"
        echo ""
        echo "🔗 访问链接:"
        echo "   前端应用: http://localhost:3000"
        echo "   后端API: http://localhost:3001"
        
        # 显示局域网访问地址
        if [[ -f ".env" ]]; then
            local local_ip=$(grep "LOCAL_IP=" .env | cut -d'=' -f2)
            if [[ -n "$local_ip" && "$local_ip" != "127.0.0.1" ]]; then
                echo ""
                echo "🌐 局域网访问:"
                echo "   前端应用: http://$local_ip:3000"
                echo "   后端API: http://$local_ip:3001"
            fi
        fi
        
        return 0
    else
        echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败${NC}"
        echo ""
        echo "🔧 故障排除建议:"
        echo "   1. 查看容器状态: docker-compose ps"
        echo "   2. 查看容器日志: docker-compose logs -f"
        echo "   3. 重新部署: bash deploy.sh"
        echo "   4. 完全清理后重新部署: bash deploy.sh --clean"
        
        return 1
    fi
}

# 主函数
main() {
    echo -e "${BLUE}=== PrivyDrop Docker 部署测试开始 ===${NC}"
    echo ""
    
    # 检查必要工具
    local missing_tools=()
    for tool in curl jq bc nc; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_warning "缺少测试工具: ${missing_tools[*]}"
        log_info "建议安装: sudo apt-get install curl jq bc netcat"
        echo ""
    fi
    
    # 运行所有测试
    test_docker_environment
    test_container_status
    test_network_connectivity
    test_api_functionality
    test_webrtc_functionality
    test_performance
    test_security
    test_logging
    test_configuration
    test_cleanup
    
    # 生成报告
    generate_report
}

# 捕获中断信号
trap 'echo -e "\n${YELLOW}测试被中断${NC}"; exit 1' INT TERM

# 运行主函数
main "$@"