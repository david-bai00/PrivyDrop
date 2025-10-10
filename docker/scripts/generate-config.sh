#!/bin/bash

# Import environment detection script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-environment.sh"

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Defaults and global parameters
WITH_TURN="${WITH_TURN:-false}"
WITH_NGINX="${WITH_NGINX:-false}"
TURN_EXTERNAL_IP_OVERRIDE=""
TURN_MIN_PORT_DEFAULT=49152
TURN_MAX_PORT_DEFAULT=49252
TURN_MIN_PORT="$TURN_MIN_PORT_DEFAULT"
TURN_MAX_PORT="$TURN_MAX_PORT_DEFAULT"
ENABLE_SNI443="${ENABLE_SNI443:-}"

# Web HTTPS in LAN (self-signed only when explicitly enabled)
WEB_HTTPS_ENABLED=false
HTTPS_LISTEN_PORT=""
HSTS_ENABLED=false

parse_turn_port_range() {
    local range="$1"
    if [[ -z "$range" ]]; then
        return 0
    fi
    if [[ ! "$range" =~ ^([0-9]{2,5})-([0-9]{2,5})$ ]]; then
        log_error "--turn-port-range must be MIN-MAX, e.g., 49152-49252"
        exit 1
    fi
    local min="${BASH_REMATCH[1]}"
    local max="${BASH_REMATCH[2]}"
    if (( min < 1 || max > 65535 || min >= max )); then
        log_error "Invalid port range: $min-$max; must be within 1-65535 and MIN<MAX"
        exit 1
    fi
    TURN_MIN_PORT="$min"
    TURN_MAX_PORT="$max"
}

NO_CLEAN=false
RESET_SSL=false

cleanup_previous_artifacts() {
    if [[ "$NO_CLEAN" == "true" ]]; then
        log_info "Skipping cleanup of previous artifacts (--no-clean)"
        return 0
    fi
    log_warning "Cleaning previous generated artifacts (keeping SSL certificates)..."
    rm -f .env 2>/dev/null || true
    rm -f docker/nginx/nginx.conf 2>/dev/null || true
    rm -f docker/nginx/conf.d/*.conf 2>/dev/null || true
    rm -f docker/coturn/turnserver.conf 2>/dev/null || true
    # Do not clean docker/ssl by default unless --reset-ssl is set
    if [[ "$RESET_SSL" == "true" ]]; then
        log_warning "Resetting SSL directory as requested: docker/ssl/*"
        rm -f docker/ssl/* 2>/dev/null || true
    fi
}

# Show help
show_help() {
    cat << 'EOF'
PrivyDrop Config Generator (Docker)

Usage: bash docker/scripts/generate-config.sh [options]

Options:
  --mode MODE              Generation mode: lan-http|lan-tls|public|full
                           lan-http: Intranet HTTP (fast start; no TLS)
                           lan-tls:  Intranet HTTPS (self-signed; dev/managed env only)
                           public:   Public HTTP + TURN (no domain)
                           full:     Domain + HTTPS (Let’s Encrypt) + TURN
  --with-turn              Enable TURN in any mode. Default external-ip=LOCAL_IP
  --with-nginx             Indicate Nginx reverse proxy is enabled (frontdoor same-origin)
  --turn-external-ip IP    Explicit TURN external-ip; if not set, use PUBLIC_IP, otherwise fallback to LOCAL_IP
  --turn-port-range R      TURN UDP port range, format MIN-MAX; default 49152-49252
  --domain DOMAIN          Domain (for Nginx/certs/TURN realm, e.g., turn.DOMAIN)
  --local-ip IP            Local intranet IP (auto-detected if omitted)
  --enable-sni443          Enable 443 SNI split (turn.DOMAIN → coturn:5349, others → web:8443)
  --no-sni443              Disable 443 SNI split (HTTPS listens directly on 443)
  --enable-web-https       In lan-tls mode, enable self-signed HTTPS on 8443 (no HSTS)
  --help                   Show this help
  --no-clean               Skip cleaning previous outputs (useful for regeneration without wiping SSL)
  --reset-ssl              Force clean docker/ssl/* (not cleaned by default)
  --ssl-mode MODE          Cert mode: letsencrypt|self-signed|provided
                           - full defaults to letsencrypt; lan-tls uses self-signed when --enable-web-https; others: none

Environment variables (optional):
  PUBLIC_IP                Explicit public IP; only used in public/full.
                           TURN external-ip prefers PUBLIC_IP,
                           fallback to LOCAL_IP (LAN-only; NAT traversal limited).

Outputs (with key variables set automatically):
  - .env                          Core env vars (including NEXT_PUBLIC_API_URL/CORS)
  - docker/nginx/*                Nginx reverse proxy configs
  - docker/ssl/*                  Self-signed certs (only when lan-tls + --enable-web-https)
  - docker/coturn/turnserver.conf Generated/overwritten in public/full or when --with-turn is set

Notes:
  - TURN external-ip is set as external-ip=${PUBLIC_IP:-${LOCAL_IP}}
    i.e., prefer PUBLIC_IP, otherwise fallback to LOCAL_IP.

Examples:
  # 1) LAN HTTP (fastest path)
  bash docker/scripts/generate-config.sh --mode lan-http [--local-ip 192.168.0.113]

  # 2) LAN + TURN (default external-ip=LOCAL_IP)
  bash docker/scripts/generate-config.sh --mode lan-http --with-turn [--local-ip 192.168.0.113]

  # 3) LAN HTTPS (self-signed; dev/managed env only)
  bash docker/scripts/generate-config.sh --mode lan-tls --enable-web-https [--local-ip 192.168.0.113]

  # 4) Public HTTP + TURN (no domain)
  bash docker/scripts/generate-config.sh --mode public [--local-ip 192.168.0.113]

  # 5) Full HTTPS + TURN (with domain; LE auto-issue/renew)
  bash docker/scripts/generate-config.sh --mode full --domain example.com --local-ip 192.168.0.113

For more scenarios and details, see:
  - docs/DEPLOYMENT_docker.md (English)
  - docs/DEPLOYMENT_docker.zh-CN.md (中文)

EOF
}

# Generate environment variables file
generate_env_file() {
    log_info "Generating environment variable config..."
    
    local env_file=".env"

    # Read existing config to keep user-defined fields (e.g., proxy, TURN)
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

    # Generate a random password (also saved globally for TURN configuration later)
    local turn_password="${existing_env[TURN_PASSWORD]}"
    if [[ -z "$turn_password" ]]; then
        turn_password=$(openssl rand -base64 32 2>/dev/null || echo "privydrop$(date +%s)")
    fi

    # Compute access endpoints for different deployment modes
    # Support both localhost and host IP for browser access; helpful for Docker direct access or local debugging
    local cors_origin="http://${LOCAL_IP}:3002,http://localhost:3002"
    # API URL exposed to browser. When WITH_NGINX=true, prefer same-origin (empty => use relative /api)
    local api_url="http://${LOCAL_IP}:3001"
    local ssl_mode="none"
    local turn_enabled="false"
    local turn_host_value=""
    local turn_realm_value="${existing_env[TURN_REALM]:-turn.local}"
    local turn_username_value="${existing_env[TURN_USERNAME]:-privydrop}"
    local next_public_turn_host=""
    local next_public_turn_username=""
    local next_public_turn_password=""

    case "$DEPLOYMENT_MODE" in
        lan-http)
            # Allow both dev ports and nginx origins to avoid CORS when --with-nginx is used
            cors_origin="http://${LOCAL_IP}:3002,http://localhost:3002,http://${LOCAL_IP},http://localhost"
            if [[ "$WITH_NGINX" == "true" ]]; then
                # Same-origin via Nginx (frontend uses relative /api)
                api_url=""
            else
                api_url="http://${LOCAL_IP}:3001"
            fi
            ;;
        lan-tls)
            if [[ "$WEB_HTTPS_ENABLED" == "true" ]]; then
                HTTPS_LISTEN_PORT="8443"
                # Allow HTTP for local debug; HTTPS is exposed on 8443 by default
                cors_origin="https://${LOCAL_IP}:${HTTPS_LISTEN_PORT},https://localhost:${HTTPS_LISTEN_PORT},http://${LOCAL_IP},http://${LOCAL_IP}:3002,http://localhost,http://localhost:3002"
                if [[ "$WITH_NGINX" == "true" ]]; then
                    # Same-origin via Nginx (relative /api), TLS is terminated by Nginx
                    api_url=""
                else
                    api_url="https://${LOCAL_IP}:${HTTPS_LISTEN_PORT}"
                fi
                ssl_mode="self-signed"
            fi
            ;;
        public)
            local effective_public_host="${PUBLIC_IP:-$LOCAL_IP}"
            cors_origin="http://${effective_public_host}:3002,http://localhost:3002,http://${effective_public_host},http://localhost"
            if [[ "$WITH_NGINX" == "true" ]]; then
                # Same-origin via Nginx gateway
                api_url=""
            else
                api_url="http://${effective_public_host}:3001"
            fi
            turn_enabled="true"
            ;;
        full)
            cors_origin="https://${DOMAIN_NAME:-$LOCAL_IP}"
            api_url="https://${DOMAIN_NAME:-$LOCAL_IP}"
            ssl_mode="letsencrypt"
            turn_enabled="true"
            ;;
        *) : ;;
    esac

    # If TURN explicitly enabled, override mode defaults
    if [[ "$WITH_TURN" == "true" ]]; then
        turn_enabled="true"
    fi

    if [[ "$turn_enabled" == "true" ]]; then
        if [[ -n "$DOMAIN_NAME" ]]; then
            turn_host_value="turn.${DOMAIN_NAME}"
            turn_realm_value="turn.${DOMAIN_NAME}"
        else
            # Without domain: prefer PUBLIC_IP; fallback to LOCAL_IP
            turn_host_value="${PUBLIC_IP:-$LOCAL_IP}"
            turn_realm_value="turn.local"
        fi

        next_public_turn_host="$turn_host_value"
        next_public_turn_username="$turn_username_value"
        next_public_turn_password="$turn_password"
    fi

    # Port range (default 49152-49252; overridable via --turn-port-range)
    local turn_min_port_value="${TURN_MIN_PORT:-$TURN_MIN_PORT_DEFAULT}"
    local turn_max_port_value="${TURN_MAX_PORT:-$TURN_MAX_PORT_DEFAULT}"

    local default_no_proxy="localhost,127.0.0.1,backend,frontend,redis,coturn"
    local http_proxy_value="${HTTP_PROXY:-${existing_env[HTTP_PROXY]}}"
    local https_proxy_value="${HTTPS_PROXY:-${existing_env[HTTPS_PROXY]}}"
    local no_proxy_value="${NO_PROXY:-${existing_env[NO_PROXY]:-$default_no_proxy}}"

    # Expose key TURN parameters to later steps
    TURN_ENABLED="$turn_enabled"
    TURN_USERNAME="$turn_username_value"
    TURN_PASSWORD="$turn_password"
    TURN_REALM="$turn_realm_value"
    TURN_HOST="$turn_host_value"
    TURN_MIN_PORT="$turn_min_port_value"
    TURN_MAX_PORT="$turn_max_port_value"

    # Decide container HTTPS port for Docker mapping
    # - full (with SNI 443): container listens on 443 (stream), website on 8443 internal
    # - lan-tls (self-signed, explicitly enabled): container listens on 8443 (no stream)
    local docker_https_container_port="443"
    if [[ "$DEPLOYMENT_MODE" == "lan-tls" && "$WEB_HTTPS_ENABLED" == "true" ]]; then
        docker_https_container_port="8443"
    else
        docker_https_container_port="443"
    fi

    cat > "$env_file" << EOF
# PrivyDrop Docker configuration
# Generated at: $(date)
# Network mode: $NETWORK_MODE
# Deployment mode: $DEPLOYMENT_MODE

# =============================================================================
# Network config
# =============================================================================
CORS_ORIGIN=${cors_origin}
NEXT_PUBLIC_API_URL=${api_url}
NEXT_PUBLIC_TURN_HOST=${next_public_turn_host}
NEXT_PUBLIC_TURN_USERNAME=${next_public_turn_username}
NEXT_PUBLIC_TURN_PASSWORD=${next_public_turn_password}

# =============================================================================
# Port config
# =============================================================================
FRONTEND_PORT=3002
BACKEND_PORT=3001
HTTP_PORT=80
HTTPS_PORT=${HTTPS_LISTEN_PORT:-443}
DOCKER_HTTPS_CONTAINER_PORT=${docker_https_container_port}

# =============================================================================
# Internal backend URL for server-side (frontend container only)
# =============================================================================
BACKEND_INTERNAL_URL=http://backend:3001

# =============================================================================
# Redis config
# =============================================================================
REDIS_HOST=redis
REDIS_PORT=6379

# =============================================================================
# Deployment config
# =============================================================================
DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
NETWORK_MODE=${NETWORK_MODE}
LOCAL_IP=${LOCAL_IP}
PUBLIC_IP=${PUBLIC_IP:-}

# =============================================================================
# SSL config
# =============================================================================
SSL_MODE=${ssl_mode}
DOMAIN_NAME=${DOMAIN_NAME:-}

# =============================================================================
# TURN server config (optional)
# =============================================================================
TURN_ENABLED=${turn_enabled}
TURN_USERNAME=${turn_username_value}
TURN_PASSWORD=${turn_password}
TURN_REALM=${turn_realm_value}
TURN_MIN_PORT=${turn_min_port_value}
TURN_MAX_PORT=${turn_max_port_value}

# =============================================================================
# Nginx config
# =============================================================================
NGINX_SERVER_NAME=${DOMAIN_NAME:-${LOCAL_IP}}

# =============================================================================
# Logging config
# =============================================================================
LOG_LEVEL=info

# =============================================================================
# Proxy config (optional)
# =============================================================================
HTTP_PROXY=${http_proxy_value}
HTTPS_PROXY=${https_proxy_value}
NO_PROXY=${no_proxy_value}
EOF

    log_success "Environment variable config generated: $env_file"
}

# Generate Nginx config
generate_nginx_config() {
    log_info "Generating Nginx config..."
    
    mkdir -p docker/nginx/conf.d
    
    local server_name="${DOMAIN_NAME:-${LOCAL_IP} localhost}"
    local upstream_backend="backend:3001"
    local upstream_frontend="frontend:3002"
    
    # Generate main Nginx config
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

    # Log format
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    # Client settings
    client_max_body_size 100M;
    client_header_timeout 60s;
    client_body_timeout 60s;

    # Gzip settings
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

    # Include site configs
    include /etc/nginx/conf.d/*.conf;
}
EOF

    # Generate site config
    mkdir -p docker/letsencrypt-www
    cat > docker/nginx/conf.d/default.conf << EOF
# Upstream definitions
upstream backend {
    server ${upstream_backend};
    keepalive 32;
}

upstream frontend {
    server ${upstream_frontend};
    keepalive 32;
}

# HTTP server config
server {
    listen 80;
    server_name ${server_name};
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # ACME upstream for Let's Encrypt issuance/renewal
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Health check endpoint
    location /nginx-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Backend API proxy
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
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Backend health-check proxy
    location /health {
        proxy_pass http://backend/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Socket.IO proxy
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket-specific settings
        proxy_buffering off;
        proxy_cache off;
    }
    
    # Frontend app proxy
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
        
        # Next.js-specific settings
        proxy_buffering off;
    }
}
EOF

    log_success "Nginx config generated"
    echo "  Main config: docker/nginx/nginx.conf"
    echo "  Site config: docker/nginx/conf.d/default.conf"
}

# Generate SSL certificates
generate_ssl_certificates() {
    if [[ "$SSL_MODE" == "self-signed" ]]; then
        log_info "Generating self-signed SSL certificates..."
        
        mkdir -p docker/ssl
        
        # Generate CA private key
        openssl genrsa -out docker/ssl/ca-key.pem 4096 2>/dev/null
        
        # Generate CA certificate
        openssl req -new -x509 -days 365 -key docker/ssl/ca-key.pem \
            -out docker/ssl/ca-cert.pem \
            -subj "/C=CN/ST=Local/L=Local/O=PrivyDrop/CN=PrivyDrop-CA" 2>/dev/null
        
        # Generate server private key
        openssl genrsa -out docker/ssl/server-key.pem 4096 2>/dev/null
        
        # Generate server CSR
        openssl req -new -key docker/ssl/server-key.pem \
            -out docker/ssl/server.csr \
            -subj "/C=CN/ST=Local/L=Local/O=PrivyDrop/CN=${LOCAL_IP}" 2>/dev/null
        
        # Create extensions config (with v3_req section for -extensions v3_req)
        cat > docker/ssl/server.ext << EOF
[v3_req]
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=localhost
DNS.2=*.local
DNS.3=${DOMAIN_NAME:-privydrop.local}
IP.1=${LOCAL_IP}
IP.2=127.0.0.1
EOF
        
        # Sign server certificate
        openssl x509 -req -days 365 -in docker/ssl/server.csr \
            -CA docker/ssl/ca-cert.pem -CAkey docker/ssl/ca-key.pem \
            -out docker/ssl/server-cert.pem -CAcreateserial \
            -extensions v3_req -extfile docker/ssl/server.ext
        # Validate certificate generation
        if [[ ! -f docker/ssl/server-cert.pem ]]; then
            log_error "Failed to generate docker/ssl/server-cert.pem (self-signed). Check OpenSSL output above."
            exit 1
        fi
        
        # Clean temporary files
        rm -f docker/ssl/server.csr docker/ssl/server.ext docker/ssl/ca-cert.srl
        
        # Set permissions
        chmod 600 docker/ssl/*-key.pem
        chmod 644 docker/ssl/*-cert.pem
        
        log_success "SSL certificates generated: docker/ssl/"
        log_info "To trust the cert, import the CA cert: docker/ssl/ca-cert.pem"
        
        # For self-signed, generate HTTPS config only when explicitly enabled (lan-tls)
        if [[ "$WEB_HTTPS_ENABLED" == "true" ]]; then
            HSTS_ENABLED=false
            HTTPS_LISTEN_PORT="${HTTPS_LISTEN_PORT:-8443}"
            generate_https_nginx_config
        fi
    fi
}

# Generate HTTPS Nginx config
generate_https_nginx_config() {
    log_info "Generating HTTPS Nginx config..."
    local https_port="443"
    if [[ -n "$HTTPS_LISTEN_PORT" ]]; then
        https_port="$HTTPS_LISTEN_PORT"
    elif [[ "$ENABLE_SNI443" == "true" ]]; then
        https_port="8443"
    fi

    local hsts_lines=""
    if [[ "$HSTS_ENABLED" == "true" ]]; then
        hsts_lines=$(cat << 'HSTSEOF'
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
HSTSEOF
)
    fi

    cat >> docker/nginx/conf.d/default.conf << EOF

# HTTPS server config
server {
    listen ${https_port} ssl http2;
    server_name ${DOMAIN_NAME:-${LOCAL_IP}};
    
    # SSL settings
    ssl_certificate /etc/nginx/ssl/server-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/server-key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
${hsts_lines}
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Health check endpoint
    location /nginx-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Backend API proxy
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
    
    # Backend health-check proxy
    location /health {
        proxy_pass http://backend/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
    
    # Socket.IO proxy
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
    
    # Frontend app proxy
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

    log_success "HTTPS config added"
}

# Generate Nginx stream SNI split (443)
generate_stream_sni443() {
    if [[ "$ENABLE_SNI443" != "true" ]]; then
        return 0
    fi
    if [[ -z "$DOMAIN_NAME" ]]; then
        log_warning "SNI 443 requires a domain; none specified, skipping stream config"
        return 0
    fi
    # Avoid duplicate appends
    if grep -q "## SNI 443 stream" docker/nginx/nginx.conf 2>/dev/null; then
        log_info "SNI 443 stream config already exists; skipping"
        return 0
    fi
    log_info "Append SNI 443 stream config to nginx.conf"
    cat >> docker/nginx/nginx.conf << EOF

## SNI 443 stream
stream {
    map \$ssl_preread_server_name \$sni_upstream {
        ~^turn\.(${DOMAIN_NAME})$ coturn;
        default web;
    }

    upstream coturn { server coturn:5349; }
    upstream web    { server 127.0.0.1:8443; }

    server {
        listen 443 reuseport;
        proxy_pass \$sni_upstream;
        ssl_preread on;
    }
}
EOF
}

# Enable HTTPS only when certs exist (for letsencrypt/provided)
enable_https_if_cert_present() {
    if [[ -f "docker/ssl/server-cert.pem" && -f "docker/ssl/server-key.pem" ]]; then
        # With SNI enabled, append stream split first, then generate HTTPS on 8443/443
        if [[ "$ENABLE_SNI443" == "true" && -n "$DOMAIN_NAME" ]]; then
            generate_stream_sni443
        fi
        # If HTTPS server is not present in default.conf, append it (port depends on SNI flag)
        local expected="listen 443 ssl"
        [[ -n "$HTTPS_LISTEN_PORT" ]] && expected="listen ${HTTPS_LISTEN_PORT} ssl"
        [[ "$ENABLE_SNI443" == "true" && -z "$HTTPS_LISTEN_PORT" ]] && expected="listen 8443 ssl"
        if ! grep -q "$expected" docker/nginx/conf.d/default.conf 2>/dev/null; then
            HSTS_ENABLED=true
            generate_https_nginx_config
        else
            log_info "Existing HTTPS (${ENABLE_SNI443:+SNI=on}) config detected; skipping"
        fi
    else
        log_warning "No certificates detected (docker/ssl/server-*.pem); 443 config not enabled yet"
    fi
}

# Generate Coturn config
generate_coturn_config() {
    if [[ "$TURN_ENABLED" == "true" ]]; then
        log_info "Generating Coturn TURN server config..."
        
        mkdir -p docker/coturn
        
        # Compute external-ip: prefer --turn-external-ip, then PUBLIC_IP, then LOCAL_IP
        local external_ip_value
        if [[ -n "$TURN_EXTERNAL_IP_OVERRIDE" ]]; then
            external_ip_value="$TURN_EXTERNAL_IP_OVERRIDE"
        elif [[ -n "$PUBLIC_IP" ]]; then
            external_ip_value="$PUBLIC_IP"
        else
            external_ip_value="$LOCAL_IP"
        fi

        local min_port_value="${TURN_MIN_PORT:-$TURN_MIN_PORT_DEFAULT}"
        local max_port_value="${TURN_MAX_PORT:-$TURN_MAX_PORT_DEFAULT}"

        cat > docker/coturn/turnserver.conf << EOF
# PrivyDrop TURN server configuration
# Generated at: $(date)

# Listen ports
listening-port=3478
tls-listening-port=5349

# Listen IPs
listening-ip=0.0.0.0
relay-ip=0.0.0.0

# External IP (for NAT)
external-ip=${external_ip_value}

# Server domain
realm=${TURN_REALM}
server-name=${TURN_REALM}

# Authentication method
lt-cred-mech

# User authentication
user=${TURN_USERNAME}:${TURN_PASSWORD}

# SSL certificates (if TLS enabled)
cert=/etc/ssl/certs/server-cert.pem
pkey=/etc/ssl/certs/server-key.pem

# Logging configuration
no-stdout-log
log-file=/var/log/turnserver.log
verbose

# Security settings
no-cli
no-loopback-peers
no-multicast-peers

# Performance settings
min-port=${min_port_value}
max-port=${max_port_value}

# Database (optional)
# userdb=/var/lib/turn/turndb

# Miscellaneous
mobility
no-tlsv1
no-tlsv1_1
EOF

        log_success "Coturn config generated: docker/coturn/turnserver.conf"
        log_info "TURN server username: ${TURN_USERNAME}"
        log_warning "TURN server password saved in .env"
    fi
}

# Generate Docker ignore files
generate_dockerignore() {
    log_info "Generating Docker ignore files..."
    
    # Backend .dockerignore
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

    # Frontend .dockerignore
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

    log_success "Docker ignore files generated"
}

# Create log directories
create_log_directories() {
    log_info "Creating log directories..."
    
    mkdir -p logs/{nginx,backend,frontend,coturn}
    
    # Set permissions
    chmod 755 logs
    chmod 755 logs/*
    
    log_success "Log directories created: logs/"
}

# Main function
main() {
    echo -e "${BLUE}=== PrivyDrop Config Generation ===${NC}"
    echo ""
    
    # Parse arguments (consistent with the environment detection script)
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            --mode)
                DEPLOYMENT_MODE="$2"
                case "$2" in
                    lan-http|lan-tls)
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
            --with-turn)
                WITH_TURN="true"
                shift
                ;;
            --turn-external-ip)
                TURN_EXTERNAL_IP_OVERRIDE="$2"
                shift 2
                ;;
            --turn-port-range)
                parse_turn_port_range "$2"
                shift 2
                ;;
            --enable-sni443)
                ENABLE_SNI443=true
                shift
                ;;
            --no-sni443)
                ENABLE_SNI443=false
                shift
                ;;
            --with-nginx)
                WITH_NGINX=true
                shift
                ;;
            --enable-web-https)
                WEB_HTTPS_ENABLED=true
                HTTPS_LISTEN_PORT="8443"
                shift
                ;;
            --no-clean)
                NO_CLEAN=true
                shift
                ;;
            --reset-ssl)
                RESET_SSL=true
                shift
                ;;
            --ssl-mode)
                SSL_MODE="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Clean previous outputs first (avoid stale leftovers)
    cleanup_previous_artifacts

    # Run environment detection first
    if ! detect_network_environment; then
        log_error "Environment detection failed"
        exit 1
    fi
    
    if ! check_system_resources; then
        log_error "System resource check failed"
        exit 1
    fi
    
    # No automatic deployment-mode detection here; honor user-provided --mode
    echo ""
    
    # Generate all configuration files
    generate_env_file
    echo ""
    
    generate_nginx_config
    echo ""
    
    # Certificate generation policy:
    # - full uses letsencrypt (issued/copied by deploy script)
    # - lan-tls uses self-signed only when --enable-web-https is set
    # - others: none
    if [[ -z "$SSL_MODE" ]]; then
        case "$DEPLOYMENT_MODE" in
            full)
                SSL_MODE="letsencrypt"
                ;;
            lan-tls)
                if [[ "$WEB_HTTPS_ENABLED" == "true" ]]; then
                    SSL_MODE="self-signed"
                else
                    SSL_MODE="none"
                fi
                ;;
            *)
                SSL_MODE="none"
                ;;
        esac
    fi

    # SNI on 443 enabled by default: full mode with domain, unless --no-sni443
    if [[ -z "$ENABLE_SNI443" ]]; then
        if [[ "$DEPLOYMENT_MODE" == "full" && -n "$DOMAIN_NAME" ]]; then
            ENABLE_SNI443=true
        else
            ENABLE_SNI443=false
        fi
    fi

    generate_ssl_certificates
    echo ""

    # Enable HTTPS depending on mode/certs
    case "$DEPLOYMENT_MODE" in
        full)
            enable_https_if_cert_present
            echo ""
            ;;
        lan-tls)
            # HTTPS already handled on generation when enabled
            :
            ;;
        *)
            :
            ;;
    esac

    generate_coturn_config
    echo ""
    
    generate_dockerignore
    echo ""
    
    create_log_directories
    echo ""
    
    log_success "🎉 All configuration files generated!"
    echo ""
    echo -e "${BLUE}Generated files:${NC}"
    echo "  .env - Environment variables"
    echo "  docker/nginx/ - Nginx config"
    echo "  docker/ssl/ - SSL certificates"
    [[ "$TURN_ENABLED" == "true" ]] && echo "  docker/coturn/ - TURN server config"
    echo "  logs/ - Log directories"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  Run './deploy.sh' to start deployment"
}

# If the script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
