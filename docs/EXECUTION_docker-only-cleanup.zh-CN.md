# Docker-only 清理执行拆解（提交粒度与顺序）

日期：2026-02-28  
范围：仅“部署体系统一到 Docker-only”的清理；不引入 Caddy，不改 WebRTC 传输护栏。  
提交要求：每个子任务一个 **英文** commit message（`git commit -m "..."`）。

## 实际执行结果（已完成）

本次清理已按“分步提交”完成（按提交顺序）：

- `5c8df18` docs: add docker-only cleanup plan
- `e0c3195` docs: make Docker the only supported deployment path
- `2b24dbe` docs(playbook): remove bare-metal deployment entries
- `0dfe627` docs: remove PM2/bare-metal references
- `3ce1ca5` chore: remove bare-metal deployment guides
- `de6199b` chore: remove bare-metal ops assets under backend/docker
- `fd70fa3` chore: remove PM2-based deploy scripts

验证说明：
- 本轮改动为“文档 + 删除部署资产”，未改动前后端运行逻辑与 WebRTC 传输参数。
- 未在本地执行 `next build` / `docker compose build`（如需我可在后续单独补充一次验证提交）。

## 总目标

- 删除裸机部署体系相关代码/文档/脚本（不兼容、不保留、不归档）。
- 将仓库所有“部署入口”统一为 Docker 一键部署：`deploy.sh` + `docker compose`。
- 同步更新 README 与 AI Playbook，确保不存在指向被删除文件的链接或描述。

## 提交拆解（建议顺序）

> 原则：每个 commit 在语义上自洽；尽量避免“文档指向不存在文件”的中间状态。

### Commit 1：统一对外入口（先断开裸机入口）

**Commit message（English）**：
- `docs: make Docker the only supported deployment path`

**修改内容**：
- 更新 `README.md`：移除裸机部署指南入口，部署方式只保留 Docker。
- 更新 `README.zh-CN.md`：同上。
- 更新 `docs/ai-playbook/index.md`：移除裸机部署指南链接，只保留 Docker 部署链接。
- 更新 `docs/ai-playbook/index.zh-CN.md`：同上。

**验收点**：
- README/Playbook 索引不再出现 `docs/DEPLOYMENT.md` / `docs/DEPLOYMENT.zh-CN.md`。

---

### Commit 2：更新 Playbook 代码地图（移除裸机相关入口文件）

**Commit message（English）**：
- `docs(playbook): remove bare-metal deployment entries`

**修改内容**：
- 更新 `docs/ai-playbook/code-map.md`
- 更新 `docs/ai-playbook/code-map.zh-CN.md`

**重点**：
- 移除或调整对 `ecosystem.config.js`、`build-and-deploy.sh`、`deploy.config.example` 的描述。
- 仅保留 Docker-only 主线入口：`deploy.sh`、`docker-compose.yml`、`docker/scripts/*`。

---

### Commit 3：更新架构文档中对 PM2/裸机部署文件的引用（避免删文件后文档失真）

**Commit message（English）**：
- `docs: remove PM2/bare-metal references`

**修改内容（视实际引用范围）**：
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/BACKEND_ARCHITECTURE.zh-CN.md`
- 以及任何仍引用 `ecosystem.config.js` / PM2 / 裸机 Nginx 的文档条目

---

### Commit 4：删除裸机部署指南文档

**Commit message（English）**：
- `chore: remove bare-metal deployment guides`

**删除内容**：
- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT.zh-CN.md`

---

### Commit 5：删除裸机运维资产（backend/docker）

**Commit message（English）**：
- `chore: remove bare-metal ops assets under backend/docker`

**删除内容**：
- `backend/docker/`（整个目录）

---

### Commit 6：删除 PM2/远程发布链路

**Commit message（English）**：
- `chore: remove PM2-based deploy scripts`

**删除内容**：
- `ecosystem.config.js`
- `build-and-deploy.sh`
- `deploy.config.example`

---

### Commit 7：收尾校验与文档一致性（可选但推荐）

**Commit message（English）**：
- `docs: align deployment references after cleanup`

**内容**：
- 全仓 `rg` 检查是否仍出现：
  - `DEPLOYMENT.md` / `DEPLOYMENT.zh-CN.md`
  - `ecosystem.config.js`
  - `build-and-deploy.sh`
  - `deploy.config`
  - `backend/docker/`
- 修复剩余引用（若存在）。

## 验证建议（在实现阶段执行）

- `rg -n "DEPLOYMENT\\.md|ecosystem\\.config\\.js|build-and-deploy\\.sh|backend/docker" -S .`
- 前端构建：`cd frontend && pnpm build`（按协作规则要求 `next build` 通过）
- Docker 构建（如环境允许）：`docker compose build`

## 回滚策略

- 任何问题：直接 `git revert <commit>` 回滚到清理前状态（删除类变更不做手工回滚）。
