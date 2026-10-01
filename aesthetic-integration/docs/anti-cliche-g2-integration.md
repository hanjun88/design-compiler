# G2.5 反俗套规则集成设计文档 (Anti-Cliche Gate at Compile Time)

> 目标：让反俗套（anti-cliché）规则在 **编译阶段** 生效，从 G2（PatchEngine）的
> "只能修补"扩展为"可以否决"。
>
> 状态：实现完成（源码 + 测试）。本文档说明问题、方案取舍、架构与 API。

---

## 1. 问题分析：为什么 PatchEngine 无法否决

通读 `compiler-core/patch-engine.ts` 后确认，"不能 veto" 是**架构限制**，不是配置开关：

1. **规则模型只有"修正"语义。** `GrammarRule.mutation` 的 op 仅为
   `replace | add | remove`；`buildPatches()` 对每条被触发的规则**必然产出一条
   纠正性补丁**。规则 schema 里没有 `reject` / `veto` / `block` op。

2. **唯一的"拒绝"原语 `test` 不阻断。** RFC 6902 的 `test` op 在 `applyPatches()`
   里被 `try/catch` 捕获：失败时只把 `testsFailed++` 并在 `auditReport.violations`
   里记一条 `REJECTED_ERROR`，**然后继续编译**。它是审计信号，不是熔断。

3. **PatchEngine 是纯函数幂等变换器。** `compile(rawIR)` 一定返回一个
   `ValidatedDesignIR`；它被设计为"把坏值改成好值"，而不是"拒绝坏设计"。
   即便抛 `CompilerError`，也只用于 `PATH_NOT_FOUND` 这类结构性错误，不承载审美判断。

4. **G2 不碰语义化俗套。** 现有 42 条 grammar 规则全部针对**标量**
   （`negativeSpaceRatio`、`symmetry`、`roughness`、`colorTemp`、`contrastRatio`…）。
   它们从不修改 `/color/*` 的 hex 色值字符串，也从不修改 `/composition/focalPoint`。
   因此"纯红配纯绿""死点居中"这类俗套会**安然穿过 G2**，只有契约 C（评估闭环）
   能在事后检测到——太晚，编译已经放行。

**结论**：要在编译时硬阻断，必须在 PatchEngine 之外新增一个"否决"阶段。

---

## 2. 方案对比

| 维度 | 方案 A：G3 美学降级 | 方案 B：G2.5 AestheticGate | 方案 C：Execution Planner 约束 |
|---|---|---|---|
| 阻断强度 | 弱（降级 TIER，不拒） | **硬阻断（拒编译）** | 中（标记不可执行） |
| 与现有机制耦合 | 复用 G3 | 新增独立阶段 | 复用 Planner 约束图 |
| 对 FROZEN ABI 影响 | 小 | **小（可选依赖，缺省零行为变化）** | 中（需理解 DAG 约束） |
| 错误信息结构化 | 弱（降级原因串） | **强（ruleId/位置/修正建议）** | 中 |
| 职责清晰度 | 差（降级≠否决） | **好（纯否决器）** | 差（规划器不懂美学） |
| 能否决 hex/字体俗套 | 否（G3 只看宿主能力） | **是** | 否 |

### 选定：方案 B（G2.5 AestheticGate），并以"可选依赖"方式非侵入接入

理由：
- 只有 B 能真正**硬阻断**违规设计，满足验收标准 1。
- 通过把 gate 设计成 `PipelineRunnerDependencies` 上的**可选字段**，缺省时
  PipelineRunner 行为与逐字节不变——满足"零破 FROZEN ABI"。
- 依赖倒置：compiler-core 只认识一个极小的 `IAestheticGate` 结构接口，
  实现在 `aesthetic-integration/`，避免循环依赖。
- G2（修正标量）与 G2.5（否决语义俗套）职责正交，可独立演进。

---

## 3. 架构（文字图）

```
RawDesignIR
   │
   ▼
G1  DataGate ──────────────► TERMINAL_HALT (G1_DATA_GATE)   低置信/缺参
   │ PASS
   ▼
G2  PatchEngine.compile()   纠正性语法补丁（标量，replace/add/remove）
   │
   ▼
G2.5 AestheticGate ────────► TERMINAL_HALT (G2_5_AESTHETIC_GATE)  ★新增
   │   check(validatedIR, ctx?)        命中 P0 俗套 → 阻断 + 结构化错误
   │   passed                          (可选 disabled 开关)
   ▼
G3  CapabilityNegotiator ──► TERMINAL_HALT (G3_CAPABILITY_NEGOTIATOR)
   │                                  宿主缺必需能力
   ▼
SUCCESS + hashChain (input/rawIR/validatedIR/executionPlan)
```

**关键设计点**：gate 运行在 **G2 之后**，检查的是 `validatedIR.validated`
（已被 grammar 修补过的场景图）。这意味着：
- grammar 能修的标量俗套（如 `symmetry` 0.95→0.82）由 G2 修复；
- grammar **碰不到**的语义俗套（hex 配色、`focalPoint` 死点居中、字体混用）
  由 G2.5 否决。二者不重叠，G2.5 是 grammar 的**补集**，不是重复。

---

## 4. 文件清单

| 文件 | 作用 |
|---|---|
| `compiler-core/aesthetic-gate-types.ts` | **新增**。`IAestheticGate`/`AestheticGateResult`/`AestheticClicheViolation`/`AestheticGateContext` 结构契约。 |
| `aesthetic-integration/color-utils.ts` | **新增**。hex→rgb→hsl、色相圆距、near-pure 判定。零依赖。 |
| `aesthetic-integration/anti-cliche-rules.ts` | **新增**。7 条纯规则函数 + 聚合器。 |
| `aesthetic-integration/anti-cliche-gate.ts` | **新增**。`AestheticGate implements IAestheticGate`，加载配置。 |
| `config/anti-cliche-rules.json` | **新增**。`enabled` 开关 + 全部阈值 + 修正建议字典。 |
| `tests/aesthetic-integration/anti-cliche-gate.test.ts` | **新增**。每类规则违规/合规用例 + 开关 + 组合边界。 |

### compiler-core 的非侵入扩展（精确改动点）

> 这些是对**已存在文件**的纯增量扩展，缺省无 gate 时行为不变。

1. `compiler-core/error-codes.ts` —— 新增枚举：
   ```ts
   AES_CLICHE_VIOLATION = "AES_CLICHE_VIOLATION",
   AES_GATE_DISABLED = "AES_GATE_DISABLED",
   ```

2. `compiler-core/contracts.ts` —— `FidelityEvaluationResult.status` 联合类型新增
   `"BLOCKED_AESTHETIC"`（生产侧加值，消费侧旧断言不受影响）。

3. `compiler-core/pipeline-runner.ts`：
   - `PipelineRunnerDependencies` 新增可选字段 `aestheticGate?: IAestheticGate`
     与 `aestheticGateContext?: AestheticGateContext`。
   - `haltStage` 联合新增 `"G2_5_AESTHETIC_GATE"`。
   - 在 `patchEngine.compile()` 之后、`capabilityNegotiator.negotiate()` 之前插入：
     ```ts
     if (deps.aestheticGate) {
       const r = deps.aestheticGate.check(validatedIR, deps.aestheticGateContext);
       if (!r.passed) {
         return { status: "TERMINAL_HALT",
                  haltStage: "G2_5_AESTHETIC_GATE",
                  evaluation: buildAestheticHaltEvaluation(validatedIR, testCaseId, inputHash, r.violations) };
       }
     }
     ```

4. `compiler-core/index.ts` 的 `setTerminalContext` —— 新增一个分支，把
   `G2_5_AESTHETIC_GATE` 映射为 `status: BLOCKED_AESTHETIC` +
   `code: AES_CLICHE_VIOLATION`（纯增量分支）。

---

## 5. 规则清单（7 条，3 大类）

| RuleId | 类别 | 触发条件 | 位置（JSON Pointer） | 修正建议 |
|---|---|---|---|---|
| AC-COLOR-001 | 配色俗套 | dominant/secondary/accent 的 hex 命中违禁表（#FF0000/#00FF00/#FFD700/#000000/#FFFFFF…） | `/color/<role>/value` | 纯红→暗朱砂 #8B2500；亮金→哑金 #B8860B 等 |
| AC-COLOR-002 | 配色俗套 | 调色板同时存在近纯红(hue≈0°,S≥0.85) 与近纯绿(hue≈120°,S≥0.85) | `/color` | 双方降饱和至 S≤50%，改邻近色 |
| AC-COLOR-003 | 配色俗套 | dominant 色饱和度 > 0.75 | `/color/dominant/value` | 降饱和至 S≤75%，纸感低饱和 |
| AC-LAYOUT-001 | 布局俗套 | focalPoint 在 [0.5,0.5]±ε 且 symmetry≥0.85（居中堆砌） | `/composition/focalPoint/value` | 焦点偏移黄金点(0.62,0.38)，symmetry 降至 0.7–0.85 |
| AC-LAYOUT-002 | 布局俗套 | negativeSpaceRatio < 0.22（画面塞满） | `/composition/negativeSpaceRatio/value` | 留白扩至 ≥0.45–0.55 |
| AC-TYPE-001 | 字体俗套 | 上下文字体族数 > maxFontFamilies(3) | `/typography/families` | 收敛到 ≤3：标题衬线 + 正文无衬线 |
| AC-TYPE-002 | 字体俗套 | 字体族命中书法/笔刷正则（maobi/calligraphy/brush/毛笔/书法…） | `/typography/families` | 标题改宋体松字距，笔刷仅作 ≤8% 印章 |

> 字体类规则依赖 `AestheticGateContext.typography.families`（场景图本身不携带字体）。
> PipelineRunner 默认传 `undefined`（字体规则自动跳过）；上游编排器可注入字体清单做端到端校验。

---

## 6. API

```ts
// compiler-core/aesthetic-gate-types.ts
interface IAestheticGate {
  readonly enabled: boolean;
  check(validatedIR: ValidatedDesignIR, ctx?: AestheticGateContext): AestheticGateResult;
}

interface AestheticGateResult {
  passed: boolean;
  violations: AestheticClicheViolation[]; // { ruleId, category, message, location, severity, suggestion, evidence }
}
```

```ts
// aesthetic-integration/anti-cliche-gate.ts
new AestheticGate(config?)        // 缺省从 config/anti-cliche-rules.json 加载
gate.check(validatedIR, ctx?)     // 纯函数；enabled=false 时恒 passed
```

配置开关（`config/anti-cliche-rules.json`）：
```jsonc
{
  "enabled": true,                 // ← 总开关：false 时 gate 直通
  "thresholds": { /* 全部阈值可调 */ }
}
```

---

## 7. 使用示例

```ts
import { PipelineRunner } from "./compiler-core/pipeline-runner";
import { AestheticGate } from "./aesthetic-integration/anti-cliche-gate";

const runner = new PipelineRunner({
  g1Policy, grammar, tierConfig,
  aestheticGate: new AestheticGate(),          // 可选；不传则无 G2.5
  aestheticGateContext: { typography: { families: ["Song Serif", "Hei Sans"] } },
});

const out = runner.execute(rawIR, hostCaps, "TC-001");
if (out.status === "TERMINAL_HALT" && out.haltStage === "G2_5_AESTHETIC_GATE") {
  // out.evaluation.diagnostics 内含每条违规的 ruleId / location / suggestion
  console.error("反俗套阻断:", out.evaluation.diagnostics);
}
```

---

## 8. 验收对照

| 验收项 | 落点 |
|---|---|
| 编译阶段阻断违规设计 | G2.5 gate，命中即 `TERMINAL_HALT` |
| ≥3 类反俗套规则，每类有测试 | 配色/布局/字体 3 类，7 条规则，逐条违规+合规用例 |
| 结构化错误含修正建议 | `AestheticClicheViolation.suggestion` + `location` + `evidence` |
| 配置开关 | `config/anti-cliche-rules.json → enabled` |
| 现有测试不受影响 | gate 为可选依赖，缺省零行为变化（见 §9 说明） |
| 设计文档 | 本文件 |

## 9. 交付说明（环境中断）

实现过程中，承载仓库 `/tmp/design-compiler-inspect` 在任务中段被环境重建：
git 历史、`compiler-core/`、`config/`、`node_modules` 与原有 18 个测试套件被清空，
仅剩 `aesthetic-integration/anti-cliche-gate.ts`。因此：

- 本目录已按原仓库布局重建**全部新增源码、配置与测试**；
- `compiler-core/` 的 4 处增量扩展（§4 列表）已在本文档给出**精确改动点**，
  可直接 patch 回真实仓库；
- **未能**在本环境实际执行 `npx jest`（无 node_modules / 原测试套件），
  也**未能**创建 git commit（无 `.git`）。恢复原仓库后应跑 `npx jest`
  确认原 229 测试全绿 + 新增 anti-cliche 测试通过，再提交到 `feat/aesthetic-integration`。
