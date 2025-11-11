# PrivyDrop AI Playbook — 协作规则（中文）

本规则面向“人类开发者 + AI 助手”的协作，确保在保持隐私立场与技术基线的前提下，高效而可控地演进代码。与目录索引（index.zh-CN.md）和流程地图（flows.zh-CN.md）互补：它约束“如何做”，不复述“做什么”。

- 适用范围：本仓库全部代码与文档
- 读者对象：人类开发者、AI 助手、评审者
- 变更原则：最佳实践优先、一次只解决一类问题、可回滚、可验证

## 一、协作原则

- Best Practices 优先：选用经过验证且与现有栈一致的方案，避免“自造轮子”。
- 单一主题：每个变更聚焦一个目标，避免“顺手修复”无关问题。
- 隐私立场：严禁引入服务器中转文件数据的实现或建议；后端仅做信令与房间协调。
- 小步快跑：小 PR、易回滚，优先最小可行改动。
- 可追溯：提交信息、PR 描述、代码注释清晰、可复现。

## 二、计划先行（强约束）

任何实现前，必须先提交“变更计划”，经同意后再实施。计划应包含：目标、影响范围与文件列表、方案概述、风险与缓解、验收标准、回滚策略、需更新的文档、验证方式。

推荐模板见“模板”章节。实施前需阅读并引用：

- docs/ai-playbook/index.zh-CN.md
- docs/ai-playbook/code-map.zh-CN.md
- docs/ai-playbook/flows.zh-CN.md

## 三、语言与注释

- 沟通语言：与项目负责人沟通一律使用中文（简体）。
- 代码注释、导出符号命名、提交信息、PR 标题/描述一律英文。
- 用户/市场文档可中英双语；本协作规则为中文。
- 导出函数、复杂流程、公共类型使用 TSDoc/JSDoc（英文），保证 API 可读性。

## 四、Next.js（前端）约定

- App Router 默认 Server Components；仅在确需交互时使用 "use client"。
- 复用现有 UI（Tailwind + shadcn/ui + Radix）；未经批准不引入新组件库。
- i18n：所有可见文案走字典与 `frontend/app/[lang]` 路由，不在组件内硬编码。
- 命名与文件：
  - 组件：PascalCase 文件与导出（ExampleCard.tsx）
  - Hooks：camelCase 文件，导出以 use\* 开头（useSomething.ts）
  - 类型/常量集中维护，避免循环依赖
- SEO：使用 Next Metadata 与 `frontend/components/seo/JsonLd.tsx`；页面需补 canonical、多语言链接。
- 性能与可访问性：按需动态导入重组件；确保 aria/焦点管理基本可用。

## 五、TypeScript 与风格

- 类型严格，避免 any；必要时用 unknown 并显式收窄；导出函数显式返回类型。
- 遵循现有 ESLint/Prettier 与路径别名（`@/...`）；不引入新格式化器。
- 函数小而清晰；复杂逻辑下沉到 service/util，组件只消费不变更状态。
- 不使用一字母变量名；避免魔法数，集中到常量。

## 六、WebRTC/传输“护栏”（不得突破）

- 保持既定策略：32MB 批次 + 64KB 网络块；DataChannel bufferedAmountLowThreshold 与 maxBuffer 策略不随意更改。
- 断点续传、严格顺序写入、多格式兼容是默认能力，禁止降级或移除。
- 信令与消息名（offer/answer/ice-candidate 等）保持兼容；如需破坏性变更，必须走“必须请示”流程。
- 重连与队列处理（ICE 候选缓存、背压、发送重试）策略保持一致，变更需风险评估与充分验证。
- 严禁将文件内容（任何形式）发往服务器或第三方服务。

## 七、后端约束（信令服务）

- 仅负责信令与房间管理；不落地用户文件数据；日志中不得包含敏感内容或原始 payload。
- 速率与滥用防护保留；如需扩展接口，必须保证向后兼容或提供迁移策略。

## 八、依赖与安全

- 新依赖需在计划中论证：体积（含 ESM/SSR 兼容性）、维护健康度、许可、替代方案、安全影响。
- 不引入遥测/埋点；不将敏感数据写入日志；最小权限原则。
- 配置通过环境变量注入；严禁在仓库中硬编码密钥或服务端点。

## 九、文档同步更新

- 代码改动若影响流程、接口或关键文件入口，须同步更新：
  - docs/ai-playbook/flows.zh-CN.md
  - docs/ai-playbook/code-map.zh-CN.md
- PR 必须列出“受影响文档”，避免 AI Playbook 过时；索引页（index.zh-CN.md）保持简洁，仅新增链接时更新。

## 十、验证与回归

- 前端：能构建通过（next build）；关键路径手测说明（至少：创建/加入房间、单/多文件、文件夹、大文件、断点续传、双浏览器互传、i18n 路由与 SEO 元数据）。
- 后端：Socket.IO 基本流程可用。
- 回归清单：重连流程、下载计数与状态清理、Store 单一数据源约束、浏览器兼容（Chromium/Firefox）。

## 十一、必须请示（需先获批）

- 协议/消息名/公共 API/存储格式的破坏性变更。
- 影响隐私立场或跨边界的架构调整（如任何形式的中转或持久化）。
- 引入新依赖、新基础设施或大规模重构。
- 修改传输“护栏”参数（分片、背压、重试等）。

## 十二、常见误区

- 组件内直改全局状态（违背单向数据流）。
- 只改代码不更文档，导致 Playbook 过期。
- 使用 any 绕过类型与边界检查。
- 将 UI 文案硬编码在组件内，绕过字典/i18n。
- 擅自调整 WebRTC 关键参数，导致隐性性能回退或兼容性问题。

## 十三、模板

变更计划模板

```
Title: <简明标题>

Goals
- <预期达成的目标>

Scope / Files
- <将修改与新增的文件路径清单 + 原因>

Approach
- <实现思路与关键设计点>

Risks & Mitigations
- <主要风险> → <缓解策略>

Acceptance Criteria
- <可验证的验收项>

Rollback
- <如何快速回滚>

Docs to Update
- code-map.zh-CN.md / flows.zh-CN.md / README(.zh-CN).md / others?

Validation
- Build: next build / backend health
- Manual: <列出关键用例>
```

PR 校验清单

```
- [ ] 仅包含单一主题改动
- [ ] 代码注释与提交信息为英文
- [ ] 未引入未批准的依赖/组件库
- [ ] i18n 与 SEO 按约定接入（如适用）
- [ ] 传输护栏未被破坏（或已获批且有验证）
- [ ] flows / code-map 文档已同步
- [ ] 附带验证说明与回归清单
```

## 十四、引用与快速入口

- 索引与上下文：docs/ai-playbook/index.zh-CN.md
- 代码地图：docs/ai-playbook/code-map.zh-CN.md
- 关键流程：docs/ai-playbook/flows.zh-CN.md
