# PrivyDrop Ubuntu 线上入口排障记录

> 历史说明：本文记录的是 `2026-04-24` 到 `2026-06-07` 期间 `43.153.3.146` 上的旧入口拓扑，当时公网 `80/443` 由宿主机 `snap caddy` 承载。`2026-06-08` 起该机器已切换为 Docker `nginx + coturn` 直出，请同时参考 `build/运维/2026-06-08-refactor-webrtc-lifecycle-docker部署记录.md`。

最近更新：2026-05-13（追加第二次故障）

适用对象：后续接手 `privydrop.app` 线上运维、部署、排障的开发或运维同学。

关联文档：

- [build/privydrop-turn-443-caddy-nginx-analysis.md](/home/bj/baijun/indie_hacker/privydrop/build/privydrop-turn-443-caddy-nginx-analysis.md)

---

## 线上真实拓扑（两次故障均未变）

```text
公网 80/443
  -> 宿主机 snap Caddy (snap.caddy.server.service)
       privydrop.app / www.privydrop.app
         /api /socket.io /health -> 127.0.0.1:3001
         其余请求 -> 127.0.0.1:3002
       handyxlate.app / www.handyxlate.app -> 127.0.0.1:3000

Docker (compose):
  backend  -> 3001
  frontend -> 3002
  coturn   -> 3478 / 5349 / 49152-49252
  redis    -> 6379
  nginx    -> Created (未实际对外，长期未用)
```

## 当前 Caddy 配置

文件路径：`/var/snap/caddy/current/Caddyfile`

```caddyfile
http://43.153.3.146 {
    redir https://privydrop.app{uri} 301
}

www.handyxlate.app {
    encode zstd gzip
    tls /var/snap/caddy/ssl/handyxlate/origin.pem /var/snap/caddy/ssl/handyxlate/origin.key
    reverse_proxy 127.0.0.1:3000
}

handyxlate.app {
    tls /var/snap/caddy/ssl/handyxlate/origin.pem /var/snap/caddy/ssl/handyxlate/origin.key
    redir https://www.handyxlate.app{uri} permanent
}

privydrop.app, www.privydrop.app {
    encode zstd gzip

    @backend path /api /api/* /socket.io/* /health
    reverse_proxy @backend 127.0.0.1:3001

    reverse_proxy 127.0.0.1:3002
}
```

---

## 故障记录 #1（2026-04-24）：IP 跳转导致 TLS 错误

### 现象
用户反馈"今天不知道为啥打开不了了"。

### 观测
- Docker 容器 `backend` / `frontend` / `coturn` 均 `Up (healthy)`
- `privydrop-nginx` 容器处于 `Created`，已确认不对外服务
- 80/443 由宿主机 `snap caddy.server` 监听
- 域名 `https://privydrop.app` 实际可用

### 根因
访问服务器 IP `http://43.153.3.146` 时，Caddy 返回 `308 -> https://43.153.3.146/`，裸 IP 无有效 HTTPS 证书，浏览器报 TLS 错误，用户视角就是"打不开"。

### 修复
修改 Caddyfile，将 `http://43.153.3.146` 改为 `301` 跳转到 `https://privydrop.app/`，然后 `systemctl reload` 热重载。

### 修复后验证
| 检查项 | 结果 |
|--------|------|
| `http://43.153.3.146` → `https://privydrop.app/` | ✅ 301 |
| `https://privydrop.app/en` | ✅ 200 |
| `https://privydrop.app/api/health` | ✅ 200 |
| `https://privydrop.app/socket.io/?EIO=4&transport=polling` | ✅ 200 |

---

## 故障记录 #2（2026-05-13）：snap 自动更新导致 Caddy 停止

### 现象
用户再次反馈站点完全打不开。

### 观测
- Docker 容器 `backend` / `frontend` / `coturn` / `redis` 均 `Up (healthy)`
- **80/443 端口无任何进程监听** — Caddy 没有运行
- `snap.caddy.server.service` 状态为 `inactive (dead)`，且 `disabled`（不开机自启）
- `snap changes` 显示 `Auto-refresh snap "caddy"` 在当天 03:29 CST 触发

### 根因
snap 自动更新 caddy 包（v2.11.3，revision 694）触发了服务重启。重启过程中 caddy 启动后约 3 秒即退出（`Deactivated successfully`），导致 80/443 无人监听。同时服务原本为 `disabled`，不会自动重试或开机自启。

### 修复
```bash
sudo systemctl enable snap.caddy.server.service   # 启用开机自启
sudo systemctl start snap.caddy.server.service     # 立即启动
```

### 修复后验证
全部通过，与故障 #1 修复后验证结果一致。

### 本次暴露的新风险
**snap auto-refresh 是 Caddy 潜在的停机触发器。** snap 默认每天检查 4 次更新，如果某次更新后启动脚本无法正常拉起 caddy，站点就会再次中断。目前没有任何监控或自动恢复手段。

---

## 排障最简路径（更新版）

当站点打不开时，按以下顺序排查：

### 1. 先确认入口层是否存活 ⭐ 新增优先检查
```bash
# 如果 80/443 没有任何进程 → 直接跳到 Caddy 启动
sudo ss -ltnp | egrep ':(80|443) '
systemctl status snap.caddy.server.service --no-pager
```

如果 Caddy 不在运行：
```bash
sudo systemctl start snap.caddy.server.service
# 确认已 enabled（否则下次重启还会丢）
systemctl is-enabled snap.caddy.server.service
```

### 2. 再确认 Docker 业务容器
```bash
cd /home/ubuntu/PrivyDrop
docker compose ps -a
```
重点看 `frontend` / `backend` 是否 `healthy`。

### 3. 最后做健康检查
```bash
curl -s -o /dev/null -w '%{http_code}' -k https://privydrop.app/api/health
curl -s -o /dev/null -w '%{http_code}' -k https://privydrop.app/en
curl -s -o /dev/null -w '%{http_code}' -k 'https://privydrop.app/socket.io/?EIO=4&transport=polling'
```
三项都应返回 `200`。`http://43.153.3.146` 应返回 `301` 跳转到 `https://privydrop.app/`。

---

## 结构性风险（两次故障均未解决）

### 1. `docker-compose.yml` 与线上入口不一致
- 仓库中保留 `nginx` 服务 + `full` 模式 + `with-nginx` 语义
- 实际入口已是宿主机 snap Caddy
- 新维护者只看仓库会走错方向

### 2. snap 自动更新无保护
- snap 每天 4 次检查 auto-refresh
- 更新后如果 caddy 启动脚本异常退出，站点直接中断
- 当前无监控或自动恢复机制

### 3. 运维知识分散
- 项目文档 → Docker Nginx
- 服务器现实 → snap Caddy
- 架构评估 → 见关联文档
- 三种认知并存，排障时容易误判

## 后续建议

| 优先级 | 方案 | 说明 |
|--------|------|------|
| 🔴 短期 | 加 Caddy 存活监控 | 最简单的 cron：每分钟检查 80/443 端口，挂了就 `systemctl start` |
| 🟡 中期 | 补全生产拓扑文档 | 把 Caddy 配置、反代规则、TURN 暴露、Cloudflare 配置写清楚 |
| 🟢 长期 | 入口层统一 | 决定是迁回 Docker Nginx 还是正式承认 snap Caddy，统一文档和代码 |

---

## 服务器信息

- 主机 IP：`43.153.3.146`
- 系统：`Ubuntu 22.04 LTS`
- 登录用户：`ubuntu`
- 项目目录：`/home/ubuntu/PrivyDrop`
- 当前 Caddy 版本：`v2.11.3`（snap revision 694）
- 当前 LE 证书过期时间：约 `2026-07-16`

## 一句话给后续接手人

**不要先假设线上走的是 Docker Nginx。先查 `80/443` 到底是谁在监听、是不是还活着。** 当前这台机子的真实入口是宿主机 `snap caddy.server`，PrivyDrop 只是跑在 `3001/3002`。两次故障本质都是"入口层出了问题但应用本身没挂"。

## 敏感信息说明

为了降低泄漏风险，本文件没有落盘记录明文密码。保留的信息：主机 IP、用户名、项目目录、服务结构、配置路径、排障命令。未落盘的信息：服务器登录密码明文。如果必须做团队交接，建议把密码放进密码管理器。
