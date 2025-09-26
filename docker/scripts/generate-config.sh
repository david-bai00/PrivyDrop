#!/bin/bash

# 导入环境检测脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-environment.sh"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 生成环境变量文件
generate_env_file() {
    log_info "生成环境变量配置..."
    
    local env_file=".env"

    # 读取已有配置以保留用户自定义字段（如代理、TURN）
    declare -A existing_env=()
    if [[ -f "$env_file" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
            if [[ "$line" == *=* ]]; then
                local key="${line%%=*}"
                local value="${line#*=}"
                existing_env[$key]="$value"
            fi
        done < "$env_file"
    fi

    # 生成随机密码（同时保存到全局变量，供后续生成 TURN 配置使用）
    local turn_password="${existing_env[TURN_PASSWORD]}"
    if [[ -z "$turn_password" ]]; then
        turn_password=$(openssl rand -base64 32 2>/dev/null || echo "privydrop$(date +%s)")
    fi

    # 计算不同部署模式下的访问入口
    local cors_origin="http://${LOCAL_IP}:3002"
    local api_url="http://${LOCAL_IP}:3001"
    local ssl_mode="self-signed"
    local turn_enabled="false"
    local turn_host_value=""
    local turn_realm_value="${existing_env[TURN_REALM]:-turn.local}"
    local turn_username_value="${existing_env[TURN_USERNAME]:-privydrop}"
    local next_public_turn_host=""
    local next_public_turn_username=""
    local next_public_turn_password=""

    if [[ "$DEPLOYMENT_MODE" == "public" ]]; then
        cors_origin="http://${DOMAIN_NAME:-$LOCAL_IP}"
        api_url="$cors_origin"
        turn_enabled="true"
    elif [[ "$DEPLOYMENT_MODE" == "full" ]]; then
        cors_origin="https://${DOMAIN_NAME:-$LOCAL_IP}"
        api_url="$cors_origin"
        ssl_mode="letsencrypt"
        turn_enabled="true"
    fi

    if [[ "$turn_enabled" == "true" ]]; then
        if [[ -n "$DOMAIN_NAME" ]]; then
            turn_host_value="turn.${DOMAIN_NAME}"
            turn_realm_value="turn.${DOMAIN_NAME}"
        else
            turn_host_value="$LOCAL_IP"
            turn_realm_value="turn.local"
        fi

        next_public_turn_host="$turn_host_value"
        next_public_turn_username="$turn_username_value"
        next_public_turn_password="$turn_password"
    fi

    local default_no_proxy="localhost,127.0.0.1,backend,frontend,redis,coturn"
    local http_proxy_value="${HTTP_PROXY:-${existing_env[HTTP_PROXY]}}"
    local https_proxy_value="${HTTPS_PROXY:-${existing_env[HTTPS_PROXY]}}"
    local no_proxy_value="${NO_PROXY:-${existing_env[NO_PROXY]:-$default_no_proxy}}"

    # 将关键 TURN 参数暴露给后续步骤
    TURN_ENABLED="$turn_enabled"
    TURN_USERNAME="$turn_username_value"
    TURN_PASSWORD="$turn_password"
    TURN_REALM="$turn_realm_value"
    TURN_HOST="$turn_host_value"

    cat > "$env_file" << EOF
# PrivyDrop Docker 配置文件
# 自动生成时间: $(date)
# 网络模式: $NETWORK_MODE
# 部署模式: $DEPLOYMENT_MODE

# =============================================================================
# 网络配置
# =============================================================================
CORS_ORIGIN=${cors_origin}
NEXT_PUBLIC_API_URL=${api_url}
NEXT_PUBLIC_TURN_HOST=${next_public_turn_host}
NEXT_PUBLIC_TURN_USERNAME=${next_public_turn_username}
NEXT_PUBLIC_TURN_PASSWORD=${next_public_turn_password}

# =============================================================================
# 端口配置
# =============================================================================
FRONTEND_PORT=3002
BACKEND_PORT=3001
HTTP_PORT=80
HTTPS_PORT=443

# =============================================================================
# Redis配置
# =============================================================================
REDIS_HOST=redis
REDIS_PORT=6379

# =============================================================================
# 部署配置
# =============================================================================
DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
NETWORK_MODE=${NETWORK_MODE}
LOCAL_IP=${LOCAL_IP}
PUBLIC_IP=${PUBLIC_IP:-}

# =============================================================================
# SSL配置
# =============================================================================
SSL_MODE=${ssl_mode}
DOMAIN_NAME=${DOMAIN_NAME:-}

# =============================================================================
# TURN服务器配置 (可选)
# =============================================================================
TURN_ENABLED=${turn_enabled}
TURN_USERNAME=${turn_username_value}
TURN_PASSWORD=${turn_password}
TURN_REALM=${turn_realm_value}

# =============================================================================
# Nginx配置
# =============================================================================
NGINX_SERVER_NAME=${DOMAIN_NAME:-${LOCAL_IP}}

# =============================================================================
# 日志配置
# =============================================================================
LOG_LEVEL=info

# =============================================================================
# 代理配置 (可选)
# =============================================================================
HTTP_PROXY=${http_proxy_value}
HTTPS_PROXY=${https_proxy_value}
NO_PROXY=${no_proxy_value}
EOF

    log_success "环境变量配置已生成: $env_file"
}

# 生成Nginx配置
generate_nginx_config() {
    log_info "生成Nginx配置..."
    
    mkdir -p docker/nginx/conf.d
    
    local server_name="${DOMAIN_NAME:-${LOCAL_IP} localhost}"
    local upstream_backend="backend:3001"
    local upstream_frontend="frontend:3002"
    
    # 生成主Nginx配置
    cat > docker/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # 基础配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    # 客户端配置
    client_max_body_size 100M;
    client_header_timeout 60s;
    client_body_timeout 60s;

    # Gzip配置
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # 包含站点配置
    include /etc/nginx/conf.d/*.conf;
}
EOF

    # 生成站点配置
    cat > docker/nginx/conf.d/default.conf << EOF
# 上游服务定义
upstream backend {
    server ${upstream_backend};
    keepalive 32;
}

upstream frontend {
    server ${upstream_frontend};
    keepalive 32;
}

# HTTP服务器配置
server {
    listen 80;
    server_name ${server_name};
    
    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # 健康检查端点
    location /nginx-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # 后端API代理
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 后端健康检查代理
    location /health {
        proxy_pass http://backend/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Socket.IO代理
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket特殊配置
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 前端应用代理
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Next.js特殊配置
        proxy_buffering off;
    }
}
EOF

    log_success "Nginx配置已生成"
    echo "  主配置: docker/nginx/nginx.conf"
    echo "  站点配置: docker/nginx/conf.d/default.conf"
}

# 生成SSL证书
generate_ssl_certificates() {
    if [[ "$SSL_MODE" == "self-signed" ]] || [[ "$NETWORK_MODE" == "private" ]]; then
        log_info "生成自签名SSL证书..."
        
        mkdir -p docker/ssl
        
        # 生成CA私钥
        openssl genrsa -out docker/ssl/ca-key.pem 4096 2>/dev/null
        
        # 生成CA证书
        openssl req -new -x509 -days 365 -key docker/ssl/ca-key.pem \
            -out docker/ssl/ca-cert.pem \
            -subj "/C=CN/ST=Local/L=Local/O=PrivyDrop/CN=PrivyDrop-CA" 2>/dev/null
        
        # 生成服务器私钥
        openssl genrsa -out docker/ssl/server-key.pem 4096 2>/dev/null
        
        # 生成服务器证书请求
        openssl req -new -key docker/ssl/server-key.pem \
            -out docker/ssl/server.csr \
            -subj "/C=CN/ST=Local/L=Local/O=PrivyDrop/CN=${LOCAL_IP}" 2>/dev/null
        
        # 创建扩展配置
        cat > docker/ssl/server.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
DNS.3 = ${DOMAIN_NAME:-privydrop.local}
IP.1 = ${LOCAL_IP}
IP.2 = 127.0.0.1
EOF
        
        # 签名服务器证书
        openssl x509 -req -days 365 -in docker/ssl/server.csr \
            -CA docker/ssl/ca-cert.pem -CAkey docker/ssl/ca-key.pem \
            -out docker/ssl/server-cert.pem -CAcreateserial \
            -extensions v3_req -extfile docker/ssl/server.ext 2>/dev/null
        
        # 清理临时文件
        rm -f docker/ssl/server.csr docker/ssl/server.ext docker/ssl/ca-cert.srl
        
        # 设置权限
        chmod 600 docker/ssl/*-key.pem
        chmod 644 docker/ssl/*-cert.pem
        
        log_success "SSL证书已生成: docker/ssl/"
        log_info "要信任证书，请导入CA证书: docker/ssl/ca-cert.pem"
        
        # 生成HTTPS Nginx配置
        if [[ "$DEPLOYMENT_MODE" != "basic" ]]; then
            generate_https_nginx_config
        fi
    fi
}

# 生成HTTPS Nginx配置
generate_https_nginx_config() {
    log_info "生成HTTPS Nginx配置..."
    
    cat >> docker/nginx/conf.d/default.conf << EOF

# HTTPS服务器配置
server {
    listen 443 ssl http2;
    server_name ${DOMAIN_NAME:-${LOCAL_IP}};
    
    # SSL配置
    ssl_certificate /etc/nginx/ssl/server-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/server-key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 安全头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # 健康检查端点
    location /nginx-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # 后端API代理
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # 后端健康检查代理
    location /health {
        proxy_pass http://backend/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
    
    # Socket.IO代理
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 前端应用代理
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }
}
EOF

    log_success "HTTPS配置已添加"
}

# 生成Coturn配置
generate_coturn_config() {
    if [[ "$TURN_ENABLED" == "true" ]]; then
        log_info "生成Coturn TURN服务器配置..."
        
        mkdir -p docker/coturn
        
        cat > docker/coturn/turnserver.conf << EOF
# PrivyDrop TURN服务器配置
# 自动生成时间: $(date)

# 监听端口
listening-port=3478
tls-listening-port=5349

# 监听IP
listening-ip=0.0.0.0
relay-ip=0.0.0.0

# 外部IP (用于NAT环境)
external-ip=${PUBLIC_IP:-${LOCAL_IP}}

# 服务器域名
realm=${TURN_REALM}
server-name=${TURN_REALM}

# 认证方式
lt-cred-mech

# 用户认证
user=${TURN_USERNAME}:${TURN_PASSWORD}

# SSL证书 (如果启用TLS)
cert=/etc/ssl/certs/server-cert.pem
pkey=/etc/ssl/certs/server-key.pem

# 日志配置
no-stdout-log
log-file=/var/log/turnserver.log
verbose

# 安全配置
no-cli
no-loopback-peers
no-multicast-peers

# 性能配置
min-port=49152
max-port=65535

# 数据库 (可选)
# userdb=/var/lib/turn/turndb

# 其他配置
mobility
no-tlsv1
no-tlsv1_1
EOF

        log_success "Coturn配置已生成: docker/coturn/turnserver.conf"
        log_info "TURN服务器用户名: ${TURN_USERNAME}"
        log_warning "TURN服务器密码已保存在.env文件中"
    fi
}

# 生成Docker忽略文件
generate_dockerignore() {
    log_info "生成Docker忽略文件..."
    
    # 后端.dockerignore
    cat > backend/.dockerignore << EOF
node_modules
npm-debug.log*
.npm
.env*
.git
.gitignore
README.md
Dockerfile
.dockerignore
coverage
.nyc_output
logs
*.log
EOF

    # 前端.dockerignore
    cat > frontend/.dockerignore << EOF
node_modules
.next
.git
.gitignore
README.md
Dockerfile
.dockerignore
.env*
npm-debug.log*
.npm
coverage
.nyc_output
*.log
public/sw.js
public/workbox-*.js
EOF

    log_success "Docker忽略文件已生成"
}

# 创建日志目录
create_log_directories() {
    log_info "创建日志目录..."
    
    mkdir -p logs/{nginx,backend,frontend,coturn}
    
    # 设置权限
    chmod 755 logs
    chmod 755 logs/*
    
    log_success "日志目录已创建: logs/"
}

# 主函数
main() {
    echo -e "${BLUE}=== PrivyDrop 配置生成 ===${NC}"
    echo ""
    
    # 解析参数（与环境检测脚本保持一致）
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            --mode)
                DEPLOYMENT_MODE="$2"
                if [[ "$2" == "private" || "$2" == "basic" ]]; then
                    FORCED_MODE="private"
                elif [[ "$2" == "public" || "$2" == "full" ]]; then
                    FORCED_MODE="public"
                fi
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
    
    # 首先运行环境检测
    if ! detect_network_environment; then
        log_error "环境检测失败"
        exit 1
    fi
    
    if ! check_system_resources; then
        log_error "系统资源检查失败"
        exit 1
    fi
    
    detect_deployment_mode
    echo ""
    
    # 生成所有配置文件
    generate_env_file
    echo ""
    
    generate_nginx_config
    echo ""
    
    generate_ssl_certificates
    echo ""
    
    generate_coturn_config
    echo ""
    
    generate_dockerignore
    echo ""
    
    create_log_directories
    echo ""
    
    log_success "🎉 所有配置文件生成完成！"
    echo ""
    echo -e "${BLUE}生成的文件:${NC}"
    echo "  .env - 环境变量配置"
    echo "  docker/nginx/ - Nginx配置"
    echo "  docker/ssl/ - SSL证书"
    [[ "$TURN_ENABLED" == "true" ]] && echo "  docker/coturn/ - TURN服务器配置"
    echo "  logs/ - 日志目录"
    echo ""
    echo -e "${BLUE}下一步:${NC}"
    echo "  运行 './deploy.sh' 开始部署"
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
