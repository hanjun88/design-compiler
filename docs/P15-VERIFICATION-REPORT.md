# P1.5 五项恢复后验证报告（纯审计）

- **仓库**: `/tmp/design-compiler-inspect/`
- **分支 / HEAD**: `feat/aesthetic-integration` @ `44d21bf`
- **基线声明**: 180/180 契约测试通过（由 agent-hint 提供；本审计未重跑，仅静态阅读）
- **审计性质**: 只读审计，未修改任何代码
- **审计日期**: 2026-09-27

---

## 总体结论速览

| # | 验证项 | 结论 | 关键发现 |
|---|--------|------|----------|
| 1 | Contract A SSOT（DC 侧自洽性） | **PARTIAL** | DC 侧类型/adapter/pointer-map 自洽，但 `schemas/` 下**缺失 AestheticConstraintSheet JSON Schema**；需 CAS 侧联合复核 |
| 2 | 11D vs 12D canonical dimension 冻结 | **FAIL / PARTIAL** | 仓库内**不存在 "11D"/"12D" 常量或文档声明**；实际 pointer-map 维度 = **24**（lighting 实为 7，非提示中的 6）；无正式冻结机制 |
| 3 | 42-rule coverage 矩阵 | **PARTIAL** | 42 registered = 42，42 executable = 42，**42 tested = 3**（仅 CA-RULE-01/02、ANTI-AI-02 有触发测试） |
| 4 | deterministic hash — compiledAt 隔离 | **FAIL** | `compiledAt = new Date().toISOString()` 且被 `computeValidatedIRHash` 全量哈希预映像纳入 → **validatedIRHash 跨运行不确定** |
| 5 | negative-path + CI | **PARTIAL** | BLOCKED_DATA / BLOCKED_ENV 均有真实失败测试并断言 errorCode/status；但**无 CI 自动化流水线配置** |

---

## 1. Contract A SSOT（DC 侧自洽性）— PARTIAL

### 验证方法
逐项阅读 `aesthetic-sheet-adapter.ts` 的 `AestheticConstraintSheet` 类型定义、`sheetToCangjieIR()` 的字段映射、`compiler-intent/pointer-map.ts` 的 canonical 路径表，并与 `schemas/` 目录对照。

### 证据

**(a) `AestheticConstraintSheet` 类型定义** — `aesthetic-integration/aesthetic-sheet-adapter.ts:68-108`
- 顶层字段：`sheetId, designBrief, mood, attributionStatement, structuralDimensions[], colorSystem{palette,saturationMax,hardFailHex}, proportion{baseModulePx,spacingScale,voidSolidRatio,focalPointsMax}, spatial{axis,bays,hierarchyLevelsMin}, lighting{primarySource,timeSetting,lightDarkRatio}, motion{prototypes,durationMs,entryMode,hardFail}, antiCliche{scanned,hardFailHits,forbidden}, violations[], score`。
- 文件头注释（`:6-16`）明确声明这是 "DC-side independent adapter … does NOT import any CAS code"，并记录了与 CAS 的两点适配：剥离尾部 `/value`、补全 DC 富字段。

**(b) sheet → CangjieRawDesignIR 映射** — `aesthetic-sheet-adapter.ts:326-448`
- 派生表：`LIGHT_SOURCE_ANGLES`（`:150`）、`TIME_COLOR_TEMP`（`:159`）、`MOOD_MATERIAL`（`:168`）、`VIOLATION_RULE_PATH`（`:177`）。
- 实际产出 21 个 Cangjie 参数（`:360-397`）：
  - color(4): `/color/dominant,/secondary,/accent,/contrastRatio`
  - composition(4): `/composition/negativeSpaceRatio,symmetry,depthLayerCount,focalPoint`
  - lighting(5): `/lighting/keyLight/azimuth,elevation,colorTemp,intensity,/lighting/ambientRatio`
  - materials(4): `/materials/0/baseType,roughness,metalness,wear`
  - camera(4): `/camera/fov,shotSize,angle,height`

**(c) pointer-map 路径映射** — `compiler-intent/pointer-map.ts:55-305`
- 共 **24** 条 canonical 路径（composition 4 / camera 4 / lighting 7 / materials 4 模板 / color 5）。
- `lookupPointer()`（`:331`）支持 materials 任意索引归一化；`intent-normalizer.ts:506-544` 对每个 Cangjie 参数做 `lookupPointer` + `validateValueType` + 覆盖检测，未命中路径记入 `unmappedParameters`。

**(d) `schemas/` 目录对照**
- 现有 schema：`estimated-parameter / evaluation-result / execution-plan / raw-design-ir / validated-design-ir`。
- **缺失**：`AestheticConstraintSheet` 没有对应的 JSON Schema（`schemas/` 下无 `aesthetic-constraint-sheet.schema.json`）。Sheet 形状仅以 TS interface 形式存在于 adapter 中，`demo/e2e-aesthetic/src/types.ts:49` 还有第二份"structural mirror"。

### 字段丢失 / 重复映射核对
- adapter 产出的 21 条路径**全部命中** pointer-map，无重复写入（`intent-normalizer` 仅记录 OVERWRITE 告警，不覆盖语义）。
- pointer-map 中 **3 条可选路径未被 adapter 产出**，由 `buildInitialCoreIR()` 骨架填默认值（`intent-normalizer.ts:268-286, 296-304, 337-342`）：
  - `/lighting/keyLight/softness`（required=false）
  - `/lighting/rimLightPresent`（required=false）
  - `/color/temperatureBias`（required=false）
- 这 3 条均为 optional，不触发 G1 BLOCKED_DATA，属设计内回退，非字段丢失。

### 结论
**PARTIAL（DC 侧自洽）**：DC 内部类型 ↔ adapter 映射 ↔ pointer-map 三者一致，无字段丢失或重复映射；但 Sheet 本身**无 JSON Schema 落地**，存在 adapter 与 demo mirror 两处结构定义漂移风险。**CAS 侧是否真正使用同一 sheet schema/mapping 必须由 CAS 独立仓库联合复核**（本仓库无 CAS 代码，无法验证跨仓一致性）。

---

## 2. 11D vs 12D canonical dimension 冻结 — FAIL / PARTIAL

### 验证方法
统计 `RawDesignIR`（`compiler-core/contracts.ts:70-127`）顶层维度；对照 `pointer-map.ts`；全仓 grep "11D"/"12D"/"canonical dimension"/冻结常量。

### 证据

**(a) RawDesignIR 顶层维度实际计数**（`contracts.ts:78-114`）：

| 分类 | 字段 | 数量 |
|------|------|------|
| composition | focalPoint, negativeSpaceRatio, depthLayerCount, symmetry | 4 |
| camera | fov, shotSize, angle, height | 4 |
| lighting | keyLight.{azimuth,elevation,colorTemp,intensity,softness} (5) + ambientRatio + rimLightPresent | **7** |
| materials | 每项 baseType,roughness,metalness,wear（×N） | 4×N |
| color | dominant,secondary,accent,contrastRatio,temperatureBias | 5 |

- pointer-map 物理条目 = 4+4+7+4+5 = **24**（`pointer-map.ts:55-305`）。
- ⚠️ 与验证提示中的 "lighting(6)" 不一致：实际 lighting 为 **7**（含 `rimLightPresent` 布尔量与 `softness`）。

**(b) "11D"/"12D" 声明检索**
- 全仓 grep `11D|12D|canonical.?dimension|CANONICAL_DIMENSION|dimensionCount` 在编译器源码/schema/文档中**零命中**（唯一命中来自 `cangjie-western/source-evidence/astro/...` 弦论文本 "at least 11 dimensions"，与本编译器无关）。
- 不存在任何命名常量（如 `CANONICAL_DIMENSION_COUNT=11/12`）、schema `const` 或冻结测试。

**(c) 冻结机制**
- 事实 SSOT 是 `pointer-map.ts` 的 `POINTER_MAP` 数组（24 条），但它是运行时数组，**没有**：维度数常量、schema 枚举冻结、或"维度数必须等于 N"的断言测试。

### 结论
**FAIL / PARTIAL**：仓库内**从未声明过 "11D" 或 "12D"**，因此"11D vs 12D"在 DC 侧无书面依据可对照。实际 canonical 维度 = **24 个 pointer-map 条目**（materials 按模板 ×N），且 lighting 实为 7 而非 6。**维度未正式冻结**——缺常量、缺 schema 冻结、缺计数断言测试。需与产品/CAS 侧对齐"11D/12D"的确切口径后再补冻结。

---

## 3. 42-rule coverage 矩阵 — PARTIAL

**数据源**: `config/grammar-rules.json`（`node` 校验 rules.length = **42**，mutation.op 全部 = `replace`，17 个唯一 targetPath）。
**PatchEngine 支持的 op**（`patch-engine.ts:140-146` / `:328-396`）：`add/remove/replace/move/copy/test`。
**target_exists 判定**：rule targetPath 去掉尾部 `/value` 后命中 `POINTER_MAP`（RawDesignIR 每个参数节点含 `.value` 子字段，故 `/value` 可解析）。
**triggerable 判定**：condition.operator ∈ {<,>,<=,>=,==,!=,between,not_between} 且阈值合理（`patch-engine.ts:194-229`）。
**has_negative_test**：全 `tests/` grep `CA-RULE-*` / `ANTI-AI-*` 命中。

| # | rule_id | target_path | target_exists | triggerable | mutation_supported | has_negative_test | notes |
|---|---------|-------------|:---:|:---:|:---:|:---:|------|
| 1 | CA-RULE-01-XUSHI | /composition/negativeSpaceRatio/value | Y | Y (<0.35) | Y (replace) | **YES** | patch-engine TC-PE; TC-AES-03 实触发 |
| 2 | CA-RULE-02-YUNRUN | /lighting/keyLight/softness/value | Y | Y (<0.5) | Y (replace) | **YES** | patch-engine TC-PE-06 排序用例；adapter 不产 softness，骨架默认 0.5 |
| 3 | CA-RULE-03-CANGRUN | /materials/0/roughness/value | Y | Y (<0.5) | Y (replace) | NO | |
| 4 | CA-RULE-04-SHEJI | /color/temperatureBias/value | Y | Y (>0.3) | Y (replace) | NO | adapter 不产 temperatureBias，骨架默认 0.0 |
| 5 | CA-RULE-05-JINGMO | /composition/symmetry/value | Y | Y (>0.9) | Y (replace) | NO | 与 RULE-37 阈值重复 |
| 6 | ANTI-AI-01 | /materials/0/roughness/value | Y | Y (<0.18) | Y (replace) | NO | multi-patch 模式 |
| 7 | ANTI-AI-02 | /composition/negativeSpaceRatio/value | Y | Y (<0.4) | Y (replace) | **YES** | TC-AES-03 实触发（nsr=0.30） |
| 8 | ANTI-AI-03 | /lighting/ambientRatio/value | Y | Y (>0.65) | Y (replace) | NO | multi-patch 含 rimLightPresent→false |
| 9 | ANTI-AI-04 | /lighting/keyLight/colorTemp/value | Y | Y (not_between [2700,6500]) | Y (replace) | NO | not_between 运算符已实现 |
| 10 | CA-RULE-06-XIASHENG | /lighting/keyLight/intensity/value | Y | Y (>0.9) | Y (replace) | NO | |
| 11 | CA-RULE-07-XUANLAN | /composition/symmetry/value | Y | Y (>0.93) | Y (replace) | NO | |
| 12 | CA-RULE-08-JIANSU | /color/temperatureBias/value | Y | Y (>0.25) | Y (replace) | NO | |
| 13 | CA-RULE-09-ZHONGZHOU | /composition/symmetry/value | Y | Y (<0.4) | Y (replace) | NO | |
| 14 | CA-RULE-10-CIDENG | /composition/depthLayerCount/value | Y | Y (<2) | Y (replace) | NO | |
| 15 | CA-RULE-11-YINLU | /camera/fov/value | Y | Y (>65) | Y (replace) | NO | |
| 16 | CA-RULE-12-JIBAI | /composition/negativeSpaceRatio/value | Y | Y (<0.4) | Y (replace) | NO | 与 ANTI-AI-02 阈值重叠 |
| 17 | CA-RULE-13-XUSHI | /composition/negativeSpaceRatio/value | Y | Y (>0.72) | Y (replace) | NO | |
| 18 | CA-RULE-14-SHUKE | /composition/depthLayerCount/value | Y | Y (>5) | Y (replace) | NO | |
| 19 | CA-RULE-15-GUCHUAN | /camera/fov/value | Y | Y (<28) | Y (replace) | NO | |
| 20 | CA-RULE-16-HUANGJIN | /composition/symmetry/value | Y | Y (>=0.95) | Y (replace) | NO | >= 运算符已实现 |
| 21 | CA-RULE-17-PINGZHENG | /camera/angle/value | Y | Y (>12) | Y (replace) | NO | |
| 22 | CA-RULE-18-CANGRUN | /materials/0/roughness/value | Y | Y (<0.45) | Y (replace) | NO | |
| 23 | CA-RULE-19-CHUHUA | /materials/0/metalness/value | Y | Y (>0.6) | Y (replace) | NO | |
| 24 | CA-RULE-20-BAOJIANG | /materials/0/wear/value | Y | Y (<0.15) | Y (replace) | NO | |
| 25 | CA-RULE-21-TIANGUANG | /lighting/keyLight/elevation/value | Y | Y (<25) | Y (replace) | NO | |
| 26 | CA-RULE-22-FUSHE | /lighting/ambientRatio/value | Y | Y (<0.25) | Y (replace) | NO | |
| 27 | CA-RULE-23-BANYING | /lighting/keyLight/softness/value | Y | Y (<0.45) | Y (replace) | NO | |
| 28 | CA-RULE-24-SHESE | /color/contrastRatio/value | Y | Y (>4.5) | Y (replace) | NO | |
| 29 | CA-RULE-25-HUIMING | /color/contrastRatio/value | Y | Y (<1.4) | Y (replace) | NO | |
| 30 | CA-RULE-26-QINGDAN | /color/temperatureBias/value | Y | Y (<-0.3) | Y (replace) | NO | |
| 31 | CA-RULE-27-JINGYUANDONG | /composition/symmetry/value | Y | Y (>0.96) | Y (replace) | NO | |
| 32 | CA-RULE-28-WANQU | /camera/angle/value | Y | Y (>18) | Y (replace) | NO | |
| 33 | CA-RULE-29-YUNXING | /lighting/keyLight/azimuth/value | Y | Y (==0) | Y (replace) | NO | adapter 默认 skylight azimuth=0 → 默认即触发 |
| 34 | CA-RULE-30-CHUYAN | /composition/negativeSpaceRatio/value | Y | Y (<0.35) | Y (replace) | NO | 与 RULE-01 阈值重复 |
| 35 | CA-RULE-31-JIEGUANG | /lighting/keyLight/intensity/value | Y | Y (<0.3) | Y (replace) | NO | |
| 36 | CA-RULE-32-YANXIA | /lighting/rimLightPresent/value | Y | Y (==true) | Y (replace) | NO | 布尔 condition；adapter 骨架默认 false |
| 37 | CA-RULE-33-KEQI | /composition/negativeSpaceRatio/value | Y | Y (<0.42) | Y (replace) | NO | |
| 38 | CA-RULE-34-DAJI | /composition/depthLayerCount/value | Y | Y (>6) | Y (replace) | NO | |
| 39 | CA-RULE-35-SHOUGAN | /materials/0/roughness/value | Y | Y (>0.95) | Y (replace) | NO | |
| 40 | CA-RULE-36-QUSULIAO | /materials/0/roughness/value | Y | Y (<0.2) | Y (replace) | NO | |
| 41 | CA-RULE-37-POJU | /composition/symmetry/value | Y | Y (>0.9) | Y (replace) | NO | 与 RULE-05 阈值重复 |
| 42 | CA-RULE-38-GUOBAO | /lighting/keyLight/intensity/value | Y | Y (>0.95) | Y (replace) | NO | |

### 统计
- **42 registered = 42**（grammar-rules.json rules.length = 42，node 校验）
- **42 executable = 42**（全部 target_path 在 POINTER_MAP 可解析；全部 condition.operator 受支持；全部 mutation.op=replace 受 PatchEngine 支持）
- **42 tested = 3**（仅 CA-RULE-01-XUSHI、CA-RULE-02-YUNRUN、ANTI-AI-02 在 tests/ 中有可执行触发测试；其余 39 条零触发用例）

### 异常备注
- 17 个唯一 targetPath 承载 42 条规则，存在多规则同路径阈值重叠（如 negativeSpaceRatio 承载 7 条、symmetry 承载 6 条），叠加后补丁按 ruleId 字典序排序（`patch-engine.ts:297`），后写覆盖先写——语义优先级未在规则包内声明。
- CA-RULE-29-YUNXING 用 `==0` 匹配 azimuth，adapter 默认 skylight azimuth=0，意味着**默认 sheet 即触发**该规则，可能与设计意图不符。

---

## 4. deterministic hash — compiledAt 隔离 — FAIL

### 验证方法
通读 `hash-policy.ts` 全部实现；追踪 `computeValidatedIRHash` / `computeExecutionPlanHash` 的预映像；检查执行路径上的 `new Date()` / `Date.now()`；对照 `pipeline-runner.ts` 计时与哈希的边界。

### 证据

**(a) `compiledAt` 来源是 wall-clock** — `compiler-core/patch-engine.ts:140-144`
```ts
meta: {
  grammarPack: this.grammar.packName,
  grammarVersion: this.grammar.version,
  compiledAt: new Date().toISOString(),   // ← wall-clock，每次运行不同
},
```

**(b) `computeValidatedIRHash` 对全实体做 RFC8785，无排除** — `compiler-core/hash-policy.ts:64-66`
```ts
public static computeValidatedIRHash(validatedIR) {
  return this.computeHash(validatedIR);   // 全量序列化，含 meta.compiledAt
}
```
对比 `computeRawIRHash`（`:59-61`）显式排除 `/provenance/rawIRHash`；而 validatedIR **没有任何排除路径**，`meta.compiledAt` 完整进入预映像。`contracts.ts:14` 注释也写明预映像为 "RFC8785(ValidatedDesignIR) 全量计算"。

**(c) 哈希调用点在 compile 之后** — `compiler-core/pipeline-runner.ts:69-81`
```ts
const validatedIR = this.patchEngine.compile(sanitizedRawIR);   // compiledAt=new Date()
...
const validatedIRHash = HashPolicy.computeValidatedIRHash(validatedIR);  // 含 compiledAt
```

**(d) `ValidatedDesignIR.meta.compiledAt` 是 schema required 字段** — `schemas/validated-design-ir.schema.json`（meta.required 含 `"compiledAt"`，format date-time），无法从实体中物理移除。

**(e) 执行路径上的时间调用清点**
- `patch-engine.ts:143` `new Date()` → **进入 validatedIR 实体 → 进入哈希预映像**（问题点）。
- `data-gate.ts:81` `new Date()` → 仅用于 BLOCKED_DATA 终态 evaluation.executedAt，终态不计算下游哈希，**不影响哈希**。
- `pipeline-runner.ts:68-74` `Date.now()` → 仅算 `grammarExecutionMs` / `adapterExecutionMs` 计时，写入 `timing`，**不进入任何哈希实体**（timing 在 FidelityEvaluationResult.provenance 下，不参与 validatedIR/plan 哈希）。✅ 隔离正确。

**(f) intent-normalizer 的反例** — `compiler-intent/intent-normalizer.ts:63-87` `stripTimestamps()` 显式剔除 `compiledAt/executedAt/timestamp` 等时间字段后才算 Cangjie 输入哈希。说明设计团队**已知时间戳破坏哈希恒等**，但该剔除**只作用于 Cangjie inputHash，未上升到 computeValidatedIRHash**。

**(g) 测试缺口**
- `hash-policy.test.ts` 只测 rawIR 自闭环、pixel buffer、注入检测，**无** "同一输入两次 compile → validatedIRHash 相同" 的确定性测试。
- `pipeline-runner.test.ts:58` 与 `aesthetic-integration/pipeline.test.ts:235` 仅断言 `validatedIRHash === HashPolicy.computeValidatedIRHash(validatedIR)`（同一对象重算自洽），**不跨运行**，因此捕获不到 compiledAt 漂移。

### 结论
**FAIL**：`ValidatedDesignIR.meta.compiledAt = new Date().toISOString()`，且 `computeValidatedIRHash` 对全实体（含该字段）做哈希、无排除。**compiledAt 未脱离哈希输入**，导致 `validatedIRHash`（及下游任何引用它的 hashChain）**跨运行不确定**——相同 rawIR + 相同 hostCaps 在不同时刻 compile 会得到不同的 validatedIRHash。`executionPlanHash` 不含时间戳，是确定的；`rawIRHash` 排除自身字段后确定；但 validatedIRHash 这一环破坏了端到端确定性。
修复方向（仅记录，不改码）：要么 `computeValidatedIRHash` 排除 `/meta/compiledAt`（与 rawIR 排除自身 hash 同构），要么把 `compiledAt` 改为调用方注入的确定性时间戳（与 adapter `capturedAt` 同模式），并补一条跨运行确定性测试。

---

## 5. negative-path + CI — BLOCKED_DATA / BLOCKED_ENV 真实失败测试 — PARTIAL

### 验证方法
阅读 `tests/contract/data-gate.test.ts`、`capability-negotiator.test.ts`、`pipeline-runner.test.ts`，逐条核对负向断言；检查 CI 配置。

### 证据

**(a) G1 BLOCKED_DATA — `tests/contract/data-gate.test.ts`**（6 个测试）
- TC-G1-03 REQUIRED_UNKNOWN（`:121-134`）：focalPoint confidence=0.52<0.6 → 断言 `evaluation.status==="BLOCKED_DATA"`、`tierExecuted==="NONE"`、`metrics/gates` undefined、hashChain 仅含 inputHash。**真实失败路径**。
- TC-G1-04 REQUIRED_MISSING（`:136-144`）：空 materials → BLOCKED_DATA，diagnostics 含 `/materials/0/baseType`。
- 另有 TC-G1-02 可选低置信重写不阻塞、TC-G1-05 边界 0.60、TC-G1-06 原对象不可变。
- 覆盖场景：required 参数被重写为 unknown、required 路径缺失（结构不存在）。**2 条 BLOCKED_DATA 负向测试**。

**(b) G3 BLOCKED_ENV — `tests/contract/capability-negotiator.test.ts`**（6 个测试）
- TC-CN-02（`:131-145`）：`webgl2:false` → BLOCKED_ENV，断言 status、tierExecuted=NONE、无 metrics/gates、hashChain={inputHash}、并经 evaluation-result schema 校验。
- TC-CN-06（`:187-198`）：`floatTextures:false` → BLOCKED_ENV，schema 校验通过、无 renderHash 泄漏。
- 另有 TC-CN-03/04 降级到 TIER_B/C、TC-CN-05 plan 无 self-hash。**2 条 BLOCKED_ENV 负向测试**。

**(c) 端到端 TERMINAL_HALT — `tests/contract/pipeline-runner.test.ts`**（4 个测试）
- TC-PR-02（`:69-77`）：低置信 required → `{status:"TERMINAL_HALT", haltStage:"G1_DATA_GATE"}` + BLOCKED_DATA 断言。
- TC-PR-03（`:79-89`）：缺 webgl2 → TERMINAL_HALT / G3 / BLOCKED_ENV。
- TC-PR-01/04 走 SUCCESS 全哈希链 + G2 semantic gate。

**(d) aesthetic 集成层负向测试** — `tests/aesthetic-integration/pipeline.test.ts`
- TC-AES-02（`:119-136`）：confidenceOverrides `/color/dominant=0.4` → TERMINAL_HALT at G1 / BLOCKED_DATA。
- 上述测试均**构造真实输入触发真实门禁**，非 mock 掉门禁逻辑；断言到具体 `evaluation.status` 与 `haltStage`。

**(e) CI 自动化**
- 仓库**无 `.github/` 目录**，全仓无任何 `.yml/.yaml` CI 流水线文件。
- `package.json` scripts 提供 `test` / `test:contract` / `test:all` / `validate:schemas`，但**无任何调度器在 PR/push 时自动执行**。

### 结论
**PARTIAL**：
- ✅ BLOCKED_DATA（G1）与 BLOCKED_ENV（G3）均有**真实失败测试**（非 mock），且断言到具体 `evaluation.status` / `haltStage` / `tierExecuted==="NONE"` / 无 metrics·gates 泄漏，端到端 TERMINAL_HALT 也有覆盖（TC-PR-02/03、TC-AES-02）。
- ⚠️ 缺口：① 无 CI 配置，180/180 的通过状态不会在每次提交自动回归；② 负向测试集中在 G1/G3 两大门禁，**42 条 grammar 规则的"触发→mutation"负向/正向矩阵几乎空白**（见第 3 节，仅 3/42 有测试）。

---

## 汇总：通过 / 有问题 / 需联合复核

**通过（PASS）**
- PatchEngine 对 42 条规则的 target 可解析、mutation op 全部受支持、condition 运算符全部可触发（executable = 42/42）。
- G1/G3 负向终态有真实失败测试并断言 errorCode/evaluation.status。
- `pipeline-runner` 的 `Date.now()` 仅用于计时，不进入哈希实体。
- rawIRHash 自闭环排除自身字段、executionPlanHash 不含时间戳——这两条哈希链是确定的。

**有问题（FAIL / PARTIAL）**
1. **[FAIL] validatedIRHash 不确定性**：`patch-engine.ts:143` `compiledAt=new Date()` 进入 `computeValidatedIRHash` 全量预映像（`hash-policy.ts:64`），跨运行哈希漂移。这是 P1.5 第 4 项的硬伤。
2. **[FAIL] canonical dimension 未冻结**：仓库无 "11D"/"12D" 声明；实际 pointer-map = 24 条（lighting=7 非 6）；缺常量/schema/测试冻结。
3. **[PARTIAL] 42 规则测试覆盖 3/42**：39 条规则零触发用例。
4. **[PARTIAL] 无 CI**：无 `.github` 或任何 yml 流水线，测试靠本地手动跑。
5. **[PARTIAL] AestheticConstraintSheet 无 JSON Schema**：仅 TS interface，且 demo 目录存在第二份 mirror，有漂移风险。

**需 CAS 侧联合复核**
- **Contract A 跨仓一致性**：DC 侧 adapter 声称"独立移植自 CAS contract A"，并注释了两处适配（剥离 `/value` 后缀、补富字段）。DC 内部自洽，但 **CAS 引擎是否真的产出同一 sheet schema、同一派生表（LIGHT_SOURCE_ANGLES/TIME_COLOR_TEMP/MOOD_MATERIAL）、同一 VIOLATION_RULE_PATH，必须在 CAS 独立仓库对照确认**——本审计无法跨仓验证。
- **"11D vs 12D" 口径**：该数字仅出现在 P1.5 任务描述中，DC 代码与文档均无出处，需与 CAS/产品侧确认 canonical dimension 的正式命名与冻结基线。
