# P1.5 五项恢复后验证报告（v2 — 基线 180edfa / WIP 0204f88）

- **仓库**: `/tmp/design-compiler-inspect/`
- **分支**: `feat/aesthetic-integration`
- **基线**: `180edfa`（P1.5 融合收口）+ WIP `0204f88`（G2.5 AestheticGate，未 rebase）
- **上一版基线**: `44d21bf`（v1 报告，2 个 FAIL）
- **审计性质**: 只读审计，未修改任何代码
- **审计日期**: 2026-09-27
- **回归实测**: `determinism.test.ts` + `hash-policy.test.ts` + `patch-engine.test.ts` 共 **35/35 通过**（本地 jest 实跑）

---

## v2 结论速览（对比 v1）

| # | 验证项 | v1 结论 | **v2 结论** | 变化说明 |
|---|--------|---------|--------------|----------|
| 1 | Contract A SSOT（DC 侧） | PARTIAL | **PARTIAL（改善）** | 新增 `docs/contract-a-schema.md` 权威契约文档 + adapter 补齐 24 路径；但仍无机器可读 JSON Schema，CAS 侧待联合复核 |
| 2 | canonical dimension 冻结 | FAIL | **PARTIAL（改善但未达声明）** | 维度数正式定为 **24**（lighting=7）并被 `TC-AES-06 paths.length===24` 守护；**但用户声称的 `V2_NUMBERED_DIMENSIONS` / `includeLegacyTemporal` 符号在仓库中不存在** |
| 3 | 42-rule coverage | PARTIAL (tested=3) | **PARTIAL（改善）** | registered=42, executable=42, **批量覆盖=42**（TC-RC-01..05 全量编译+targetFound 断言）；但具名 ruleId 触发测试仍只有 **4** |
| 4 | deterministic hash — compiledAt 隔离 | FAIL | **PASS** ✅ | `computeValidatedIRHash` 现排除 `/meta/compiledAt`；新增端到端双跑哈希一致 + 篡改 compiledAt 回归测试 |
| 5 | negative-path + CI | PARTIAL | **PARTIAL（改善）** | **CI workflow 已存在**（`.github/workflows/test.yml`）；负向门禁测试沿用 v1 真实失败测试 |

---

## 1. Contract A SSOT（DC 侧自洽性）— PARTIAL（改善）

### v2 新增证据
- **新增权威契约文档** `docs/contract-a-schema.md`（224 行）：
  - §1 明确 CAS（`modules/frontend/runtime/sheet-to-cangjie.ts`，产 21 参数）与 DC（`aesthetic-integration/aesthetic-sheet-adapter.ts`，产 24 参数）两侧实现必须 lock-step。
  - §2 路径约定：**node-level，无 `/value` 后缀**（v1 中 adapter 的 `${targetPath}/value` bug 已修，见 `aesthetic-sheet-adapter.ts:326`）。
  - §3 完整 **24 路径参数表**（color5+composition4+lighting7+materials4+camera4=24），标注 G1 7 路径与 DC-only 字段。
  - §4 constraints 约定、§5 G1 requiredPaths 7 路径、§6 已知实现差异（paramId/evidence/calibration.method envelope 差异为 ABI 选择，不强制统一）、§7 共享派生表、§8 硬约束。
- **adapter 补齐 3 个此前缺失的路径**（`aesthetic-sheet-adapter.ts` diff）：
  - 新增 `LIGHT_SOURCE_SOFTNESS`（`:171`）→ `/lighting/keyLight/softness`
  - 新增 `TIME_TEMP_BIAS`（`:184`）→ `/color/temperatureBias`
  - 新增 `/lighting/rimLightPresent`（boolean，默认 false）
  - 现 adapter 产出 **24 条参数**，与 POINTER_MAP 完全对齐。
- **测试守护**：`tests/aesthetic-integration/pipeline.test.ts`
  - `TC-AES-06`：断言 `paths.length===24`、无 `/value` 后缀、softness=0.7/tempBias=0.05/rim=false。
  - `TC-AES-07`：P0 violation constraints 使用 node-level targetPath。
  - `TC-AES-08/09`：缺 palette role / 非法 ratio 抛错。

### 仍存在的缺口
- `schemas/` 目录仍**没有** `AestheticConstraintSheet` 的机器可读 JSON Schema（现有 5 个 schema：estimated-parameter / evaluation-result / execution-plan / raw-design-ir / validated-design-ir）。契约目前以 Markdown 承载，无 CI 可机器校验 Sheet 形状。
- 跨仓一致性仍**必须 CAS 侧联合复核**：文档自述 CAS 产 21 参数、DC 产 24（superset），3 个 DC-only 字段（softness/temperatureBias/rimLightPresent）CAS 尚未产出。

### 结论
**PARTIAL（改善）**：DC 侧自洽性已从"仅有 TS interface"升级为"权威契约文档 + 24 路径对齐 + 测试守护"。剩余两点：① Sheet 无 JSON Schema 落地；② CAS 侧 21 vs 24 参数差、envelope 差异需独立仓库对照。

---

## 2. canonical dimension 冻结 — PARTIAL（改善，但声明的符号不存在）

### 验证方法
在更新后的工作树全量 grep `V2_NUMBERED_DIMENSIONS|includeLegacyTemporal|NUMBERED_DIMENSIONS|DIMENSION_FREEZE`，并对照文档/测试。

### 证据
- ⚠️ **重要更正**：用户声称 180edfa "已添加 `V2_NUMBERED_DIMENSIONS` + `includeLegacyTemporal`"。**全仓 grep 这两个符号零命中**（`compiler-core/ compiler-intent/ schemas/ tests/contract/` 均无；唯一 "V2" 命中是无关的 `v2_executability` 字段）。该符号**不存在于本基线**。
- 实际落地的冻结手段：
  - `docs/contract-a-schema.md` §3 将 **24 路径表**声明为 SSOT（"Source of truth: POINTER_MAP"，Totals=24）。
  - `tests/aesthetic-integration/pipeline.test.ts` **TC-AES-06** 硬断言 `cangjieIR.parameters.length === 24` 且无 `/value` 后缀——这是一个**机械计数守护**，adapter 漏产/多产路径会直接红。
  - `docs/rule-coverage-matrix.md` §4 同步列出 24 个唯一路径，lighting=7。
- 实际维度计数（与 v1 一致）：composition 4 + camera 4 + lighting 7 + materials 4×N + color 5 = **24**（lighting 含 keyLight 5 + ambientRatio + rimLightPresent）。

### 结论
**PARTIAL（改善）**：维度数已从 v1 的"无声明、无守护"升级为"文档 SSOT=24 + TC-AES-06 计数断言"。但：
1. 任务/用户提到的 `V2_NUMBERED_DIMENSIONS`、`includeLegacyTemporal` 两个具体符号**未在仓库中找到**，疑为另一分支/计划中、或命名不同；
2. "11D vs 12D" 的命名口径仍未解决——代码与文档统一采用 **24 路径**，而非 11 或 12；
3. 没有跨维度分类的 schema `const` 冻结，仅有单处 `length===24` 断言。
建议：与提交者确认符号去向；若冻结目标是 24，则补一个命名常量 + 分类计数断言（4/4/7/4/5）即可升级为 PASS。

---

## 3. 42-rule coverage 矩阵 — PARTIAL（改善）

### v2 新增机制
- `PatchEngine.buildRuleCoverage()`（`compiler-core/patch-engine.ts:196-235`）在每次 compile 时输出 `auditReport.ruleCoverage`：
  `{total, targetFound, targetMissing, triggerable, missingTargets[], perRule[{ruleId,targetPath,targetFound,triggered}]}`，perRule 按 ruleId ASCII 升序（确定性，进入 validatedIRHash）。
- schema 同步：`schemas/validated-design-ir.schema.json` 新增 `RuleCoverageReport` $ref。
- **TC-RC-01..05**（`tests/contract/patch-engine.test.ts`）：
  - TC-RC-01: `total===42`
  - TC-RC-02: `targetFound>=40` 且 `targetFound+targetMissing===total`
  - TC-RC-03: 补齐的 softness/temperatureBias/rimLightPresent 不在 missingTargets
  - TC-RC-04: perRule.length===42 且按 ruleId 升序
  - TC-RC-05: 删除 negativeSpaceRatio 后对应规则 targetFound=false、不崩溃（SILENT_NOOP 可观测）
- `docs/rule-coverage-matrix.md` 记录：标准 fixture 下 42/42 targetFound、42/42 triggerable，其中 9 条实际触发补丁、33 条落在合规区间。

### 最新统计表

| 指标 | v1 | **v2** |
|------|---:|---:|
| registered（rules.length） | 42 | **42** |
| executable（target 可解析 + op 支持 + condition 可评估） | 42 | **42**（ruleCoverage.targetFound=42） |
| 批量编译覆盖（TC-RC 全量跑过并断言） | 0 | **42** |
| **具名 ruleId 触发测试**（grep ruleId） | 3 | **4**（CA-RULE-01-XUSHI、CA-RULE-02-YUNRUN、ANTI-AI-01、ANTI-AI-02） |

> 说明：`docs/rule-coverage-matrix.md` 把 42 行的 "tested" 全部标 ✅，但该列含义是"可执行/可观测"，**不等于**每条规则都有独立的"构造越界输入→断言具体 mutation"测试。按 v1 的严格口径（grep ruleId），具名触发测试仍为 4/42。TC-RC 系列把"全量规则被编译且 target 可解析"这一层补上了，但单规则越界触发用例仍是缺口。

### 结论
**PARTIAL（改善）**：42 registered / 42 executable 维持，且新增 ruleCoverage 可观测层 + TC-RC 全量批量守护。但"每条规则独立触发断言"仅 4/42，其余 38 条仍无定向越界测试。

---

## 4. deterministic hash — compiledAt 隔离 — **PASS** ✅

### v2 证据（v1 FAIL 的修复点）
- **`compiler-core/hash-policy.ts:101-103`**：
  ```ts
  public static computeValidatedIRHash(validatedIR) {
    return this.computeHashWithExclusion(validatedIR, ["/meta/compiledAt"]);
  }
  ```
  预映像显式排除 `/meta/compiledAt`；文件头注释（`:30-38`）写明 compiledAt 为审计时间戳、不参与哈希，而 `grammarPack/grammarVersion` 等确定性字段**仍参与**哈希。
- `compiledAt` 仍由 `patch-engine.ts` 写入 `new Date().toISOString()`（保留审计用途），但已被排除出预映像。
- `computeExecutionPlanHash` 仍全量无排除（执行计划本身不含时间戳）；`computeRawIRHash` 仍排除 `/provenance/rawIRHash`。
- **新增测试守护**（本地实跑通过）：
  - `tests/contract/hash-policy.test.ts` "ValidatedIR compiledAt 确定性排除"：
    - 测试1：compiledAt 不同 → validatedIRHash 相同；
    - 测试2：同对象重算幂等；
    - 测试3：改 `validated.composition` → hash **必须**变（证明非过度排除）；
    - 测试3b：改 `/meta/grammarVersion` → hash **必须**变；
    - 测试4：rawIRHash 排除行为回归不变。
  - `tests/contract/determinism.test.ts`（端到端）：
    - TC-DET-01：同一 sheet 两次 `runner.execute()` → 四个 hash（input/rawIR/validatedIR/executionPlan）全部位级一致；
    - TC-DET-02：手动把 compiledAt 篡改为 `1999-12-31...` → 重算 `computeValidatedIRHash` 仍等于记录值。
- `pipeline-runner.ts` 的 `Date.now()` 仍仅用于 timing（grammarExecutionMs/adapterExecutionMs），不进入任何哈希实体。

### 结论
**PASS**：compiledAt 已完全脱离 validatedIRHash 预映像；same input + same grammar + same hostCaps → 四个哈希位级一致；且有"篡改 compiledAt 不改变 hash"与"改语义必须改变 hash"双向测试守护。哈希确定性修复到位。

---

## 5. negative-path + CI — PARTIAL（改善）

### v2 新增证据
- **CI workflow 已存在**：`.github/workflows/test.yml`
  - 触发：push / PR 到 `master` 与 `feat/aesthetic-integration`；
  - Node 20、`npm ci` → `npm run build`（tsc 类型检查）→ `npm run test:all`（unit + contract）。
  - v1 的"无 CI"缺口已补齐。
- **负向门禁测试**沿用 v1 真实失败测试（非 mock），且 v2 新增：
  - `tests/contract/capability-negotiator.test.ts`（+8 行）；
  - `tests/contract/pipeline-runner.test.ts`（微调）；
  - `tests/aesthetic-integration/pipeline.test.ts` TC-AES-02 G1 BLOCKED_DATA、TC-AES-03 G2 触发、TC-AES-04 G3 降级。
  - 所有负向断言到具体 `evaluation.status`（BLOCKED_DATA / BLOCKED_ENV）、`tierExecuted==="NONE"`、无 metrics/gates 泄漏。

### 结论
**PARTIAL（改善）**：CI 自动化已落地（PR/push 自动跑类型检查 + 全量测试），负向路径测试真实且断言具体 errorCode。剩余小缺口：42 条 grammar 规则的定向越界测试仍薄（见第 3 项），但 G1/G3 两道门禁的负向覆盖充分。

---

## v2 总体结论

**通过（PASS）**
- ✅ **第 4 项 hash 确定性**：compiledAt 已排除出 validatedIRHash 预映像，端到端双跑哈希一致，双向测试守护。**v1 FAIL 已修复。**
- ✅ CI 流水线已建立（`.github/workflows/test.yml`）。
- ✅ 42 规则全部 target 可解析、op 受支持、condition 可评估（ruleCoverage.targetFound=42）。

**改善但未完全达标（PARTIAL）**
1. **第 1 项 Contract A**：DC 侧文档与 24 路径对齐大幅改善；仍缺 Sheet 的机器可读 JSON Schema；CAS 侧 21 vs 24 参数差需联合复核。
2. **第 2 项维度冻结**：维度数定为 24 并有 `TC-AES-06 length===24` 计数守护；**但用户声称的 `V2_NUMBERED_DIMENSIONS` / `includeLegacyTemporal` 符号在本基线中不存在**，"11D/12D"命名口径仍未闭环。
3. **第 3 项规则测试**：批量覆盖 42/42，但具名越界触发测试仅 4/42。

**需 CAS 侧联合复核**
- Contract A 跨仓一致性（CAS `sheet-to-cangjie.ts` 是否产同样 path SET / 派生表 / node-level 约定）。
- 维度冻结符号 `V2_NUMBERED_DIMENSIONS` 的真实位置——若在 CAS 仓或另一分支，需对照确认 DC 侧是否漏合。

### 与 v1 的差异一句话
v1 的 2 个 FAIL 中，**第 4 项（hash）已真正修复并 PASS**；第 2 项（维度）以"文档 SSOT + 计数断言"部分缓解，但提交者声明的具体符号未在本基线出现，需对账。
