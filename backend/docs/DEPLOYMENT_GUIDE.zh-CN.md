# Privydrop 后端部署指南

本指南提供部署 Privydrop 后端应用程序的全面说明，包括设置 Redis、TURN 和 Nginx（用于生产环境）等必要服务。

## 1. 引言

本文档将引导您完成准备服务器环境、配置依赖项和部署 Privydrop 后端的步骤。无论您是设置开发/测试环境还是完整的生产实例，本指南都旨在涵盖基本方面。

## 2. 先决条件

在开始之前，请确保您的服务器环境满足以下要求：

*   **操作系统：** Linux 发行版（例如，推荐 Ubuntu 20.04 LTS 或更高版本）。
*   **Node.js：** v18.x 或更高版本。
*   **npm (或 yarn)：** Node.js 的包管理器。
*   **Git：** 用于克隆代码仓库。
*   **Curl、GnuPG 等：** 用于安装 Nginx 或其他依赖项。
*   **Root 或 Sudo 权限：** 安装软件包和配置服务所需。

## 3. 依赖服务安装与配置

Privydrop 后端依赖于多个外部服务。

### 3.1. Redis 服务器

Redis 用于房间管理、会话信息和缓存。

**安装 (Ubuntu 示例)：**
```bash
sudo apt update
sudo apt install redis-server
```

**配置：**
- 默认情况下，Redis 监听 `127.0.0.1:6379` 并且不需要密码。
- 如果您的 Redis 实例位于不同的主机、端口或需要密码，则需要相应地更新后端应用程序的环境变量（参见第 4.3 节）。
- 确保 Redis 正在运行：
  ```bash
  sudo systemctl status redis-server
  # 或对于旧系统
  # /etc/init.d/redis-server status
  ```
- 如果 Redis 未运行，则启动它：
  ```bash
  sudo systemctl start redis-server
  # 或
  # sudo /etc/init.d/redis-server start
  ```

### 3.2. TURN/STUN 服务器 (Coturn)

TURN 服务器对于 WebRTC 穿透 NAT 和防火墙至关重要，可确保可靠的点对点连接。Coturn 是一个流行的开源 TURN 服务器实现。

**安装 (Ubuntu 示例)：**
```bash
sudo apt update
sudo apt install coturn
```

**配置：**

1.  **启用 Coturn 服务：**
    编辑 `/etc/default/coturn` 并取消注释该行：
    ```
    TURNSERVER_ENABLED=1
    ```

2.  **Coturn 配置文件 (`/etc/turnserver.conf`):**
    这是主要的配置文件。以下是一个综合示例，请根据您的需求进行调整。

    *   **用于测试/开发 (使用 IP，无 TLS):**
        ```conf
        # STUN/TURN 的监听 IP 地址。如果服务器在 NAT 之后，请使用服务器的私有/本地 IP，
        # 并确保后端的 TURN_EXTERNAL_IP 环境变量使用公网 IP。
        # 如果您的服务器直接拥有公网 IP，则可以使用该 IP。
        listening-ip=你的服务器私有或公网IP

        # 服务器的外部 IP 地址。
        # 这是客户端从互联网连接到 TURN 服务器将使用的 IP。
        # 如果服务器位于 NAT 之后，则必须设置此项。
        external-ip=你的服务器公网IP

        # TURN 服务器的 realm
        realm=你的服务器公网IP # 或用于生产环境的域名

        # TURN 认证用户
        user=你的Turn用户名:你的Turn密码

        # STUN/TURN 的监听端口 (UDP 和 TCP)
        listening-port=3478

        # STUN/TURN 的其他监听端口 (UDP 和 TCP)
        # alt-listening-port=3479 # 可选

        # 日志文件
        log-file=/var/log/turnserver.log
        verbose

        # 如果测试时没有 SSL 证书，则禁用 TLS/DTLS
        no-tls
        no-dtls

        # 其他推荐设置
        lt-cred-mech # 使用长期凭证机制
        fingerprint  # 对 STUN 消息使用指纹
        ```

    *   **用于生产 (使用域名，并为 TURNS 配置 TLS):**
        ```conf
        # 监听 IP 地址
        listening-ip=你的服务器私有或公网IP

        # 如果服务器在 NAT 之后，则为服务器的外部 IP 地址
        external-ip=你的服务器公网IP # 必须是公网 IP

        # TURN 服务器的 realm - 必须与 SSL 证书使用的域名匹配
        realm=turn.yourdomain.com

        # TURN 认证用户
        user=你的Turn用户名:你的Turn密码

        # STUN/TURN 的监听端口 (UDP 和 TCP) - 标准非 TLS
        listening-port=3478

        # TURNS (TLS-TCP) 的监听端口
        tls-listening-port=5349

        # TURNS 使用的 SSL 证书和密钥
        cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
        pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem

        # 日志文件
        log-file=/var/log/turnserver.log
        verbose

        # 其他推荐设置
        lt-cred-mech
        fingerprint
        # 如果需要，指定密码套件列表，例如为了兼容旧客户端，但现代默认值通常没问题。
        # cipher-list="DEFAULT"
        ```

3.  **防火墙配置：**
    在服务器的防火墙上打开必要的端口 (例如，使用 `ufw`)：
    *   **TCP & UDP `3478`**: 用于 STUN 和 TURN。
    *   **TCP & UDP `5349`**: 用于 TURNS (TURN over TLS/DTLS) - *生产环境*。
    *   **UDP `49152-65533`**: Coturn 的默认中继端口范围 (可在 `turnserver.conf` 中使用 `min-port` 和 `max-port` 配置)。
    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349 # 用于生产环境
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    sudo ufw status
    ```

4.  **生产环境的 SSL 证书 (TURNS)：**
    如果为生产环境部署并使用 `TURNS` (TURN over TLS)，您需要为您的 TURN 域名（例如 `turn.yourdomain.com`）准备 SSL 证书。
    *   确保您有一个 DNS 'A' 记录将 `turn.yourdomain.com` 指向您服务器的公网 IP。
    *   使用 Certbot 获取证书：
        ```bash
        sudo apt install certbot
        sudo certbot certonly --standalone -d turn.yourdomain.com
        ```
        证书和私钥通常存储在 `/etc/letsencrypt/live/turn.yourdomain.com/`。

5.  **SSL 证书权限 (生产环境)：**
    Coturn 进程（通常以用户 `turnserver` 运行）需要读取 SSL 证书和密钥的权限。
    *   检查当前权限：
        ```bash
        sudo ls -lh /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
        sudo ls -ld /etc/letsencrypt/archive/
        ```
    *   如果 Coturn 日志显示权限错误：
        创建一个组（例如 `ssl-cert`），将 `turnserver` 添加到该组，并调整权限：
        ```bash
        sudo groupadd -f ssl-cert
        # 查找 coturn 运行的用户，通常是 'turnserver' 或 'coturn'
        # ps aux | grep turnserver
        sudo usermod -a -G ssl-cert turnserver # 如果不同，请替换 'turnserver'
        sudo chown -R root:ssl-cert /etc/letsencrypt/
        sudo chmod -R 750 /etc/letsencrypt/
        ```
        验证 `/etc/letsencrypt/archive/` 和 `/etc/letsencrypt/live/` 上的新权限。

6.  **启动/重启并测试 Coturn：**
    ```bash
    sudo systemctl restart coturn
    sudo systemctl status coturn
    ```
    检查 `/var/log/turnserver.log` 中是否有任何错误。

    **测试您的 TURN 服务器：**
    使用在线工具，如 Metered TURN Server Tester (https://www.metered.ca/turn-server-testing)：
    *   **用于测试 (非 TLS)：**
        *   TURN URL: `turn:你的服务器公网IP:3478`
        *   用户名: `你的Turn用户名`
        *   密码: `你的Turn密码`
    *   **用于生产 (TURNS)：**
        *   TURNS URL: `turns:turn.yourdomain.com:5349`
        *   用户名: `你的Turn用户名`
        *   密码: `你的Turn密码`
    查找 "Success" 或 "Reachable" 消息。

### 3.3. Nginx (反向代理 - 生产环境)

建议在生产环境中使用 Nginx 作为反向代理，处理 SSL 终止、提供静态文件（如果适用）并启用 HTTP/3。

**安装 (支持 HTTP/3，Ubuntu 示例)：**
参考: https://nginx.org/en/linux_packages.html#Ubuntu

1.  **安装先决条件：**
    ```bash
    sudo apt install curl gnupg2 ca-certificates lsb-release ubuntu-keyring
    ```
2.  **导入 Nginx 签名密钥：**
    ```bash
    curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor \
     | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null
    ```
3.  **验证密钥：**
    ```bash
    gpg --dry-run --quiet --no-keyring --import --import-options import-show /usr/share/keyrings/nginx-archive-keyring.gpg
    # 期望指纹: 573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62
    ```
4.  **为稳定版 Nginx 包设置 apt 仓库：**
    ```bash
    echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
    http://nginx.org/packages/ubuntu `lsb_release -cs` nginx" \
     | sudo tee /etc/apt/sources.list.d/nginx.list
    ```
5.  **设置仓库 pinning：**
    ```bash
    echo -e "Package: *\nPin: origin nginx.org\nPin: release o=nginx\nPin-Priority: 900\n" \
     | sudo tee /etc/apt/preferences.d/99nginx
    ```
6.  **安装 Nginx：**
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

**配置：**

1.  **防火墙配置：**
    *   TCP `80` (用于 HTTP，重定向到 HTTPS)
    *   TCP `443` (用于 HTTPS)
    *   UDP `443` (用于 HTTP/3 QUIC)
    ```bash
    sudo ufw allow 'Nginx Full' # 允许 HTTP 和 HTTPS
    sudo ufw allow 443/udp     # 用于 HTTP/3
    sudo ufw status
    ```

2.  **主域名 SSL 证书：**
    为您的主应用程序域名（例如 `yourdomain.com` 和 `www.yourdomain.com`）获取 SSL 证书。
    ```bash
    # 确保已安装 certbot 并配置为与 Nginx 一起使用
    sudo apt install python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```
    按照提示操作。这也会尝试为 SSL 配置 Nginx。

3.  **Nginx 配置 (`/etc/nginx/nginx.conf` 和 `/etc/nginx/conf.d/` 中的 server blocks)：**
    您需要配置 Nginx 以：
    *   监听端口 80 并重定向到 HTTPS。
    *   监听端口 443 (TCP 和 UDP 用于 HTTP/3)。
    *   使用您的 SSL 证书。
    *   将请求代理传递到您的后端 Node.js 应用程序（例如，运行在 `localhost:3001`）。
    *   处理 Socket.IO 的 WebSocket 连接。
    *   （可选）如果前端静态文件在同一服务器上，则由 Nginx 提供服务。

    您的应用程序的基本 server block 示例 (`/etc/nginx/conf.d/privydrop.conf`):
    ```nginx
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        # 将所有 HTTP 请求重定向到 HTTPS
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        # 用于 HTTP/3 (QUIC)
        listen 443 quic reuseport;
        listen [::]:443 quic reuseport;

        server_name yourdomain.com www.yourdomain.com;

        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        include /etc/letsencrypt/options-ssl-nginx.conf; # Certbot 推荐的 SSL 设置
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;   # Certbot 推荐的 SSL 设置

        # HTTP/3 特定头部
        # 告知浏览器 HTTP/3 可用
        add_header Alt-Svc 'h3=":443"; ma=86400';
        # 用于 0-RTT
        # add_header Alt-Svc 'h3=":443"; ma=86400, h3-29=":443"; ma=86400'; # 如果支持较旧的 h3 草案
        # ssl_early_data on; # Nginx 1.15.4+

        # (可选) 如果由 Nginx 提供前端服务
        # root /path/to/your/frontend/build;
        # index index.html index.htm;

        location / {
            # 如果提供前端服务:
            # try_files $uri $uri/ /index.html;

            # 如果只有后端，或者当与前端分离时用于 API 调用:
            proxy_pass http://localhost:3001; # 假设后端运行在端口 3001
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;
            proxy_read_timeout 86400s; # 适用于可能较长的文件传输
            proxy_send_timeout 86400s;
        }

        # Socket.IO 特定 location (确保路径与您的 Socket.IO 路径匹配)
        location /socket.io/ {
            proxy_pass http://localhost:3001; # 假设后端运行在端口 3001
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        # 根据需要添加其他安全头部、日志记录等
    }
    ```
    *   **重要：** `nginx.conf` 主文件应包含一个启用 QUIC 的 `http` 块：
        ```nginx
        # 在 /etc/nginx/nginx.conf 中，位于 http {} 块内部：
        http {
            # ... 其他设置 ...
            quic_retry on; # Nginx 1.25.0+
            # ... 其他设置 ...
        }
        ```
        确保您的 Nginx 版本支持 QUIC 和 `quic_retry`。官方 Nginx 包通常支持。

4.  **测试 Nginx 配置并重启：**
    ```bash
    sudo nginx -t
    sudo systemctl restart nginx
    ```

## 4. 后端应用部署

### 4.1. 获取代码
将您的仓库克隆到服务器：
```bash
git clone <your-repository-url> privydrop
cd privydrop/backend
```

### 4.2. 安装依赖
```bash
npm install
```

### 4.3. 环境变量

在 `backend/` 目录中创建一个 `.env.production.local` 文件。此文件包含敏感信息和配置。

```ini
# 服务器配置
PORT=3001 # Node.js 应用监听的端口 (Nginx 将代理到此端口)
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com # 你的前端应用程序 URL

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password # 如果适用

# TURN 服务器配置
# 后端使用这些配置来通知客户端有关 TURN 服务器的信息。
# 用于测试 (如果使用非 TLS TURN)
# TURN_EXTERNAL_IP=你的服务器公网IP
# TURN_REALM=你的服务器公网IP
# TURN_USERNAME=你的Turn用户名
# TURN_PASSWORD=你的Turn密码

# 用于生产 (如果使用 TURNS)
TURN_EXTERNAL_IP=你的服务器公网IP # TURN 服务器的公网 IP
TURN_REALM=turn.yourdomain.com   # Realm, 通常是你的 TURN 域名
TURN_USERNAME=你的Turn用户名
TURN_PASSWORD=你的Turn密码
TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem # TURN SSL 证书路径
TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem   # TURN SSL 密钥路径
# 注意：后端本身并不直接使用 TURN_CERT_PATH/TURN_KEY_PATH
# 进行其自身操作，但如果您扩展其功能，则可能会传递此信息或将其用于内部验证。
# 这些路径的主要用户是 Coturn 本身。
# 后端主要需要知道正确的 TURN URL (从这些设置派生) 以发送给客户端。

# Nginx 相关 (如果存在辅助脚本，则由它们使用，或供参考)
# NGINX_SERVER_NAME=yourdomain.com
# NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
# NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem
# NGINX_FRONTEND_ROOT=/path/to/your/frontend/build # 如果 Nginx 提供前端服务
```
**重要：**
*   确保 `CORS_ORIGIN` 正确设置为您生产环境前端的域名。
*   `TURN_*` 变量对于后端正确通知客户端如何连接到您的 TURN 服务器至关重要。

### 4.4. 使用 PM2 进行进程管理

PM2 是 Node.js 应用程序的生产流程管理器。

1.  **全局安装 PM2：**
    ```bash
    sudo npm install -g pm2
    ```
2.  **使用 `ecosystem.config.js` 文件启动应用程序：**
    `ecosystem.config.js` 文件（通常在您的项目根目录中）定义了 PM2 应如何运行您的应用程序。
    ```bash
    # 如果尚未在后端目录中，请导航至该目录
    # cd /path/to/privydrop/backend

    sudo pm2 start ecosystem.config.js
    ```
    如果您先前运行的实例具有相同的名称（例如，在 `ecosystem.config.js` 中定义的 `signaling-server`）：
    ```bash
    sudo pm2 stop signaling-server && sudo pm2 delete signaling-server
    sudo pm2 start ecosystem.config.js
    ```
3.  **检查应用程序状态和日志：**
    ```bash
    sudo pm2 list
    sudo pm2 logs signaling-server # 或您 ecosystem 文件中定义的名称
    sudo pm2 monit
    ```
4.  **使 PM2 能够开机自启：**
    ```bash
    sudo pm2 startup
    # 遵循命令提供的说明 (通常涉及运行它输出的另一个命令)
    sudo pm2 save # 保存当前进程列表
    ```

### 4.5. 后端应用程序防火墙
如果您的后端应用程序端口（默认为 `3001`）并未由 Nginx 代理所有访问（例如，直接到应用程序的健康检查），请确保它在防火墙中已打开。但是，对于典型的 Nginx 生产设置，通常只需要 Nginx 端口（80、443）可公开访问。
```bash
# 仅当需要直接访问 Node.js 应用且不通过 Nginx 时
# sudo ufw allow 3001/tcp
```

## 5. Docker 化部署 (进阶/可选)

虽然本指南侧重于传统部署，但您也可以将 Privydrop 后端容器化。有关基本的 Docker 构建和运行命令，请参阅 `backend/docker/` 目录中的 `Dockerfile` 以及 `README.md` 中的 Docker 部署部分。

对于生产 Docker 设置，请考虑使用 `docker-compose` 来编排后端应用程序、Nginx（作为 Docker 内或主机上的反向代理）、Redis 以及可能的 Coturn（尽管 Coturn 通常直接在主机上运行以获得更好的网络访问效果）。在 Docker化环境中管理 SSL 证书和网络配置需要仔细规划。

## 6. 安全与维护

*   **定期更新：** 保持服务器的操作系统、Nginx、Node.js、PM2 和所有其他软件包为最新状态。
*   **SSL 证书续订：** Certbot 通常会设置自动续订。您可以使用 `sudo certbot renew --dry-run` 进行测试。确保续订过程有权在需要时重新启动 Nginx。
*   **日志管理：** 定期监控 Nginx (`/var/log/nginx/`)、Coturn (`/var/log/turnserver.log`) 和您的应用程序（通过 PM2）的日志。设置日志轮替。
*   **防火墙：** 保持防火墙规则严格，仅允许必要的端口。
*   **应用程序依赖项：** 定期更新 Node.js 依赖项 (`npm update`) 并进行全面测试。

## 7. 故障排除

*   **连接问题：** 检查防火墙规则、Nginx 代理设置、后端 .env 文件中的 `CORS_ORIGIN`，并确保所有服务（Redis、Coturn、Node.js 应用）都在运行。
*   **WebRTC 失败：** 使用 `chrome://webrtc-internals`（或 Firefox 等效工具）进行调试。独立测试您的 TURN 服务器。确保 `TURN_EXTERNAL_IP` 和 `TURN_REALM` 设置正确。
*   **Nginx 错误：** `sudo nginx -t` 将检查配置语法。检查 Nginx 错误日志。
*   **PM2 问题：** 使用 `pm2 logs <app_name>` 查看应用程序错误。
*   **证书权限：** 如果 Coturn 或 Nginx 无法读取 SSL 证书，请仔细检查文件权限和组成员身份。

---
这是一个草稿，可以根据需要扩展更多详细信息、针对不同 Linux 发行版的特定配置或更高级的主题。