#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
test_api() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    log_info "Test: $description"
    log_info "URL: $url"
    
    # Send request and capture response
    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        log_error "Request failed - unable to connect to service"
        return 1
    fi
    
    # Split response body and status code
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    # Check HTTP status code
    if [ "$http_code" -eq "$expected_status" ]; then
        log_success "HTTP status code OK: $http_code"
    else
        log_error "HTTP status code mismatch: expected $expected_status, got $http_code"
        return 1
    fi
    
    # Validate JSON format
    if echo "$response_body" | jq . >/dev/null 2>&1; then
        log_success "Response is valid JSON"
        
        # Pretty-print JSON response
        echo -e "${BLUE}Response body:${NC}"
        echo "$response_body" | jq .
        
        # Verify required fields
        status=$(echo "$response_body" | jq -r '.status // empty')
        service=$(echo "$response_body" | jq -r '.service // empty')
        timestamp=$(echo "$response_body" | jq -r '.timestamp // empty')
        
        if [ -n "$status" ] && [ -n "$service" ] && [ -n "$timestamp" ]; then
            log_success "Contains required fields: status, service, timestamp"
        else
            log_error "Missing required fields"
            return 1
        fi
        
    else
        log_error "Response is not valid JSON"
        echo "Response body: $response_body"
        return 1
    fi
    
    return 0
}

# Check if service is running
check_service() {
    local port="$1"
    local service_name="$2"
    
    if nc -z localhost "$port" 2>/dev/null; then
        log_success "$service_name is running (port $port)"
        return 0
    else
        log_error "$service_name is not running (port $port)"
        return 1
    fi
}

# Wait for service to start
wait_for_service() {
    local port="$1"
    local service_name="$2"
    local max_attempts=30
    local attempt=0
    
    log_info "Waiting for $service_name to start..."
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost "$port" 2>/dev/null; then
            log_success "$service_name started"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    log_error "$service_name startup timed out"
    return 1
}

# Main test function
main() {
    echo -e "${BLUE}=== PrivyDrop Health Check API Tests ===${NC}"
    echo ""
    
    # Check required tools
    if ! command -v curl &> /dev/null; then
        log_error "curl is not installed; please install curl"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed; please install jq for JSON parsing"
        exit 1
    fi
    
    if ! command -v nc &> /dev/null; then
        log_error "netcat is not installed; please install nc for port checks"
        exit 1
    fi
    
    # Check service status
    echo -e "${BLUE}=== Check Service Status ===${NC}"
    backend_running=false
    frontend_running=false
    
    if check_service 3001 "Backend"; then
        backend_running=true
    fi
    
    if check_service 3002 "Frontend"; then
        frontend_running=true
    fi
    
    # Show startup hints if services are not running
    if [ "$backend_running" = false ]; then
        echo ""
        log_warning "Backend is not running; please start it:"
        echo "  cd backend && npm run dev"
        echo ""
    fi
    
    if [ "$frontend_running" = false ]; then
        echo ""
        log_warning "Frontend is not running; please start it:"
        echo "  cd frontend && pnpm dev"
        echo ""
    fi
    
    # Test backend health check APIs
    if [ "$backend_running" = true ]; then
        echo -e "${BLUE}=== Test Backend Health Check APIs ===${NC}"
        
        test_api "http://localhost:3001/health" "Backend basic health check"
        test_api "http://localhost:3001/api/health" "Backend API path health check"
        test_api "http://localhost:3001/health/detailed" "Backend detailed health check"
    fi
    
    # Test frontend health check APIs
    if [ "$frontend_running" = true ]; then
        echo -e "${BLUE}=== Test Frontend Health Check APIs ===${NC}"
        
        test_api "http://localhost:3002/api/health" "Frontend basic health check"
        test_api "http://localhost:3002/api/health/detailed" "Frontend detailed health check"
    fi
    
    # Test results summary
    echo ""
    echo -e "${BLUE}=== Test Results Summary ===${NC}"
    echo "Total tests: $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ $TESTS_FAILED test(s) failed${NC}"
        exit 1
    fi
}

# Trap interrupt signals
trap 'echo -e "\n${YELLOW}Tests interrupted${NC}"; exit 1' INT TERM

# Run main function
main "$@"
