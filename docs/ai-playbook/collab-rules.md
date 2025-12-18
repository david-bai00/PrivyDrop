# PrivyDrop AI Playbook — Collaboration Rules

These rules govern how “human developers + AI assistants” collaborate to evolve the codebase efficiently and safely, without breaking the privacy stance or technical baseline. This document complements the index (`index.md`) and the flow map (`flows.md`): it constrains “how we work” without re-stating “what the system does”.

- Scope: the entire repository (code + docs)
- Audience: human developers, AI assistants, reviewers
- Change principles: best practices first, one goal per change, reversible, verifiable

## 1. Collaboration Principles

- Best practices first: prefer proven approaches consistent with the existing stack; avoid reinventing the wheel.
- One change, one purpose: each change should focus on one goal; avoid “while I’m here” fixes.
- Privacy stance: never introduce (or suggest) server-relayed file transfers; the backend is for signaling and room coordination only.
- Small steps: keep PRs small and easy to roll back; prefer the minimum viable change.
- Traceability: commit messages, PR descriptions, and code comments should be clear and reproducible.

## 2. Plan First (Hard Requirement)

Before implementing anything, you must propose a “change plan” and get approval. The plan must include: goals, scope + file list, approach, risks + mitigations, acceptance criteria, rollback, docs to update, and validation.

Recommended reading before implementation (and reference in the plan):

- `docs/ai-playbook/index.md`
- `docs/ai-playbook/code-map.md`
- `docs/ai-playbook/flows.md`

## 3. Language & Comments

- Communication: always use Simplified Chinese when communicating with the project owner/maintainers.
- Code comments, exported symbol naming, commit messages, and PR titles/descriptions must be in English.
- User/marketing docs may be bilingual; this collaboration guide is maintained in both languages.
- Use TSDoc/JSDoc (English) for exported functions, complex flows, and shared types to keep APIs readable.

## 4. Next.js (Frontend) Conventions

- App Router defaults to Server Components; use `"use client"` only when interaction truly requires it.
- Reuse existing UI (Tailwind + shadcn/ui + Radix); do not introduce new UI libraries without approval.
- i18n: all visible copy must go through dictionaries and the `frontend/app/[lang]` routes; do not hardcode strings in components.
- Naming & files:
  - Components: PascalCase file names and exports (ExampleCard.tsx)
  - Hooks: camelCase file names; exports start with use* (useSomething.ts)
  - Centralize types/constants; avoid circular deps
- SEO: use Next Metadata and `frontend/components/seo/JsonLd.tsx`; pages must include canonical and multilingual links.
- Performance & a11y: dynamically import heavy components when needed; ensure basic aria/focus behavior.

## 5. TypeScript & Style

- Keep types strict; avoid any. Use unknown when needed and narrow explicitly; exported functions should have explicit return types.
- Follow existing ESLint/Prettier and path aliases (`@/...`); do not introduce new formatters.
- Keep functions small and clear; move complex logic into service/util layers. Components should consume state, not mutate global state.
- Avoid 1-letter variable names; avoid magic numbers—centralize them as constants.

## 6. WebRTC / Transfer Guardrails (Do Not Break)

- Keep established strategy: 32MB batches + 64KB network chunks; do not casually change DataChannel bufferedAmountLowThreshold or maxBuffer strategy.
- Resume, strict sequential disk writes, and multi-format compatibility are baseline capabilities—do not downgrade/remove them.
- Signaling and message names (offer/answer/ice-candidate, etc.) must stay compatible; any breaking change must follow the “must ask” process.
- Reconnect and queue handling (ICE candidate caching, backpressure, send retries) must remain consistent; changes require risk assessment and thorough validation.
- Never send file contents (in any form) to the backend or third-party services.

## 7. Backend Constraints (Signaling Service)

- Signaling + room management only. Never persist user file data; logs must not include sensitive content or raw payloads.
- Keep rate limiting and abuse protection; if extending APIs, ensure backward compatibility or provide a migration path.

## 8. Dependencies & Security

- New dependencies require justification in the plan: size (ESM/SSR compatibility), maintenance health, license, alternatives, security impact.
- Do not add telemetry/tracking; do not log sensitive data; follow least privilege.
- Inject config via env vars; never hardcode secrets or service endpoints in the repo.

## 9. Documentation Sync

- If code changes affect flows, interfaces, or key entry points, update in the same PR:
  - `docs/ai-playbook/flows.zh-CN.md`
  - `docs/ai-playbook/code-map.zh-CN.md`
- PRs must list “docs impacted” to avoid the playbook going stale; keep the index page lean and only update it when adding new links.

## 10. Validation & Regression

- Frontend: must build (`next build`); include manual verification for key paths (at least: create/join room, single/multi file, folder, large files, resume, cross-browser transfers, i18n routes + SEO metadata).
- Backend: Socket.IO core flow works.
- Regression checklist: reconnect flow, download counts + state cleanup, store single-source-of-truth constraint, browser compatibility (Chromium/Firefox).

## 11. Must Ask First (Approval Required)

- Breaking changes to protocols/message names/public APIs/storage formats.
- Architecture changes impacting privacy stance or crossing boundaries (any relay or persistence).
- New dependencies, new infrastructure, or large refactors.
- Changes to transfer guardrail parameters (chunking, backpressure, retries, etc.).

## 12. Common Pitfalls

- Mutating global state from inside components (breaks one-way dataflow).
- Changing code without updating docs, leaving the playbook stale.
- Using any to bypass type and boundary checks.
- Hardcoding UI copy in components instead of using dictionaries/i18n.
- Tweaking critical WebRTC parameters without validation, causing silent regressions.

## 13. Templates

Change Plan Template

```
Title: <concise title>

Goals
- <what you intend to achieve>

Scope / Files
- <files to change/add + why>

Approach
- <implementation approach and key design points>

Risks & Mitigations
- <major risk> -> <mitigation>

Acceptance Criteria
- <verifiable acceptance items>

Rollback
- <how to roll back quickly>

Docs to Update
- code-map.zh-CN.md / flows.zh-CN.md / README(.zh-CN).md / others?

Validation
- Build: next build / backend health
- Manual: <key scenarios>
```

PR Checklist

```
- [ ] Single-topic change only
- [ ] Code comments and commit messages are in English
- [ ] No unapproved dependencies/UI libraries added
- [ ] i18n and SEO follow conventions (if applicable)
- [ ] Transfer guardrails are unchanged (or approved + validated)
- [ ] flows / code-map docs are updated in sync
- [ ] Validation notes and regression checklist included
```

## 14. References & Quick Entry Points

- Index & context: `docs/ai-playbook/index.md`
- Code map: `docs/ai-playbook/code-map.md`
- Key flows: `docs/ai-playbook/flows.md`

