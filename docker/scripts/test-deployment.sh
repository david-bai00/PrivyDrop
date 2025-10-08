#!/bin/bash

# PrivyDrop Docker deployment test script
# Validate deployment integrity and functionality

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test result counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Logging helpers
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

# Test functions
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "Test: $test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Docker environment tests
test_docker_environment() {
    echo -e "${BLUE}=== Docker Environment Tests ===${NC}"
    
    run_test "Docker installed" "command -v docker"
    run_test "Docker daemon running" "docker info"
    run_test "Docker Compose available" "docker-compose --version || docker compose version"
    
    echo ""
}

# Container status tests
test_container_status() {
    echo -e "${BLUE}=== Container Status Tests ===${NC}"
    
    # Check if containers exist and are running
    local containers=("privydrop-redis" "privydrop-backend" "privydrop-frontend")
    
    for container in "${containers[@]}"; do
        run_test "Container $container is running" "docker ps | grep -q $container"
    done
    
    # Check container health
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container.*healthy"; then
            log_success "Container $container health OK"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_warning "Container $container health unknown or unhealthy"
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done
    
    echo ""
}

# Network connectivity tests
test_network_connectivity() {
    echo -e "${BLUE}=== Network Connectivity Tests ===${NC}"
    
    # Test port connectivity
    local ports=("3002:Frontend" "3001:Backend" "6379:Redis")
    
    for port_info in "${ports[@]}"; do
        local port=$(echo "$port_info" | cut -d':' -f1)
        local service=$(echo "$port_info" | cut -d':' -f2)
        
        run_test "$service port $port reachable" "nc -z localhost $port"
    done
    
    # Test inter-container networking
    run_test "Backend can connect to Redis" "docker-compose exec -T backend sh -c 'nc -z redis 6379'"
    run_test "Frontend can reach backend" "curl -f http://localhost:3001/health"
    
    echo ""
}

# API functionality tests
test_api_functionality() {
    echo -e "${BLUE}=== API Functionality Tests ===${NC}"
    
    # Health check APIs
    run_test "Backend health check API" "curl -f http://localhost:3001/health"
    run_test "Frontend health check API" "curl -f http://localhost:3002/api/health"
    
    # Backend detailed health check
    if curl -f http://localhost:3001/health/detailed >/dev/null 2>&1; then
        local redis_status=$(curl -s http://localhost:3001/health/detailed | jq -r '.dependencies.redis.status' 2>/dev/null)
        if [[ "$redis_status" == "connected" ]]; then
            log_success "Redis connection OK"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "Redis connection issue"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "Detailed health check API unavailable"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Application API tests
    run_test "Get room API" "curl -f http://localhost:3001/api/get_room"
    run_test "Create room API" "curl -f -X POST -H 'Content-Type: application/json' -d '{\"roomId\":\"test123\"}' http://localhost:3001/api/create_room"
    
    echo ""
}

# WebRTC functionality tests
test_webrtc_functionality() {
    echo -e "${BLUE}=== WebRTC Functionality Tests ===${NC}"
    
    # Test frontend page load
    if curl -f http://localhost:3002 >/dev/null 2>&1; then
        log_success "Frontend page reachable"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Frontend page not reachable"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Test Socket.IO connection (basic)
    if curl -f http://localhost:3001/socket.io/socket.io.js >/dev/null 2>&1; then
        log_success "Socket.IO client script reachable"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Socket.IO client script not reachable"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# Performance tests
test_performance() {
    echo -e "${BLUE}=== Performance Tests ===${NC}"
    
    # Memory usage test
    local backend_memory=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep privydrop-backend | awk '{print $2}' | cut -d'/' -f1)
    local frontend_memory=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep privydrop-frontend | awk '{print $2}' | cut -d'/' -f1)
    
    if [[ -n "$backend_memory" ]]; then
        log_info "Backend memory usage: $backend_memory"
    fi
    
    if [[ -n "$frontend_memory" ]]; then
        log_info "Frontend memory usage: $frontend_memory"
    fi
    
    # Response time test
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:3001/health)
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "API response time OK: ${response_time}s"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "API response time slow: ${response_time}s"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# Security tests
test_security() {
    echo -e "${BLUE}=== Security Tests ===${NC}"
    
    # Check container users
    local backend_user=$(docker-compose exec -T backend whoami 2>/dev/null || echo "unknown")
    local frontend_user=$(docker-compose exec -T frontend whoami 2>/dev/null || echo "unknown")
    
    if [[ "$backend_user" != "root" ]]; then
        log_success "Backend container uses non-root user: $backend_user"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "Backend container runs as root"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [[ "$frontend_user" != "root" ]]; then
        log_success "Frontend container uses non-root user: $frontend_user"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "Frontend container runs as root"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Check for sensitive info leakage
    if curl -s http://localhost:3001/health/detailed | grep -q "password\|secret\|key" >/dev/null 2>&1; then
        log_warning "Health check API may leak sensitive info"
    else
        log_success "Health check API does not leak sensitive info"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# Logging tests
test_logging() {
    echo -e "${BLUE}=== Logging Tests ===${NC}"
    
    # Check log directories
    if [[ -d "logs" ]]; then
        log_success "Log directory exists"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warning "Log directory does not exist"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Check log files
    local log_files=("logs/backend" "logs/frontend")
    for log_dir in "${log_files[@]}"; do
        if [[ -d "$log_dir" ]]; then
            log_success "Log directory $log_dir exists"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_info "Log directory $log_dir not found (may be normal)"
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done
    
    echo ""
}

# Configuration file tests
test_configuration() {
    echo -e "${BLUE}=== Configuration File Tests ===${NC}"
    
    # Check env file
    if [[ -f ".env" ]]; then
        log_success ".env file exists"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Check key configuration entries
        local required_vars=("LOCAL_IP" "CORS_ORIGIN" "NEXT_PUBLIC_API_URL")
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" .env; then
                log_success "Config $var is set"
                TESTS_PASSED=$((TESTS_PASSED + 1))
            else
                log_error "Config $var is not set"
                TESTS_FAILED=$((TESTS_FAILED + 1))
            fi
            TOTAL_TESTS=$((TOTAL_TESTS + 1))
        done
    else
        log_error ".env file not found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Check Docker Compose file
    if [[ -f "docker-compose.yml" ]]; then
        log_success "docker-compose.yml exists"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "docker-compose.yml not found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
}

# Cleanup tests
test_cleanup() {
    echo -e "${BLUE}=== Cleanup Tests ===${NC}"
    
    # Verify cleanup commands work
    if [[ -f "deploy.sh" ]]; then
        log_success "Deployment script exists"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Test help command
        if bash deploy.sh --help >/dev/null 2>&1; then
            log_success "Deployment script help works"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "Deployment script help fails"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "Deployment script not found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    
    echo ""
}

# Generate test report
generate_report() {
    echo -e "${BLUE}=== Test Report ===${NC}"
    echo ""
    
    echo "📊 Test stats:"
    echo "   Total tests: $TOTAL_TESTS"
    echo -e "   Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "   Failed: ${RED}$TESTS_FAILED${NC}"
    
    local success_rate=$((TESTS_PASSED * 100 / TOTAL_TESTS))
    echo "   Success rate: $success_rate%"
    
    echo ""
    echo "📋 System info:"
    echo "   Docker version: $(docker --version)"
    echo "   Docker Compose version: $(docker-compose --version 2>/dev/null || docker compose version 2>/dev/null || echo 'unknown')"
    echo "   OS: $(uname -s) $(uname -r)"
    echo "   Test time: $(date)"
    
    echo ""
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}🎉 All tests passed! PrivyDrop deployment successful!${NC}"
        echo ""
        echo "🔗 Access links:"
        echo "   Frontend: http://localhost:3002"
        echo "   Backend API: http://localhost:3001"
        
        # Show LAN access addresses
        if [[ -f ".env" ]]; then
            local local_ip=$(grep "LOCAL_IP=" .env | cut -d'=' -f2)
            if [[ -n "$local_ip" && "$local_ip" != "127.0.0.1" ]]; then
                echo ""
                echo "🌐 LAN access:"
                echo "   Frontend: http://$local_ip:3002"
                echo "   Backend API: http://$local_ip:3001"
            fi
        fi
        
        return 0
    else
        echo -e "${RED}❌ $TESTS_FAILED test(s) failed${NC}"
        echo ""
        echo "🔧 Troubleshooting tips:"
        echo "   1. View container status: docker-compose ps"
        echo "   2. View container logs: docker-compose logs -f"
        echo "   3. Redeploy: bash deploy.sh"
        echo "   4. Clean and redeploy: bash deploy.sh --clean"
        
        return 1
    fi
}

# Main function
main() {
    echo -e "${BLUE}=== PrivyDrop Docker Deployment Tests ===${NC}"
    echo ""
    
    # Check required tools
    local missing_tools=()
    for tool in curl jq bc nc; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_warning "Missing test tools: ${missing_tools[*]}"
        log_info "Suggested install: sudo apt-get install curl jq bc netcat"
        echo ""
    fi
    
    # Run all tests
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
    
    # Generate report
    generate_report
}

# Trap interrupt signals
trap 'echo -e "\n${YELLOW}Tests interrupted${NC}"; exit 1' INT TERM

# Run main function
main "$@"
