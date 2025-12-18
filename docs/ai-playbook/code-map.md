# PrivyDrop AI Playbook — Code Map

This map is designed for quick orientation. It lists directories and key entry files with short notes, and intentionally does not cover “frequently changed spots” or detailed impact analysis.

## Frontend (Next.js, TypeScript)

- `frontend/app/` — App Router routes and pages.

  - `frontend/app/[lang]/page.tsx` — Home page entry; generates metadata and SEO structured data (JsonLd), with multilingual canonical links.
  - `frontend/app/[lang]/*/page.tsx` — Static pages: features, about, faq, help, terms, privacy; each generates multilingual SEO metadata.
  - `frontend/app/[lang]/blog/page.tsx` — Blog list page; renders multilingual post lists.
  - `frontend/app/[lang]/blog/[slug]/page.tsx` — Blog post page; MDX rendering, TOC, breadcrumbs, and JSON-LD structured data.
  - `frontend/app/[lang]/blog/tag/[tag]/page.tsx` — Blog tag page; lists posts by tag.
  - `frontend/app/[lang]/layout.tsx` — Global layout & providers (ThemeProvider, Header/Footer); generates organization/site structured data.
  - `frontend/app/[lang]/HomeClient.tsx` — Main client component composing the home layout (Hero, ClipboardApp, HowItWorks, video demo, system diagram, features, FAQ), with multi-platform video links (YouTube/Bilibili).
  - `frontend/app/api/health/route.ts` — Basic health API.
  - `frontend/app/api/health/detailed/route.ts` — Detailed health API.
  - `frontend/app/sitemap.ts` — Sitemap generator; multilingual URLs and dynamic blog entries.
  - `frontend/middleware.ts` — i18n and routing middleware.
  - `frontend/app/config/environment.ts` — Runtime/env config (ICE, endpoints, etc.).
  - `frontend/app/config/api.ts` — Backend API client wrapper.

- `frontend/components/` — UI layer, including the orchestrator and child components.

  - `frontend/components/ClipboardApp.tsx` — Top-level UI orchestrator. Integrates 5 business hooks (useWebRTCConnection/useFileTransferHandler/useRoomManager/usePageSetup/useClipboardAppMessages), and handles global drag events plus the Send/Retrieve tabs.
    - UX: when switching to Retrieve and all of the following hold—“not in a room, no roomId in URL, empty input, cached ID exists”—it auto-fills and joins (reads `frontend/lib/roomIdCache.ts`).
    - Connection feedback: integrates `useConnectionFeedback` (`frontend/hooks/useConnectionFeedback.ts`) to map WebRTC states to UI messages (negotiating, 8s slow hint, disconnect/reconnect/restored hints when visible). Slow hints reuse `frontend/utils/useOneShotSlowHint.ts`.

- `frontend/hooks/` — Business logic hub (React Hooks).
  - `useRoomManager.ts`
    - Join flow: `join_inProgress` (immediate), `join_slow` (3s, reuses `useOneShotSlowHint`), `join_timeout` (15s); timers are cleared on both success and failure.
    - Equivalent success signals: before `joinResponse`, receiving `ready/recipient-ready/offer` is treated as “joined”, and clears the 3s/15s timers.
    - Others: room status copy, share-link generation, leave room, input validation (750ms debounce).
  - `useConnectionFeedback.ts`
    - State normalization: `new/connecting` → `negotiating`; `failed/closed` → `disconnected` (reuses `utils/rtcPhase.ts`).
    - Negotiation slow hint: an 8s timer (`rtc_slow`), shown at most once per negotiation attempt; if it fires in background, it’s deferred and emitted once on foreground if still negotiating (reuses `useOneShotSlowHint`).
    - One-shot hints: first `connected` (`rtc_connected`) is shown once; foreground reconnecting (`rtc_reconnecting`) and restored (`rtc_restored`) hints.

- i18n copy & types
  - Copy: `frontend/constants/messages/*.{ts}` (zh/en/ja/es/de/fr/ko filled).
  - Types: `frontend/types/messages.ts` (ClipboardApp includes `join_*` and `rtc_*` message keys).
  - `frontend/components/ClipboardApp/SendTabPanel.tsx` — Send panel: rich-text editor, file upload, room ID generation (4-digit vs UUID), share-link generation.
    - UX: clicking “Use cached ID” triggers join immediately on the sender side, saving one manual click.
  - `frontend/components/ClipboardApp/RetrieveTabPanel.tsx` — Retrieve panel: room join, file receiving, directory selection (File System Access API), rich-text display.
  - `frontend/components/ClipboardApp/FileListDisplay.tsx` — File list: file/folder grouping, progress tracking, browser-specific download strategies (Chrome auto download; others prompt manual save), download count stats.
  - `frontend/components/ClipboardApp/FullScreenDropZone.tsx` — Full-screen drag overlay/feedback.
  - `frontend/components/ClipboardApp/*` — Other subcomponents: FileUploadHandler, ShareCard (QR code sharing), TransferProgress, CachedIdActionButton, FileTransferButton.
  - `frontend/components/Editor/` — Rich-text editor module: RichTextEditor, toolbar components (BasicFormatTools/FontTools/AlignmentTools/InsertTools), SelectMenu, types, and editor hooks.
  - `frontend/components/blog/` — Blog components: TableOfContents (Chinese heading ID generation + scroll tracking), Mermaid rendering, MDXComponents, ArticleListItem, etc.
  - `frontend/components/common/` — Shared components: clipboard_btn (clipboard read/write buttons), AutoPopupDialog, LazyLoadWrapper, YouTubePlayer.
  - `frontend/components/web/` — Site components: Header (responsive nav + language), Footer (copyright + language links), FAQSection, HowItWorks, SystemDiagram, KeyFeatures, theme-provider.
    - `frontend/components/web/ThemeToggle.tsx` — Theme toggle (single Light/Dark button), used in Header (desktop & mobile).
  - `frontend/components/seo/JsonLd.tsx` — SEO structured data component for multiple JSON-LD types.
  - `frontend/components/LanguageSwitcher.tsx` — Language switcher.
  - `frontend/components/ui/*` — Base UI atoms (Radix UI + shadcn/ui): Button (variants), Accordion, Dialog, Card, Tooltip, Select, Input, Textarea, Checkbox, DropdownMenu, Toast system, AnimatedButton.

- `frontend/hooks/` — Business logic hub (React Hooks).

  - `frontend/hooks/useWebRTCConnection.ts` — WebRTC lifecycle and orchestration APIs.
  - `frontend/hooks/useRoomManager.ts` — Room create/join/validate and UI state; supports cached-ID reconnect (≥8 chars auto-sends initiator-online).
  - `frontend/hooks/useFileTransferHandler.ts` — File/text payload orchestration and callbacks; uses getState() to avoid stale closures; supports JSZip folder downloads.
  - `frontend/hooks/useClipboardActions.ts` — Clipboard actions/state; supports modern APIs and document.execCommand fallback; handles HTML/rich-text paste.
  - `frontend/hooks/useClipboardAppMessages.ts` — App messaging (shareMessage/retrieveMessage) with a 4-second auto-dismiss mechanism.
  - `frontend/hooks/useLocale.ts` — Language selection by parsing pathname.
  - `frontend/hooks/usePageSetup.ts` — Page setup & SEO; auto-join from URL roomId; referrer tracking.
  - `frontend/hooks/useRichTextToPlainText.ts` — Rich-text → plain-text helper; block-level line breaks and text-node wrapping.

- `frontend/lib/` — Core libraries and utilities.

  - WebRTC base & roles
    - `frontend/lib/webrtc_base.ts` — WebRTC base class: Socket.IO signaling, RTCPeerConnection management, ICE candidate queues, dual-disconnect reconnection, wake lock management, DataChannel send retries (5 attempts with increasing delays), graceful disconnect tracking (`gracefullyDisconnectedPeers` Set), and multi-format payload compatibility (ArrayBuffer/Blob/Uint8Array/TypedArray). joinRoom uses a 15s timeout and an “equivalent success signal” fallback: Initiator treats `ready/recipient-ready` as joined; Recipient treats `offer` as joined; once triggered it sets inRoom and clears listeners/timers to reduce false timeouts on weak networks.
    - `frontend/lib/webrtc_Initiator.ts` — Initiator role: handles `ready`/`recipient-ready`, creates RTCPeerConnection and a proactive DataChannel, sends offers, handles answers, supports a 256KB buffer threshold.
    - `frontend/lib/webrtc_Recipient.ts` — Recipient role: handles `offer`, creates RTCPeerConnection and a reactive DataChannel (`ondatachannel`), generates and sends answers, handles `initiator-online` reconnect signals and connection cleanup.
    - `frontend/lib/webrtcService.ts` — WebRTC service singleton (persists across routes): manages sender/receiver instances, exposes a unified business API, handles connection-state changes, broadcasting, file requests, and disconnect cleanup.
  - Sending (sender)
    - `frontend/lib/fileSender.ts` — Backward-compatible sender wrapper; internally uses FileTransferOrchestrator.
    - `frontend/lib/transfer/FileTransferOrchestrator.ts` — Sender main orchestrator; manages the file transfer lifecycle.
    - `frontend/lib/transfer/StreamingFileReader.ts` — High-performance streaming reader using the 32MB batch + 64KB network chunk dual-layer buffer design.
    - `frontend/lib/transfer/NetworkTransmitter.ts` — Network transmitter; uses native WebRTC backpressure control and supports embedded-metadata chunk packets.
    - `frontend/lib/transfer/StateManager.ts` — State hub; tracks peer state, pending files, folder metadata.
    - `frontend/lib/transfer/ProgressTracker.ts` — Progress tracker; computes file/folder progress and speed stats; triggers callbacks.
    - `frontend/lib/transfer/MessageHandler.ts` — Message routing (fileRequest/fileReceiveComplete/folderReceiveComplete).
    - `frontend/lib/transfer/TransferConfig.ts` — Transfer config: 4MB file read chunks, 32MB batches, 64KB network chunks.
  - Receiving (receiver)
    - `frontend/lib/fileReceiver.ts` — Backward-compatible receiver wrapper; internally uses FileReceiveOrchestrator.
    - `frontend/lib/receive/FileReceiveOrchestrator.ts` — Receiver main orchestrator; manages reception lifecycle with resume support and streaming disk writes.
    - `frontend/lib/receive/ReceptionStateManager.ts` — State hub; manages file metadata, active reception state, folder progress, and save-mode config.
    - `frontend/lib/receive/ChunkProcessor.ts` — Chunk processor: payload conversion, embedded-metadata parsing, validation, and index mapping.
    - `frontend/lib/receive/StreamingFileWriter.ts` — Streaming writer with SequencedDiskWriter for strict in-order disk writes; supports large streaming files.
    - `frontend/lib/receive/FileAssembler.ts` — In-memory assembler for small files; reassembles, checks integrity, and creates a File object.
    - `frontend/lib/receive/MessageProcessor.ts` — Message routing (fileMeta/stringMetadata/fileRequest/folderReceiveComplete).
    - `frontend/lib/receive/ProgressReporter.ts` — Progress reporter: progress/speed stats and throttled callbacks.
    - `frontend/lib/receive/ReceptionConfig.ts` — Reception config: 1GB “large file” threshold, 64KB chunks, buffer sizes, debug toggles.
  - Tools & helpers
    - `frontend/lib/fileReceiver.ts`, `frontend/lib/fileUtils.ts`, `frontend/lib/speedCalculator.ts`, `frontend/lib/utils.ts` — general utilities.
    - `frontend/lib/roomIdCache.ts` — room ID cache management.
    - `frontend/lib/wakeLockManager.tsx` — wake lock manager (mobile optimization).
    - `frontend/lib/utils/ChunkRangeCalculator.ts` — chunk-range calculations.
    - `frontend/lib/browserUtils.ts` — browser compatibility helpers.
    - `frontend/lib/tracking.ts` — user behavior tracking.
    - `frontend/lib/dictionary.ts`, `frontend/lib/mdx-config.ts`, `frontend/lib/blog.ts` — i18n/content/SEO helpers.

- `frontend/stores/` — Shared app state (Zustand).

  - `frontend/stores/fileTransferStore.ts` — Single source of truth for transfer progress/state (Zustand singleton, persists across routes).

- `frontend/types/`, `frontend/constants/` — Types and constants.

  - `frontend/types/global.d.ts` — Global types (lodash module, FileSystemDirectoryHandle).
  - `frontend/types/messages.ts` — i18n message and UI content types (Meta, Text, Messages, etc.).
  - `frontend/types/webrtc.ts` — WebRTC transfer protocol types (metadata, chunk shape, state machine interfaces).
  - `frontend/constants/messages/` — i18n message files (7 languages: en, zh, de, es, fr, ja, ko).
  - `frontend/constants/i18n-config.ts` — i18n config (default language, supported languages, display-name mapping).

- `frontend/content/` — Content.

  - `frontend/content/blog/` — Blog posts (MDX, multilingual), including OSS release, WebRTC file transfer, resume, etc.
  - `frontend/lib/blog.ts` — Blog utilities: multilingual post loading, frontmatter parsing, tag extraction, content validation.

- **Config & build**
  - `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts` — project configuration.
  - `frontend/next.config.mjs`, `frontend/postcss.config.mjs`, `frontend/components.json` — Next.js and component config.
  - `frontend/.eslintrc.json` — lint configuration.
  - `frontend/Dockerfile`, `frontend/health-check.js` — Docker deploy and health checks.

## Backend (Express, Socket.IO, Redis)

- `backend/src/server.ts` — Server entry: Express + Socket.IO init and listen.
- `backend/src/config/env.ts`, `backend/src/config/server.ts` — Environment and server config.
  - `backend/src/config/env.ts` — Env var validation (port, CORS, Redis), supports per-env `.env` loading.
  - `backend/src/config/server.ts` — CORS config for dev/prod, supports multi-origin and LAN regex matching.
- `backend/src/routes/api.ts` — REST: room create/validate, tracking, debug logs.
- `backend/src/routes/health.ts` — Health checks.
- `backend/src/socket/handlers.ts` — Signaling events: `join`, `initiator-online`, `recipient-ready`, `offer`, `answer`, `ice-candidate`.
- `backend/src/services/redis.ts` — Redis client.
- `backend/src/services/room.ts` — Room/member storage and helpers.
- `backend/src/services/rateLimit.ts` — Redis Sorted Set IP rate limiter.
- `backend/src/types/room.ts`, `backend/src/types/socket.ts` — Types and interfaces.

  - `backend/src/types/socket.ts` — Socket.IO types: JoinData, SignalingData (offer/answer/candidate), InitiatorData, RecipientData.
  - `backend/src/types/room.ts` — Room types: RoomInfo (createdAt), ReferrerTrack, LogMessage.

- **Backend config & scripts**
  - `backend/package.json`, `backend/tsconfig.json` — project configuration.
  - `backend/Dockerfile`, `backend/.dockerignore` — Docker configuration.
  - `backend/health-check.js` — health-check script.
  - `backend/scripts/export-tracking-data.js` — data export script.
  - `backend/docker/` — Docker-related configs/scripts (Nginx, TURN server config).

## Deployment & Ops

- **Root-level config**

  - `docker-compose.yml`, `ecosystem.config.js` — Docker Compose and PM2 config.
  - `build-and-deploy.sh`, `deploy.sh` — build and deploy scripts.
  - `deploy.config_prod`, `deploy.config_test` — prod/test deployment config.

- **Docker infrastructure**

  - `docker/nginx/` — Nginx reverse proxy config.
  - `docker/scripts/` — deployment scripts (env checks, config generation, deployment tests).
  - `docker/ssl/` — SSL certificate directory.
  - `docker/coturn/` — TURN server config.
  - `docker/letsencrypt-www/` — Let’s Encrypt config.

- **Build & docs**
  - `build/` — ignore this temporary directory.
  - `test-health-apis.sh` — health API test script.
  - `README.md`, `README.zh-CN.md`, `ROADMAP.md`, `ROADMAP.zh-CN.md` — project docs.

