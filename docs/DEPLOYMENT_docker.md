# PrivyDrop Docker One-Click Deployment (Recommended)

This guide provides a one-click Docker deployment for PrivyDrop. It supports both private and public networks, automates config/build/start, and provisions HTTPS certificates.

## 🚀 Quick Start (Top)

```bash
# Private LAN (no domain/public IP)
bash ./deploy.sh --mode lan-http

# Private LAN + TURN (for complex NAT/LAN)
bash ./deploy.sh --mode lan-http --with-turn

# LAN HTTPS (self-signed; dev/managed env; explicitly enable 8443)
bash ./deploy.sh --mode lan-tls --enable-web-https --with-nginx

# Public IP without domain (with TURN)
bash ./deploy.sh --mode public --with-turn

# Public domain (HTTPS + Nginx + TURN + SNI 443, auto-issue/renew certs)
bash ./deploy.sh --mode full --domain your-domain.com --with-nginx --with-turn --le-email you@domain.com
```

- Requires Docker Compose v2 (command `docker compose`).
- In full mode, Let’s Encrypt (webroot) is auto-issued and auto-renewed (no downtime); SNI 443 multiplexing is enabled by default (`turn.your-domain.com` → coturn:5349; others → web:8443).

## Modes Overview

- lan-http: Intranet HTTP; fastest to start; no TLS
- lan-tls:  Intranet HTTPS (self-signed; dev/managed env); 8443 disabled by default; enable via `--enable-web-https`; HSTS disabled; turns:443 not guaranteed
- public:   Public HTTP + TURN; works without a domain (no HTTPS/turns:443)
- full:     Domain + HTTPS (Let’s Encrypt auto-issue/renew) + TURN; SNI 443 split enabled by default (use `--no-sni443` to disable)

## 🎯 Deployment Advantages

Compared to traditional deployment methods, Docker deployment offers the following advantages:

| Comparison                   | Traditional Deployment          | Docker Deployment              |
| ---------------------------- | ------------------------------- | ------------------------------ |
| **Deploy Time**              | 30-60 minutes                   | 5 minutes                      |
| **Technical Requirements**   | Linux ops experience            | Basic Docker knowledge         |
| **Environment Requirements** | Public IP + Domain              | Works on private networks      |
| **Configuration Complexity** | 10+ manual steps                | One-click auto configuration   |
| **Success Rate**             | ~70%                            | >95%                           |
| **Maintenance Difficulty**   | Manual multi-service management | Automatic container management |

## 📋 System Requirements

### Minimum Configuration

- **CPU**: 1 core
- **Memory**: 512MB
- **Disk**: 2GB available space
- **Network**: Any network environment (private/public)

### Recommended Configuration

- **CPU**: 2+ cores
- **Memory**: 1GB+
- **Disk**: 5GB+ available space
- **Network**: 100Mbps+

### Software Dependencies

- Docker 20.10+
- Docker Compose 2.x (command `docker compose`)
- curl (for health checks, optional)
- openssl (cert tools; the script auto-installs certbot)

## 🚀 Quick Start

### 1. Get the Code

```bash
# Clone the project
git clone https://github.com/david-bai00/PrivyDrop.git
cd PrivyDrop
```

### 2. One-Click Deployment

```bash
# Basic deployment (recommended for beginners)
bash deploy.sh

# After deployment completes, visit:
# http://localhost:3002
```

That's it! 🎉

## 📚 Deployment Modes

### Basic Mode (Default)

**Use Case**: Private network file transfer, personal use, testing environment

```bash
bash deploy.sh
```

**Features**:

- ✅ HTTP access
- ✅ Private network P2P transfer
- ✅ Uses public STUN servers
- ✅ Zero configuration startup

### Public Mode

**Use Case**: Servers with public IP but no domain

```bash
bash deploy.sh --mode public --with-turn
```

**Features**:

- ✅ HTTP access
- ✅ Built-in TURN server
- ✅ Supports complex network environments
- ✅ Automatic NAT traversal configuration

### Full Mode (full)

**Use Case**: Production environment, public servers with domain

```bash
bash ./deploy.sh --mode full --domain your-domain.com --with-nginx --with-turn --le-email you@domain.com
```

**Features**:

- ✅ HTTPS secure access (Let’s Encrypt auto-issue/renew, zero downtime)
- ✅ Nginx reverse proxy
- ✅ Built-in TURN server (default port range 49152-49252/udp)
- ✅ SNI 443 multiplexing (turn.<domain> → coturn:5349; others → web:8443)
- ✅ Complete production setup

> Tip: If your network uses carrier-grade NAT or proxy and is mis-detected as public, append `--mode private` to skip public-IP probing and force basic mode. When the detected LAN IP is not the one you expect, append `--local-ip 192.168.x.x` to override it explicitly.

## 🔧 Advanced Configuration

### Custom Ports

```bash
# Modify .env file
FRONTEND_PORT=8080
BACKEND_PORT=8081
HTTP_PORT=8000
```

### Build-Time Proxy (optional)

Set the following variables in `.env` (or export them before running `deploy.sh`) when the build needs to go through a proxy. The configuration generator now preserves these fields on subsequent runs.

```bash
HTTP_PROXY=http://your-proxy:7890
HTTPS_PROXY=http://your-proxy:7890
NO_PROXY=localhost,127.0.0.1,backend,frontend,redis,coturn
```

`docker compose` passes these values as build args; the Dockerfiles expose them as environment variables so `npm`/`pnpm` automatically reuse the proxy. Leave them blank if you don't need a proxy.

### Common Flags

```bash
# Enable only Nginx reverse proxy
bash ./deploy.sh --with-nginx

# Enable TURN (recommended in public/full)
bash ./deploy.sh --with-turn

# Explicitly enable SNI 443 (auto-enabled in full+domain; use --no-sni443 to disable)
bash ./deploy.sh --with-sni443

# Adjust TURN port range (default 49152-49252/udp)
bash ./deploy.sh --mode full --with-turn --turn-port-range 55000-55100
```

## 🌐 Access Methods

### Local Access

- **Frontend App**: http://localhost:3002
- **API Interface**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### LAN Access

After deployment, the script automatically displays LAN access addresses:

```
🌐 LAN Access:
   Frontend App: http://192.168.1.100:3002
   Backend API: http://192.168.1.100:3001
```

### HTTPS Access (full mode)

- **Public HTTPS**: https://your-domain.com
- **Certificate Source**: Let’s Encrypt (auto issue/renew via webroot)
- **Runtime Location**: Copied to `docker/ssl/` and hot-reloaded

Notes:

- First-time issuance happens automatically after Nginx:80 is up; then 443 is enabled and hot-reloaded.
- Renewal is automated: a deploy-hook copies renewed certs to `docker/ssl/` and reloads Nginx; coturn is HUP’ed/restarted for TLS as needed.

## 🔍 Management Commands

### View Service Status

```bash
docker compose ps
```

### View Service Logs

```bash
# View all service logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f redis
```

### Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart backend
```

### Stop Services

```bash
# Stop services but keep data
docker compose stop

# Stop services and remove containers
docker compose down
```

### Complete Cleanup

```bash
# Clean all containers, images and data
bash deploy.sh --clean
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Port Already in Use

**Symptom**: Deployment shows port occupation warning

```
⚠️  The following ports are already in use: 3002, 3001
```

**Solution**:

```bash
# First try cleaning previous containers
bash deploy.sh --clean   # or docker compose down

# If the port is still occupied, locate the process
sudo ss -tulpn | grep :3002
sudo kill -9 <PID>

# Finally, adjust the exposed ports in .env if necessary
vim .env   # Update FRONTEND_PORT / BACKEND_PORT
```

#### 2. Insufficient Memory

**Symptom**: Containers fail to start or restart frequently

**Solution**:

```bash
# Check memory usage
free -h

# Add swap space (temporary solution)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 3. Docker Permission Issues

**Symptom**: Permission denied errors

**Solution**:

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Re-login or refresh group permissions
newgrp docker
```

#### 4. Service Inaccessible

**Symptom**: Browser cannot open pages

**Solution**:

```bash
# 1. Check service status
docker-compose ps

# 2. Check health status
curl http://localhost:3001/health
curl http://localhost:3002/api/health

# 3. View detailed logs
docker-compose logs -f

# 4. Check firewall
sudo ufw status
```

#### 5. WebRTC Connection Failure

**Symptom**: Cannot establish P2P connections

**Solution**:

```bash
# Enable TURN server
bash deploy.sh --with-turn

# Check network connectivity
curl -I http://localhost:3001/api/get_room
```

### Health Checks

The project provides comprehensive health check functionality:

```bash
# Run health check tests
bash test-health-apis.sh

# Manual service checks
curl http://localhost:3001/health          # Backend basic check
curl http://localhost:3001/health/detailed # Backend detailed check
curl http://localhost:3002/api/health      # Frontend check
```

### Performance Monitoring

```bash
# View container resource usage
docker stats

# View disk usage
docker system df

# Clean unused resources
docker system prune -f
```

## 📊 Performance Optimization

### Production Environment Optimization

1. **Enable Nginx Caching**:

```bash
bash deploy.sh --with-nginx
```

2. **Configure Resource Limits**:

```yaml
# Add to docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
```

3. **Enable Log Rotation**:

```bash
# Configure log size limits
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### Network Optimization

1. **Use Dedicated Network**:

```yaml
networks:
  privydrop-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

2. **Enable HTTP/2**:

```bash
# Auto-enabled (requires HTTPS)
bash deploy.sh --mode full --with-nginx
```

## 🔒 Security Configuration

### LAN HTTPS (lan-tls, self-signed, dev/managed env)

- 8443 is disabled by default; explicitly enable with:

```bash
bash ./deploy.sh --mode lan-tls --enable-web-https --with-nginx
```

- For development or managed devices only (internal CA trusted fleet-wide); HSTS disabled; `turns:443` not guaranteed. For restricted networks (443-only), use full (domain + trusted cert + SNI 443).

### Public Domain Deployment (HTTPS + Nginx) — Quick Test

1) Point your domain A record to the server IP (optional: also `turn.<your-domain>` to the same IP)

2) Run:

```bash
./deploy.sh --mode full --domain <your-domain> --with-nginx --with-turn --le-email you@domain.com
```

3) Open ports: `80`, `443`, `3478/udp`, `5349/tcp`, `5349/udp`

4) Verify: visit `https://<your-domain>`, `/api/health` returns 200; open `chrome://webrtc-internals` and check for `relay` candidates (TURN)

### SSL/TLS Automation (Let’s Encrypt)

In full mode, certificates are auto-issued and auto-renewed:

- Initial issuance: webroot (no downtime); system certs live under `/etc/letsencrypt/live/<domain>/`; copied to `docker/ssl/` and 443 is enabled.
- Renewal: `certbot.timer` or `/etc/cron.d/certbot` runs daily; the deploy-hook copies new certs to `docker/ssl/` and hot-reloads Nginx/Coturn.
- Lineage suffixes (-0001/-0002) are handled automatically.

### Network Security

1. **Firewall Configuration**:

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp  # TURN server
```

2. **Container Network Isolation**:
   - All services run in isolated networks
   - Only necessary ports exposed
   - Internal services communicate using container names

## 📈 Monitoring and Logging

### Log Management

All service logs are centrally stored in the `logs/` directory:

```
logs/
├── nginx/          # Nginx access and error logs
├── backend/        # Backend application logs
├── frontend/       # Frontend application logs
└── coturn/         # TURN server logs
```

## 🔄 Updates and Maintenance

### Update Application

```bash
# Pull latest code
git pull origin main

# Redeploy
bash deploy.sh
```

### Data Backup

```bash
# Backup Redis data
docker-compose exec redis redis-cli BGSAVE

# Backup SSL certificates
tar -czf ssl-backup.tar.gz docker/ssl/

# Backup configuration files
cp .env .env.backup
```

### Regular Maintenance

```bash
# Clean unused images and containers
docker system prune -f

# Update base images
docker-compose pull
docker-compose up -d
```

## 🆘 Getting Help

### Command Line Help

```bash
bash deploy.sh --help
```

### Online Resources

- [Project Homepage](https://github.com/david-bai00/PrivyDrop)
- [Live Demo](https://www.privydrop.app/)
- [Issue Reporting](https://github.com/david-bai00/PrivyDrop/issues)

### Community Support

- GitHub Issues: Technical questions and bug reports
