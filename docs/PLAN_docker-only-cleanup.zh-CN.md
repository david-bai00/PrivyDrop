# PrivyDrop 部署体系统一（Docker-only）清理计划（提案，未实施）

日期：2026-02-28  
状态：已实施（Docker-only 清理已完成）  
讨论结论：**不保留、不兼容、不归档**，所有非 Docker 部署体系相关代码/资源已直接删除。

## 实施记录（Commit Log）

按提交顺序（均为英文提交信息）：

- `5c8df18` docs: add docker-only cleanup plan
- `e0c3195` docs: make Docker the only supported deployment path
- `2b24dbe` docs(playbook): remove bare-metal deployment entries
- `0dfe627` docs: remove PM2/bare-metal references
- `3ce1ca5` chore: remove bare-metal deployment guides
- `de6199b` chore: remove bare-metal ops assets under backend/docker
- `fd70fa3` chore: remove PM2-based deploy scripts

## 背景与问题陈述

当前仓库同时存在两条“生产部署”路径，导致入口分散、维护口径漂移、对新人不友好：

1) **Docker 一键部署（主线候选）**
- 入口脚本：`deploy.sh`
- 编排：`docker-compose.yml`
- 配置生成：`docker/scripts/generate-config.sh`（按模式生成 `.env`、`docker/nginx/*`、`docker/coturn/*`、`docker/ssl/*` 等运行产物）
- 健康/自检：`docker/scripts/test-deployment.sh`
- 文档：`docs/DEPLOYMENT_docker.zh-CN.md` / `docs/DEPLOYMENT_docker.md`、README 中 Docker 部分

2) **裸机部署（PM2 + Nginx + Certbot + Coturn + Redis）**
- 文档：`docs/DEPLOYMENT.zh-CN.md` / `docs/DEPLOYMENT.md`
- 裸机依赖安装：`backend/docker/env_install.sh`
- 裸机 Nginx 脚本/模板：`backend/docker/Nginx/*`
- 裸机 TURN 模板：`backend/docker/TURN/*`
- PM2 配置/远程打包发布：`ecosystem.config.js`、`build-and-deploy.sh`、`deploy.config.example`

“两套部署系统”同时存在的直接后果：
- 文档与脚本互相矛盾（证书、端口、入口、同源网关策略等），难以长期一致。
- `backend/docker/*` 命名会误导为 Docker 部署的一部分（但实际是裸机运维资产）。
- 后续要做的「Caddy 替代 Nginx」在 full 模式又涉及 `turns:443` 保留与 443 SNI 分流；若不先清理裸机路径，将放大维护成本。

## 本次变更目标（Docker-only 清理）

Goals
- 仓库对外仅保留**一条**官方部署路径：Docker 一键部署（`deploy.sh` + `docker compose`）。
- 删除所有裸机部署体系相关的脚本/模板/远程发布工具链，避免继续误导与漂移。
- 将 README 与 AI Playbook（code-map/flows）中与部署入口相关的描述收敛到 Docker-only。

Non-Goals（明确不做）
- 不修改 WebRTC 传输护栏（分片/背压/重试等关键参数不动）。
- 不变更信令协议、Socket.IO 事件名等对外兼容面。
- 不在本次 PR 引入 Caddy（仅做“清理统一”；Caddy 迁移另起单一主题 PR）。

## 必要前提（来自讨论）

- 部署形态：`full`（公网域名）
- 必须保留：`turns:443`（受限网络兼容）
- 证书流程：先保持现状（当前 `deploy.sh` + certbot + `docker/ssl/*` + 热重载逻辑）

## 影响范围（拟删除清单）

> 说明：下列文件/目录均属于“裸机部署体系”，与 Docker-only 主线目标冲突，按你的要求将直接删除（不保留归档）。

### 1) 裸机部署文档
- `docs/DEPLOYMENT.zh-CN.md`
- `docs/DEPLOYMENT.md`

理由：与 `docs/DEPLOYMENT_docker*.md` 并列存在会持续制造双入口与口径漂移。

### 2) 裸机依赖安装与配置资产（命名含 docker 但非 Docker 主线）
- `backend/docker/`（整个目录）
  - `backend/docker/env_install.sh`
  - `backend/docker/Nginx/*`
  - `backend/docker/TURN/*`
  - `backend/docker/Dockerfile`

理由：与 `docker/scripts/generate-config.sh`、`docker-compose.yml` 的 Docker 一键部署主线无关；目录名会长期误导。

### 3) PM2/远程发布链路
- `ecosystem.config.js`
- `build-and-deploy.sh`
- `deploy.config.example`

理由：属于裸机发布路径；Docker-only 后应彻底退出主线以避免继续维护。

## 需要保留并作为主线的部署资产

- `deploy.sh`
- `docker-compose.yml`
- `docker/`（当前仅 `docker/scripts/*` 在仓库中；其余 `docker/nginx`、`docker/ssl`、`docker/coturn` 等为运行时生成目录/产物）
- `docs/DEPLOYMENT_docker.zh-CN.md`、`docs/DEPLOYMENT_docker.md`
- `README.md`、`README.zh-CN.md`（将统一只推荐 Docker）
- `docker/scripts/test-deployment.sh`（作为 Docker-only 自检脚本）

注：`test-health-apis.sh` 目前更偏“直连端口的开发/调试”，可保留但需在 README 中明确定位，避免被当成生产验收脚本。

## 文档同步更新清单（本次必须做）

由于本次清理会影响“入口文件路径/流程”，需要在同一 PR 内同步更新：
- `README.md`：移除/弱化裸机部署入口，仅保留 Docker 部署主线入口。
- `README.zh-CN.md`：同上。
- `docs/ai-playbook/code-map.zh-CN.md`：删除或调整与裸机部署相关的入口与文件列表。
- `docs/ai-playbook/flows.zh-CN.md`：如包含裸机流程入口或引用，需同步删除/调整。

（若英文 playbook 也引用了相关入口：`docs/ai-playbook/code-map.md`、`docs/ai-playbook/flows.md` 同步处理。）

## 实施步骤（单一主题 PR：Docker-only 清理）

1) 删除裸机部署文档：`docs/DEPLOYMENT*.md`（非 docker 版本）
2) 删除裸机运维资产：`backend/docker/`
3) 删除 PM2/远程发布链路：`ecosystem.config.js`、`build-and-deploy.sh`、`deploy.config.example`
4) 更新 README（中英）到 Docker-only（并明确 full 模式 + turns:443 的能力边界）
5) 更新 AI Playbook：`docs/ai-playbook/code-map*`、`docs/ai-playbook/flows*`
6) 验证（见下节）

## 验收标准（Acceptance Criteria）

- 仓库中不存在裸机部署体系的入口文件（上述删除清单均移除）。
- 文档入口统一：
  - README（中英）只指向 Docker 部署指南与 `deploy.sh`。
  - Playbook 的 code-map/flows 中不再出现被删除文件路径。
- Docker 部署主线不受影响：
  - `bash ./deploy.sh --mode full --domain <domain> --with-nginx --with-turn --le-email <email>` 的说明完整且自洽（本次不改行为，只改入口收敛）。

## 验证方式（Validation）

> 在执行删除后（实现阶段）至少做以下验证；本文件仅定义验证清单，本次提案阶段不执行。

- Frontend build：`cd frontend && pnpm install && pnpm build`（要求 next build 通过）
- Docker build：`docker compose build`（full 模式相关 profile 组合）
- Docker smoke test（可选但推荐）：`bash docker/scripts/test-deployment.sh`
- 手测回归（最小集）：
  - 创建/加入房间
  - 双浏览器互传（至少单文件 + 文件夹各一次）
  - TURN 连接能力检查：确保 ICE servers 中 `turns:<host>:443` 可用（full 场景）

## 风险与缓解（Risks & Mitigations）

- 风险：有人仍依赖裸机部署脚本/文档
  - 缓解：在 README 的部署章节明确“已统一到 Docker-only”（并在发布说明/PR 描述中强调破坏性变更）
- 风险：删除 `backend/docker/*` 后，有人误以为 Docker 部署失效
  - 缓解：在 README 和 `docs/DEPLOYMENT_docker*.md` 强调 Docker 主线入口文件清单（`deploy.sh`/`docker-compose.yml`/`docker/scripts/*`）

## 回滚策略（Rollback）

由于本次为删除类变更，回滚方式为：
- 使用 Git 回退该 PR（`git revert` 或直接回退分支/提交）。

## 后续工作（另起 PR：Caddy 替代 Nginx，保留 turns:443）

本次只做 Docker-only 清理，不做 Caddy。

后续 Caddy 迁移的硬约束（已确认）：
- full 模式必须保留 `turns:443`
- 继续沿用现有证书流程（certbot + `docker/ssl/*` + 热更新 hook）

因此 Caddy 方案需要解决 **443 SNI 分流（turn.<domain> → coturn:5349，其余 → web:8443）** 的等价实现（原方案在 Nginx stream 中实现）。这将是单独的设计与实施主题。
