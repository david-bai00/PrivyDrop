# PrivyDrop `refactor/webrtc-lifecycle` Docker 部署记录

更新时间：2026-06-08  
适用范围：`43.153.3.146` 上的 `privydrop.app` 生产部署与后续排障。

关联文档：

- [build/运维/2026-04-24-privydrop-ubuntu-入口排障记录.md](/home/bj/baijun/indie_hacker/privydrop/build/运维/2026-04-24-privydrop-ubuntu-入口排障记录.md)
- [build/2026-06-07_官网迁移到后端机部署记录.md](/home/bj/baijun/indie_hacker/privydrop/build/2026-06-07_官网迁移到后端机部署记录.md)

---

## 1. 本次部署目标

将 `refactor/webrtc-lifecycle` 分支部署到 `43.153.3.146`，并把这台机子的 PrivyDrop 入口统一到 Docker 方案，不再依赖宿主机 `snap caddy`。

注意：

- 本次实际上部署的是**本地工作区快照**，不是纯分支 `HEAD`。
- 原因是部署前额外修正了两个未提交的生产部署脚本问题：
  - `deploy.sh`
  - `docker/scripts/generate-config.sh`

这两个修正的目的：

- Let’s Encrypt 首次签发时同时覆盖 `privydrop.app`、`www.privydrop.app`、`turn.privydrop.app`
- Docker `nginx` 的 `server_name` 正确覆盖 apex + `www`

---

## 2. 切换后的稳定态

```text
公网 80/443
  -> Docker nginx (privydrop-nginx)
       privydrop.app / www.privydrop.app
         /api -> backend:3001
         /socket.io -> backend:3001
         其余请求 -> frontend:3002
       turn.privydrop.app
         通过 443 SNI 分流到 coturn:5349

Docker:
  backend  -> 3001
  frontend -> 3002
  redis    -> 6379
  coturn   -> 3478 / 5349 / 49152-49252
  nginx    -> 80 / 443

宿主机:
  snap.caddy.server.service -> disabled
  coturn.service            -> disabled
```

这代表 `2026-04-24` 文档里的旧事实已经失效：**当前线上入口不再是宿主机 snap caddy，而是 compose 内的 nginx。**

---

## 3. 部署前的关键前置判断

`2026-06-07` 已确认 `handyxlate.app` 从这台跳板机迁出，因此 `43.153.3.146` 可以专注承载 PrivyDrop，不再需要与 handyxlate 共享 Caddy 入口。

部署前线上旧状态：

- `/home/ubuntu/PrivyDrop` 还是旧版本代码
- `backend` / `frontend` / `redis` / `coturn` 容器仍在
- `privydrop-nginx` 长期处于 `Created`
- `80/443` 实际被宿主机 `snap caddy` 监听
- 宿主机 `coturn.service` 仍在运行

如果直接运行 `bash ./deploy.sh --mode full --domain privydrop.app --with-nginx --with-turn`，一定会与宿主机残留服务冲突。

---

## 4. 这次实际踩到的坑

### 坑 1：宿主机 `coturn.service` 抢占 `3478/5349`

现象：

- Docker 构建成功
- `privydrop-coturn` 创建后启动失败
- 报错 `failed to bind host port ... 3478 ... address already in use`

根因：

- 不是旧 Docker 容器残留
- 是宿主机 systemd 的 `coturn.service` 还在跑，直接占住了 TURN 端口

处理：

```bash
sudo systemctl stop coturn
sudo systemctl disable coturn
```

### 坑 2：中断部署后生成目录被 `root` 持有

现象：

- 重新用 `ubuntu` 执行部署时，`generate-config.sh` 报：
  - `docker/nginx/nginx.conf: Permission denied`
  - `docker/coturn/turnserver.conf: Permission denied`
  - `chmod logs: Operation not permitted`

根因：

- 前一轮部署失败或中断过程中，`docker/nginx/`、`docker/coturn/`、`logs/` 被 `root` 写入
- 后续再用 `ubuntu` 用户部署时就无法覆盖这些文件

处理策略：

- 本次直接改为 `root` 执行最终部署，避免继续与混合 ownership 对抗
- 部署完成后再把项目目录 ownership 还原给 `ubuntu`

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/PrivyDrop
```

### 坑 3：部署脚本默认没把 `www` 域名一并纳入生产证书与 `server_name`

根因：

- 原脚本对 bare domain 的处理不完整
- `full` 模式下更像是“`privydrop.app` + `turn.privydrop.app`”，但没有稳定覆盖 `www.privydrop.app`

处理：

- 在本地修改 `deploy.sh`
- 在本地修改 `docker/scripts/generate-config.sh`
- 之后才把工作区快照传到服务器部署

---

## 5. 本次实际执行顺序

高层步骤如下：

1. 停用宿主机 `snap.caddy.server.service`
2. 备份旧代码目录并下发新的工作区快照到 `/home/ubuntu/PrivyDrop`
3. 执行 `bash ./deploy.sh --clean`
4. 发现宿主机 `coturn.service` 抢端口，停止并禁用
5. 发现生成目录 ownership 混乱，改用 `root` 重新完整执行：

```bash
bash ./deploy.sh --clean
bash ./deploy.sh --mode full --domain privydrop.app --with-nginx --with-turn
```

6. 证书签发成功后，脚本自动重建 `nginx` 与 `coturn`，启用 HTTPS 和 443 SNI 分流
7. 部署完成后把 `/home/ubuntu/PrivyDrop` ownership 还原为 `ubuntu:ubuntu`

---

## 6. 部署后的验证结果

容器状态：

- `privydrop-backend`：`Up (healthy)`
- `privydrop-frontend`：`Up (healthy)`
- `privydrop-redis`：`Up (healthy)`
- `privydrop-nginx`：`Up`
- `privydrop-coturn`：`Up`

外部验证：

- `https://privydrop.app`：正常返回站点（首页会 `307` 到 `/en`）
- `https://www.privydrop.app`：正常
- `https://privydrop.app/api/health`：`200`
- 后端 `http://localhost:3001/health/detailed`：最终为 `healthy`

证书结果：

- 首次签发成功
- 证书目录：`/etc/letsencrypt/live/privydrop.app-0001/`
- 过期时间：`2026-09-05`

---

## 7. 后续接手人最该知道的事实

### 1. 现在不要再按旧 Caddy 拓扑排障

优先检查：

```bash
cd /home/ubuntu/PrivyDrop
docker compose ps
sudo ss -ltnup | egrep ':(80|443|3478|5349|3001|3002) '
```

而不是先看：

```bash
systemctl status snap.caddy.server.service
```

### 2. 如果再次部署，优先先清宿主机残留服务

部署前先确认：

```bash
systemctl is-active snap.caddy.server.service || true
systemctl is-active coturn || true
sudo ss -ltnup | egrep ':(80|443|3478|5349) ' || true
```

如果宿主机服务还活着，先停再部署。

### 3. 如果中途切到 `root` 跑脚本，最后必须把目录 ownership 还原

否则下次 `ubuntu` 用户会再次遇到权限错误：

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/PrivyDrop
```

### 4. 当前服务器上运行内容与 Git 分支 `HEAD` 可能暂时不一致

因为这次线上使用的是“分支代码 + 未提交部署修正”的工作区快照。  
如果后续需要复现线上，请优先核对：

- `deploy.sh`
- `docker/scripts/generate-config.sh`

---

## 8. 建议的后续动作

建议至少做下面两件事：

1. 把本次对 `deploy.sh` 与 `docker/scripts/generate-config.sh` 的修正正式提交入库
2. 后续任何生产部署都明确记录“是分支 HEAD 还是本地工作区快照”

可选改进：

1. 给 `build/运维/` 增加更多时间线文档索引
2. 在部署脚本里加入对宿主机 `coturn` / `caddy` 残留服务的显式检测与提示

---

## 9. 一句话结论

`43.153.3.146` 上的 PrivyDrop 现已从“宿主机 snap caddy + Docker 应用容器”的混合入口，切换为“Docker nginx + Docker coturn + Docker app”统一入口。后续排障思路、启动顺序、端口占用判断，都应该按新的 Docker 拓扑来做。
