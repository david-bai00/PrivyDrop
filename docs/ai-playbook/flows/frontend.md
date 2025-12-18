# PrivyDrop AI Playbook — Frontend Component System & Core-Orchestrator Collaboration

← Back to flow index: [`docs/ai-playbook/flows.md`](../flows.md)

(This page is the English edition of content split out from `docs/ai-playbook/flows.zh-CN.md`, preserving the original section numbering and structure.)

## 6) Frontend Component System & Core-Orchestrator Collaboration

### Component Architecture Layers

```
App Router (page.tsx/layout.tsx)
    ↓
HomeClient (layout & SEO)
    ↓
ClipboardApp (top-level UI orchestrator)
    ↓
SendTabPanel/RetrieveTabPanel (feature panels)
    ↓
Business Hooks (state + orchestration)
    ↓
Core Services (webrtcService) + Store (fileTransferStore)
```

### ClipboardApp Orchestrator Pattern

**Core responsibilities**:

- Integrates 5 key business hooks: useWebRTCConnection, useFileTransferHandler, useRoomManager, usePageSetup, useClipboardAppMessages
- Handles global drag events: dragenter/dragleave/dragover/drop, supports multi-file and folder-tree traversal
- Manages the Send/Retrieve tabs via activeTab
- Unified messaging: shareMessage/retrieveMessage auto-dismiss after 4 seconds

### Hook Layering & Separation of Concerns

**useWebRTCConnection** (state bridge):

- Computes global transfer state (isAnyFileTransferring)
- Exposes webrtcService methods (broadcastDataToAllPeers, requestFile, requestFolder)
- Provides reset methods (resetSenderConnection, resetReceiverConnection)

**useFileTransferHandler** (files and content):

- File ops: addFilesToSend (dedupe), removeFileToSend
- Downloads: handleDownloadFile (supports folder ZIP downloads)
- Key fix: uses `useFileTransferStore.getState()` to read the latest state and avoid stale closures
- Retry: up to 3 retries with 50ms interval and detailed error logs

**useRoomManager** (room lifecycle):

- Room ops: joinRoom (supports cached-ID reconnect), processRoomIdInput (750ms debounce)
- Leave protection: confirmation prompt while transferring (checks isAnyFileTransferring)
- Status text: dynamic room status copy
- Link generation: auto-generates share links

**usePageSetup** (page initialization):

- i18n dictionary loading and error handling
- URL param handling: extracts roomId and auto-joins (200ms delay to ensure DOM readiness)
- Referrer tracking (trackReferrer)

**useClipboardAppMessages** (messages):

- Split message states: shareMessage (send side) and retrieveMessage (receive side)
- Unified API: putMessageInMs(message, isShareEnd, displayTimeMs)
- Auto cleanup: clears message state after 4 seconds

### Panel-Specific Design

**SendTabPanel**:

- Dual-mode room ID generation: 4-digit numbers (via backend API) and UUID (via Web Crypto)
- Rich-text editor integration (dynamic import, SSR disabled)
- File upload handling + file list management
- Share link + QR code

**RetrieveTabPanel**:

- File System Access API integration: directory selection and direct disk saves
- Rich-text rendering (dangerouslySetInnerHTML)
- File requests + download state management
- Save-location selection and large file/folder hints

**FileListDisplay**:

- Smart grouping and stats for files/folders
- Cross-browser download strategy: Chrome auto-download; other browsers show manual save guidance
- Download count stats + transfer progress tracking
- Resume state and storage mode display (memory/disk)

### Key UX Improvements

1. **Stale-closure fix for download state**: `useFileTransferHandler.ts:110` uses `useFileTransferStore.getState()`
2. **Debounced roomId validation**: `useRoomManager.ts:247` uses lodash debounce (750ms)
3. **Leaving while transferring**: `useRoomManager.ts:164,218` checks `isAnyFileTransferring` and shows a confirmation dialog
4. **Cached-ID reconnect**: `useRoomManager.ts:91` detects long IDs (≥8 chars) and auto-sends `initiator-online`
5. **Folder ZIP downloads**: `useFileTransferHandler.ts:89` builds ZIPs on the fly with JSZip
6. **Global drag-and-drop robustness**: ClipboardApp uses dragCounter to avoid mis-detecting drag state; supports webkitGetAsEntry folder traversal
7. **Clipboard compatibility**: useClipboardActions supports modern navigator.clipboard APIs with document.execCommand fallback
8. **Rich-text safety**: useRichTextToPlainText is safe on server render; client-side DOM conversion handles block elements
9. **In-app navigation without breaking transfers (same tab)**: relies on `frontend/stores/fileTransferStore.ts` (Zustand singleton) and `frontend/lib/webrtcService.ts` (service singleton). App Router navigation keeps transfers and selected/received content intact. Avoid calling `webrtcService.leaveRoom()` or resetting the store in route-change side effects. Refresh/new tab is not covered.

### UI Connection Feedback State Machine (Weak Network / VPN Hints)

- Join phase
  - Immediate: `join_inProgress` (“Joining the room…”).
  - Not finished after 3s: `join_slow` (“Connection seems slow—check your network/VPN…”).
  - Timeout after 15s: `join_timeout` (“Join timed out…”).
  - Equivalent success signal: while waiting for `joinResponse`, if `ready/recipient-ready/offer` arrives, treat it as “joined” and immediately clear the 3s/15s timers and hints to avoid “slow/timeout hints after success”.
- Negotiation phase (WebRTC)
  - Enter `new/connecting`: normalize to “negotiating” → `rtc_negotiating`.
  - Not connected after 8s: `rtc_slow` (“Your network may be restricted—try turning off VPN or try again later”). Only fires when the page is visible. Only once per negotiation attempt (timer starts when either side enters negotiating; ownership goes to the side that entered negotiating first).
- Connection & reconnection
  - First `connected`: `rtc_connected` (one-time).
  - Foreground disconnect: `rtc_reconnecting` → upon recovery `rtc_restored`.
  - Background disconnect does not notify; when returning to foreground, if still disconnected, notify `rtc_reconnecting` immediately.
  - If the page is backgrounded during a disconnect, when returning to foreground, if still negotiating and the slow timer had fired, emit `rtc_slow` once and mark it as already shown to avoid repeats.

Implementation locations:

- `frontend/hooks/useRoomManager.ts`: join-phase hints and timers (3s slow, 15s timeout), cleared on join success/failure; supports early “equivalent success signals” (`ready/recipient-ready/offer`).
- `frontend/hooks/useConnectionFeedback.ts`: maps WebRTC connection states to UI hints.
  - Phase normalization (mapPhase): `new/connecting` → `negotiating`; `failed/closed` → `disconnected`.
  - Negotiation slow hint: 8s timer, foreground/background throttling, only once per attempt (including deferred background → emitted on foreground).
  - One-shot hints: first `connected` only once; disconnected → restored shows `rtc_restored`; `rtc_reconnecting` only in foreground.
  - Shared helpers: timer + visibility control via `frontend/utils/useOneShotSlowHint.ts`; phase normalization via `frontend/utils/rtcPhase.ts`.

Copy & i18n:

- Message keys live in `frontend/constants/messages/*.{ts}`; types in `frontend/types/messages.ts`.
- Key messages: `join_inProgress`, `join_slow`, `join_timeout`, `rtc_negotiating`, `rtc_slow`, `rtc_connected`, `rtc_reconnecting`, `rtc_restored` (filled across en/ja/es/de/fr/ko).

Throttling & display:

- All hints auto-dismiss after ~4–6 seconds; use `useClipboardAppMessages.putMessageInMs(message, isShareEnd, ms)` as the unified display channel.
- Connection feedback fires under three constraints: state transition + ever/wasDisc markers + visibility checks, preventing “hint storms”.

10. **Auto-join on switching to Retrieve (cached ID)**: when switching to Retrieve, not in a room, no `roomId` in URL, empty input, and a cached ID exists locally, auto-fill and call joinRoom. Entry: `frontend/components/ClipboardApp.tsx` (watches activeTab, reads `frontend/lib/roomIdCache.ts`).
11. **Sender “Use cached ID” joins immediately**: clicking “Use cached ID” in SendTabPanel triggers joining right away (not just filling the input). Entry: `frontend/components/ClipboardApp/CachedIdActionButton.tsx` (`onUseCached`) + `frontend/components/ClipboardApp/SendTabPanel.tsx`.
12. **Dark theme toggle**: single-button Light/Dark toggle in `frontend/components/web/ThemeToggle.tsx`, integrated into `frontend/components/web/Header.tsx` (desktop & mobile). Some local styles are migrated from hardcoded colors to tokens (e.g. retrieve panel uses `bg-card text-card-foreground`).

### Frontend Architecture Specializations

**Rich-text editor module**:

- **RichTextEditor**: main editor component; contentEditable, image paste, formatting tools; SSR disabled
- **Toolbar separation**: BasicFormatTools (bold/italic/underline), FontTools (font/size/color), AlignmentTools, InsertTools (link/image/code block)
- **Type-safe design**: complete TypeScript types (FormatType, AlignmentType, FontStyleType, CustomClipboardEvent)
- **Editor hooks**: useEditorCommands (commands), useSelection (selection), useStyleManagement (style)

**Website page components**:

- **Header responsive nav**: desktop horizontal nav + mobile hamburger; integrates GitHub link and language switcher
- **Footer i18n**: dynamic copyright year and multilingual support links via languageDisplayNames
- **FAQSection**: configurable “tool page vs standalone page”, heading level control, and automatic FAQ array generation
- **Content components**: HowItWorks (animated steps + video), SystemDiagram, KeyFeatures

**UI component library architecture**:

- **Built on Radix UI**: Button (CVA variants), Accordion, Dialog, Select, DropdownMenu
- **Design-system consistency**: shared cn utility, theme token system, animation transitions
- **Composable patterns**: DialogHeader/DialogFooter/DialogTitle/DialogDescription
- **Lazy-load optimizations**: LazyLoadWrapper uses react-intersection-observer with rootMargin tuning to reduce layout shifts

**Shared components as utilities**:

- **clipboard_btn**: WriteClipboardButton/ReadClipboardButton split; integrates useClipboardActions; supports i18n messages
- **TableOfContents**: Chinese heading ID generation, scroll tracking, indentation, IntersectionObserver
- **JsonLd SEO**: multi-type support, suppressHydrationWarning, array vs single object handling
- **AutoPopupDialog/YouTubePlayer**: scenario-driven wrappers designed for reuse

### Dataflow Pattern

- **One-way dataflow**: Store → Hooks → Components
- **Centralized state**: all state is owned by `useFileTransferStore`
- **Standardized error handling**: unified message channel (putMessageInMs)
- **i18n integration**: useLocale + getDictionary provide multilingual content

