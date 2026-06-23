# PrivyDrop `fea` 分支测试覆盖盘点与缺口快照

更新时间：2026-06-23

## 1. 文档目的

这份文档是当前 `fea` 分支测试工作的**现状盘点文档**。

它主要回答 3 个问题：

- 现在已经正式测到了哪里
- 还有哪些区域没有正式覆盖，或覆盖仍然偏弱
- 如果继续补测，下一步最合适从哪里开始

本文以当前仓库状态为准，不再沿用旧阶段里“官方 E2E 只有少量 resume 主链”的判断。

## 2. 本次盘点基线

本次盘点对照了 4 类信息源：

- `build/fea-test-workspace/fea-test-master-plan.zh-CN.md`
- `build/fea-test-workspace/context/e2e-regression-git-migration-handoff.zh-CN.md`
- 当前仓库内正式测试：
  - `frontend/tests/unit/*.test.ts`
  - `frontend/tests/e2e/regression/*.spec.ts`
- `build/fea-test-workspace/*.cjs` 本地探索脚本与其产物

## 3. 当前覆盖现状总览

截至本次盘点，可确认的正式自动化覆盖为：

- 前端单测：`34` 个文件
- 正式 Playwright E2E：`46` 个 spec
- 后端独立自动化测试：仍然基本没有
- GitHub Actions：
  - PR / push smoke：已接入
  - nightly full E2E：已接入

这意味着：

- WebRTC 重构后最脆弱的主链，已经不再只是靠本地探索脚本兜底
- 正式 E2E 已经从早期“少量 resume / reconnect”扩展到多个 Phase
- 现在最大的系统性盲区，不再是“没有自动守门”，而是 `backend` 独立测试，以及 `Phase 2` / `Phase 7` 更深变体链路

## 4. 当前正式覆盖已经比较扎实的区域

### 4.1 前端单测层

以下能力已经有比较成体系的单测护栏：

- WebRTC lifecycle / reconnect 规则
  - `webrtcBaseJoin.test.ts`
  - `webrtcLifecycle.test.ts`
  - `webrtcService.test.ts`
- 发送 / 接收内核
  - `fileTransferOrchestrator.test.ts`
  - `fileReceiveOrchestratorShutdown.test.ts`
  - `networkTransmitter.test.ts`
  - `streamingFileReader.test.ts`
  - `streamingFileWriter.test.ts`
  - `chunkProcessor.test.ts`
  - `progressTracker.test.ts`
  - `progressReporter.test.ts`
- shutdown / reset / store boundary
  - `receiverShutdown.test.ts`
  - `senderShutdown.test.ts`
  - `transferStoreReset.test.ts`
  - `shutdownMatrixConsistency.test.ts`
  - `webRtcStoreCoordinator.test.ts`
- 日志 / 消息 / 分层边界
  - `logger*.test.ts`
  - `useClipboardAppMessages.test.ts`
  - `clipboardMessageLayerBoundary.test.ts`
  - `noDirectDomainStoreWrites.test.ts`
  - `noDirectBackendLogging.test.ts`

### 4.2 正式浏览器 E2E 层

当前仓库内正式 Playwright E2E 已覆盖：

#### Phase 2

- `room-validation.spec.ts`
- `sender-custom-short-id-create-join.spec.ts`
- `sender-duplicate-roomid.spec.ts`
- `sender-roomcheck-feedback.spec.ts`

#### Phase 3

- `file-meta-resync.spec.ts`
- `multilingual-sync.spec.ts`
- `text-clear-resync.spec.ts`

#### Phase 4

- `single-file-transfer.spec.ts`
- `multi-file-transfer.spec.ts`
- `folder-transfer.spec.ts`
- `large-file-progress.spec.ts`
- `folder-save-directory.spec.ts`
- `resume-single-file.spec.ts`
- `folder-resume-from-partial.spec.ts`

#### Phase 5

- `concurrent-leave.spec.ts`
- `peer-disconnect-state.spec.ts`
- `receiver-leave-during-transfer.spec.ts`
- `sender-leave-during-transfer.spec.ts`
- `receiver-refresh-reset.spec.ts`
- `sender-refresh-reset.spec.ts`
- `refresh-resume-single-file.spec.ts`
- `refresh-resume-folder.spec.ts`

#### Phase 6

- `join-timeout.spec.ts`
- `offline-reconnect.spec.ts`
- `sender-join-timeout-full-chain.spec.ts`
- `slow-network-hint.spec.ts`
- `visibility-reconnect.spec.ts`
- `transfer-resume-after-reconnect.spec.ts`
- `multi-peer-transfer-resume.spec.ts`
- `multi-peer-refresh-resume.spec.ts`
- `multi-peer-mixed-state.spec.ts`

#### Phase 7

- `cached-id-save-mode-timeout.spec.ts`
- `home-console-clean.spec.ts`
- `receiver-cached-id-auto-join.spec.ts`
- `receiver-cached-id-auto-join-not-found.spec.ts`
- `receiver-manual-input-blocks-cached-auto-join.spec.ts`
- `receiver-save-id-success.spec.ts`
- `receiver-save-mode-overwrite-cache.spec.ts`
- `receiver-save-mode-timeout.spec.ts`
- `receiver-use-cached-fills-only.spec.ts`
- `sender-cached-id-join.spec.ts`
- `side-message-isolation.spec.ts`
- `url-overrides-manual-and-cached-on-reload.spec.ts`
- `url-priority-over-cached-id.spec.ts`
- `url-roomid-auto-join.spec.ts`
- `url-roomid-not-found.spec.ts`

## 5. 当前仍然明显偏弱或未正式覆盖的区域

下面这些不是说“完全没测过”，而是说：

- 要么只有 `build/fea-test-workspace/*.cjs` 探索脚本
- 要么虽被其他场景顺带经过，但没有 dedicated 正式回归
- 要么是最近新增 / 最近修过的高风险变体，还没有形成稳定正式守门

### 5.1 Phase 2 房间入口 / roomId / join 规则

`build/fea-test-workspace` 里还有大量 Phase 2 脚本没有正式化：

- `phase2-receiver-leave-basic.cjs`
- `phase2-sender-leave-basic.cjs`
- `phase2-sender-long-id-reuse-join.cjs`
- 以及一批 `overwrite / duplicate / race / notavailable` 变体

当前风险点：

- 长 roomId 规则与更深的自定义 roomId 变体
- duplicate / overwrite / race 条件的更深变体
- join / leave 文案反馈
- roomcheck 相关提示链

### 5.2 Phase 5 sender 侧 leave during transfer

这条已不再是正式覆盖缺口，当前已存在 dedicated 的：

- `sender-leave-during-transfer.spec.ts`

`Phase 5` 当前更应关注的是：

- sender / receiver leave 与其他复杂网络场景的交叉组合
- 而不是基础 sender-leave happy path 是否存在

### 5.3 Phase 6 剩余网络 UX / timeout 变体

当前还没有正式 spec 的主要包括：

其中：

- `join-timeout.spec.ts` 已经存在，但更偏基础 join timeout
- `sender-join-timeout-full-chain` 现已正式化为 `sender-join-timeout-full-chain.spec.ts`
- `slow-network-hint` 现已正式化为 `slow-network-hint.spec.ts`

### 5.4 Phase 7 cached-id / url-priority / immediate-rejoin 变体

当前 Phase 7 已正式覆盖的入口 / 优先级链，已经扩展到：

- `home-console-clean`
- `receiver-cached-id-auto-join`
- `receiver-cached-id-auto-join-not-found`
- `receiver-manual-input-blocks-cached-auto-join`
- `receiver-use-cached-fills-only`
- `sender-cached-id-join`
- `side-message-isolation`
- `url-overrides-manual-and-cached-on-reload`
- `url-priority-over-cached-id`
- `url-roomid-auto-join`
- `url-roomid-not-found`

但探索脚本里还有一整组高价值变体未正式化：

#### receiver cached-id 相关

- 当前这一组还剩更深的 save-mode / overwrite 交叉，而不是基础入口行为本身

#### URL / cached / manual 优先级

- `phase7-url-roomid-tab-roundtrip-priority.cjs`

#### save mode / timeout / overwrite

- 基础 sender / receiver save-mode timeout 与 overwrite 已正式化
- 当前更剩下的是与更多 cached-id / overwrite / rejoin 交叉后的组合

#### immediate rejoin / overwrite

- `phase7-receiver-leave-immediate-rejoin-live-room-chain.cjs`
- `phase7-receiver-leave-immediate-rejoin-file-download.cjs`
- `phase7-receiver-leave-immediate-rejoin-download-count.cjs`
- `phase7-receiver-leave-immediate-rejoin-filemeta-resync.cjs`
- `phase7-receiver-leave-immediate-rejoin-text-resync.cjs`
- `phase7-receiver-leave-overwrites-connected.cjs`
- `phase7-receiver-leave-then-notfound-overwrites.cjs`
- `phase7-receiver-notfound-retry-join-overwrites.cjs`

### 5.5 后端独立测试仍是系统性盲区

当前 `backend/` 目录仍然没有成体系的独立测试：

- 没有 backend unit tests
- 没有 backend integration tests

这意味着下面这些能力仍主要靠前端联调“间接经过”：

- `room` service
- socket handlers
- rate limit
- Redis 生命周期

## 6. 当前需要谨慎理解的点

### 6.1 `multi-peer-mixed-state` 现在已经有正式 spec

它不再属于“完全没正式覆盖”。

但这条仍应谨慎看待，因为它早期就暴露过“脚本断言语义过时”问题。后续如果这条再失败，需要先区分：

- 是产品回归
- 还是 UI / 文案语义已变、脚本断言仍旧写死

### 6.2 `folder-save-directory` 已经有正式 spec，但不等于真实浏览器 API 全覆盖

当前正式 E2E 已有：

- `folder-save-directory.spec.ts`

但它大概率仍依赖 mock save-directory 夹具。

因此要明确区分：

- “正式回归已覆盖业务分支”
- 和“真实 File System Access API 端到端已完全测透”

这两件事不是一回事。

### 6.3 当前正式 E2E 默认关闭了 join rate limit

`frontend/tests/e2e/globalSetup.ts` 会注入：

- `DISABLE_JOIN_RATE_LIMIT=1`

这对 E2E 稳定性是合理的，但也意味着：

- 当前正式自动化基本不覆盖真实 rate-limit 行为本身

如果后续要补完整性，需要单独设计“带限流”的专项测试。

### 6.4 当前已接入 CI，但 smoke 仍然是采样，不是全量替代

当前仓库已新增 GitHub Actions：

- PR / push：`quality + smoke E2E`
- nightly：`quality + full E2E`

这意味着：

- 主链回归已经有自动守门
- 但 PR 上跑的是高价值采样集，不是 46 条全量 E2E

因此如果 nightly 失败，需要先区分：

- 是 smoke 没覆盖到的新回归
- 还是全量重型场景里的环境 / 稳定性问题

## 7. 当前推荐的下一步测试优先级

如果现在继续补测，我建议优先级按下面排。

### 7.1 第一优先级

1. backend 独立测试
2. 观察并收敛新接入 CI 的首轮 smoke / nightly 结果

原因：

- 当前最大盲区已经转移到 backend
- 现在仓库虽然有 E2E 守门，但第一次接入 CI 后，通常还会暴露环境 / 稳定性 / 时序问题
- 先把 CI 跑顺，再继续扩更多 spec，收益更高

### 7.2 第二优先级

3. Phase 2 房间入口 / join / duplicate / roomId 更深变体
4. Phase 7 cached-id / url-priority / immediate-rejoin 更深变体

原因：

- 这两块仍然是剩余浏览器场景里最值得扩的区域
- 但在 CI 还没经历真实持续运行前，不适合再一口气扩很多

### 7.3 第三优先级

5. rate-limit 专项测试
6. 真实 File System Access API 手工 / 半自动回归
7. cross-browser / 移动端基线
8. 3+ peers 稳定性场景

原因：

- 它们依然重要，但更像第二阶段的系统性加固
- 当前不应优先于 backend 基础护栏和 CI 稳定性观察

## 8. 建议的下一波起手顺序

如果继续推进，建议从下面这 4 件事开始：

1. 观察首轮 GitHub Actions smoke / nightly 运行结果并修复真实 flake
2. 为 `backend` 的 `room service` / `socket handlers` / `rate limit` 补第一批独立测试
3. 选择 1 到 2 条最高风险的 `Phase 2` 深变体正式化
4. 选择 1 到 2 条最高风险的 `Phase 7` immediate-rejoin / overwrite 变体正式化

理由：

- 这条顺序能先把“自动守门是否稳定”跑明白
- 再用更低成本的 backend 测试补上当前最大盲区
- 最后再继续扩浏览器重型场景，效率更高

## 9. 当前整理结论

截至 2026-06-23，可以明确下结论：

1. 旧的“只有少量官方 E2E”判断已经完全失效。
2. 当前正式 E2E 和前端单测，对 WebRTC 主链已经有比较扎实的护栏。
3. 当前仓库已经进入“有自动守门”的阶段：
   - PR / push smoke 已接入
   - nightly full E2E 已接入
4. 当前最明显的剩余缺口，已经收敛到：
   - backend 独立测试
   - `Phase 2` 房间入口更深变体
   - `Phase 7` cached-id / url-priority / immediate-rejoin 更深变体
   - rate-limit / 真实文件系统 API / cross-browser 这类系统性补盲
5. 因此，后续推进不应再以“继续堆更多相似主链 E2E”为优先目标，而应先做：
   - CI 稳定性观察
   - backend 基础护栏
   - 少量高价值边界变体补齐

## 10. 2026-06-06 Wave 1 探索补测结果

按本轮建议的起手顺序，已串行复核以下 4 条本地探索脚本：

1. `phase2-room-validation.cjs`
2. `phase2-sender-duplicate-roomid.cjs`
3. `phase7-receiver-cached-id-auto-join.cjs`
4. `phase7-url-priority-over-cached-id.cjs`

结果：4 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase2-room-validation/2026-06-05T22-55-53-327Z/result.json`
- `build/fea-test-workspace/artifacts/phase2-sender-duplicate-roomid/2026-06-05T22-56-02-839Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-cached-id-auto-join/2026-06-05T22-56-10-132Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-url-priority-over-cached-id/2026-06-05T22-56-19-898Z/result.json`

### 10.1 这轮补测说明了什么

- `Phase 2` 的基础 room validation 当前是健康的：
  - sender / receiver 空 roomId 禁用态正常
  - invalid / missing roomId 的 notFound 提示正常
  - receiver 在 notFound 后仍可重试 join
- sender duplicate roomId 反馈链当前是健康的：
  - 已占用 roomId 会得到明确提示
  - 第二个 sender 不会错误进入房间
  - 第一个 sender 的房主状态不受影响
- `Phase 7` 的两条核心优先级链当前也是健康的：
  - receiver cached-id auto join 正常
  - URL roomId 对 cached roomId 的优先级正常，且不会错误覆盖缓存

### 10.2 这轮补测之后，缺口判断如何变化

这 4 条通过后，`Phase 2 / Phase 7` 不能再被简单概括成“完全没测到”。

更准确的说法是：

- `Phase 2 / Phase 7` 已经有一部分关键入口链路被本地探索脚本重新验证为通过
- 但它们仍然**没有形成完整的正式浏览器守门覆盖**
- 剩余缺口主要集中在：
  - 更多 `Phase 2` 的 duplicate / overwrite / race / roomcheck 变体
  - 更多 `Phase 7` 的 cached-id / URL / manual input / immediate rejoin 变体

### 10.3 下一步建议顺序

在这轮结果基础上，下一批最值得继续测的是：

1. `phase2-sender-roomcheck-feedback.cjs`
2. `phase2-sender-custom-short-id-create-join.cjs`
3. `phase7-receiver-manual-input-blocks-cached-auto-join.cjs`
4. `phase7-url-roomid-not-found.cjs`
5. `phase5-sender-leave-during-transfer.cjs`

原因：

- 继续沿着 `Phase 2 / Phase 7` 把入口链路和优先级链查透，收益最高
- 然后再补一个当前正式 E2E 仍缺席的 sender 侧 leave 场景

## 11. 2026-06-06 Wave 2 探索补测结果

按 10.3 的顺序，已继续串行复核以下 5 条本地探索脚本：

1. `phase2-sender-roomcheck-feedback.cjs`
2. `phase2-sender-custom-short-id-create-join.cjs`
3. `phase7-receiver-manual-input-blocks-cached-auto-join.cjs`
4. `phase7-url-roomid-not-found.cjs`
5. `phase5-sender-leave-during-transfer.cjs`

结果：5 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase2-sender-roomcheck-feedback/2026-06-05T23-44-22-713Z/result.json`
- `build/fea-test-workspace/artifacts/phase2-sender-custom-short-id-create-join/2026-06-05T23-44-29-859Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-manual-input-blocks-cached-auto-join/2026-06-05T23-44-40-289Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-url-roomid-not-found/2026-06-05T23-44-49-175Z/result.json`
- `build/fea-test-workspace/artifacts/phase5-sender-leave-during-transfer/2026-06-05T23-44-57-387Z/result.json`

### 11.1 这轮补测说明了什么

- `Phase 2` 的 sender 入口链进一步被证实是健康的：
  - roomcheck 的 available / not available 反馈正确
  - custom short room ID 的 happy path 创建和入房正常
- `Phase 7` 的 cached-id / manual input / URL-not-found 这批优先级链也进一步健康：
  - manual input 能阻止 cached auto-join 回填/覆盖
  - URL roomId 自动 join 失败后，retrieve tab、输入框和值、retry join 能正确收敛
- `Phase 5` 的 sender leave during transfer 当前也健康：
  - sender 主动离房不会留下明显错误状态
  - receiver 侧也没有出现额外控制台错误

### 11.2 这轮补测之后，缺口判断再次收窄

在 Wave 1 + Wave 2 连续通过之后，当前最初担心的两块已经显著收窄：

- `Phase 2`：不再只是“入口链路基本没测”
- `Phase 7`：不再只是“cached-id / URL priority 基本没测”

当前更准确的剩余缺口是：

- `Phase 2` 里更深的 duplicate / overwrite / race 变体
- `Phase 7` 里 immediate rejoin / overwrite / save-mode 相关变体
- `Phase 6` 里尚未正式化的网络 UX / timeout 变体
- `backend` 独立自动化测试

### 11.3 当前建议的下一批测试顺序

如果继续沿着“高风险空洞优先”推进，建议下一批从这里开始：

1. `phase2-sender-roomcheck-available-race-duplicate-overwrite.cjs`
2. `phase2-sender-roomcheck-notavailable-join-duplicate-overwrite.cjs`
3. `phase7-receiver-leave-immediate-rejoin-live-room-chain.cjs`
4. `phase7-receiver-leave-immediate-rejoin-filemeta-resync.cjs`
5. `phase7-receiver-leave-immediate-rejoin-text-resync.cjs`
6. `phase6-slow-network-hint.cjs`
7. `phase6-sender-join-timeout-full-chain.cjs`

原因：

- 现在最值得继续深挖的是更复杂的 `Phase 2` race / overwrite 变体
- 以及 `Phase 7` 的 immediate rejoin 链
- 再之后再收 `Phase 6` 的剩余网络 UX / timeout 边界

## 12. 2026-06-06 Wave 3 探索补测结果

按 11.3 的顺序，已继续串行复核以下 7 条本地探索脚本：

1. `phase2-sender-roomcheck-available-race-duplicate-overwrite.cjs`
2. `phase2-sender-roomcheck-notavailable-join-duplicate-overwrite.cjs`
3. `phase7-receiver-leave-immediate-rejoin-live-room-chain.cjs`
4. `phase7-receiver-leave-immediate-rejoin-filemeta-resync.cjs`
5. `phase7-receiver-leave-immediate-rejoin-text-resync.cjs`
6. `phase6-slow-network-hint.cjs`
7. `phase6-sender-join-timeout-full-chain.cjs`

结果：7 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase2-sender-roomcheck-available-race-duplicate-overwrite/2026-06-06T01-22-36-717Z/result.json`
- `build/fea-test-workspace/artifacts/phase2-sender-roomcheck-notavailable-join-duplicate-overwrite/2026-06-06T01-22-46-541Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-leave-immediate-rejoin-live-room-chain/2026-06-06T01-23-45-861Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-leave-immediate-rejoin-filemeta-resync/2026-06-06T01-25-16-496Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-leave-immediate-rejoin-text-resync/2026-06-06T01-25-36-464Z/result.json`
- `build/fea-test-workspace/artifacts/phase6-slow-network-hint/2026-06-06T01-25-56-130Z/result.json`
- `build/fea-test-workspace/artifacts/phase6-sender-join-timeout-full-chain/2026-06-06T01-26-14-869Z/result.json`

### 12.1 这轮补测说明了什么

- `Phase 2` 的更深一层 roomcheck / duplicate / overwrite / race 变体当前也是健康的：
  - `available -> race -> duplicate -> overwrite` 链没有暴露异常状态收敛
  - `not available -> join -> duplicate -> overwrite` 链也没有出现错误占房或错误覆盖
- `Phase 7` 的 immediate rejoin 主链当前是健康的：
  - receiver leave 后立即 rejoin，live room 链能恢复到正常 `Connected`
  - file metadata 可以重新同步出来
  - text content 可以重新同步出来
- `Phase 6` 剩余两条网络 UX / timeout 场景当前也是健康的：
  - slow network hint 会按预期出现
  - sender join timeout full chain 会先出现协商中的提示，再出现 slow hint，最终落到 timeout 文案

### 12.2 这轮补测发现的环境前提

`Phase 7 immediate rejoin` 这批脚本对环境有一个明确前提：

- 本地直接跑 `build/fea-test-workspace` 脚本时，backend 需要以 `DISABLE_JOIN_RATE_LIMIT=1` 启动

原因：

- 这批脚本属于高频 join / leave / rejoin 场景
- 如果沿用普通开发环境的 rate limit，容易把“环境限流噪音”误判成“产品重入失败”
- 本轮已经验证过一次：`phase7-receiver-leave-immediate-rejoin-live-room-chain.cjs` 在未关闭 join rate limit 的后端上会出现 `Rate limit exceeded. Try again in 0s. Attempts left: 0.`，但切到 `DISABLE_JOIN_RATE_LIMIT=1` 后转为稳定通过

因此，后续继续跑 `Phase 7 immediate rejoin` 相关探索脚本时，应把“backend 是否关闭 join rate limit”作为第一检查项。

### 12.3 这轮补测之后，缺口再次收窄

Wave 1 + Wave 2 + Wave 3 连续通过后，当前缺口已经明显从“主链功能是否健康”收缩到“剩余专项盲区是否值得继续补”。

当前更准确的剩余缺口是：

- `Phase 7` 里 save-mode / overwrite / cached-id 交叉变体仍未系统复核完
- `Phase 6` 更多网络扰动组合还没做，例如现有 reconnect/resume 之外的更长时序或更多 peer 扰动
- `backend` 仍然缺独立自动化测试
- 正式 E2E 之外，探索脚本与正式 spec 之间仍存在一部分重叠但未完全对齐的场景清单

### 12.4 下一步建议顺序

如果继续沿着“本地探索补测”推进，下一批建议优先从这些场景里选：

1. `Phase 7` save-mode / overwrite 交叉变体
2. `Phase 7` receiver cached-id 其他剩余变体
3. 更多 `Phase 6` 多 peer / 长时序网络扰动组合
4. `backend` socket room / join / leave / rate-limit 独立自动化

原因：

- `Phase 2` 的 room entry 链已经被连续多轮压过，短期优先级可以下调
- 当前最可能还藏边界问题的，是 `Phase 7` 的状态优先级交叉链
- 再往后，最值得补的是后端独立测试，而不是继续无上限地加浏览器脚本

## 13. 2026-06-06 Wave 4 探索补测结果

在 Wave 3 基础上，继续补了 `Phase 7` 的 save-mode / cached-id / URL reload priority 交叉链，串行复核以下 7 条本地探索脚本：

1. `phase7-cached-id-save-mode-timeout.cjs`
2. `phase7-receiver-save-mode-timeout.cjs`
3. `phase7-receiver-save-mode-overwrite-cache.cjs`
4. `phase7-receiver-save-id-success.cjs`
5. `phase7-receiver-use-cached-fills-only.cjs`
6. `phase7-receiver-cached-id-auto-join-not-found.cjs`
7. `phase7-url-overrides-manual-and-cached-on-reload.cjs`

结果：7 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase7-cached-id-save-mode-timeout/2026-06-06T01-27-03-783Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-save-mode-timeout/2026-06-06T01-27-12-291Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-save-mode-overwrite-cache/2026-06-06T01-27-20-163Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-save-id-success/2026-06-06T01-27-24-913Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-use-cached-fills-only/2026-06-06T01-27-32-794Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-cached-id-auto-join-not-found/2026-06-06T01-27-37-705Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-url-overrides-manual-and-cached-on-reload/2026-06-06T01-27-44-456Z/result.json`

### 13.1 这轮补测说明了什么

- `Phase 7` 的 save-mode timeout / overwrite cache 链当前是健康的：
  - cached roomId 与 save-mode timeout 不会错误互相污染
  - missing roomId 场景后的缓存覆盖/替换语义正常
  - receiver 保存 roomId 的 happy path 正常
- `Phase 7` 的 cached-id 使用策略也健康：
  - `use cached` 可以只填充输入框，而不是强制错误 auto-join
  - cached-id auto join 落到 notFound 时不会把界面状态搞乱
- `Phase 7` 的 URL / manual / cached 三方优先级链当前也是健康的：
  - reload 后 URL roomId 仍会压过 manual 与 cached 值
  - 没有出现错误覆盖、错误回填或错误房间连接

### 13.2 这轮补测之后，剩余缺口如何变化

到 Wave 4 为止，`Phase 7` 已经不再只是“少数点状验证”，而是：

- immediate rejoin 主链通过
- filemeta/text resync 通过
- save-mode / cache overwrite 通过
- cached-id auto join / notFound / fills-only 通过
- URL reload priority 通过

因此，`Phase 7` 当前剩余的缺口已经进一步缩小到：

- 少数仍未复核的 leave/rejoin 下载侧变体
- 个别 side-message / disconnect 清理类细分脚本
- 与多人并发、长时序网络扰动组合后的交叉链

### 13.3 当前建议的下一步方向

如果继续推进本地探索补测，现阶段更值得优先选的是：

1. `Phase 7` 剩余的 leave/rejoin 下载侧变体
2. `Phase 7` side-message / disconnect 清理细分场景
3. `Phase 6` 更多多人并发 + 网络扰动组合
4. `backend` 独立自动化测试

原因：

- `Phase 7` 的基础优先级链已经被多轮验证为健康，继续补同类收益开始下降
- 现在更容易藏问题的，是“连接变化 + UI 清理 + 已发布内容恢复”的交叉链
- 从整体工程收益看，继续堆浏览器脚本的边际价值，已经开始低于补 backend 独立测试

## 14. 2026-06-06 Wave 5 探索补测结果

继续补了 `Phase 7` 的下载侧 rejoin 和 side-message 清理链，串行复核以下 4 条本地探索脚本：

1. `phase7-receiver-leave-immediate-rejoin-download-count.cjs`
2. `phase7-receiver-leave-immediate-rejoin-file-download.cjs`
3. `phase7-receiver-sender-disconnect-clears-side-messages.cjs`
4. `phase7-receiver-save-then-join-message-chain.cjs`

结果：4 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase7-receiver-leave-immediate-rejoin-download-count/2026-06-06T01-28-09-744Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-leave-immediate-rejoin-file-download/2026-06-06T01-28-32-426Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-sender-disconnect-clears-side-messages/2026-06-06T01-28-53-280Z/result.json`
- `build/fea-test-workspace/artifacts/phase7-receiver-save-then-join-message-chain/2026-06-06T01-28-58-936Z/result.json`

### 14.1 这轮补测说明了什么

- `Phase 7` 的 immediate rejoin 下载侧主链当前是健康的：
  - receiver 重新入房后，file metadata 可恢复
  - 文件下载可以成功完成
  - sender 的 download count 会正确递增
- sender disconnect 后 receiver 侧的 side-message 清理当前也是健康的：
  - 旧的连接侧消息不会错误残留
  - receiver 面板会收敛到 `Sender disconnected`
- `save then join` 的消息链当前也是健康的：
  - receiver 先保存 roomId 再加入房间，不会把缓存与连接态文案搅乱

### 14.2 本轮值得记录的观察

在多条 `immediate rejoin` 脚本的 trace 中，都能看到 sender 面板在 rejoin 初期短暂出现：

- `Room is not available, please try another`

但本轮几个场景的共同特征是：

- receiver 最终都能恢复到 `Connected`
- sender 最终都能恢复到 `2 People in the room`
- file metadata / download / count 都能完成
- 最终面板和 console error 都没有残留异常

因此目前更合理的判断是：

- 这更像是重入窗口中的瞬时提示噪音
- 还不足以按稳定产品故障处理
- 但值得在后续正式 E2E 或 UI 观测类脚本里继续留意

### 14.3 到当前为止的缺口判断

到 Wave 5 为止，`Phase 7` 的主要高价值链路已经被压得比较深：

- cached-id / URL / manual priority
- immediate rejoin
- filemeta / text resync
- save-mode / overwrite cache
- download / download count
- disconnect side-message cleanup

因此，继续在 `Phase 7` 同一层面横向补脚本的边际收益已经明显下降。

现阶段更值得继续推进的方向，优先级更像是：

1. `Phase 6` 更复杂的多人并发与网络扰动组合
2. `backend` 独立自动化测试
3. 如果仍继续浏览器探索，则优先找“尚未覆盖的长时序组合”而不是再堆同类 happy path

## 15. 2026-06-06 上线前测试收口策略

基于最近连续多轮探索补测的结果，当前测试策略已从“继续深挖长尾交叉场景”切换为“尽快为上线收口常见场景”。

### 15.1 上线前应优先确认的常见场景

本轮上线前最小测试包只保留以下高频用户路径：

1. 建房与入房主流程
2. 文本同步与清空
3. 单文件传输
4. 多文件 / 文件夹传输
5. 大文件与进度展示
6. 页面刷新后的基本恢复
7. 常见弱网恢复
8. 单对单传输中一方离开

### 15.2 本轮准备继续重点复核的场景

按“高频 + 上线价值高”优先，当前准备继续复核的是：

1. 建房与入房基础链路
2. 文本同步 / 清空
3. 单文件传输
4. 文件夹传输
5. 大文件进度
6. receiver / sender 刷新后的基本恢复
7. offline / visibility reconnect
8. sender / receiver leave during transfer

### 15.3 先放一放的场景

以下场景并非没有价值，但当前不再作为上线前阻塞项：

- `Phase 7` 更多 immediate rejoin 细分变体
- `cached-id / URL / manual` 的更多优先级交叉组合
- `save-mode / overwrite / notFound` 的更多细分链
- 多人并发下的复杂 resume / refresh / mixed-state
- 3 个以上 peer 的压力场景
- 更长时序 soak / stress 测试
- `backend` 独立自动化测试

### 15.4 收口原则

当前目标不是把所有边界都测到极致，而是：

- 尽快确认高频主流程在当前 `fea` 上可上线
- 把剩余风险明确标记为“已知但延期处理”
- 避免继续在低频交叉场景上消耗过多时间

## 16. 2026-06-06 上线前最小测试包收口结果

按 15.1 和 15.2 的策略，已对当前最关键的高频用户路径做一轮收口复核，串行跑过以下 12 条本地探索脚本：

1. `phase2-room-validation.cjs`
2. `phase3-multilingual-sync.cjs`
3. `phase3-text-clear-resync.cjs`
4. `phase4-single-file-transfer.cjs`
5. `phase4-folder-transfer.cjs`
6. `phase4-large-file-progress.cjs`
7. `phase5-receiver-refresh-reset.cjs`
8. `phase5-sender-refresh-reset.cjs`
9. `phase6-offline-reconnect.cjs`
10. `phase6-visibility-reconnect.cjs`
11. `phase5-sender-leave-during-transfer.cjs`
12. `phase5-receiver-leave-during-transfer.cjs`

结果：12 条全部通过。

对应产物：

- `build/fea-test-workspace/artifacts/phase2-room-validation/2026-06-06T08-38-18-997Z/result.json`
- `build/fea-test-workspace/artifacts/phase3-multilingual-sync/2026-06-06T08-38-29-008Z/result.json`
- `build/fea-test-workspace/artifacts/phase3-text-clear-resync/2026-06-06T08-38-36-677Z/result.json`
- `build/fea-test-workspace/artifacts/phase4-single-file-transfer/2026-06-06T08-38-42-483Z/result.json`
- `build/fea-test-workspace/artifacts/phase4-folder-transfer/2026-06-06T08-38-53-219Z/result.json`
- `build/fea-test-workspace/artifacts/phase4-large-file-progress/2026-06-06T08-38-59-312Z/result.json`
- `build/fea-test-workspace/artifacts/phase5-receiver-refresh-reset/2026-06-06T08-39-08-297Z/result.json`
- `build/fea-test-workspace/artifacts/phase5-sender-refresh-reset/2026-06-06T08-39-19-475Z/result.json`
- `build/fea-test-workspace/artifacts/phase6-offline-reconnect/2026-06-06T08-39-26-740Z/result.json`
- `build/fea-test-workspace/artifacts/phase6-visibility-reconnect/2026-06-06T08-40-35-857Z/result.json`
- `build/fea-test-workspace/artifacts/phase5-sender-leave-during-transfer/2026-06-06T08-41-35-653Z/result.json`
- `build/fea-test-workspace/artifacts/phase5-receiver-leave-during-transfer/2026-06-06T08-41-43-234Z/result.json`

### 16.1 这轮收口说明了什么

当前 `fea` 在上线前最关键的常见场景上，已有比较扎实的通过证据：

- 建房 / 入房基础链路正常
- 文本同步与清空正常
- 单文件传输正常
- 文件夹传输正常
- 大文件传输与进度展示正常
- receiver / sender 刷新后的基本恢复正常
- offline reconnect / visibility reconnect 正常
- 单对单传输中任一方离开时，状态收敛正常

### 16.2 本轮可接受的已知噪音

`offline reconnect` 和 `visibility reconnect` 两条脚本里，receiver console 仍会记录一些原始错误：

- `net::ERR_INTERNET_DISCONNECTED`
- `api/logs_debug Failed to fetch`
- websocket 在断网窗口中的连接失败日志

当前判断这些属于“断网窗口中的可预期噪音”，原因是：

- 两条脚本最终都稳定通过
- 连接状态都能恢复
- 产物和最终 UI 状态都正确
- 没有观察到恢复后的功能性残留故障

因此这类日志目前不作为上线阻塞项，但应继续作为后续观测项保留。

### 16.3 当前上线视角下的建议

如果目标是尽快上线，当前更合理的结论是：

- 常见高频场景已经可以先收口
- 低频长尾交叉场景可以延期
- 后续若继续补测，优先顺序不再是继续深挖 `Phase 7` 细分脚本，而是：
  1. 更复杂的 `Phase 6` 多人并发 / 网络扰动组合
  2. `backend` 独立自动化测试

### 16.4 当前建议先放一放的内容

仍建议延期、不作为本轮上线阻塞项的内容包括：

- 更多 `immediate rejoin` 细分变体
- 更多 `cached-id / URL / manual` 交叉优先级组合
- `save-mode / overwrite / notFound` 的更深细分链
- 多人并发下的复杂 resume / refresh / mixed-state
- 3 个以上 peer 的压力场景
- 更长时序的 soak / stress 测试

## 17. 2026-06-07 正式 E2E 入库进展

本轮已把 13 条原本主要存在于 `build/fea-test-workspace` 的高价值探索场景迁移为正式 Playwright spec：

### 17.1 Phase 2 / 5 / 6

- `room-validation.spec.ts`
- `sender-custom-short-id-create-join.spec.ts`
- `sender-duplicate-roomid.spec.ts`
- `sender-roomcheck-feedback.spec.ts`
- `sender-leave-during-transfer.spec.ts`
- `slow-network-hint.spec.ts`

### 17.2 Phase 7

- `receiver-cached-id-auto-join.spec.ts`
- `receiver-cached-id-auto-join-not-found.spec.ts`
- `receiver-manual-input-blocks-cached-auto-join.spec.ts`
- `receiver-use-cached-fills-only.spec.ts`
- `receiver-save-id-success.spec.ts`
- `receiver-save-mode-overwrite-cache.spec.ts`
- `receiver-save-mode-timeout.spec.ts`
- `url-priority-over-cached-id.spec.ts`
- `url-roomid-not-found.spec.ts`
- `url-overrides-manual-and-cached-on-reload.spec.ts`

### 17.3 本轮入库后的判断

这 13 条适合优先入库，原因是：

- 用户路径常见
- 断言语义清晰
- 对现有 helper 依赖低
- 与已正式存在的 resume / reconnect / transfer 主链形成互补

与之相对，当前仍不建议优先入库的，依然是：

- 多人并发 + 长时序网络扰动组合
- `immediate rejoin` 的复杂下载/恢复细分链
- 需要更重夹具或更强诊断的场景

## 18. 2026-06-07 第二批正式 E2E 入库进展

本轮又继续把 4 条仍然适合低成本长期维护的场景迁移为正式 Playwright spec：

- `sender-join-timeout-full-chain.spec.ts`
- `receiver-save-id-success.spec.ts`
- `receiver-save-mode-timeout.spec.ts`
- `receiver-save-mode-overwrite-cache.spec.ts`

这 4 条的共同特点是：

- 都属于单页单人入口/反馈链
- 不依赖多人并发或复杂断线恢复
- 用户真实会碰到，且文案/状态的可回归价值高

验证结果：

- 这 4 条单独串跑：`4 passed`
- 连同上一轮新增的 13 条一起串跑：`17 passed`

到这里为止，当前最适合优先正式化的 `Phase 2 / Phase 6 / Phase 7` 单人入口类场景，已经基本收进仓库。

## 19. 2026-06-07 第三批正式 E2E 入库进展

本轮又补入了 1 条 sender 侧 cached-id save-mode 场景：

- `cached-id-save-mode-timeout.spec.ts`

这条之所以值得补，是因为它和前一轮已经入库的 receiver save-mode 形成了对称覆盖：

- receiver 侧：`receiver-save-id-success` / `receiver-save-mode-timeout` / `receiver-save-mode-overwrite-cache`
- sender 侧：`sender-cached-id-join` / `cached-id-save-mode-timeout`

验证结果：

- 新 spec 定向回归：`1 passed`
- 连同当前入口类正式 spec 一起串跑：`19 passed`

到这里为止，cached-id / save-mode 这组最常见、最适合长期维护的单页交互链，已经收口得比较完整。
