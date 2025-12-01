# PrivyDrop — UI 连接反馈增强方案（VPN/弱网场景）

> 状态：草案（待评审）
> 范围：仅前端 UI/状态呈现与少量 Hook 粒度改动；不改变传输参数（分片/背压/重试等护栏）。

## 背景与问题

- 背景：在 VPN/企业网等受限网络下，P2P 建连（WebRTC/ICE）与信令握手显著变慢，甚至失败；当前界面缺少“阶段化反馈与可操作建议”，用户误以为应用无响应，体验较差。
- 目标：在不中断或改变底层传输机制的前提下，补齐“入房/协商/重连”的阶段性提示，明确可执行的下一步建议，降低弱网流失率。

## 现状梳理（代码与配置要点）

- ICE/TURN 配置（前端）
  - 生产环境启用自建 TURN 时，会提供三条候选：`stun:host:3478`、`turns:host:443`（TLS）、`turn:host:3478`；未配置时回退到 Google STUN。
    - 参考：frontend/app/config/environment.ts:18、frontend/app/config/environment.ts:32、frontend/app/config/environment.ts:38、frontend/app/config/environment.ts:43
  - 传输层允许 `websocket`→`polling` 回退，弱网下初次握手更慢：frontend/app/config/environment.ts:62
- 入房/信令（前端）
  - 入房 `joinRoom()` 设置了 15 秒超时（照顾慢网/轮询回退），并支持“等效成功信号”（ready/recipient-ready/offer）提前判定成功，但 UI 在这段时间没有“连接中”的显式反馈：frontend/lib/webrtc_base.ts:489
- 连接状态与 UI 显示
  - Store 已具备连接状态位（idle/connecting/connected/failed），但 UI 未消费“connecting/failed”等中间态；入房按钮成功后才提示一次“已加入”，缺少过程感知：
    - Store：frontend/stores/fileTransferStore.ts:13
    - 入房提示：frontend/hooks/useRoomManager.ts:101
    - 面板状态文案仅基于“是否在房间 + peerCount”，协商中仍显示“只有您一人在房间内”，对慢网用户不友好：frontend/hooks/useRoomManager.ts:140
  - 已存在“数据通道开启”提示文案，但未在 `onDataChannelOpen` 时统一呈现：frontend/constants/messages/zh.ts:277
- 重连机制（前端）
  - P2P `disconnected/failed/closed` 会自动尝试重连，但 UI 缺少“重连中/已恢复”的可视提示：frontend/lib/webrtc_base.ts:360、frontend/lib/webrtc_base.ts:372、frontend/lib/webrtc_base.ts:380

> 备注：部署侧自建 TURNS（443/TCP+TLS）已具备，但若前端未正确注入 TURN 环境变量或后端 TURN 认证配置不一致，前端将回退到 STUN，VPN 下成功率大幅降低。

## 目标（用户体验）

- 阶段化反馈：用户始终知道自己处于“入房中 / 已入房等待对端 / P2P 协商中 / 已连接 / 重连中 / 超时/失败”的哪一步。
- 可操作建议：连接慢/超时提示原因与下一步（检查 VPN/代理、重试、可选“优先中继”策略）。
- 零侵入护栏：不调整分片大小、背压阈值、重试参数等，只补充状态呈现与选择性策略开关。

## 方案总览

- P0（本次交付，UI 为主）
  - 入房阶段
    - 点击“加入房间”即设置 `shareConnectionState/retrieveConnectionState = "connecting"`，面板展示“正在加入房间…（慢网可需 5–30 秒）”。
    - 3s 未成功：顶部消息条提示“连接较慢，可检查网络/VPN 或稍后重试（不影响已填写内容）”。
    - 15s 超时：提示“加入超时（网络可能受限）”，保留“重试”操作。
    - 若检测到生产且未配 TURN（仅 STUN）：追加一次性小贴士“VPN/企业网络建议启用 TURN（443/TLS）以提升成功率”。
  - 协商阶段（WebRTC）
    - 监听 `onConnectionStateChange`：
      - `new/connecting` → “已入房，正在建立 P2P 连接…”；
      - `connected` → “已连接”；
      - `disconnected/failed/closed` → “连接中断/失败”。
    - 监听 `onDataChannelOpen`：显示 `channelOpen_msg`（“数据通道已开启，准备接收…”）。
  - 重连阶段
    - 触发 `attemptReconnection()` 时显示“重连中…”，恢复后显示“已恢复连接”。
  - 文案与可访问性
    - 使用现有 `useClipboardAppMessages` 与面板顶部状态位，避免新增组件树复杂度；消息 4–6s 自动消失。

- P1（配置建议，不属本 UI 交付范围，列为并行事项）
  - 前端 ICE 列表将 443 明确为 `turns:turn.privydrop.app:443?transport=tcp`；保留 `turn:turn.privydrop.app:3478`，可补 `turn:turn.privydrop.app:3478?transport=tcp` 以兼容极端网络（需与你确认）。
  - 校验并修复 `.env` 注入、coturn 认证一致性与 Nginx SNI 分流配置，确保“确实命中 TURNS”。

- P2（可选开关）
  - 新增“受限网络优先中继”开关：将 `RTCPeerConnection` 的 `iceTransportPolicy` 切为 `relay`（仅用 TURN 中继，牺牲直连，换取更稳连通率）。默认关闭，仅当 UI 检测到“频繁超时/失败”时提示用户尝试。（此项需评审批准）

## 影响范围与实现要点（建议）

- 文件范围（前端）
  - Hook/逻辑
    - `frontend/hooks/useRoomManager.ts`
      - 入房 `joinRoom()` 点击后：设置 `setShareConnectionState('connecting') / setRetrieveConnectionState('connecting')`；3s 慢网提示；15s 超时提示。
      - `ready/recipient-ready/offer` 提前成功路径：面板状态置为“已入房，正在建立 P2P 连接…”。
    - `frontend/lib/webrtcService.ts`
      - 透传/转发 `onConnectionStateChange` 与 `onDataChannelOpen` 触发 UI 消息（可在现有回调中调用 Store 与消息函数）。
    - `frontend/hooks/useWebRTCConnection.ts`
      - 消费 Store 的连接态到 UI（保留现有接口）。
  - UI
    - `frontend/components/ClipboardApp/SendTabPanel.tsx`
    - `frontend/components/ClipboardApp/RetrieveTabPanel.tsx`
      - 顶部状态栏按连接态与 peerCount 组合生成文案：
        - 未入房 → “可加入房间”；
        - 入房中 → “正在加入房间 …”；
        - 已入房 & 协商中 → “已入房，正在建立 P2P 连接 …”；
        - 已连接 → “已连接”；
        - 中断/失败 → “连接断开/失败（可重试）”。

> 不新增依赖，不修改分片/背压/重试等护栏；所有变更控制在 Hooks/Store 的状态设置与现有组件的文案展示层。

## 风险与取舍

- 风险：提示过多影响简洁度 → 采用节流与阶段触发（>3s/超时才提示）。
- 风险：重连提示干扰用户 → 仅在检测到 `disconnected/failed/closed` 后显示简短条幅，恢复即清除。
- 取舍：暂不做 Loading 全屏遮罩，避免误导“阻塞 UI”。

## 验收标准（手测用例）

- 构建：`next build` 通过。
- 未配 TURN（回退 STUN）：
  - 入房后 3s/10s/15s 节点提示准确；超时有“重试”。
  - 若随后出现 `ready/offer` 等等效成功，面板文本从“入房中”切换为“已入房，正在建立 P2P 连接…”。
- 启用 TURNS（443/TCP+TLS）：
  - 在 VPN/受限网络下 5–10s 内能稳定“已连接”；`chrome://webrtc-internals` 最终为 `typ relay` 且 `tcp`。
- 断网/恢复：
  - 显示“重连中…”，重连后变“已连接”。
- 浏览器：Chrome/Firefox/Safari 基本一致；消息行为可预期，自动消失。

## 回滚策略

- UI 仅为展示层与 Store 状态设置：可按文件粒度快速回滚。
- 若引入 P2（优先中继）策略开关：默认关闭，实现为配置位，移除不影响主流程。

## 变更清单（供实现参考）

- Hook：`frontend/hooks/useRoomManager.ts`
  - 入房点击 → 立即设置连接态为 `connecting`；设置 3s/15s 定时器分阶段提示；join 成功/等效成功时清理定时器与提示。
- Service：`frontend/lib/webrtcService.ts`
  - 在已有回调 `onConnectionStateChange / onDataChannelOpen` 中，调用 Store 与 `useClipboardAppMessages.putMessageInMs()` 填充短提示。
- UI：`SendTabPanel.tsx / RetrieveTabPanel.tsx`
  - 顶部状态文本：结合 `isInRoom + connectionState + peerCount` 生成更细颗粒度文案；失败时为按钮区提供“重试”。

## 附录 A — TURN/TURNS 部署核对（与 UI 关联的重要前置）

> 该节供排查参考，用于保证“UI 提示有效”的前提下，确实命中 TURNS 中继（否则弱网下 UI 会频繁超时）。

- 前端构建期变量（必须确保注入生效）：
  - `frontend/.env.production` 为真实文件（非断链），含：
    - `NEXT_PUBLIC_TURN_HOST=turn.privydrop.app`
    - `NEXT_PUBLIC_TURN_USERNAME=...`
    - `NEXT_PUBLIC_TURN_PASSWORD=...`
- 后端 coturn 一致性：
  - `backend/.env.production` 仅保留一份有效变量，避免重复段覆盖；执行 `sudo bash backend/docker/TURN/configure.sh backend/.env.production` 后，核对 `/etc/turnserver.conf`：
    - `tls-listening-port=5349`、`lt-cred-mech`、`realm=turn.privydrop.app`、`user=USERNAME:PASSWORD`、`cert/pkey` 指向 `/etc/letsencrypt/live/privydrop.app/*`。
- Nginx stream SNI 分流：
  - `/etc/nginx/nginx.conf` 的 `stream { map $ssl_preread_server_name $backend ... }` 中，针对 `turn.privydrop.app` 路由到 `127.0.0.1:5349`：backend/docker/Nginx/nginx.conf:14–42
- 端口与防火墙：
  - 放行 443/tcp、5349/tcp、3478/udp 与中继端口段（49152–65535/tcp,udp）。
- 现场验证：
  - `openssl s_client -connect turn.privydrop.app:443 -servername turn.privydrop.app`
  - 在线 TURN 测试工具分别测试 `turns:turn.privydrop.app:443` 与 `turn:turn.privydrop.app:3478`。
  - 浏览器 `chrome://webrtc-internals` 最终 candidate `typ relay (tcp)`。

## 附录 B — 建议文案（草拟）

- 正在加入房间…（慢网可需 5–30 秒）
- 连接较慢，建议检查网络/VPN 或稍后重试
- 加入超时（网络可能受限），请重试
- 已入房，正在建立 P2P 连接…
- 已连接
- 重连中…
- 已恢复连接
- 数据通道已开启，准备接收数据…
- 受限网络提示：建议启用 TURN（443/TLS）以提升连通率

— 完 —

