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
bash ./deploy.sh
```

That's it! 🎉

## 📚 Deployment Modes

### LAN HTTP (lan-http)

**Use Case**: Private network file transfer, personal use, testing environment

```bash
bash ./deploy.sh --mode lan-http
```

**Features**:

- ✅ HTTP access
- ✅ Private network P2P transfer
- ✅ Uses public STUN servers
- ✅ Zero configuration startup

### Public Mode

**Use Case**: Servers with public IP but no domain

```bash
bash ./deploy.sh --mode public --with-turn --with-nginx
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

> Tip: The script no longer auto-detects the deployment mode; always pass `--mode lan-http|lan-tls|public|full`. If the detected LAN IP is not the one you expect, add `--local-ip 192.168.x.x` to override.

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

- With Nginx (recommended, same-origin gateway)
  - lan-http/public: `http://localhost` (or `http://<public IP>`)
  - lan-tls (with `--enable-web-https`): `https://localhost:8443` (or `https://<LAN IP>:8443`)
  - full (with domain): `https://<your-domain>` (443)
  - Health checks: `curl -fsS http://localhost/api/health` (lan-http/public), `curl -kfsS https://localhost:8443/api/health` (lan-tls+https), `curl -fsS https://<domain>/api/health` (full)

- Without Nginx (direct ports, for debugging only)
  - Frontend: `http://localhost:3002` (or `http://<LAN IP>:3002`)
  - API: `http://localhost:3001` (or `http://<LAN IP>:3001`)
  - Note: direct ports may cause CORS or 404 in production/public setups and are not recommended for public access.

### HTTPS Access (lan-tls/full)

- lan-tls: with `--enable-web-https`, access via `https://localhost:8443` (certs in `docker/ssl/`). Import `docker/ssl/ca-cert.pem` into your browser or trust store on first use.
- full: after Let’s Encrypt issuance, access via `https://<your-domain>` (443). Certs auto-issue/renew; hot-reload is handled via deploy hook.

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
bash ./deploy.sh --clean
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
bash ./deploy.sh --clean   # or docker compose down

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
docker compose ps

# 2. Check health status
curl http://localhost:3001/health
curl http://localhost:3002/api/health

# 3. View detailed logs
docker compose logs -f

# 4. Check firewall
sudo ufw status
```

#### 5. WebRTC Connection Failure

**Symptom**: Cannot establish P2P connections

**Solution**:

```bash
# Enable TURN server
bash ./deploy.sh --with-turn

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

Usage (strongly recommended)

1) Import the self-signed CA (required)
- Location: `docker/ssl/ca-cert.pem`
- Browser import:
  - Chrome/Edge: Settings → Privacy & Security → Security → Manage certificates → “Trusted Root Certification Authorities” → Import `ca-cert.pem`
  - macOS: Keychain Access → System → Certificates → Import `ca-cert.pem` → set to “Always Trust”
  - Linux (system-wide):
    - `sudo cp docker/ssl/ca-cert.pem /usr/local/share/ca-certificates/privydrop-ca.crt`
    - `sudo update-ca-certificates`
- Without trusting the CA, browser HTTPS will show untrusted cert warnings and API requests will fail.

2) Access endpoints (default ports and paths)
- Nginx reverse proxy: `http://localhost`
- HTTPS (Web): `https://localhost:8443`, `https://<LAN IP>:8443`
- Frontend direct (optional): `http://localhost:3002`, `http://<LAN IP>:3002`
- Note: In lan-tls, 443 is not open; HTTPS uses 8443.

3) CORS
- For convenience, common dev origins are allowed by default: `https://<LAN IP>:8443`, `https://localhost:8443`, `http://localhost`, `http://<LAN IP>`, `http://localhost:3002`, `http://<LAN IP>:3002`.
- To minimize allowed origins, edit `CORS_ORIGIN` in `.env` and then `docker compose restart backend`.

4) Health checks
- `curl -kfsS https://localhost:8443/api/health` → 200
- `bash ./test-health-apis.sh` → all tests should pass (frontend container trusts the self-signed CA).

5) Deployment hints
- The script prints only reachable Nginx endpoints; in lan-tls it will show `https://localhost:8443` (and `https://<LAN IP>:8443` if available).

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
docker compose exec redis redis-cli BGSAVE

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
docker compose pull
docker compose up -d
```

## 🆘 Getting Help

### Command Line Help

```bash
bash ./deploy.sh --help

### Additional Notes

- In Docker environments, Next.js Image optimization is disabled by default (`NEXT_IMAGE_UNOPTIMIZED=true`) to avoid container loopback fetch failures on `/_next/image`. To enable it, set the variable to `false` and rebuild.
- With `--with-nginx`, the frontend is built to use same-origin API (`/api`, `/socket.io/`). Use the gateway URLs printed by the script; direct ports `:3002/:3001` are not recommended in production.
```

### Online Resources

- [Project Homepage](https://github.com/david-bai00/PrivyDrop)
- [Live Demo](https://www.privydrop.app/)
- [Issue Reporting](https://github.com/david-bai00/PrivyDrop/issues)

### Community Support

- GitHub Issues: Technical questions and bug reports
