# PrivyDrop Docker 部署指南

本指南提供 PrivyDrop 的 Docker 一键部署方案，支持内网和公网环境，无需复杂的手动配置。

## 🎯 部署优势

相比传统部署方式，Docker 部署具有以下优势：

| 对比项目       | 传统部署             | Docker 部署      |
| -------------- | -------------------- | ---------------- |
| **部署时间**   | 30-60 分钟           | 5 分钟           |
| **技术要求**   | Linux 运维经验       | 会用 Docker 即可 |
| **环境要求**   | 公网 IP + 域名       | 内网即可使用     |
| **配置复杂度** | 10+个手动步骤        | 一键自动配置     |
| **成功率**     | ~70%                 | >95%             |
| **维护难度**   | 需要手动管理多个服务 | 容器自动管理     |

## 📋 系统要求

### 最低配置

- **CPU**: 1 核
- **内存**: 512MB
- **磁盘**: 2GB 可用空间
- **网络**: 任意网络环境（内网/公网均可）

### 推荐配置

- **CPU**: 2 核及以上
- **内存**: 1GB 及以上
- **磁盘**: 5GB 及以上可用空间
- **网络**: 100Mbps 及以上

### 软件依赖

- Docker 20.10+
- Docker Compose 2.0+ (或 docker-compose 1.27+)
- curl (用于健康检查)
- openssl (用于 SSL 证书生成)

## 🚀 快速开始

### 1. 获取代码

```bash
# 克隆项目
git clone https://github.com/david-bai00/PrivyDrop.git
cd PrivyDrop
```

### 2. 一键部署

```bash
# 基础部署 (推荐新手)
bash deploy.sh

# 等待部署完成后访问
# http://localhost:3002
```

就是这么简单！🎉

## 📚 部署模式详解

### 基础模式 (默认)

**适用场景**: 内网文件传输、个人使用、测试环境

```bash
bash deploy.sh
```

**特性**:

- ✅ HTTP 访问
- ✅ 内网 P2P 传输
- ✅ 使用公共 STUN 服务器
- ✅ 零配置启动

### 公网模式

**适用场景**: 有公网 IP 但无域名的服务器

```bash
bash deploy.sh --mode public --with-turn
```

**特性**:

- ✅ HTTP 访问
- ✅ 内置 TURN 服务器
- ✅ 支持复杂网络环境
- ✅ 自动配置 NAT 穿透

### 完整模式

**适用场景**: 生产环境、有域名的公网服务器

```bash
bash deploy.sh --domain your-domain.com --mode full --with-nginx --with-turn
```

**特性**:

- ✅ HTTPS 安全访问
- ✅ 自签名 SSL 证书
- ✅ Nginx 反向代理
- ✅ 内置 TURN 服务器
- ✅ 完整生产环境配置

> 提示：若家庭宽带/运营商代理导致脚本误判为公网环境，可追加 `--mode private` 强制跳过公网检测，按基础模式执行；如果自动识别到的局域网地址不是你想要的，可进一步追加 `--local-ip 192.168.x.x` 显式指定。

## 🔧 高级配置

### 自定义端口

```bash
# 修改 .env 文件
FRONTEND_PORT=8080
BACKEND_PORT=8081
HTTP_PORT=8000
```

### 构建阶段代理（可选）

若需要在 Docker 构建时走网络代理，可在 `.env` 中设置以下变量，或者在执行 `deploy.sh` 之前通过环境变量导出。重新运行配置脚本时，这些字段会被保留：

```bash
HTTP_PROXY=http://你的代理:7890
HTTPS_PROXY=http://你的代理:7890
NO_PROXY=localhost,127.0.0.1,backend,frontend,redis,coturn
```

`docker-compose` 会把这些变量作为 build args 传递给前后端镜像，Dockerfile 中会自动设置为环境变量，从而让 `npm`/`pnpm` 使用代理。若无需代理，保持为空即可。

### 启用特定服务

```bash
# 仅启用 Nginx 反向代理
bash deploy.sh --with-nginx

# 仅启用 TURN 服务器
bash deploy.sh --with-turn

# 启用所有服务
bash deploy.sh --with-nginx --with-turn
```

## 🌐 访问方式

### 本机访问

- **前端应用**: http://localhost:3002
- **API 接口**: http://localhost:3001
- **健康检查**: http://localhost:3001/health

### 局域网访问

部署完成后，脚本会自动显示局域网访问地址：

```
🌐 局域网访问：
   前端应用: http://192.168.1.100:3002
   后端API: http://192.168.1.100:3001
```

### HTTPS 访问 (如果启用)

- **安全访问**: https://localhost
- **证书位置**: `docker/ssl/ca-cert.pem`

**注意**: 首次访问 HTTPS 时，浏览器会提示证书不受信任，这是正常的。可以：

1. 点击"高级" → "继续访问"
2. 或导入 `docker/ssl/ca-cert.pem` 证书到浏览器

## 🔍 管理命令

### 查看服务状态

```bash
docker-compose ps
```

### 查看服务日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f redis
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart backend
```

### 停止服务

```bash
# 停ิ止服务但保留数据
docker-compose stop

# 停止服务并删除容器
docker-compose down
```

### 完全清理

```bash
# 清理所有容器、镜像和数据
bash deploy.sh --clean
```

## 🛠️ 故障排除

### 常见问题

#### 1. 端口被占用

**现象**: 部署时提示端口已被占用

```
⚠️  以下端口已被占用: 3002, 3001
```

**解决方案**:

```bash
# 方法1: 清理旧容器
bash deploy.sh --clean   # 或 docker-compose down

# 方法2: 查找并结束占用进程
sudo ss -tulpn | grep :3002
sudo kill -9 <PID>

# 方法3: 如仍冲突，再调整端口
vim .env   # 修改 FRONTEND_PORT / BACKEND_PORT
```

#### 2. 内存不足

**现象**: 容器启动失败或频繁重启

**解决方案**:

```bash
# 检查内存使用
free -h

# 添加交换空间 (临时解决)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 3. Docker 权限问题

**现象**: 提示权限不足

**解决方案**:

```bash
# 将用户添加到docker组
sudo usermod -aG docker $USER

# 重新登录或刷新组权限
newgrp docker
```

#### 4. 服务无法访问

**现象**: 浏览器无法打开页面

**解决方案**:

```bash
# 1. 检查服务状态
docker-compose ps

# 2. 检查健康状态
curl http://localhost:3001/health
curl http://localhost:3002/api/health

# 3. 查看详细日志
docker-compose logs -f

# 4. 检查防火墙
sudo ufw status
```

#### 5. WebRTC 连接失败

**现象**: 无法建立 P2P 连接

**解决方案**:

```bash
# 启用TURN服务器
bash deploy.sh --with-turn

# 检查网络连接
curl -I http://localhost:3001/api/get_room
```

### 健康检查

项目提供了完整的健康检查功能：

```bash
# 运行健康检查测试
bash test-health-apis.sh

# 手动检查各服务
curl http://localhost:3001/health          # 后端基础检查
curl http://localhost:3001/health/detailed # 后端详细检查
curl http://localhost:3002/api/health      # 前端检查
```

### 性能监控

```bash
# 查看容器资源使用
docker stats

# 查看磁盘使用
docker system df

# 清理未使用的资源
docker system prune -f
```

## 📊 性能优化

### 生产环境优化

1. **启用 Nginx 缓存**:

```bash
bash deploy.sh --with-nginx
```

2. **配置资源限制**:

```yaml
# 在 docker-compose.yml 中添加
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
```

3. **启用日志轮转**:

```bash
# 配置日志大小限制
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### 网络优化

1. **使用专用网络**:

```yaml
networks:
  privydrop-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

2. **启用 HTTP/2**:

```bash
# 自动启用 (需要 HTTPS)
bash deploy.sh --mode full --with-nginx
```

## 🔒 安全配置

### SSL/TLS 配置

1. **自签名证书** (默认):

   - 自动生成和配置
   - 适用于内网和测试环境
   - 证书位置: `docker/ssl/`

2. **Let's Encrypt 证书** (计划中):
   - 自动申请和续期
   - 适用于有域名的生产环境

### 网络安全

1. **防火墙配置**:

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp  # TURN服务器
```

2. **容器网络隔离**:
   - 所有服务运行在独立网络中
   - 仅暴露必要端口
   - 内部服务使用容器名通信

## 📈 监控和日志

### 日志管理

所有服务日志统一存储在 `logs/` 目录：

```
logs/
├── nginx/          # Nginx访问和错误日志
├── backend/        # 后端应用日志
├── frontend/       # 前端应用日志
└── coturn/         # TURN服务器日志
```

### 监控集成 (可选)

可以集成 Prometheus + Grafana 监控栈：

```bash
# 启用监控 (计划中)
bash deploy.sh --with-monitoring
```

## 🔄 更新和维护

### 更新应用

```bash
# 拉取最新代码
git pull origin main

# 重新部署
bash deploy.sh
```

### 数据备份

```bash
# 备份Redis数据
docker-compose exec redis redis-cli BGSAVE

# 备份SSL证书
tar -czf ssl-backup.tar.gz docker/ssl/

# 备份配置文件
cp .env .env.backup
```

### 定期维护

```bash
# 清理未使用的镜像和容器
docker system prune -f

# 更新基础镜像
docker-compose pull
docker-compose up -d
```

## 🆘 获取帮助

### 命令行帮助

```bash
bash deploy.sh --help
```

### 在线资源

- [项目主页](https://github.com/david-bai00/PrivyDrop)
- [在线演示](https://www.privydrop.app/)
- [问题反馈](https://github.com/david-bai00/PrivyDrop/issues)

### 社区支持

- GitHub Issues: 技术问题和 bug 报告
- GitHub Discussions: 使用交流和功能建议

---

## 📝 更新日志

### v1.0.0 (Docker 化版本)

- ✅ 新增 Docker 一键部署支持
- ✅ 新增健康检查 API
- ✅ 新增自动环境检测和配置生成
- ✅ 新增多种部署模式
- ✅ 新增完整的故障排除指南
- ✅ 支持内网部署，无需公网 IP

---

**🎉 恭喜！你已经成功部署了 PrivyDrop。开始享受安全、私密的文件分享吧！**
