# PrivyDrop AI Playbook — 代码地图（中文）

本地图以“快速定位”为目标，仅给出目录与关键入口文件的简要说明，不包含“常改动点/影响范围”。

## 前端（Next.js，TypeScript）

- `frontend/app/` — App Router 路由与页面。

  - `frontend/app/[lang]/page.tsx` — 主页入口，生成元数据和 SEO 结构化数据（JsonLd），支持多语言 canonical 链接。
  - `frontend/app/[lang]/*/page.tsx` — 静态页面：features(功能特性)、about(关于)、faq(常见问题)、help(帮助)、terms(服务条款)、privacy(隐私政策)，均包含多语言 SEO 元数据生成。
  - `frontend/app/[lang]/blog/page.tsx` — 博客列表页，展示多语言文章列表。
  - `frontend/app/[lang]/blog/[slug]/page.tsx` — 博客文章详情页，支持 MDX 渲染、目录生成、面包屑导航和 JSON-LD 结构化数据。
  - `frontend/app/[lang]/blog/tag/[tag]/page.tsx` — 博客标签页，按标签分类展示文章。
  - `frontend/app/[lang]/layout.tsx` — 全局布局与 Provider 注入，包含 ThemeProvider、Header/Footer，生成组织架构和网站结构化数据。
  - `frontend/app/[lang]/HomeClient.tsx` — 主客户端组件，组织页面结构（Hero 区域、ClipboardApp、HowItWorks、视频演示、系统架构图、功能特性、FAQ），支持多平台视频链接（YouTube/B 站）。
  - `frontend/app/api/health/route.ts` — 基础健康检查 API。
  - `frontend/app/api/health/detailed/route.ts` — 详细健康检查 API。
  - `frontend/app/sitemap.ts` — 站点地图生成，支持多语言 URL 和博客文章动态收录。
  - `frontend/middleware.ts` — i18n 与路由中间件。
  - `frontend/app/config/environment.ts` — 运行时/环境配置（ICE、端点等）。
  - `frontend/app/config/api.ts` — 后端 API 交互封装。

- `frontend/components/` — UI，包括协调器与子组件。

  - `frontend/components/ClipboardApp.tsx` — 顶层 UI 协调器，集成 5 个业务 hooks（useWebRTCConnection/useFileTransferHandler/useRoomManager/usePageSetup/useClipboardAppMessages），处理全局拖拽事件和双标签页（发送/接收）管理。
    - 体验增强：切到接收端（retrieve）且满足“未在房间、URL 无 roomId、输入为空、存在缓存ID”时自动填充并加入房间（读取 `frontend/lib/roomIdCache.ts`）。
    - 连接反馈：集成 `useConnectionFeedback`（`frontend/hooks/useConnectionFeedback.ts`），桥接 WebRTC 连接态到 UI 文案，含协商中提示、8s 慢连接提示、断开/重连/恢复提示（前台可见时提示）。慢提示统一复用 `frontend/utils/useOneShotSlowHint.ts`。

- `frontend/hooks/` — 业务中枢 Hooks。
  - `useRoomManager.ts`
    - 入房流程：`join_inProgress`（立即）、`join_slow`（3s，复用 `useOneShotSlowHint`）、`join_timeout`（15s）；join 成功/失败均清理定时器。
    - 等效成功信号：在 `joinResponse` 之前若收到 `ready/recipient-ready/offer`，提前判定入房成功并清理 3s/15s 定时器。
    - 其他：房间状态文案、分享链接生成、离开房间、输入校验（750ms 防抖）。
  - `useConnectionFeedback.ts`
    - 状态归一化：优先读取 Store 中的 lifecycle state；`joining/waiting_for_peer/negotiating`→`negotiating`，`reconnecting`→`disconnected` phase（复用 `utils/rtcPhase.ts`）。
    - 协商慢提示：8s 定时器（`rtc_slow`），单次协商仅提示一次；若在后台到时则挂起，回到前台且仍协商时补发一次（复用 `useOneShotSlowHint`）。
    - 一次性提示：首次 `connected`（`rtc_connected`）仅提示一次；`reconnecting` 进入时提示前台重连（`rtc_reconnecting`），恢复到 `connected` 时提示 `rtc_restored`。

- i18n 文案与类型
  - 文案定义：`frontend/constants/messages/*.{ts}`（已补齐 zh/en/ja/es/de/fr/ko）。
  - 类型定义：`frontend/types/messages.ts`（`ClipboardApp` 下包含 `join_*` 与 `rtc_*` 文案键）。
  - `frontend/components/ClipboardApp/SendTabPanel.tsx` — 发送面板，集成富文本编辑器、文件上传、房间 ID 生成（支持 4 位数字/UUID 两种模式）、分享链接生成。
    - 体验增强：点击“使用缓存ID”将立即触发加入房间（sender 侧），减少一次手动点击。
  - `frontend/components/ClipboardApp/RetrieveTabPanel.tsx` — 接收面板，处理房间加入、文件接收、目录选择（File System Access API）、富文本内容显示。
  - `frontend/components/ClipboardApp/FileListDisplay.tsx` — 文件列表显示组件，支持文件/文件夹分组显示、进度跟踪、多浏览器下载策略（Chrome 自动下载/其他浏览器手动保存）、下载计数统计。
  - `frontend/components/ClipboardApp/FullScreenDropZone.tsx` — 全屏拖拽提示组件，文件拖拽时的视觉反馈。
  - `frontend/components/ClipboardApp/*` — 其他子组件：FileUploadHandler（文件上传处理）、ShareCard（二维码分享）、TransferProgress（进度条）、CachedIdActionButton（缓存 ID 操作）、FileTransferButton（文件传输按钮）。
  - `frontend/components/Editor/` — 富文本编辑器模块，包含 RichTextEditor 主编辑器、工具栏组件（BasicFormatTools/FontTools/AlignmentTools/InsertTools）、SelectMenu 下拉选择、类型定义和编辑器 hooks。
  - `frontend/components/blog/` — 博客相关组件，包含 TableOfContents（支持中文目录生成和滚动跟踪）、Mermaid 图表渲染、MDXComponents、ArticleListItem 文章列表。
  - `frontend/components/common/` — 通用组件，包含 clipboard_btn（读写剪贴板按钮）、AutoPopupDialog（自动弹出对话框）、LazyLoadWrapper（懒加载包装器）、YouTubePlayer（YouTube 播放器）。
  - `frontend/components/web/` — 网站页面组件，包含 Header（响应式导航和多语言支持）、Footer（版权和语言链接）、FAQSection（可配置 FAQ 展示）、HowItWorks（步骤说明和视频演示）、SystemDiagram（系统架构图）、KeyFeatures（功能特性展示）、theme-provider 主题提供者。
    - `frontend/components/web/ThemeToggle.tsx` — 主题切换按钮（单按钮 Light/Dark 切换），集成于 Header（桌面与移动）。
  - `frontend/components/seo/JsonLd.tsx` — SEO 结构化数据组件，支持多类型 JSON-LD 数据生成。
  - `frontend/components/LanguageSwitcher.tsx` — 语言切换器。
  - `frontend/components/ui/*` — 基础 UI 原子组件（基于 Radix UI 和 shadcn/ui），包含 Button（多变体按钮）、Accordion（手风琴）、Dialog（模态对话框）、Card（卡片）、Tooltip（工具提示）、Select、Input、Textarea、Checkbox、DropdownMenu、Toast 通知系统和 AnimatedButton 动画按钮。

- `frontend/hooks/` — 业务逻辑中枢（React Hooks）。

  - `frontend/hooks/useWebRTCConnection.ts` — WebRTC 生命周期与编排 API；初始化 `WebRTCStoreCoordinator`，广播入口已收敛到 coordinator command，不再由 hook 自己读取 `shareContent/sendFiles` 组装发送参数，也不再暴露 `sender/receiver` 内部实例；重置连接时直接走 `shutdownSender("leave_room")` / `shutdownReceiver("leave_room")`。
  - `frontend/hooks/useRoomManager.ts` — 房间创建/加入/校验与 UI 状态，支持缓存 ID 重连（≥8 字符自动发送 initiator-online）；分享广播、sender/receiver 离房、roomId 选择与 sender reset 都改为调用 `WebRTCStoreCoordinator` command，离房时通过 `getSessionInfo()` 读取 room/peer 信息，避免直接访问内部连接对象或在 hook 内直接拼领域状态写入。
  - `frontend/hooks/useFileTransferHandler.ts` — 文件/文本负载编排与回调，使用 getState() 修复闭包问题，支持 JSZip 文件夹下载；发送去重、sender payload 写入与单文件下载匹配统一基于稳定 `fileId` 与 `WebRTCStoreCoordinator` command，避免同名文件误判和 hook 直写 store。receiver 结果清空也已改走 coordinator command。
  - `frontend/hooks/useClipboardActions.ts` — 剪贴板操作与状态管理，支持现代 API 和 document.execCommand 降级，处理 HTML/富文本粘贴。
  - `frontend/hooks/useClipboardAppMessages.ts` — 应用消息处理（shareMessage/retrieveMessage），4 秒自动消失机制。
  - `frontend/hooks/useLocale.ts` — 国际化语言切换，基于 pathname 解析。
  - `frontend/hooks/usePageSetup.ts` — 页面配置与 SEO 设置，处理 URL 参数 roomId 自动加入和引荐来源追踪。
  - `frontend/hooks/useRichTextToPlainText.ts` — 富文本转纯文本工具，处理块级元素换行和文本节点包装。

- `frontend/lib/` — 核心库与工具。

  - WebRTC 基础与角色
    - `frontend/lib/webrtc_base.ts` — WebRTC 基础类，提供 Socket.IO 信令、RTCPeerConnection/DataChannel 的 `Map` 管理、ICE 候选者队列、双重断开检测重连机制、唤醒锁管理、异步数据发送结果（`SendResult`/`BroadcastResult`）、带最终结果返回的发送重试、优雅断开跟踪（gracefullyDisconnectedPeers Set）和多格式数据类型兼容性支持（ArrayBuffer/Blob/Uint8Array/TypedArray）。加入房间（joinRoom）采用 15 秒超时，并在 join 未返回时启用“等效成功信号”提前判定成功：Initiator 收到 `ready/recipient-ready`，Recipient 收到 `offer`；触发后立即设置 inRoom 并清理监听/定时器，降低弱网下误报。该层还会发出 `join/reconnect/leave` 生命周期事件，供 service 统一驱动状态机。
    - `frontend/lib/webrtc_Initiator.ts` — 发起方实现，处理`ready`/`recipient-ready`事件，创建 RTCPeerConnection 和主动式 DataChannel，发送 offer，处理 answer 响应，支持 256KB 缓冲阈值配置。
    - `frontend/lib/webrtc_Recipient.ts` — 接收方实现，处理`offer`事件，创建 RTCPeerConnection 和响应式 DataChannel（ondatachannel），生成并发送 answer，处理`initiator-online`重连信号和现有连接清理。
    - `frontend/lib/webrtcLifecycleMachine.ts` — 纯连接生命周期规则模块，封装 RTC 状态归一化、join/reconnect/leave 生命周期事件到权威 lifecycle state 的映射、peer 状态聚合优先级，以及“断开后是否进入 reconnecting”的约束；作为最小单测护栏的规则来源。
    - `frontend/lib/webrtcConnectionCollection.ts` — 纯 `Map` 遍历规则模块，封装 peer 集合快照、广播映射与 cleanup 遍历，避免遍历过程中因集合突变漏处理 peer。
    - `frontend/lib/webrtcSendMachine.ts` — 纯发送结果规则模块，封装 `SendResult`/`BroadcastResult` 构造、单 peer 重试决策与广播聚合；作为 async send 结果语义的最小单测护栏来源。
    - `frontend/lib/webrtcService.ts` — WebRTC 服务单例封装（跨路由常驻），管理 sender/receiver 实例，提供统一业务接口，处理连接状态变更、数据广播、文件请求和连接断开清理；现在维护权威连接 lifecycle state（`idle/joining/waiting_for_peer/negotiating/connected/reconnecting/leaving/failed`），并通过单一 `WebRTCServiceEvent` 事件表向上层发出连接/传输事件，不再直接写 Zustand，同时提供 `getSessionInfo()` / `getLifecycleState()` 这类只读查询接口给 hooks 和协调层使用。内部额外维护按 peer 的归一化连接状态快照，避免多 peer 混合态时被单个 `negotiating/disconnected` 事件错误覆盖整体 lifecycle。sender/receiver 离房与 cleanup 进一步收敛为显式 `shutdownSender()` / `shutdownReceiver()` 动作入口。
    - `frontend/lib/app/WebRTCStoreCoordinator.ts` — 薄应用编排层，订阅 `webrtcService` 的显式事件表并统一写入 `fileTransferStore`；负责把权威 lifecycle state 派生为兼容的 badge state，同时处理 sender DataChannel 打开后的自动广播与按 peer 清理进度。当前还承接 sender room 选择、sender/receiver domain reset、receiver 已接收结果清空，以及 sender payload（`shareContent/sendFiles`）更新与广播等显式 command，作为 hooks/components 的领域状态写入口边界。
    - `frontend/lib/logger.ts` — 统一运行时日志入口，封装 `debug/info/warn/error` 与后端日志门控；开发/测试环境允许 console + backend，生产环境禁止后端调试日志上报。
  - 发送（sender）
    - `frontend/lib/fileSender.ts` — 发送端向后兼容包装层，内部使用 FileTransferOrchestrator 提供统一服务；新增 `shutdown(action)`，把 sender 清理语义从零散 `cleanup()` 收敛到显式动作。
    - `frontend/lib/transfer/FileTransferOrchestrator.ts` — 发送端主编排器，集成所有组件管理文件传输生命周期；文件元数据发送已改为等待底层 async send 结果，避免“上层判失败、底层晚发成功”的语义错位。
    - `frontend/lib/transfer/senderShutdown.ts` — 发送侧关闭动作策略表，定义 `leave_room/reset_app/cleanup` 的连接保持与发送状态清理策略。
    - `frontend/lib/transfer/StreamingFileReader.ts` — 高性能流式文件读取器，采用 32MB 批次+64KB 网络块的双层缓冲架构。
    - `frontend/lib/transfer/NetworkTransmitter.ts` — 网络传输器，使用 WebRTC 原生背压控制，支持嵌入元数据分片发送。
    - `frontend/lib/transfer/StateManager.ts` — 状态管理中心，跟踪 peer 状态、待发送文件、文件夹元数据。
    - `frontend/lib/transfer/ProgressTracker.ts` — 进度跟踪器，处理文件/文件夹进度计算、速度统计和回调触发。
    - `frontend/lib/transfer/MessageHandler.ts` — 消息处理器，负责 WebRTC 消息路由（fileRequest/fileReceiveComplete/folderReceiveComplete）。
    - `frontend/lib/transfer/TransferConfig.ts` — 传输配置管理，定义文件读取 4MB 分片、32MB 批次、64KB 网络发送块。
  - 接收（receiver）
    - `frontend/lib/fileReceiver.ts` — 接收端向后兼容包装层，内部使用 FileReceiveOrchestrator 提供统一服务；关闭相关 API 已统一为 async，并新增显式动作化关闭入口（`peer_disconnect/leave_room/force_reset/cleanup`），调用方可以等待关闭完成。
    - `frontend/lib/receive/FileReceiveOrchestrator.ts` — 接收端主编排器，集成所有组件管理文件接收生命周期，支持断点续传和磁盘流式写入；控制消息（`fileRequest`、完成确认）会等待 async send 的最终结果后再推进状态；关闭路径已统一为单一 `shutdown(action, reason)`，由策略表决定是否保留 metadata/saveType/saveDirectory 和是否释放内部处理器。
    - `frontend/lib/receive/ReceptionStateManager.ts` — 状态管理中心，管理文件元数据、活跃接收状态、文件夹进度、保存类型配置；接收 lifecycle 已细分为 ready/active/shutdown 三组状态：`idle/completed/interrupted/failed`、`preparing/requesting/receiving/finalizing`、`disconnecting/leaving_room/resetting/cleaning_up`；通过显式阶段方法与 `resetState()` 收敛状态，不再由编排层直接手写中间态。
    - `frontend/lib/receive/receptionStateMachine.ts` — 纯接收生命周期规则模块，封装接收准备、请求发出、首块到达、finalize、失败/中断以及 reset 后目标状态的迁移规则，作为接收状态机最小单测护栏来源。
    - `frontend/lib/receive/receiverShutdown.ts` — 接收侧关闭动作策略表，定义 `peer_disconnect/leave_room/force_reset/cleanup` 的保留项、生命周期状态与进度/处理器清理策略。
    - `frontend/lib/receive/ChunkProcessor.ts` — 分片处理器，处理多种数据格式转换、嵌入元数据解析、分片验证和索引映射。
    - `frontend/lib/receive/StreamingFileWriter.ts` — 流式文件写入器，包含 SequencedDiskWriter 严格顺序写入机制，支持大文件磁盘流式写入。
    - `frontend/lib/receive/FileAssembler.ts` — 内存文件组装器，处理小块文件的内存重组、完整性校验和文件对象创建。
    - `frontend/lib/receive/MessageProcessor.ts` — 消息处理器，负责 WebRTC 消息路由（fileMeta/stringMetadata/fileRequest/folderReceiveComplete）；所有外发控制消息统一返回 `SendResult`，供编排层显式处理失败。
    - `frontend/lib/receive/ProgressReporter.ts` — 进度报告器，处理文件/文件夹进度计算、速度统计和节流回调。
    - `frontend/lib/receive/ReceptionConfig.ts` — 接收配置管理，定义大文件阈值 1GB、64KB 分片、缓冲区大小和调试开关。
  - 工具与辅助
    - `frontend/lib/fileReceiver.ts`、`frontend/lib/fileUtils.ts`、`frontend/lib/speedCalculator.ts`、`frontend/lib/utils.ts` — 基础工具。
    - `frontend/lib/roomIdCache.ts` — 房间 ID 缓存管理。
    - `frontend/lib/wakeLockManager.tsx` — 屏幕唤醒锁管理（移动端优化）。
    - `frontend/lib/utils/ChunkRangeCalculator.ts` — 文件分片范围计算。
    - `frontend/lib/browserUtils.ts` — 浏览器兼容性工具。
    - `frontend/lib/tracking.ts` — 用户行为追踪。
    - `frontend/lib/dictionary.ts`、`frontend/lib/mdx-config.ts`、`frontend/lib/blog.ts` — i18n/内容与 SEO 辅助。

- `frontend/stores/` — 共享应用状态（Zustand）。

  - `frontend/stores/fileTransferStore.ts` — 传输进度/状态的唯一事实来源（Zustand 单例，跨路由保持）；发送列表删除和进度主键以 `fileId` 为准，避免 UI 展示字段参与底层匹配。连接相关状态分为权威 lifecycle state 与兼容 badge state 两层。底层 lib 不再直接 import 此 store；sender/receiver 的领域状态写入已进一步收敛到 `frontend/lib/app/WebRTCStoreCoordinator.ts`，包括 room/reset/retrieved-result 与 sender payload 这类业务状态，store 中保留的 reset action 主要由编排层调用。
  - `frontend/stores/transferStoreReset.ts` — Store reset 动作策略与 transfer activity 计算工具；定义 sender/receiver reset 的清理边界，避免 sender reset 误清 receiver 侧进度。


- `frontend/types/`、`frontend/constants/` — 类型定义与常量。

  - `frontend/types/global.d.ts` — 全局类型定义（lodash 模块、FileSystemDirectoryHandle 接口）。
  - `frontend/types/messages.ts` — 多语言消息与 UI 内容类型定义（Meta、Text、Messages 等国际化结构）。
  - `frontend/types/webrtc.ts` — WebRTC 传输协议类型（文件元数据、分片结构、状态机接口）。
  - `frontend/types/webrtcLifecycle.ts` — 连接生命周期状态与兼容 badge 状态定义，包含 lifecycle→badge 的派生映射。
  - `frontend/constants/messages/` — 多语言消息文件（7 种语言：en、zh、de、es、fr、ja、ko）。
  - `frontend/constants/i18n-config.ts` — 国际化配置（默认语言、支持语言列表、显示名称映射）。

- `frontend/content/` — 内容资源。

  - `frontend/content/blog/` — 博客文章（MDX 格式，多语言），包含开源发布、WebRTC 文件传输、断点续传等主题文章。
  - `frontend/lib/blog.ts` — 博客工具函数，支持多语言文章读取、frontmatter 解析、标签提取和内容验证。

- **配置与构建**
  - `frontend/package.json`、`frontend/tsconfig.json`、`frontend/tailwind.config.ts` — 项目配置；前端最小单测入口为 `pnpm test:unit`（Vitest）。
  - `frontend/next.config.mjs`、`frontend/postcss.config.mjs`、`frontend/components.json` — Next.js 与组件配置。
  - `frontend/vitest.config.ts` — Vitest 配置，提供 `@/` 路径别名并将最小单测限定在 `frontend/tests/unit/**/*.test.ts`。
  - `frontend/.eslintrc.json` — 代码检查配置。
  - `frontend/Dockerfile`、`frontend/health-check.js` — Docker 部署与健康检查。
  - `frontend/tests/unit/*.test.ts` — 最小自动化护栏，当前覆盖 lifecycle 规则、async send 结果语义、`Map` 广播/cleanup 规则、接收状态机、ChunkProcessor 封包解析/校验边界、ReceptionStateManager 核心状态与 reset 保留策略、sender/receiver shutdown 策略与 store reset 边界，以及 sender/receiver/store 关闭矩阵的一致性。

## 后端（Express，Socket.IO，Redis）

- `backend/src/server.ts` — 启动入口：Express + Socket.IO 初始化与监听。
- `backend/src/config/env.ts`、`backend/src/config/server.ts` — 环境与服务配置。
  - `backend/src/config/env.ts` — 环境变量配置与验证，包含端口、CORS、Redis 连接设置，支持开发/生产环境自动加载对应.env 文件。
  - `backend/src/config/server.ts` — CORS 配置，区分开发/生产环境，支持多域名配置和 LAN 地址正则匹配。
- `backend/src/routes/api.ts` — REST：房间创建/校验、追踪、调试日志。
- `backend/src/routes/health.ts` — 健康检查。
- `backend/src/socket/handlers.ts` — 信令事件：`join`、`initiator-online`、`recipient-ready`、`offer`、`answer`、`ice-candidate`。
- `backend/src/services/redis.ts` — Redis 客户端。
- `backend/src/services/room.ts` — 房间/成员存储与辅助。
- `backend/src/services/rateLimit.ts` — 基于 Redis 有序集的 IP 限流。
- `backend/src/types/room.ts`、`backend/src/types/socket.ts` — 类型定义与接口。

  - `backend/src/types/socket.ts` — Socket.IO 相关类型，包含 JoinData 房间加入数据、SignalingData WebRTC 信令数据(offer/answer/candidate)、InitiatorData 发起方数据、RecipientData 接收方数据。
  - `backend/src/types/room.ts` — 房间相关类型，包含 RoomInfo 房间信息(创建时间)、ReferrerTrack 来源追踪数据、LogMessage 日志消息结构。

- **后端配置与脚本**
  - `backend/package.json`、`backend/tsconfig.json` — 项目配置。
  - `backend/Dockerfile`、`backend/.dockerignore` — Docker 配置。
  - `backend/health-check.js` — 健康检查脚本。
  - `backend/scripts/export-tracking-data.js` — 数据导出脚本。

## 部署与运维

- **根目录配置**

  - `deploy.sh` — Docker 一键部署入口（环境检测、配置生成、证书自动化、启动/清理）。
  - `docker-compose.yml` — Docker Compose 编排（frontend/backend/redis/nginx/turn）。
  - `.env` — Docker 部署环境变量（由脚本生成/维护）。

- **Docker 基础设施**

  - `docker/nginx/` — Nginx 反向代理配置。
  - `docker/scripts/` — 部署相关脚本（环境检测、配置生成、部署测试）。
  - `docker/ssl/` — SSL 证书目录。
  - `docker/coturn/` — TURN 服务器配置。
  - `docker/letsencrypt-www/` — Let's Encrypt 配置。

- **构建与文档**
  - `build/` — 请忽略这个临时目录。
  - `test-health-apis.sh` — 健康 API 测试脚本。
  - `README.md`、`README.zh-CN.md`、`ROADMAP.md`、`ROADMAP.zh-CN.md` — 项目文档。
