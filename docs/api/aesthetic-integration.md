# aesthetic-integration API 参考

> 模块入口：`aesthetic-integration/index.ts`
>
> DC 侧把 CAS 美学约束单接入真实 G1→G2→G3 流水线的模块。本模块**不 import CAS 代码**，类型与转换逻辑独立移植。

---

## 目录

- [AestheticPipelineRunner](#aestheticpipelinerunner)
- [AestheticSheetAdapter（sheetToCangjieIR）](#aestheticsheetadapter-sheettocangjieir)
- [反俗套规则配置](#反俗套规则配置)

---

## AestheticPipelineRunner

文件：`aesthetic-integration/aesthetic-pipeline-runner.ts`

端到端编排：约束单 → adapter → `normalizeIntent` → 真实 `PipelineRunner`。

### `new AestheticPipelineRunner()`

构造时加载三份生产配置：
- `config/g1-policy.json`
- `config/grammar-rules.json`
- `config/tier-mapping.json`

配置缺失或损坏时构造函数抛错。

### `execute(sheet, hostCaps, opts): AestheticPipelineResult`

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `sheet` | `AestheticConstraintSheet` | CAS 美学约束单（JSON） |
| `hostCaps` | `HostCapabilities` | 宿主能力，如 `{ webgl2: true, floatTextures: true }` |
| `opts` | `AestheticPipelineOptions` | 必含 `capturedAt` |

**AestheticPipelineOptions**：
```ts
{
  capturedAt: string;            // 必传，ISO8601，确定性时间戳（禁 new Date()）
  testCaseId?: string;          // 默认 `AES-${sheet.sheetId}`
  distillerVersion?: string;
  confidenceFloor?: number;     // 默认读 config
  confidenceOverrides?: Record<string, number>;       // 按 DC path（无 /value 后缀）
  calibrationOverrides?: Record<string, "PRODUCTION"|"EXPERIMENTAL"|"DEPRECATED">;
  inferenceExecutionMs?: number; // 默认 0
}
```

**AestheticPipelineResult**：
```ts
{
  pipeline: PipelineOutput;       // SUCCESS 或 TERMINAL_HALT
  cangjieIR: CangjieRawDesignIR;  // adapter 产物（normalize 前）
  normalization: NormalizationResult;
  coreIR: RawDesignIR;            // normalize 后，G1 实际看到的 IR
  aestheticScore: number;         // 来自 sheet，仅 metadata
}
```

**PipelineOutput（判别联合）**：
```ts
// 成功
{ status: "SUCCESS"; rawIR; validatedIR; executionPlan;
  hashChain: { inputHash; rawIRHash; validatedIRHash; executionPlanHash };
  timing: { distillationExecutionMs; grammarExecutionMs; adapterExecutionMs }; }

// 终止
{ status: "TERMINAL_HALT";
  haltStage: "G1_DATA_GATE" | "G3_CAPABILITY_NEGOTIATOR";
  evaluation: FidelityEvaluationResult; }
```

### 用法

```ts
import { AestheticPipelineRunner, type AestheticConstraintSheet } from "./aesthetic-integration";

const runner = new AestheticPipelineRunner();
const result = runner.execute(sheet, { webgl2: true, floatTextures: true }, {
  capturedAt: "2026-09-27T00:00:00Z",
  testCaseId: "AES-shuyuan",
});

if (result.pipeline.status === "SUCCESS") {
  console.log(result.pipeline.executionPlan);
  console.log(result.pipeline.hashChain.validatedIRHash);
} else {
  console.log("halted at", result.pipeline.haltStage);
  console.log(result.pipeline.evaluation.diagnostics);
}
```

### 只读 getter

- `getG1Policy(): G1Policy` — 返回 G1 策略副本
- `getGrammar(): GrammarRulePack` — 返回加载的规则包

---

## AestheticSheetAdapter（sheetToCangjieIR）

文件：`aesthetic-integration/aesthetic-sheet-adapter.ts`

DC 侧独立实现的契约 A：`AestheticConstraintSheet` → `CangjieRawDesignIR`。

### `sheetToCangjieIR(sheet, opts): AestheticSheetAdapterResult`

纯确定性函数：同 sheet + 同 opts → 同 IR。

**参数**：
- `sheet: AestheticConstraintSheet`
- `opts: AestheticSheetAdapterOptions`
  - `capturedAt: string`（必传）
  - `irId?: string`（默认 `ir-<sheetId>`）
  - `distillerVersion?: string`（默认 `"1.0.0"`）
  - `confidenceOverrides?: Record<string, number>` — key 为 DC path（**不带** `/value` 后缀，如 `/color/dominant`）
  - `calibrationOverrides?: Record<string, CangjieCalibrationStatus>`

**返回**：
```ts
{ cangjieIR: CangjieRawDesignIR; aestheticScore: number }
```

**异常**：palette 缺角色（dominant/secondary/accent）或比例字符串（如 `"7:5"`）格式错误时抛错。

### 与 CAS 侧契约 A 的差异

| 项 | CAS 侧 | DC 侧 adapter |
|----|--------|---------------|
| 参数 path | 带 `/value` 后缀（`/color/dominant/value`） | 不带后缀（`/color/dominant`） |
| paramId | 无 | 自动生成 `aes-001` 递增 |
| source/calibration | 简化 | 补全为 `{ type:"expert-judgment", ref }` / `{ method:"expert-calibrated", status }` |
| 颜色对比 | 无 | 额外补 `/color/contrastRatio`=4.5（pointer-map 必选路径） |
| 光强 | 无 | 额外补 `/lighting/keyLight/intensity`=1.0 |

### DC 侧类型镜像

adapter 内部定义了独立的 `AestheticConstraintSheet` / `SheetColorEntry` / `SheetViolation` / `SheetStructuralDimension` 结构（与 CAS JSON 对齐），从 index.ts 一并导出。

---

## 反俗套规则配置

反俗套不是本模块单独开关，而是通过两条链路生效：

### 1. sheet.violations → Cangjie constraints（adapter 自动翻译）

| sheet violation severity | DC 产物 | 含义 |
|--------------------------|---------|------|
| P0 | `range.fatalBelow = 0.0` + `CangjieConstraint{ type:"threshold", condition:{operator:"not-in", value: hardFailHex} }` | 违禁 hex 出现即 BLOCK |
| P1 | `range.hard = [0.3, 0.7]` | 参数区间收紧（REPAIR） |

`VIOLATION_RULE_PATH` 表把 ruleId 映射到目标 path（无 `/value` 后缀）：

| ruleId | targetPath |
|--------|-----------|
| saturation / pure-red / main-area | `/color/dominant` |
| bright-gold / accent-area | `/color/accent` |
| pure-black | `/color/secondary` |
| void-solid | `/composition/negativeSpaceRatio` |
| symmetry | `/composition/symmetry` |
| light-ratio | `/lighting/ambientRatio` |
| （未登记兜底） | `/composition/negativeSpaceRatio` |

### 2. grammar-rules.json（G2 PatchEngine 强制）

`config/grammar-rules.json` 的 42 条规则在 G2 阶段对参数做 `replace/add/remove` 补丁。要自定义反俗套规则，**编辑该 JSON**（SSOT），而非改代码：

```jsonc
{
  "ruleId": "CA-RULE-36-QUSULIAO",
  "principle": "去塑料感",
  "category": "materials",
  "targetPath": "/materials/0/roughness",
  "condition": { "operator": "<", "value": 0.2 },
  "mutation": { "op": "replace", "value": 0.35 },
  "severity": "P1_WARNING",
  "reason": "镜面低糙是 AI 塑料感通病"
}
```

severity 三档：`P0_CRITICAL`（阻断）/ `P1_WARNING`（修补）/ `P2_INFO`（信息）。

> 注意：CAS 侧 `modules/frontend/runtime/grammar-rules/` 是该 JSON 的 TS 镜像；改 DC JSON 后应同步 CAS 镜像以保持一致。
