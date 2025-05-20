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
    docker/TURN/turnserver_production.conf 和 docker/TURN/turnserver_development.conf 是生产和开发环境对应的模板配置文件，你不需要手动修改，只需要在环境变量配置文件中加入对应的字段就行。

3.  **防火墙配置：**
    在服务器的防火墙上打开必要的端口 (例如，使用 `ufw`)：

    - **TCP & UDP `3478`**: 用于 STUN 和 TURN。
    - **TCP & UDP `5349`**: 用于 TURNS (TURN over TLS/DTLS) - _生产环境_。
    - **UDP `49152-65533`**: Coturn 的默认中继端口范围 (可在 `turnserver.conf` 中使用 `min-port` 和 `max-port` 配置)。

    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349 # 用于生产环境
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    sudo ufw status
    ```

4.  **生产环境的 SSL 证书 (TURNS)：**
    如果为生产环境部署并使用 `TURNS` (TURN over TLS)，您需要为您的 TURN 域名（例如 `turn.yourdomain.com`）准备 SSL 证书。

    - 确保您有一个 DNS 'A' 记录将 `turn.yourdomain.com` 指向您服务器的公网 IP。
    - 使用 Certbot 获取证书：
      ```bash
      sudo apt install certbot
      sudo certbot certonly --standalone -d turn.yourdomain.com
      ```
      证书和私钥通常存储在 `/etc/letsencrypt/live/turn.yourdomain.com/`。

5.  **SSL 证书权限 (生产环境)：**
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

6.  填写配置到环境变量文件
    在配置文件中修改你的 TURN 服务器配置信息，比如在.env.development.local 环境变量配置中加入如下内容：
    `# TURN Server Configuration`
    TURN_EXTERNAL_IP=YourServerPublicIP e.g.:123.123.456.567
    TURN_REALM=YourServerPublicIP
    TURN_USERNAME=UserName
    TURN_PASSWORD=PassWord

    在.env.production.local 环境变量配置中加入如下内容：
    `# TURN Server Configuration`
    TURN_EXTERNAL_IP=YourServerPublicIP e.g.:123.123.456.567
    TURN_REALM=turn.YourDomain
    TURN_USERNAME=UserName
    TURN_PASSWORD=PassWord
    TURN_CERT_PATH=/etc/letsencrypt/live/turn.YourDomain/fullchain.pem
    TURN_KEY_PATH=/etc/letsencrypt/live/turn.YourDomain/privkey.pem

7.  **启动/重启并测试 Coturn：**

    ```bash
    sudo bash ./docker/TURN/configure_turn.sh .env.development.local or .env.production.local
    sudo systemctl status coturn
    ```

    检查 `/var/log/turnserver.log` 中是否有任何错误。

    **测试您的 TURN 服务器：**
    使用在线工具，如 Metered TURN Server Tester (https://www.metered.ca/turn-server-testing)：

    - **用于测试 (非 TLS)：**
      - TURN URL: `turn:你的服务器公网IP:3478`
      - 用户名: `你的Turn用户名`
      - 密码: `你的Turn密码`
    - **用于生产 (TURNS)：**
      _ TURNS URL: `turns:turn.yourdomain.com:5349`
      _ 用户名: `你的Turn用户名` \* 密码: `你的Turn密码`
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
    docker/Nginx/default 为配置模板，你不需要修改该文件，只需要将以下配置添加到环境变量文件.env.production.local 中：
    ```
    # Nginx Configuration
    NGINX_SERVER_NAME=YourDomain # without www pre-fix
    NGINX_SSL_CERT=/etc/letsencrypt/live/YourDomain/fullchain.pem
    NGINX_SSL_KEY=/etc/letsencrypt/live/YourDomain/privkey.pem
    NGINX_FRONTEND_ROOT=path/to/frontend
    ```
4.  **测试 Nginx 配置并重启：**
    sudo bash docker/Nginx/configure.sh .env.production.local

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

在`.env.production.local`或`.env.development.local`中加入与后端相关的配置内容，如下：
NODE_ENV=development or production
BACKEND_PORT=3001
CORS_ORIGIN=http://localhost:3000 or htts://www.YourDomain

### 4.3 测试

sudo npm run dev

### 4.4. 生产部署

一般使用 PM2 进行生产级别的进程管理，PM2 是 Node.js 应用程序的生产流程管理器。

1.  **全局安装 PM2：**
    ```bash
    sudo npm install -g pm2
    ```
2.  **使用 `ecosystem.config.js` 文件启动应用程序：**

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

## 5. Docker 化部署 (目前暂不支持)

虽然本指南侧重于传统部署，但您也可以将 Privydrop 后端容器化。`backend/docker/Dockerfile`提供基本的环境构建过程记录。

对于生产 Docker 设置，请考虑使用 `docker-compose` 来编排后端应用程序、Nginx（作为 Docker 内或主机上的反向代理）、Redis 以及可能的 Coturn（尽管 Coturn 通常直接在主机上运行以获得更好的网络访问效果）。在 Docker 化环境中管理 SSL 证书和网络配置需要仔细规划。

## 6. 安全与维护

- **SSL 证书续订：** Certbot 通常会设置自动续订。您可以使用 `sudo certbot renew --dry-run` 进行测试。确保续订过程有权在需要时重新启动 Nginx。可以参考`backend/docker/Nginx/renew_ssl.sh`脚本进行自动续订。
- **防火墙：** 保持防火墙规则严格，仅允许必要的端口。

## 7. 故障排除

- **连接问题：** 检查防火墙规则、Nginx 代理设置、后端 .env 文件中的 `CORS_ORIGIN`，并确保所有服务（Redis、Coturn、Node.js 应用）都在运行。
- **Nginx 错误：** `sudo nginx -t` 将检查配置语法。检查 Nginx 错误日志。
- **PM2 问题：** 使用 `pm2 logs <app_name>` 查看应用程序错误。
- **证书权限：** 如果 Coturn 或 Nginx 无法读取 SSL 证书，请仔细检查文件权限和组成员身份。
