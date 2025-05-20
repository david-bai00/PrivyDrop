# Privydrop 后端部署指南

本指南提供部署 Privydrop 后端应用程序的全面说明，包括设置 Redis、TURN 和 Nginx（用于生产环境）等必要服务。

## 1. 引言

本文档将引导您完成准备服务器环境、配置依赖项和部署 Privydrop 后端的步骤。无论您是设置开发/测试环境还是完整的生产实例，本指南都旨在涵盖基本方面。

## 2. 先决条件

在开始之前，请确保您的服务器环境满足以下要求：

- **操作系统：** Linux 发行版（例如，推荐 Ubuntu 20.04 LTS 或更高版本）。
- **Node.js：** v18.x 或更高版本。
- **npm (或 yarn)：** Node.js 的包管理器。
- **Root 或 Sudo 权限：** 安装软件包和配置服务所需。
- **可选：基础环境与 Docker 镜像参考：** 如果您需要从一个非常纯净的系统环境开始搭建，或者希望了解用于 Docker 构建的基础依赖，可以参考 `backend/docker/Dockerfile` 文件（用于 Docker 镜像构建）和 `backend/docker/env_install.log` 文件（可能包含特定环境下的依赖安装记录）。对于大多数标准 Linux 发行版，遵循本指南后续步骤即可。


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
  则将 redis 默认配置放到环境变量配置文件中，内容为：
  REDIS_HOST='localhost'
  REDIS_PORT=6379

- 如果您的 Redis 实例位于不同的主机、端口或需要密码，则需要相应地更新环境变量（参见第 4.3 节）。
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

2.  **Coturn 配置文件:**
    `docker/TURN/turnserver_production.conf` 和 `docker/TURN/turnserver_development.conf` 是生产和开发环境对应的模板配置文件，你不需要手动修改，只需要在环境变量配置文件中加入对应的字段就行（详见本节步骤 6）。

3.  **防火墙配置：**
    在服务器的防火墙上打开必要的端口 (例如，使用 `ufw`)：

    - **TCP & UDP `3478`**: 用于 STUN 和 TURN。
    - **TCP & UDP `5349`**: 用于 TURNS (TURN over TLS/DTLS) - **主要用于生产环境**。
    - **UDP `49152-65533`**: Coturn 的默认中继端口范围 (可在 `turnserver.conf` 中使用 `min-port` 和 `max-port` 配置)。

    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349 # 用于生产环境的 TURNS
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    sudo ufw status
    ```

    **注意：** 以下关于 SSL 证书和 TURNS 的配置（步骤 4 和步骤 5）主要针对**生产环境**。如果仅设置开发或测试环境，并使用非加密的 TURN (`turn:你的服务器公网IP:3478`)，则可以跳过这些步骤，并在步骤 6 中仅配置开发环境所需的变量。

4.  **生产环境的 SSL 证书 (TURNS)：(生产环境步骤)**
    如果为生产环境部署并使用 `TURNS` (TURN over TLS)，您需要为您的 TURN 域名（例如 `turn.yourdomain.com`）准备 SSL 证书。

    - 确保您有一个 DNS 'A' 记录将 `turn.yourdomain.com` 指向您服务器的公网 IP。
    - 使用 Certbot 获取证书：
      ```bash
      sudo apt install certbot
      sudo certbot certonly --standalone -d turn.yourdomain.com
      ```
      证书和私钥通常存储在 `/etc/letsencrypt/live/turn.yourdomain.com/`。

5.  **SSL 证书权限 (生产环境)：(生产环境步骤)**
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

6.  **填写配置到环境变量文件**
    在相应的 `.env` 文件中修改您的 TURN 服务器配置信息。

    - 对于**开发/测试环境** (例如，在 `.env.development.local` 文件中加入如下内容)：
      ```env
      # TURN Server Configuration (Development)
      TURN_EXTERNAL_IP=YourServerPublicIP # 例如: 123.123.456.567
      TURN_REALM=YourServerPublicIP
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      ```
    - 对于**生产环境** (例如，在 `.env.production.local` 文件中加入如下内容)：
      ```env
        # TURN Server Configuration (Production)
        TURN_EXTERNAL_IP=YourServerPublicIP # 例如: 123.123.456.567
        TURN_REALM=turn.yourdomain
        TURN_USERNAME=YourTurnUsername
        TURN_PASSWORD=YourTurnPassword
        TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain/fullchain.pem
        TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain/privkey.pem
      ```

7.  **启动/重启并测试 Coturn：**

    ```bash
    # 使用适当的环境变量文件路径替换 "your_env_file_path"
    # 例如: sudo bash ./docker/TURN/configure.sh .env.development.local
    # 或: sudo bash ./docker/TURN/configure.sh .env.production.local
    sudo bash ./docker/TURN/configure.sh your_env_file_path
    sudo systemctl status coturn
    ```

    检查 `/var/log/turnserver.log` (或 Coturn 日志文件路径) 中是否有任何错误。

    **测试您的 TURN 服务器：**
    使用在线工具，如 Metered TURN Server Tester (https://www.metered.ca/turn-server-testing)：

    - **用于开发/测试 (非 TLS)：**
      - TURN URL: `turn:你的服务器公网IP:3478`
      - 用户名: `你的Turn用户名`
      - 密码: `你的Turn密码`
    - **用于生产 (TURNS) (若已配置)：**
      - TURNS URL: `turns:turn.yourdomain:5349`
      - 用户名: `你的Turn用户名`
      - 密码: `你的Turn密码`

    查找 "Success" 或 "Reachable" 消息。

### 3.3. Nginx (反向代理 - 生产环境)

**注意：本节内容完全针对生产环境。如果您正在设置开发或测试环境，并且不使用 Nginx 作为反向代理，则可以跳过此整个 3.3 节。**

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

**配置 (生产环境)：**

1.  **防火墙配置：**

    - TCP `80` (用于 HTTP，重定向到 HTTPS)
    - TCP `443` (用于 HTTPS)
    - UDP `443` (用于 HTTP/3 QUIC)

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

3.  **Nginx 配置：**
    `docker/Nginx/default` 是 Nginx 配置模板。您不需要手动修改该文件，只需要将以下配置添加到生产环境变量文件 `.env.production.local` 中：
    ```env
    # Nginx Configuration (Production)
    NGINX_SERVER_NAME=yourdomain # 不带 www 前缀,yourdomain包含了后缀
    NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain/fullchain.pem
    NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain/privkey.pem
    NGINX_FRONTEND_ROOT=/path/to/your/frontend/build # 前端静态文件构建产物的路径
    ```
4.  **应用 Nginx 配置并重启：**
    ```bash
    # 此脚本会使用 .env.production.local 中的 NGINX_* 变量来生成 Nginx 配置文件
    sudo bash docker/Nginx/configure.sh .env.production.local
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

### 4.3. 环境变量配置

后端应用的运行依赖于环境变量。请根据您的部署环境（开发/测试或生产）在 `privydrop/backend` 目录下创建并配置相应的 `.env` 文件。

- **开发/测试环境**: 创建 `.env.development.local` 文件。
- **生产环境**: 创建 `.env.production.local` 文件。 **(生产环境步骤)**

在对应的 `.env` 文件中加入以下与后端相关的基本配置内容：

```env
NODE_ENV=development # 或 production
BACKEND_PORT=3001
CORS_ORIGIN=http://localhost:3000 # 开发环境示例, 生产环境应为 https://www.yourdomain
```

**重要提示：** 请确保之前在 **第 3.1 节 (Redis)** 和 **第 3.2 节 (TURN 服务器)** 中讨论的 Redis 和 TURN 服务器相关环境变量也已正确添加到相应的 `.env.development.local` 或 `.env.production.local` 文件中。

对于**生产环境 (`.env.production.local`)**，请务必确认所有配置（如 `NODE_ENV=production`，生产 TURN URL，生产 CORS origin 等）均已正确设置。

### 4.4. 启动开发/测试服务器

完成开发环境配置 (`.env.development.local`) 后，可以使用以下命令启动后端服务进行开发或测试：

```bash
# 确保您在 privydrop/backend 目录下
npm run dev
```

此命令通常会使用 `.env.development.local` 中的配置。

### 4.5. 生产环境部署 (使用 PM2)

**注意：本节介绍如何使用 PM2 进行生产环境部署。如果仅设置开发/测试环境，可以跳过此节。**

PM2 是 Node.js 应用程序的生产流程管理器，建议用于生产部署。

1.  **全局安装 PM2：**
    ```bash
    sudo npm install -g pm2
    ```
2.  **使用 `ecosystem.config.js` 文件启动应用程序：**
    项目根目录下的 `backend/ecosystem.config.js` 是 PM2 的配置文件。

    ```bash
    # 确保您在 privydrop/backend 目录下
    # cd /path/to/privydrop/backend

    # 启动前，请确保 .env.production.local 文件已按生产环境要求配置完毕
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

## 5. Docker 化部署 (目前暂不支持)

虽然本指南侧重于传统部署，但您也可以将 Privydrop 后端容器化。`backend/docker/Dockerfile` 提供了基本的环境构建过程记录。

**注意：** 此部署方式当前主要供参考，官方支持尚不完善。生产环境的 Docker 部署需要更详细的规划，包括使用 `docker-compose` 来编排后端应用程序、Nginx（作为 Docker 内或主机上的反向代理）、Redis 以及可能的 Coturn（尽管 Coturn 通常直接在主机上运行以获得更好的网络访问效果）。在 Docker 化环境中管理 SSL 证书和网络配置需要仔细规划。

## 6. 安全与维护

- **SSL 证书续订 (生产环境相关)：** 可以参考 `backend/docker/Nginx/renew_ssl.sh` 脚本进行自动续订。
- **防火墙：** 保持防火墙规则严格，仅允许必要的端口。

## 7. 故障排除

- **连接问题：** 检查防火墙规则、Nginx 代理设置（生产环境）、后端 `.env` 文件中的 `CORS_ORIGIN`，并确保所有服务（Redis、Coturn、Node.js 应用）都在运行且配置正确。
- **Nginx 错误 (生产环境)：** `sudo nginx -t` 将检查配置语法。检查 Nginx 错误日志 (通常在 `/var/log/nginx/error.log`)。
- **PM2 问题 (生产环境)：** 使用 `pm2 logs <app_name>` 查看应用程序错误。
- **证书权限 (生产环境)：** 如果 Coturn 或 Nginx 无法读取 SSL 证书，请仔细检查文件权限和用户/组设置。
- **Coturn 日志：** 检查 `/var/log/turnserver.log` (或您系统中 Coturn 的日志路径) 获取 Coturn 服务相关的错误信息。
