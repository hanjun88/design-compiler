# compiler-core API 参考

> 模块入口：`compiler-core/index.ts`（包入口 `index.ts` 一并 re-export）
>
> 确定性编译内核：G1 数据门禁 → G2 语法补丁 → G3 能力协商 → 执行计划。

---

## PipelineRunner

文件：`compiler-core/pipeline-runner.ts`

确定性编排边界。**G1 阻断在语法之前；G3 阻断在执行计划哈希之前。**

### `new PipelineRunner(deps: PipelineRunnerDependencies)`

```ts
interface PipelineRunnerDependencies {
  g1Policy: G1Policy;
  grammar: GrammarRulePack;
  tierConfig: TierMappingConfig;
}
```

### `execute(rawIR, hostCaps, testCaseId): PipelineOutput`

**参数**：
- `rawIR: RawDesignIR` — 经 `normalizeIntent` 后的 Core IR
- `hostCaps: HostCapabilities` — `{ webgl2: boolean; floatTextures: boolean; [k]: boolean|number|undefined }`
- `testCaseId: string`

**返回** `PipelineOutput`（判别联合）：

```ts
// 成功
{
  status: "SUCCESS";
  rawIR: RawDesignIR;
  validatedIR: ValidatedDesignIR;
  executionPlan: RuntimeExecutionPlan;
  hashChain: {
    inputHash: string;
    rawIRHash: string;
    validatedIRHash: string;
    executionPlanHash: string;
  };
  timing: { distillationExecutionMs; grammarExecutionMs; adapterExecutionMs };
}

// 终止
{
  status: "TERMINAL_HALT";
  haltStage: "G1_DATA_GATE" | "G3_CAPABILITY_NEGOTIATOR";
  evaluation: FidelityEvaluationResult;   // FROZEN 1.0.0
}
```

**编排逻辑**：
1. `DataGate.execute(rawIR)` → `BLOCKED_DATA` 即终止在 G1；
2. `PatchEngine.compile(sanitizedRawIR)` → ValidatedDesignIR（G2）；
3. `CapabilityNegotiator.negotiate(...)` → `BLOCKED_ENV` 即终止在 G3；
4. 装配 `validatedIRHash` / `executionPlanHash`（下游哈希，不写进实体自身）。

---

## 各阶段说明

### G1 — DataGate（`data-gate.ts`）

**G1Policy**：
```ts
interface G1Policy {
  version: string;
  confidenceFloor: number;       // 默认 0.6
  lowConfidenceAction: "UNKNOWN";
  requiredPaths: string[];       // RFC 6901 JSON Pointer
  policyDescription?: string;
}
```

行为：
- `confidence < confidenceFloor` → 该参数 `status="unknown"`、`value=null`；
- required path 缺失/结构非法/未知 → `BLOCKED_DATA` 终止；
- 可选未知参数不阻断；
- **输入 RawDesignIR 不被就地突变**（sanitize 在 PASS 副本上做）；
- 业务失败以 `DataGateResult` 返回，不抛异常。

当前 `config/g1-policy.json` 的 7 条 requiredPaths：
`/composition/focalPoint`、`/composition/negativeSpaceRatio`、`/camera/fov`、`/lighting/keyLight/azimuth`、`/lighting/keyLight/elevation`、`/color/dominant`、`/materials/0/baseType`。

### G2 — PatchEngine（`patch-engine.ts`）

RFC 6902 AST→AST 语义转译。流水线：Rule Evaluator → Mutation Planner → Deterministic Sorter → RFC 6902 Applier → Audit & Scoring。

**GrammarRule**：
```ts
interface GrammarRule {
  ruleId: string;
  principle: string;
  category: "composition" | "lighting" | "color" | "materials";
  targetPath: string;
  condition: { operator: "<"|">"|"<="|">="|"=="|"!="|"between"|"not_between"; value: number|string|boolean|[number,number] };
  mutation: { op: "replace"|"add"|"remove"; value? };
  patches?: GrammarRulePatch[];   // 多补丁模式
  severity: "P0_CRITICAL" | "P1_WARNING" | "P2_INFO";
  reason: string;
}
```

**GrammarRulePack**：`{ packName; version; description; rules: GrammarRule[] }`。

铁律：100% 纯函数幂等；补丁按 `audit.ruleId` ASCII 升序（PATCH DETERMINISM）；被改参数标记 `grammar-derived`；ValidatedDesignIR 不注入自身 hash。

### G3 — CapabilityNegotiator（`capability-negotiator.ts`）

**HostCapabilities**：`{ webgl2: boolean; floatTextures: boolean; highPrecisionFragment?; anisotropyExtension?; maxFragmentUniformVectors?; [k] }`。

按 `config/tier-mapping.json` 在 TIER_A(WebGL2+AgX+后期) / TIER_B(WebGL1+ACES) / TIER_C(CSS3D) 间协商。不满足 requiredCapabilities → `BLOCKED_ENV`；部分满足 → `DEGRADED` 并记录 `downgrades: [{ feature, reason, fallbackStrategy }]`。

### G4 — ExecutionPlanner（`execution-planner.ts`）

把 ValidatedIR 装配为 `RuntimeExecutionPlan`（sceneBindings / cameraRig / materials[].uniforms），做确定性依赖图校验。

---

## DesignCompiler（稳定包装层）

文件：`compiler-core/index.ts`

`DesignCompiler` 是 `PipelineRunner` 的异步包装：输入校验 → 编译上下文 → 终止态 → 哈希链装配。

```ts
const compiler = new DesignCompiler(versionFingerprint, {
  pipeline: { g1Policy, grammar, tierConfig },
  hostCapabilities: { webgl2: true, floatTextures: true },
  testCaseId: "DESIGN_COMPILER",
});

const result = await compiler.compile(rawIR);
if (result.success) {
  console.log(result.executionPlan);
} else {
  console.log(result.context.status);   // BLOCKED_DATA | BLOCKED_ENV | FAILED
}
```

- `compile(rawIR)`：非 RawDesignIR（缺 `provenance.inputHash` 等）→ `SCHEMA_INVALID`。
- `getContext()` / `getStatus()`：读编译上下文。

---

## 支撑模块

| 模块 | 导出 | 说明 |
|------|------|------|
| `contracts.ts` | `RawDesignIR` / `ValidatedDesignIR` / `RuntimeExecutionPlan` / `FidelityEvaluationResult` 等 | 物理同构类型 + Hash Flow Contract |
| `hash-policy.ts` | `HashPolicy.computeValidatedIRHash` / `computeExecutionPlanHash` | RFC8785 + SHA-256 |
| `json-pointer.ts` | `JsonPointerResolver` | RFC 6901 寻址；`'-'` 仅 G2 add 允许 |
| `scoring.ts` | `ScoringEngine` | 权重和=1.0 门禁 |
| `semantic-gate.ts` | G2 语义门禁 | metricRef 正则锁死 |
| `error-codes.ts` | `CompilerError` / `CompilerErrorCode` | 错误码枚举 |
| `deep-equal.ts` | `deepEqual` | 结构深比较 |

---

## 常见用法（裸 PipelineRunner）

```ts
import { PipelineRunner } from "./compiler-core/pipeline-runner";
import * as fs from "fs";

const g1Policy = JSON.parse(fs.readFileSync("config/g1-policy.json", "utf8"));
const grammar  = JSON.parse(fs.readFileSync("config/grammar-rules.json", "utf8"));
const tierCfg  = JSON.parse(fs.readFileSync("config/tier-mapping.json", "utf8"));

const runner = new PipelineRunner({ g1Policy, grammar, tierConfig });
const out = runner.execute(coreIR, { webgl2: true, floatTextures: true }, "case-01");

if (out.status === "SUCCESS") {
  console.log(out.executionPlan, out.hashChain);
} else {
  console.log(out.haltStage, out.evaluation.diagnostics);
}
```

> 美学约束单场景请优先用 `aesthetic-integration` 的 `AestheticPipelineRunner`（见 [aesthetic-integration.md](../api/aesthetic-integration.md)），它已封装 adapter + normalizeIntent。
