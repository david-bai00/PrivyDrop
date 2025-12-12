# PrivyDrop AI Playbook — 上下文与索引（中文）

本手册为 AI 与开发者提供一个高信噪比的入口，帮助快速定位到正确的代码位置。仅包含项目上下文与链接索引，不提供步骤化的任务指南。

## 项目快照

- 产品：基于 WebRTC 的 P2P 文件/文本分享，浏览器之间通过 RTCDataChannel 直接传输，端到端加密。
- 前端：Next.js 14（App Router）、React 18、TypeScript、Tailwind、shadcn/ui。
- 后端：Node.js、Express、Socket.IO、Redis；可选 STUN/TURN 做 NAT 穿透。
- 隐私立场：服务器不承载文件数据中转；后端仅负责信令与房间协调。

## 文档索引

- README

  - `README.zh-CN.md`

- AI Playbook

  - 代码地图：`docs/ai-playbook/code-map.zh-CN.md`
  - 流程（含微方案模板）：`docs/ai-playbook/flows.zh-CN.md`
  - 协作规则：`docs/ai-playbook/collab-rules.zh-CN.md`

- 系统与架构

  - 系统架构：`docs/ARCHITECTURE.md` / `docs/ARCHITECTURE.zh-CN.md`
  - 前端架构：`docs/FRONTEND_ARCHITECTURE.md` / `docs/FRONTEND_ARCHITECTURE.zh-CN.md`
  - 后端架构：`docs/BACKEND_ARCHITECTURE.md` / `docs/BACKEND_ARCHITECTURE.zh-CN.md`

- 部署
  - 部署指南：`docs/DEPLOYMENT.md` / `docs/DEPLOYMENT.zh-CN.md`
  - Docker 部署：`docs/DEPLOYMENT_docker.md` / `docs/DEPLOYMENT_docker.zh-CN.md`

## 关键模块速览

- 前端核心
  - Hooks：`frontend/hooks/useWebRTCConnection.ts`（连接编排）、`useRoomManager.ts`（房间生命周期）、`useFileTransferHandler.ts`（负载编排）。
  - WebRTC 基础：`frontend/lib/webrtc_base.ts`（Socket.IO 信令、RTCPeerConnection、数据通道）。
  - 角色：`frontend/lib/webrtc_Initiator.ts`、`frontend/lib/webrtc_Recipient.ts`（发起/接收角色行为）。
  - 发送：`frontend/lib/transfer/*`、`frontend/lib/fileSender.ts`（元数据、分片、进度）。
  - 接收：`frontend/lib/receive/*`、`frontend/lib/fileReceiver.ts`（组装、校验、持久化）。
  - Store：`frontend/stores/fileTransferStore.ts`（进度/状态的单一事实来源）。
- 后端核心
  - Socket.IO：`backend/src/socket/handlers.ts`（join、initiator-online、recipient-ready、offer/answer/ice-candidate）。
  - Services：`backend/src/services/{room,redis,rateLimit}.ts`。
  - REST：`backend/src/routes/api.ts`（房间、追踪、调试日志）。

## 维护

- 保持精简与事实，避免与系统级文档重复。
- 本文用于团队协作与快速理解。
