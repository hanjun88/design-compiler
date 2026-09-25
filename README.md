# Deterministic Design Compiler

确定性设计编译器 — 将 AIGC 图像输入编译为可溯源、可验证、可复现的 WebGL 渲染执行计划。

## 架构

```
AIGC Image
    │
    ▼
[ G1 Data Gate ] ── BLOCKED_DATA ──► Terminal Evaluation
    │ PASS
    ▼
[ G2 Grammar Engine ] ── RFC 6902 Patches
    │
    ▼
[ G3 Capability Negotiator ] ── BLOCKED_ENV
    │ ACCEPTED / DEGRADED
    ▼
[ Execution Planner ]
    │
    ▼
[ HeartMirror WebGL Runtime ] ── Offscreen Render
    │
    ▼
[ Evaluation ABI ] ── 5-D Fidelity Metrics
```

## 当前状态

| 层 | 状态 | 说明 |
|---|---|---|
| ABI | **FROZEN 1.0.0** | evaluation-result.schema.json，G0/G2 门禁 18/18 |
| Step 0 契约层 | **LOCKED** | TypeScript 类型 + 5 份 Schema + RFC 6901 + 因果哈希流，178 项契约测试全绿 |
| Step 1 G1 Data Gate | **IMPLEMENTED** | 置信度重写、必选路径门禁、输入不变性 |
| Step 2 G2 Patch Engine | **IMPLEMENTED** | RFC 6902 补丁、确定性排序、审计与评分 |
| Step 3 G3 Capability Negotiator | **IMPLEMENTED** | 能力检测、TIER_A/B/C 降级、BLOCKED_ENV |
| Step 4 Pipeline / Planner | **IMPLEMENTED** | PipelineRunner + DesignCompiler + 确定性执行计划与依赖校验 |
| Production closure | **PARTIAL / NOT_CLOSED** | Governance、跨仓集成、Gate4/5 尚未完成 |

## 项目结构

```
design-compiler/
├── schemas/                    # [System ABI] JSON Schema Draft 2020-12
│   ├── estimated-parameter.schema.json
│   ├── raw-design-ir.schema.json
│   ├── validated-design-ir.schema.json
│   ├── execution-plan.schema.json
│   └── evaluation-result.schema.json      # v1.0.0 FROZEN
├── compiler-core/              # [Pipeline Kernel]
│   ├── contracts.ts            # 物理同构类型 + Hash Flow Contract
│   ├── error-codes.ts         # CompilerError + 错误码枚举
│   ├── hash-policy.ts         # RFC8785 + SHA-256 + PixelBuffer 规范化
│   ├── json-pointer.ts        # RFC 6901 寻址 + '-' 终点追加限制
│   ├── scoring.ts             # ScoringEngine + 权重和=1.0 门禁
│   ├── semantic-gate.ts       # G2 语义门禁引擎
│   ├── data-gate.ts           # [Step 1] G1 数据门禁
│   ├── patch-engine.ts        # [Step 2] RFC 6902 补丁引擎
│   ├── capability-negotiator.ts  # [Step 3] 能力协商
│   └── execution-planner.ts   # [Step 4] 确定性执行计划生成与依赖校验
├── toolchain/cangjie/         # [Offline Meta-Compiler] 五元产物包
├── skills/                     # [Online Execution Passes]
├── evaluation/                 # [Evaluation ABI & Feedback]
├── governance/                 # [Rule Versioning & Safety]
├── tests/
│   ├── runner.test.ts          # G0/G2 自动化测试执行器（18/18）
│   ├── contract/
│   │   ├── contracts.test.ts   # P0 物理同构测试（3/3）
│   │   ├── hash-policy.test.ts # 哈希流契约测试（14/14）
│   │   ├── json-pointer.test.ts # RFC 6901 寻址测试（31/31）
│   │   ├── design-compiler.test.ts # 公开编译入口成功/阻断测试
│   │   └── execution-planner.test.ts # 计划确定性/依赖图测试
│   └── golden/
│       └── evaluation-negative-semantic-golden-matrix.json
├── index.ts                    # 统一包入口 + DesignCompiler 公开 API
├── package.json
├── tsconfig.json
├── tsconfig.test.json
└── jest.config.js
```

## 核心契约

### Hash Flow Contract

| Hash | 存储宿主 | 预映像 |
|---|---|---|
| `rawIRHash` | `RawDesignIR.provenance.rawIRHash` | `RFC8785(RawDesignIR \ {provenance.rawIRHash})` |
| `validatedIRHash` | 仅下游 `FidelityEvaluationResult.provenance.hashChain` | `RFC8785(ValidatedDesignIR)` 全量 |
| `executionPlanHash` | 仅下游 `FidelityEvaluationResult.provenance.hashChain` | `RFC8785(RuntimeExecutionPlan)` 全量 |
| `renderHash` | 仅下游 `FidelityEvaluationResult.provenance.hashChain` | `CanonicalPixelBuffer` 规范化字节流 |

**物理约束**：ValidatedDesignIR / RuntimeExecutionPlan 内部严禁存在任何自身 hash 字段。

### PATCH DETERMINISM CONTRACT

补丁必须按 `audit.ruleId` 字典序（ASCII 升序）排列。HashPolicy 不得执行隐式重排，保持输入即哈希。

### JSON Pointer '-' 约束

`'-'` 仅允许在 Patch Engine `add` 操作中作为数组追加标识。读取寻址时恒返回 `found=false, isEndOfArray=true`。

## 开发

```bash
# 安装依赖
npm install

# 运行全部测试
npm run test:all

# 仅运行 ABI 门禁测试（G0/G2）
npm test

# 仅运行契约层测试（jest）
npm run test:contract
```

## 测试覆盖

| 套件 | 测试数 | 状态 |
|---|---:|---|
| G0 Schema Structural Gate | 12 | PASS |
| G2 Semantic Integrity Gate | 6 | PASS |
| Contract tests（全部 Jest suites） | 178 | PASS |
| **本阶段新增 API / Planner / Governance 测试** | **15** | **PASS** |

## License

MIT
