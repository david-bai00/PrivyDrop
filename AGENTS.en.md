# AGENTS — PrivyDrop Repository Rules (Short)

## First Principles

- Communicate in Chinese: Always use Simplified Chinese when communicating with the project owner/maintainers. Use English for code comments, naming, commit messages, and PR titles/descriptions.
- Best practices, aligned with the existing stack: Prefer proven approaches consistent with what the repo already uses; iterate in small steps and keep changes easy to roll back.
- Plan first: Before implementing anything, propose a change plan and get approval (goals, scope/files, approach, risks, acceptance, rollback, docs updates, validation). Template: `docs/ai-playbook/collab-rules.md` (or `docs/ai-playbook/collab-rules.zh-CN.md`).
- One change, one purpose: Each change should solve one clear goal; avoid “while I’m here” fixes; keep it minimal and reversible.
- Privacy & architecture red line: The backend is for signaling and room coordination only. Do not relay, store, or upload any user file data to the server or third parties in any form.
- Transport guardrails: Keep established chunking/backpressure/retry parameters and mechanisms; any breaking change or parameter-level change must be approved first.
- Dependencies & infrastructure: Do not add new dependencies/component libraries/infrastructure or do large refactors without approval.
- Docs must stay in sync: If a change affects flows, interfaces, or entry file paths, update `docs/ai-playbook/flows.zh-CN.md` and `docs/ai-playbook/code-map.zh-CN.md` in the same PR.
- Verification required: Frontend must build (`next build`); list key manual test cases and regression points.

## Priority & Conflicts

- Explicit user instructions override this file; if there’s a conflict, call it out in the plan and get approval.
- For detailed rules, examples, and checklists, follow `docs/ai-playbook/collab-rules.md` (this file only keeps the highest-level principles).

