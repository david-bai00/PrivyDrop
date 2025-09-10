#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
test_api() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    log_info "测试: $description"
    log_info "URL: $url"
    
    # 发送请求并获取响应
    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        log_error "请求失败 - 无法连接到服务"
        return 1
    fi
    
    # 分离响应体和状态码
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    # 检查HTTP状态码
    if [ "$http_code" -eq "$expected_status" ]; then
        log_success "HTTP状态码正确: $http_code"
    else
        log_error "HTTP状态码错误: 期望 $expected_status, 实际 $http_code"
        return 1
    fi
    
    # 检查JSON格式
    if echo "$response_body" | jq . >/dev/null 2>&1; then
        log_success "响应格式为有效JSON"
        
        # 显示格式化的JSON响应
        echo -e "${BLUE}响应内容:${NC}"
        echo "$response_body" | jq .
        
        # 检查必要字段
        status=$(echo "$response_body" | jq -r '.status // empty')
        service=$(echo "$response_body" | jq -r '.service // empty')
        timestamp=$(echo "$response_body" | jq -r '.timestamp // empty')
        
        if [ -n "$status" ] && [ -n "$service" ] && [ -n "$timestamp" ]; then
            log_success "包含必要字段: status, service, timestamp"
        else
            log_error "缺少必要字段"
            return 1
        fi
        
    else
        log_error "响应不是有效的JSON格式"
        echo "响应内容: $response_body"
        return 1
    fi
    
    return 0
}

# 检查服务是否运行
check_service() {
    local port="$1"
    local service_name="$2"
    
    if nc -z localhost "$port" 2>/dev/null; then
        log_success "$service_name 服务运行中 (端口 $port)"
        return 0
    else
        log_error "$service_name 服务未运行 (端口 $port)"
        return 1
    fi
}

# 等待服务启动
wait_for_service() {
    local port="$1"
    local service_name="$2"
    local max_attempts=30
    local attempt=0
    
    log_info "等待 $service_name 服务启动..."
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost "$port" 2>/dev/null; then
            log_success "$service_name 服务已启动"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    log_error "$service_name 服务启动超时"
    return 1
}

# 主测试函数
main() {
    echo -e "${BLUE}=== PrivyDrop 健康检查API测试 ===${NC}"
    echo ""
    
    # 检查必要工具
    if ! command -v curl &> /dev/null; then
        log_error "curl 未安装，请先安装 curl"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq 未安装，请先安装 jq 用于JSON解析"
        exit 1
    fi
    
    if ! command -v nc &> /dev/null; then
        log_error "netcat 未安装，请先安装 nc 用于端口检查"
        exit 1
    fi
    
    # 检查服务状态
    echo -e "${BLUE}=== 检查服务状态 ===${NC}"
    backend_running=false
    frontend_running=false
    
    if check_service 3001 "后端"; then
        backend_running=true
    fi
    
    if check_service 3000 "前端"; then
        frontend_running=true
    fi
    
    # 如果服务未运行，提供启动提示
    if [ "$backend_running" = false ]; then
        echo ""
        log_warning "后端服务未运行，请先启动后端服务："
        echo "  cd backend && npm run dev"
        echo ""
    fi
    
    if [ "$frontend_running" = false ]; then
        echo ""
        log_warning "前端服务未运行，请先启动前端服务："
        echo "  cd frontend && pnpm dev"
        echo ""
    fi
    
    # 测试后端健康检查API
    if [ "$backend_running" = true ]; then
        echo -e "${BLUE}=== 测试后端健康检查API ===${NC}"
        
        test_api "http://localhost:3001/health" "后端基础健康检查"
        test_api "http://localhost:3001/api/health" "后端API路径健康检查"
        test_api "http://localhost:3001/health/detailed" "后端详细健康检查"
    fi
    
    # 测试前端健康检查API
    if [ "$frontend_running" = true ]; then
        echo -e "${BLUE}=== 测试前端健康检查API ===${NC}"
        
        test_api "http://localhost:3000/api/health" "前端基础健康检查"
        test_api "http://localhost:3000/api/health/detailed" "前端详细健康检查"
    fi
    
    # 测试结果汇总
    echo ""
    echo -e "${BLUE}=== 测试结果汇总 ===${NC}"
    echo "总测试数: $TOTAL_TESTS"
    echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "失败: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 所有测试通过！${NC}"
        exit 0
    else
        echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败${NC}"
        exit 1
    fi
}

# 捕获中断信号
trap 'echo -e "\n${YELLOW}测试被中断${NC}"; exit 1' INT TERM

# 运行主函数
main "$@"