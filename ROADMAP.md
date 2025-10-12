# PrivyDrop Roadmap

## Overview

- Vision: keep file/text transfer lightweight, smooth, reliable, and easy to self‑host.
- Current snapshot: resumable transfer, chunking + backpressure, Safari/Firefox support, Docker one‑click deploy.

---

## Scope

- Scope: file/text transfer only (one‑to‑many), room‑based sessions.

---

## Near‑Term Roadmap (by priority, no dates)

- P0 Code Optimization & Slimming

  - Architecture convergence & clear boundaries: transport (send/receive), WebRTC wrapper, state, and UI separated; split oversized files; centralize shared types/constants.
  - Redundancy cleanup: remove dead code/unused exports; merge duplicate utilities and logic (keep a single authority for packet encode/decode).
  - Unified config & naming: chunk/batch/backpressure thresholds from a single source; unify naming; do not change behavior.
  - State management coherence: Zustand as the single source of truth; custom hooks only subscribe/dispatch intent, no business logic.
  - Async & error path simplification: unify Promise/event patterns and return values; centralize error types and boundaries.
  - Logging & debug (key runtime item): unified logger with levels (error/warn/info/debug) and toggle; default low‑noise in production; replace scattered console/postLog; consistent IDs by room/session/file.
  - Type & build health: gradually tighten TS, reduce any/implicit any; keep lint/format consistent.

- P0 Minimal Test Set

  - Unit tests: chunk read/slice, embedded packet parse, sequenced disk writer handling of out‑of‑order/duplicate/tail chunks.
  - Lightweight integration: headless/fake data channel to verify send→receive→persist, covering backpressure wait and resume path.
  - Backend minimal tests: room and rate‑limit core contracts.

- P1 Error UX & Read‑only Network Check

  - Clear, actionable errors with retry suggestions; visible send/receive states and failure summaries.
  - Read‑only panel: connection state, data channel state, send buffer, current/avg rate, recent errors. Display only; no complex probing.

- P1 Docs & Deployment Consistency
  - Aligned quickstart and Docker self‑hosting; FAQ and troubleshooting; consistent screenshots and terminology.
  - Frontend architecture docs synced (Zustand + custom hooks).

---

## Definition of Done

- P0 Code Optimization & Slimming

  - Clear module boundaries; unified directory/naming; duplicates merged; dead code removed.
  - Single source for chunk/batch/backpressure config, with behavior unchanged.
  - Zustand as the only state source; components free of business side‑effects; custom hooks roles are clear.
  - Logger levels and toggle in place; production low‑noise; no stray debug output.
  - Build and lint pass; TypeScript warnings significantly reduced.

- P0 Minimal Test Set
  - Core edge cases covered by unit tests; at least one minimal integration path completes send→receive→persist.

---

## Terminology

- Sender/Receiver
- Room
- Chunk / Backpressure
- Resume
- DataChannel
- Persist to disk (OPFS/disk write)
