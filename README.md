# Deterministic Design Compiler

确定性设计编译器 — 把设计意图编译为可溯源、可验证、可复现的 WebGL 执行计划，并在编译的每一步留下可重算的哈希链。

美学判断**不在本仓库**：规则、阈值、时代参数域、反伪国风门禁、算子参数及其出处与置信度，全部由
[`chinese-aesthetic-skill`](https://github.com/hanjun88/chinese-aesthetic-skill) 的规则注册表持有，
经机器契约 `AestheticConstraintSheet` 进入编译器。编译器只做契约、校验、编译、执行与回滚。

## 架构

```
chinese-aesthetic-skill                       design-compiler
─────────────────────────                     ─────────────────────────────────────────────────────────────
rules/ (注册表：唯一美学来源)                     contracts/            契约 schema + 哈希锁（编译器持有）
   │  scripts/emit-sheet.mjs                  skill-bridge/         校验 · DecisionPack · 溯源账本
   ▼                                              │
AestheticConstraintSheet ───────────────────►  validateSheet  (schema · contract_hash · 版本绑定 · 能力 ·
 (rule_id · decision_id · confidence ·            │            置信度熔断 · 出处/哈希完整 · 区间一致性；任何一项失败即拒收)
  provenance · source_ref · contract_hash)        ▼
                                              DecisionPack ──► RawDesignIR（美学参数由 sheet 播种）
                                                                   │
                                                  G1 Data Gate ────┤ BLOCKED_DATA
                                                                   ▼
                                                  RFC 6902 Patch Engine（补丁来自 sheet 的 GRAMMAR_RULE）
                                                                   ▼
                                                  ValidatedDesignIR ─► G3 Capability Negotiator ─► RuntimeExecutionPlan
                                                                   │
                                                  Scene chain：渲染证据 → 关系图 → 反伪国风门禁 → 时代语法 → 美学计划
                                                               → 运行时计划 → SceneCompilationIR → Scene Pack
                                                                   │
                                          governance/GrammarGovernor：版本代际 · 金丝雀编译 · 失败回滚 · 环境重校验
```

两仓的分工：

| | chinese-aesthetic-skill | design-compiler |
|---|---|---|
| 持有 | 规则、阈值、时代/风格语法、反伪国风决策、材质/光照/构图/留白决策、出处、置信度、rule_id / decision_id | 机器契约与 schema、RawDesignIR / ValidatedDesignIR / ExecutionPlan、RFC 6902 映射、能力协商、校验、溯源传递、运行时映射、场景编译、适配器、执行安全、回滚与验证 |
| 不持有 | DOM / React / Three.js / Figma 执行 | 任何美学阈值或美学语义 |

## 契约

| 契约 | 唯一来源 | 派生 / 守护 |
|---|---|---|
| `AestheticConstraintSheet` | `contracts/aesthetic-constraint-sheet/*.schema.json`（JSON Schema 2020-12） | 生成的 `*.types.ts`、`contract.lock.json`（版本 + `contract_hash` = RFC 8785 规范化 schema 的 SHA-256） |
| `SkillBinding` | `contracts/binding/binding.schema.json` | `contracts/binding/binding.json`：本编译器接受的 skill 构建（仓库、commit、版本区间、注册表哈希、账本哈希、契约哈希） |
| `ProvenanceLedger` | `contracts/provenance-ledger/*.schema.json` | 每次编译的 patch → rule_id → decision_id → 出处 → source_ref 哈希链 |

- 契约变更流程见 [`contracts/README.md`](contracts/README.md)；`node scripts/contract/lock-contract.mjs --check --against <base>` 在 CI 中禁止“哈希变了而版本没升”。
- 版本绑定是强制的：任何 sheet 的来源仓库、commit、skill 版本、注册表哈希、账本哈希、契约哈希、schema 版本与能力集合只要有一项与绑定不符，立即拒收（fail closed）；`GrammarGovernor.pinned()` 是生产构造方式。

## 治理与回滚

`governance/GrammarGovernor` 把每个设计语境的 sheet 视为一代（generation）：

- `submit()`：校验 → DecisionPack → 经真实编译链的金丝雀编译 → 激活；任何拒绝都不改变当前生效的一代。
- `compile()`：当前代的补丁应用失败、而上一代能编译同一输入时，当前代被回滚并隔离；上一代同样失败则归因于输入，不回滚。
- `applyEnvironment()`：编译器契约或能力集合变化后重新校验各代，回滚到仍通过校验的最新一代，否则停用（失败即封闭）。
- `rollbackGrammar()`：显式、可审计的回滚；被回滚的一代不可原样重新激活。

## 状态（由证据生成，勿手改）

下面这块由 `node scripts/run-gates.mjs` 产出的 `gate-evidence/summary.json` 经 `scripts/evidence/readme-status.mjs --write` 生成；
文档里任何其它位置都不得手写测试数量（`scripts/lint-docs.mjs` 强制）。

<!-- evidence:begin -->

_尚未生成：运行 `node scripts/run-gates.mjs` 后执行 `node scripts/evidence/readme-status.mjs --write`。_

<!-- evidence:end -->

## 目录

```
design-compiler/
├── contracts/            # 机器契约（schema · 生成类型 · 哈希锁 · binding.json）
├── skill-bridge/         # sheet 校验 · DecisionPack · 需求清单 · 溯源账本 · 编译入口 · 场景链
├── governance/           # GrammarGovernor（代际 · 金丝雀 · 回滚）· 回归执行器
├── compiler-core/        # Pipeline Kernel：哈希流 · G1 · RFC 6902 · G3 · 执行计划
├── compiler-intent/      # Cangjie → Core IR 归一化与指针表
├── chinese-aesthetic/    # 美学执行线：证据抽取 · 关系图 · 算子 · 计划 · 适配器 · 场景契约 · 场景包 · 运行时
├── render-engine/        # 软件参考渲染器（物理证据）
├── evaluation/           # 评测 ABI 与 5 维保真度评测器
├── schemas/              # [System ABI] JSON Schema 2020-12（评测结果 ABI 1.0.0 已冻结）
├── config/               # G1 策略 · 能力分级映射
├── scripts/              # 门禁 · 契约锁 · 绑定 · 证据 · 文档 lint · 黄金重封
├── tests/                # contract · intent · chinese-aesthetic · golden-case-matrix · skill-bridge（跨仓）
└── docs/closure/         # 闭环台账：分支 · 契约 · 规则 · 废弃 · ADR
```

## 开发

```bash
npm ci
SKILL_DIR=../chinese-aesthetic-skill npm run gates   # 全部门禁一次执行，原始输出写入 ./gate-evidence
npm run typecheck && npm run build                   # 零错误类型检查（三个 tsconfig）与构建
npm run test:cross-repo                              # 真实 skill → sheet → 编译链 → 场景链 / 回滚 / 对抗 / 绑定
npm run binding:verify                               # CI 门禁：检出的 skill 即被钉扎的 commit，且每个语境的 sheet 都能被编译器消费
npm run golden:reseal                                # skill 决策变化后重封黄金清单，评审渲染哈希差异
```

测试用的 sheet 一律由 skill 的真实生成器（`SKILL_DIR`，默认 `../chinese-aesthetic-skill`）产出；找不到 skill 检出即失败，没有跳过，也没有伪造数据的回退。

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

## License

MIT
