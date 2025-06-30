# Privydrop 部署指南

本指南提供部署 Privydrop 全栈应用的全面说明，包括设置 Redis、TURN 服务器、后端服务、前端应用以及配置 Nginx 作为反向代理。

## 1. 引言

本文档将引导您完成准备服务器环境、配置依赖项和部署 Privydrop 的前后端。无论您是设置开发/测试环境还是完整的生产实例，本指南都旨在涵盖所有基本方面。

## 2. 先决条件

在开始之前，请确保您的服务器环境满足以下要求：

- **操作系统：** Linux 发行版（例如，推荐 Ubuntu 20.04 LTS 或更高版本）。
- **Node.js：** v18.x 或更高版本。
- **npm (或 yarn/pnpm)：** Node.js 的包管理器。
- **Root 或 Sudo 权限：** 安装软件包和配置服务所需。
- **域名：** 生产环境部署需要一个域名。
- **可选：基础环境与 Docker 镜像参考：** 如果您需要从一个非常纯净的系统环境开始搭建，或者希望了解用于 Docker 构建的基础依赖，可以参考 `backend/docker/Dockerfile` 文件（用于 Docker 镜像构建）和 `backend/docker/env_install.log` 文件（依赖安装记录）。

## 3. 依赖服务安装与配置

### 3.1. Redis 服务器

Redis 用于后端的房间管理、会话信息和缓存。

**安装 (Ubuntu 示例)：**

```bash
sudo apt update
sudo apt install redis-server
```

**配置：**

- 默认情况下，Redis 监听 `127.0.0.1:6379` 且无需密码。请确保后端的 `.env` 文件中包含 `REDIS_HOST` 和 `REDIS_PORT`。
- 确保 Redis 正在运行：`sudo systemctl status redis-server`
- 如果未运行，请启动：`sudo systemctl start redis-server`

### 3.2. TURN/STUN 服务器 (Coturn)

**重要提示：本节为可选配置。** Privydrop 默认仅使用公共 STUN 服务器，在多数网络环境下足以建立连接。只有当您对 NAT 穿透成功率有极高要求时，才需要搭建自己的 TURN 服务器。

TURN 服务器对于 WebRTC 穿透 NAT 和防火墙至关重要。Coturn 是一个流行的实现。

**安装 (Ubuntu 示例)：**

```bash
sudo apt update
sudo apt install coturn
```

**配置：**

1.  **启用 Coturn 服务：** 编辑 `/etc/default/coturn` 并取消注释 `TURNSERVER_ENABLED=1`。
2.  **防火墙配置：** 在服务器的防火墙上打开必要的端口 (例如，使用 `ufw`)：
    - TCP & UDP `3478`: 用于 STUN 和 TURN。
    - TCP & UDP `5349`: 用于 TURNS (TURN over TLS/DTLS) - **生产环境**。
    - UDP `49152-65535`: Coturn 的默认中继端口范围。
    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    ```
3.  **生产环境的 SSL 证书 (用于 TURNS):**
    为你的 TURN 域名 (例如 `turn.yourdomain.com`) 获取 SSL 证书。
    ```bash
    # 确保 DNS 'A' 记录将 turn.yourdomain.com 指向服务器 IP
    sudo apt install certbot
    sudo certbot certonly --standalone -d turn.yourdomain.com
    ```
4.  **SSL 证书权限验证：**
    Coturn 进程（通常以用户 `turnserver` 运行）需要读取 SSL 证书和密钥的权限。

    - 检查当前权限：
      ```bash
      sudo ls -lh /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
      sudo ls -ld /etc/letsencrypt/archive/
      ```
    - 如果 Coturn 日志显示权限错误：
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

5.  **配置并启动 Coturn:**

    - 在后端的 `.env` 文件中配置 `TURN_*` 相关环境变量（如用户名、密码、证书路径等）。
    - 在测试环境下需要填入的变量为：
      ```
      TURN_EXTERNAL_IP=YourServerPublicIP # 例如: 123.123.456.567
      TURN_REALM=YourServerPublicIP
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      ```
    - 在生产部署环境下需要填入的变量为：
      ```
      TURN_EXTERNAL_IP=YourServerPublicIP # 例如: 123.123.456.567
      TURN_REALM=turn.yourdomain
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain/fullchain.pem
      TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain/privkey.pem
      ```
    - 使用项目提供的脚本生成配置文件并启动服务：

    ```bash
    # 位于 backend/ 目录
    sudo bash ./docker/TURN/configure.sh path/to/your/.env.production
    # 开发环境使用 .env.development
    sudo systemctl status coturn
    ```

    - 检查日志 `/var/log/turnserver.log` 确认无误。

6.  **在线测试（可选）:**
    使用在线工具，如 Metered TURN Server Tester (https://www.metered.ca/turn-server-testing)：

    - **用于开发/测试 (非 TLS)：**
      - TURN URL: `你的服务器公网IP`
      - TURN Port: `3478`
      - 用户名: `你的Turn用户名`
      - 密码: `你的Turn密码`
    - **用于生产 (TURNS)：**
      - TURNS URL: `turn.yourdomain`
      - TURNS Port: `5349`
      - 用户名: `你的Turn用户名`
      - 密码: `你的Turn密码`

    正常的话，能看到 "Reachable" 消息。

## 4. 应用部署 (生产环境)

本节介绍如何使用 Nginx 和 PM2 在生产环境部署 PrivyDrop。

### 4.1. 获取代码并安装依赖

```bash
git clone <your-repository-url> privydrop
cd privydrop

# 安装后端依赖
cd backend && npm install && cd ..

# 安装前端依赖
cd frontend && pnpm install && cd ..
```

### 4.2. 构建应用

```bash
cd frontend && pnpm build && cd ..
cd backend && npm build && cd ..
```

这将分别在 `frontend/.next` 和 `backend/dist` 目录生成优化后的生产版本。

### 4.3. 配置 Nginx 作为反向代理

在生产中，Nginx 将作为所有流量的入口，负责 SSL 终止，并将请求路由到正确的前端或后端服务。

1.  **安装 Nginx:** 推荐安装支持 HTTP/3 的较新版本。

2.  **防火墙:** 确保 `TCP:80 (HTTP)` 和 `TCP/UDP:443 (HTTPS/HTTP3)` 端口已打开。

3.  **主域名 SSL 证书:** 为你的主域名 (如 `yourdomain.com`) 获取证书。

    ```bash
    sudo apt install python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```

4.  **Nginx 配置文件:**
    后端项目 `backend/docker/Nginx/` 目录中提供了配置脚本和模板。

    - 在后端的 `.env.production` 文件中添加 `NGINX_*` 相关变量，包括域名、证书路径和**前端构建产物的根目录**,示例为：

    ```
    NGINX_SERVER_NAME=yourdomain # 不带 www 前缀,yourdomain包含了后缀
    NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain/fullchain.pem
    NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain/privkey.pem
    NGINX_FRONTEND_ROOT=/path/to/your/frontend/build # 前端静态文件构建产物的路径
    ```

5.  **应用配置:** 创建软链接并重启 Nginx。
    ```bash
    # 此脚本会使用 .env.production 中的 NGINX_* 变量来生成 Nginx 配置文件
    sudo bash docker/Nginx/configure.sh .env.production
    ```

### 4.4. 配置环境变量

- **后端:**
  - 在 `backend/` 目录下创建 `.env.production` 或 `.env.development` 文件
  - 在 `.env.development` 文件中填入环境变量 (BACKEND_PORT, REDIS_HOST, REDIS_PORT, CORS_ORIGIN)。
  - 在 `.env.production` 文件中除了上述变量外，还要加入 (NGINX_SERVER_NAME, NGINX_SSL_CERT, NGINX_SSL_KEY, NGINX_FRONTEND_ROOT)。
- **前端:** 在 `frontend/` 目录下创建 `.env.production` 或 `.env.development` 文件,并填入环境变量 (NEXT_PUBLIC_API_URL)。

### 4.5. 使用 PM2 运行应用

PM2 是一个强大的 Node.js 进程管理器，我们将用它来分别运行后端服务和前端服务。

1.  **全局安装 PM2：**

    ```bash
    sudo npm install -g pm2
    ```

2.  **启动后端服务：**
    项目后端目录提供了一个 `ecosystem.config.js` 文件用于 PM2。

    ```bash
    cd backend
    # 确保 .env.production 已配置完毕
    pm2 start ecosystem.config.js
    ```

3.  **启动前端服务：**

    ```bash
    cd frontend
    pm2 start npm --name "privydrop-frontend" -- run start
    ```

    `npm start` 会启动 Next.js 的生产服务器，默认监听 3000 端口。

4.  **管理应用**
    - 查看状态: `pm2 list`
    - 查看日志: `pm2 logs <app_name>`
    - 设置开机自启: `pm2 startup` 然后 `pm2 save`

## 5. 故障排除

- **连接问题：** 检查防火墙、Nginx 代理设置、CORS_ORIGIN 配置，确保所有 PM2 进程都在运行。
- **Nginx 错误:** `sudo nginx -t` 检查语法，查看 `/var/log/nginx/error.log`。
- **PM2 问题:** `pm2 logs <app_name>` 查看应用日志。
- **证书权限 (生产环境)：** 如果 Coturn 或 Nginx 无法读取 SSL 证书，请仔细检查文件权限和用户/组设置。

## 7. 安全与维护

- **SSL 证书续订 (生产环境相关)：** 可以参考 `backend/docker/Nginx/renew_ssl.sh` 脚本进行自动续订。
- **防火墙：** 保持防火墙规则严格，仅允许必要的端口。
