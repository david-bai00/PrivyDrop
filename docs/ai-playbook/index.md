# PrivyDrop AI Playbook — Context & Index

This playbook is a high signal-to-noise entry point for AI and developers, helping you jump to the right place in the codebase fast. It contains project context and an index of links, not step-by-step task guides.

## Project Snapshot

- Product: WebRTC-based P2P file/text sharing. Data transfers directly between browsers via RTCDataChannel with end-to-end encryption.
- Frontend: Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn/ui.
- Backend: Node.js, Express, Socket.IO, Redis; optional STUN/TURN for NAT traversal.
- Privacy stance: The server must never relay file data; the backend is for signaling and room coordination only.

## Document Index

- README

  - `README.md`

- AI Playbook

  - Code map: `docs/ai-playbook/code-map.md`
  - Flows (includes micro-plan template): `docs/ai-playbook/flows.md`
  - Flows (deep dives, split out): `docs/ai-playbook/flows/frontend.md`, `docs/ai-playbook/flows/backpressure-chunking.md`, `docs/ai-playbook/flows/resume.md`, `docs/ai-playbook/flows/reconnect-consistency.md`
  - Collaboration rules: `docs/ai-playbook/collab-rules.md`

- System & Architecture

  - System architecture: `docs/ARCHITECTURE.md` / `docs/ARCHITECTURE.zh-CN.md`
  - Frontend architecture: `docs/FRONTEND_ARCHITECTURE.md` / `docs/FRONTEND_ARCHITECTURE.zh-CN.md`
  - Backend architecture: `docs/BACKEND_ARCHITECTURE.md` / `docs/BACKEND_ARCHITECTURE.zh-CN.md`

- Deployment
  - Deployment guide: `docs/DEPLOYMENT.md` / `docs/DEPLOYMENT.zh-CN.md`
  - Docker deployment: `docs/DEPLOYMENT_docker.md` / `docs/DEPLOYMENT_docker.zh-CN.md`

## Key Modules at a Glance

- Frontend core
  - Hooks: `frontend/hooks/useWebRTCConnection.ts` (connection orchestration), `useRoomManager.ts` (room lifecycle), `useFileTransferHandler.ts` (payload orchestration).
  - WebRTC base: `frontend/lib/webrtc_base.ts` (Socket.IO signaling, RTCPeerConnection, data channel).
  - Roles: `frontend/lib/webrtc_Initiator.ts`, `frontend/lib/webrtc_Recipient.ts` (initiator/recipient behavior).
  - Sending: `frontend/lib/transfer/*`, `frontend/lib/fileSender.ts` (metadata, chunking, progress).
  - Receiving: `frontend/lib/receive/*`, `frontend/lib/fileReceiver.ts` (assembly, validation, persistence).
  - Store: `frontend/stores/fileTransferStore.ts` (single source of truth for progress/state).
- Backend core
  - Socket.IO: `backend/src/socket/handlers.ts` (join, initiator-online, recipient-ready, offer/answer/ice-candidate).
  - Services: `backend/src/services/{room,redis,rateLimit}.ts`.
  - REST: `backend/src/routes/api.ts` (rooms, tracking, debug logs).

## Maintenance

- Keep it lean and factual; avoid duplicating system-level docs.
- This playbook exists to support collaboration and quick orientation.
