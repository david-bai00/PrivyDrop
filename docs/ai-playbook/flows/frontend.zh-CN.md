# PrivyDrop AI Playbook — 前端组件系统与业务中枢协作流程（中文）

← 返回流程入口：[`docs/ai-playbook/flows.zh-CN.md`](../flows.zh-CN.md)

（本页从 `docs/ai-playbook/flows.zh-CN.md` 拆分，保留原章节编号与内容。）

## 6）前端组件系统与业务中枢协作流程

### 组件架构层级

```
App Router (page.tsx/layout.tsx)
    ↓
HomeClient (页面布局与SEO)
    ↓
ClipboardApp (顶层UI协调器)
    ↓
SendTabPanel/RetrieveTabPanel (功能面板)
    ↓
业务中枢 Hooks (状态管理与业务逻辑)
    ↓
Core Services (webrtcService) + Store (fileTransferStore)
```

### ClipboardApp 顶层协调器模式

**核心职责**：

- 集成 5 个关键业务 hooks：useWebRTCConnection、useFileTransferHandler、useRoomManager、usePageSetup、useClipboardAppMessages
- 全局拖拽事件处理：dragenter/dragleave/dragover/drop，支持多文件和文件夹树遍历
- 双标签页状态管理：发送/接收面板切换，通过 activeTab 控制
- 统一消息系统：shareMessage/retrieveMessage 4 秒自动消失机制

### Hook 层级与职责分离

**useWebRTCConnection**（状态桥梁）：

- 计算全局传输状态（isAnyFileTransferring）
- 暴露 webrtcService 方法（broadcastDataToAllPeers、requestFile、requestFolder）
- 提供连接重置方法（resetSenderConnection、resetReceiverConnection）

**useFileTransferHandler**（文件与内容管理）：

- 文件操作：addFilesToSend（去重）、removeFileToSend
- 下载功能：handleDownloadFile（支持文件夹压缩下载）
- 关键修复：使用 `useFileTransferStore.getState()` 获取最新状态，避免闭包问题
- 重试机制：最大 3 次重试，50ms 间隔，详细错误日志

**useRoomManager**（房间生命周期管理）：

- 房间操作：joinRoom（支持缓存 ID 重连）、processRoomIdInput（750ms 防抖）
- 离开保护：传输中确认提示（isAnyFileTransferring 检查）
- 状态文本：动态更新房间状态文本
- 链接生成：自动生成分享链接

**usePageSetup**（页面初始化）：

- 国际化消息加载与错误处理
- URL 参数处理：roomId 自动提取并触发加入房间（200ms 延迟确保 DOM 就绪）
- 引荐来源追踪（trackReferrer）

**useClipboardAppMessages**（消息管理）：

- 分离式消息状态：shareMessage（发送相关）和 retrieveMessage（接收相关）
- 统一消息显示接口：putMessageInMs(message, isShareEnd, displayTimeMs)
- 自动清理机制：4 秒后自动清空消息状态

### 面板组件特化设计

**SendTabPanel 发送面板**：

- 房间 ID 双模式生成：4 位数字（后端 API 生成）和 UUID（前端 crypto API）
- 富文本编辑器集成（动态导入，SSR 禁用）
- 文件上传处理和文件列表管理
- 分享链接生成与二维码显示

**RetrieveTabPanel 接收面板**：

- File System Access API 集成：目录选择和直接保存到磁盘
- 富文本内容渲染（dangerouslySetInnerHTML）
- 文件请求和下载状态管理
- 保存位置选择和大文件/文件夹提示

**FileListDisplay 文件列表**：

- 智能文件/文件夹分组和统计显示
- 多浏览器下载策略：Chrome 自动下载，其他浏览器手动保存提示
- 下载计数统计和传输进度跟踪
- 断点续传和存储方式显示（内存/磁盘）

### 关键用户体验优化

1. **下载状态闭包修复**：`useFileTransferHandler.ts:110` 使用 `useFileTransferStore.getState()` 获取最新状态
2. **房间 ID 输入防抖**：`useRoomManager.ts:247` 使用 lodash debounce 750ms 延迟验证
3. **传输中离开保护**：`useRoomManager.ts:164,218` 检查 `isAnyFileTransferring` 状态并显示确认对话框
4. **缓存 ID 重连**：`useRoomManager.ts:91` 检测长 ID（≥8 字符）自动发送 `initiator-online`
5. **文件夹压缩下载**：`useFileTransferHandler.ts:89` 使用 JSZip 动态创建 ZIP 文件
6. **全局拖拽优化**：ClipboardApp 使用 dragCounter 防止拖拽状态误判，支持 webkitGetAsEntry 文件树遍历
7. **剪贴板兼容性**：useClipboardActions 支持现代 navigator.clipboard API 和 document.execCommand 降级方案
8. **富文本安全处理**：useRichTextToPlainText 服务端渲染安全，客户端 DOM 转换处理块级元素
9. **站内导航不中断（同一标签页）**：依赖 `frontend/stores/fileTransferStore.ts`（Zustand 单例）与 `frontend/lib/webrtcService.ts`（服务单例）。App Router 页面切换不打断传输且保留已选择/已接收内容。注意不要在路由切换副作用中调用 `webrtcService.leaveRoom()` 或重置 Store；刷新/新标签不在保证范围内。

### UI 连接反馈状态机（弱网/VPN 提示）

- 入房阶段（join）
  - 立即：`join_inProgress`（“正在加入房间…”）。
  - 3s 未完成：`join_slow`（“连接较慢，建议检查网络/VPN…”）。
  - 15s 超时：`join_timeout`（“加入超时…”）。
  - 等效成功信号：在等待 `joinResponse` 期间，若收到 `ready/recipient-ready/offer`，视为提前入房成功并即时清理 3s/15s 定时器与提示，避免“成功后再出现慢/超时提示”。
- 协商阶段（WebRTC）
  - 进入 `new/connecting`：归一为 “协商中” → `rtc_negotiating`。
  - 8s 未连上：`rtc_slow`（“网络可能受限，尝试关闭 VPN 或稍后再试”）。仅在页面前台可见时触发；同一次协商尝试仅提示一次（发送端/接收端任一进入协商即启动计时，提示归属以最先进入协商的一侧为准）。
- 连接与重连
  - 首次 `connected`：`rtc_connected`（仅一次）。
  - 前台断开：`rtc_reconnecting` → 恢复后 `rtc_restored`。
  - 后台断开不提示；回到前台若仍断开立即提示 `rtc_reconnecting`。
  - 已断开期间若页面在后台，返回前台时若仍处于协商态且此前触发了慢协商计时，则会补发一次 `rtc_slow` 并标记本次协商已提示，以避免重复。

实现位置：
- `frontend/hooks/useRoomManager.ts`：入房阶段提示与定时器管理（3s 慢网、15s 超时），并在 join 成功/失败时清理定时器；支持“等效成功信号”提前判定成功（`ready/recipient-ready/offer`）。
- `frontend/hooks/useConnectionFeedback.ts`：桥接 WebRTC 连接态到 UI 提示。
  - 状态归一化（mapPhase）：`new/connecting`→`negotiating`；`failed/closed`→`disconnected`。
  - 协商慢提示：8s 定时器、前后台可见性节制、单次协商尝试仅提示一次（含挂起→前台补发）。
  - 一次性提示：首次 `connected` 只显示一次；断开→恢复显示 `rtc_restored`；仅前台显示 `rtc_reconnecting`。
  - 复用：慢提示定时与前后台补发由 `frontend/utils/useOneShotSlowHint.ts` 统一实现；状态归一化由 `frontend/utils/rtcPhase.ts` 提供。

文案与 i18n：
- 文案键均位于 `frontend/constants/messages/*.{ts}`，类型定义见 `frontend/types/messages.ts`。
- 关键键：`join_inProgress`、`join_slow`、`join_timeout`、`rtc_negotiating`、`rtc_slow`、`rtc_connected`、`rtc_reconnecting`、`rtc_restored`（已在 en/ja/es/de/fr/ko 全部补齐）。

节流与展示：
- 所有提示默认 4–6 秒自动消失；通过 `useClipboardAppMessages.putMessageInMs(message, isShareEnd, ms)` 统一展示。
- 连接反馈提示在“状态迁移 + ever/wasDisc 标记 + 可见性判断”三重约束下触发，避免提示风暴。
10. **切到接收端自动加入（缓存ID）**：当用户切换到接收端、未在房间、URL 无 `roomId`、输入框为空且本地存在缓存 ID 时，自动填充并直接调用加入房间以提升体验。入口：`frontend/components/ClipboardApp.tsx`（监听 `activeTab` 变化，读取 `frontend/lib/roomIdCache.ts`）。
11. **发送端“使用缓存ID”即刻加入**：发送端在 `SendTabPanel` 点击“使用缓存ID”后会立即调用加入房间（而非仅填充输入框）。入口：`frontend/components/ClipboardApp/CachedIdActionButton.tsx`（`onUseCached` 回调）+ `frontend/components/ClipboardApp/SendTabPanel.tsx`。
12. **深色主题切换**：提供单按钮 Light/Dark 切换，入口：`frontend/components/web/ThemeToggle.tsx`；集成位置：`frontend/components/web/Header.tsx`（桌面与移动）；局部样式从硬编码颜色迁移为设计令牌（例如接收面板使用 `bg-card text-card-foreground`）。

### 前端组件架构特化

**富文本编辑器模块**：

- **RichTextEditor**：主编辑器组件，支持 contentEditable、图片粘贴、格式化工具、SSR 禁用
- **工具栏组件分离**：BasicFormatTools（粗体/斜体/下划线）、FontTools（字体/大小/颜色）、AlignmentTools（对齐）、InsertTools（链接/图片/代码块）
- **类型安全设计**：完整的 TypeScript 类型定义（FormatType、AlignmentType、FontStyleType、CustomClipboardEvent）
- **编辑器 Hooks**：useEditorCommands（命令执行）、useSelection（选择管理）、useStyleManagement（样式管理）

**网站页面组件设计**：

- **Header 响应式导航**：桌面端水平导航+移动端汉堡菜单，集成 GitHub 链接和语言切换器
- **Footer 国际化**：动态版权年份、多语言支持链接显示，使用 languageDisplayNames 配置
- **FAQSection 灵活配置**：支持工具页面/独立页面切换、标题级别控制、自动 FAQ 数组生成
- **内容展示组件**：HowItWorks（步骤动画+视频）、SystemDiagram（架构图）、KeyFeatures（图标+特性说明）

**UI 组件库架构**：

- **基于 Radix UI**：Button（CVA 多变体系统）、Accordion（手风琴）、Dialog（模态对话框）、Select、DropdownMenu
- **设计系统一致性**：统一的 cn 工具函数、主题色彩系统、动画过渡效果
- **组件组合模式**：DialogHeader/DialogFooter/DialogTitle/DialogDescription 组合设计
- **懒加载优化**：LazyLoadWrapper 使用 react-intersection-observer，支持 rootMargin 配置防止布局跳动

**通用组件工具化**：

- **clipboard_btn**：WriteClipboardButton/ReadClipboardButton 分离设计，集成 useClipboardActions hook，支持国际化消息
- **TableOfContents**：支持中文标题 ID 生成、滚动跟踪、层级缩进、IntersectionObserver 监听
- **JsonLd SEO**：多类型数据支持、suppressHydrationWarning、数组/单对象处理
- **AutoPopupDialog/YouTubePlayer**：业务场景封装，复用性设计

### 数据流模式

- **单向数据流**：Store → Hooks → Components
- **状态管理集中化**：所有状态通过 `useFileTransferStore` 统一管理
- **错误处理标准化**：统一的消息提示机制（putMessageInMs）
- **国际化集成**：useLocale + getDictionary 提供多语言支持
