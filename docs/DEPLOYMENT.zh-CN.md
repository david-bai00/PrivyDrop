# Privydrop 部署指南

本指南提供部署 Privydrop 全栈应用的全面说明，包括设置 Redis、TURN 服务器、后端服务、前端应用以及配置 Nginx 作为反向代理。

## 1. 引言

本文档将引导您完成准备服务器环境、配置依赖项和部署 Privydrop 的前后端。无论您是设置开发/测试环境还是完整的生产实例，本指南都旨在涵盖所有基本方面。

## 2. 先决条件

在开始之前，请确保您的服务器环境满足以下要求：

- **操作系统：** Linux 发行版（例如，推荐 Ubuntu 20.04 LTS 或更高版本）。
- **Node.js：** v18.x 或更高版本。
- **npm/pnpm：** Node.js 的包管理器。
- **Root 或 Sudo 权限：** 安装软件包和配置服务所需。
- **域名：** 生产环境部署需要一个域名。
- **可选：基础环境与 Docker 镜像参考：** 如果您需要从一个非常纯净的系统环境开始搭建，或者希望了解用于 Docker 构建的基础依赖，可以参考 `backend/docker/Dockerfile` 文件（用于 Docker 基础镜像构建）和 `backend/docker/env_install.log` 文件（依赖安装记录）。

## 3. 环境安装

**重要提示：** 项目根目录的 `backend/docker/env_install.sh` 脚本包含了所有必要的依赖安装命令，包括 Node.js、Redis、Coturn、Nginx 等。您可以直接运行此脚本来安装所有依赖：

```bash
# 确保脚本有执行权限
chmod +x backend/docker/env_install.sh

# 运行安装脚本
sudo bash backend/docker/env_install.sh
```

该脚本将自动安装：
- **Node.js v20** - 运行环境
- **Redis Server** - 用于房间管理和缓存  
- **Coturn** - TURN/STUN 服务器（可选，用于NAT穿透）
- **Nginx** - Web 服务器和反向代理（使用官方仓库）
- **PM2** - Node.js 进程管理器
- **Certbot** - SSL 证书管理

安装完成后，可以验证各服务状态：
```bash
# 验证 Node.js 版本
node -v

# 验证 Redis 状态
sudo systemctl status redis-server

# 验证 Nginx 安装
nginx -V

# 验证 Coturn 安装
sudo systemctl status coturn
```

**注意事项：**
- **Redis配置：** 默认监听 `127.0.0.1:6379`，请确保后端 `.env` 文件中包含正确的 `REDIS_HOST` 和 `REDIS_PORT`
- **TURN服务：** 为可选配置，Privydrop 默认使用公共 STUN 服务器，只有对 NAT 穿透有极高要求时才需要配置
- **Nginx：** 脚本安装官方版本并验证 stream 模块支持

**TURN服务器防火墙配置（如果需要配置TURN服务）：**
```bash
# 启用 Coturn 服务
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# 防火墙配置：打开 Turnserver 默认端口
sudo ufw allow Turnserver
sudo ufw reload
```

通过 `sudo ufw app info Turnserver` 看到的端口如下：
- `3478,3479,5349,5350,49152:65535/tcp`
- `3478,3479,5349,5350,49152:65535/udp`

## 4. 应用部署 (生产环境)

本节介绍如何使用 Nginx 和 PM2 在生产环境部署 PrivyDrop。

### 4.1. 获取代码并安装依赖

```bash
git clone https://github.com/david-bai00/PrivyDrop.git
cd PrivyDrop

# 安装后端依赖
cd backend && npm install && cd ..

# 安装前端依赖
cd frontend && pnpm install && cd ..
```

### 4.2. 构建应用

```bash
cd frontend && pnpm build && cd ..
cd backend && npm run build && cd ..
```

这将分别在 `frontend/.next` 和 `backend/dist` 目录生成优化后的生产版本。

### 4.3. 配置 Nginx 作为反向代理

在生产中，Nginx 将作为所有流量的入口，负责 SSL 终止，并将请求路由到正确的前端或后端服务。

1.  **为后端和前端准备生产环境变量**
    在部署之前，请确保后端和前端的生产环境变量文件已准备就绪。您需要从示例文件复制并根据您的服务器信息进行修改。

    - **后端配置:**

      ```bash
      # 位于项目根目录
      cp backend/.env_production_example backend/.env.production
      ```

      然后编辑 `backend/.env.production`，至少配置 `CORS_ORIGIN` 为您的主域名 (例如 `https://privydrop.app`) 以及 `REDIS` 相关信息。

    - **前端配置:**
      ```bash
      # 位于项目根目录
      cp frontend/.env_production_example frontend/.env.production
      ```
      然后编辑 `frontend/.env.production`，配置 `NEXT_PUBLIC_API_URL` 为您的后端服务域名 (例如 `https://privydrop.app`)。

2.  **防火墙:**
    打开'Nginx Full'默认端口以及 443/udp

    ```bash
        sudo ufw allow 'Nginx Full'
        sudo ufw reload # 或 ufw enable
    ```

    通过 sudo ufw app info 'Nginx Full'看到的端口如下：
    80,443/tcp

3.  **生成 Nginx 基础配置:**
    后端项目 `backend/docker/Nginx/` 目录中提供了配置脚本和模板。此模板使用一个临时的"占位符"证书，以确保 Nginx 配置在申请真实证书前是有效的。

    - 现在，编辑 `backend/.env.production` 文件，添加 `NGINX_*` 相关变量。**无需 SSL 证书路径**。示例为：
      ```
      NGINX_SERVER_NAME=privydrop.app # 你的主域名
      NGINX_FRONTEND_ROOT=/path/to/your/PrivyDrop/frontend # 前端项目根目录
      TURN_REALM=turn.privydrop.app # TURN 服务器域名（如需配置 TURN 服务）
      ```
    - 执行脚本生成 Nginx 配置文件：
      ```bash
      # 此脚本会使用 .env 文件中的变量来生成 Nginx 配置文件
      sudo bash backend/docker/Nginx/configure.sh backend/.env.production
      ```

### 4.4. 使用 Certbot 安装统一 SSL 证书

现在 Nginx 有了基础配置，我们可以使用 Certbot 来获取并安装真实的 SSL 证书。我们将为所有服务（主域名、www 和 TURN）申请一张统一的证书，并让 Certbot 自动更新 Nginx 配置。

1.  **安装 Certbot 的 Nginx 插件：**

    ```bash
    sudo apt install python3-certbot-nginx
    ```

2.  **运行 Certbot 申请证书：**

    - 此命令会自动检测您的 Nginx 配置并为其安装证书。
    - `-d` 参数指定所有需要包含在此证书中的域名。请确保您的域名 DNS 已正确解析到服务器 IP。
    - `--deploy-hook` 是一个关键参数：它会在证书成功续期后，自动重启 Coturn 服务，以加载新证书。这实现了完全自动化的证书维护。

    ```bash
    # 将 privydrop.app 替换为你的主域名
    sudo certbot --nginx \
        -d privydrop.app \
        -d www.privydrop.app \
        -d turn.privydrop.app \
        --deploy-hook "sudo systemctl restart coturn"
    ```

    按照 Certbot 的提示操作（例如输入邮箱、同意服务条款等）。

    运行如下命令，查看证书路径是否已替换：

    ```bash
    sudo grep ssl_certificate /etc/nginx/sites-enabled/default
    ```

    应该能看到指向 `/etc/letsencrypt/live/privydrop.app/` 的路径

3.  **删除由 Certbot 产生的多余配置:**

    ```bash
    sudo bash backend/docker/Nginx/del_redundant_cfg.sh
    ```

4.  **启动 nginx 服务:**
    ```bash
    sudo systemctl start[reload] nginx
    ```
    如果报错显示 Address already in use（通过 systemctl status nginx.service 查看），则运行 pkill nginx。

### 4.5. 配置并启动 TURN 服务 (生产环境)

获取到统一的 SSL 证书后，我们现在来完成 Coturn 服务的生产环境配置。

1.  **配置环境变量**:
    打开后端的 `.env.production` 文件，配置所有 `TURN_*` 相关变量。

    ```ini
    # .env.production

    # ... 其他变量 ...

    # TURN/STUN Server (Coturn) Configuration
    TURN_REALM=turn.privydrop.app # 你的 TURN 域名
    TURN_USERNAME=YourTurnUsername   # 设置一个安全的用户名
    TURN_PASSWORD=YourTurnPassword   # 设置一个强密码

    # 关键：将证书路径指向由 Certbot 为主域名生成的统一证书
    TURN_CERT_PATH=/etc/letsencrypt/live/privydrop.app/fullchain.pem
    TURN_KEY_PATH=/etc/letsencrypt/live/privydrop.app/privkey.pem
    ```

2.  **验证 SSL 证书权限**:
    Coturn 进程通常以一个低权限用户（如 `turnserver` 或 `coturn`）运行，而 Certbot 生成的证书文件默认属于 `root` 用户。因此，我们需要调整权限，确保 Coturn 有权限读取证书。

    ```bash
    # (可选) 查找 coturn 服务的运行用户
    # ps aux | grep turnserver

    # 创建一个共享组，并将 turnserver 用户添加进去
    sudo groupadd -f ssl-cert
    sudo usermod -a -G ssl-cert turnserver # 如果运行用户不是 turnserver，请替换

    # 更改证书目录的所有权和权限
    sudo chown -R root:ssl-cert /etc/letsencrypt/
    sudo chmod -R 750 /etc/letsencrypt/
    ```

3.  **生成配置文件并启动服务**:
    运行项目提供的脚本，它会根据 `.env.production` 文件生成 `/etc/turnserver.conf` 并重启 Coturn。
    ```bash
    # 使用你的 .env 文件路径
    sudo bash backend/docker/TURN/configure.sh backend/.env.production
    ```
4.  **检查服务状态与在线测试**:

    - 检查服务状态：
      ```bash
      sudo systemctl status coturn
      # 同时检查日志确保没有权限错误
      # sudo journalctl -u coturn -f
      ```
    - **在线测试 (推荐)**:
      服务启动后，使用在线工具，如 [Metered TURN Server Tester](https://www.metered.ca/turn-server-testing)，验证 TURNS 服务是否正常工作：

      - **TURNS URL**: `turn:turn.privydrop.app:3478` (将域名替换为你的)
      - **Username**: `你在 .env 中设置的用户名`
      - **Password**: `你在 .env 中设置的密码`

      如果所有检查点都显示绿色 "Success" 或 "Reachable"，则表示您的 TURN 服务器已成功配置。

### 4.6. 使用 PM2 运行应用

PM2 是一个强大的 Node.js 进程管理器，我们将用它来运行后端和前端服务。

1.  **使用统一配置文件启动服务：**

    项目根目录提供了一个统一的 `ecosystem.config.js` 配置文件，可以一次性启动所有服务：

    ```bash
    # 如果之前运行过服务，先停止并删除
    sudo pm2 stop all && sudo pm2 delete all

    # 使用统一配置文件启动所有服务
    sudo pm2 start ecosystem.config.js
    ```

2.  **管理应用：**
    - 查看状态: `pm2 list`
    - 查看日志: `pm2 logs <app_name>` (例如：`pm2 logs signaling-server` 或 `pm2 logs privydrop-frontend`)
    - 设置开机自启: `pm2 startup` 然后 `pm2 save`
    - 重启服务: `pm2 restart all` 或指定服务 `pm2 restart signaling-server`
    - 停止服务: `pm2 stop all` 或指定服务 `pm2 stop privydrop-frontend`

## 5. 故障排除

- **连接问题：** 检查防火墙、Nginx 代理设置、CORS_ORIGIN 配置，确保所有 PM2 进程都在运行。
- **Nginx 错误:** `sudo nginx -t` 检查语法，查看 `/var/log/nginx/error.log`。
- **PM2 问题:** `pm2 logs <app_name>` 查看应用日志。
- **证书权限 (生产环境)：** 如果 Coturn 或 Nginx 无法读取 SSL 证书，请仔细检查 `第 4.5 节` 中的文件权限和用户/组设置。

## 6. 安全与维护

- **SSL 证书续订：** 当你使用 `certbot --nginx` 并配合 `--deploy-hook` 成功配置证书后，Certbot 会自动处理 Nginx 证书的续订和 Coturn 服务的重启。你无需手动干预或使用额外的脚本。
- **防火墙：** 保持防火墙规则严格，仅允许必要的端口。
