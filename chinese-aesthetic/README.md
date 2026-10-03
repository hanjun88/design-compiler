# Chinese Aesthetic Evaluation Matrix

中式美学评估矩阵 — 外围正交评估层，与 ABI 1.0.0 完全解耦。

## 架构原则

```
Chinese Cultural Principle
        ↓
Aesthetic Relationship
        ↓
Visual Structure
        ↓
Machine Assertions (第一层，可计算)
        ↓
Semantic Evaluation (第二层，文化解读)
```

**严禁**：将中式美学反向硬编码进 ABI 1.0.0 物理模式。
**严禁**：`negativeSpaceRatio >= X → 宾主揖让 PASS` 这种还原论。
**严禁**：把文化判断伪装成机器精确事实。

## 双层架构

### 第一层：Machine Assertions（机器可计算断言）

六项可计算指标，所有数值来自物理证据或 Core IR：

| 断言 ID | 文化维度 | 计算方法 |
|---|---|---|
| `focal-hierarchy` | 宾主揖让 | 焦点中心偏移 + 主辅面积分离 |
| `void-solid-ratio` | 计白当黑 | 高亮度低纹理像素比例 + 空域连续性 |
| `qiyun-continuity` | 气韵连贯 | Farneback光流相干性 + 相机运动平滑度 + 亮度连续性 |
| `spatial-depth-layers` | 层次与远近 | 亮度直方图峰数 + 层间分离度 |
| `color-relationship` | 色彩关系 | k-means调色板 + WCAG对比度 + 色温偏移 |
| `material-relationship` | 材质关系 | Laplacian方差(粗糙度) + 高光比(金属度) |

每项输出：`status: PASS/FAIL/INCONCLUSIVE` + `metrics` + `evidenceRefs` + `method`。

### 第二层：Semantic Judgment（审美语义裁决）

八大文化维度，接收机器断言作为证据，输出独立语义判断：

| 维度 | 文化内涵 |
|---|---|
| 宾主揖让 | 主体突出而不孤立，辅从承托而不僭越 |
| 计白当黑 | 留白非空，乃气之所在；黑处是画，白处亦是画 |
| 虚实相生 | 虚中有实，实中有虚，似与不似之间 |
| 气韵连贯 | 气者心之运，韵者气之节；运动有连贯，光流有相干 |
| 含蓄与留白 | 意不尽言，境不画满；点缀含蓄而不张扬 |
| 层次与远近 | 远者淡近者浓，高者虚低者实；咫尺千里 |
| 形神关系 | 形者物之态，神者物之魂；以形写神 |
| 时间感/动势 | 动势者气之行，时间者动之积；静中寓动 |

每项输出：`judgment: PASS/FAIL/INCONCLUSIVE` + `evidenceRefs` + `rationale` + `machineMetrics`。

**关键规则**：Semantic Judgment ≠ Machine Metric。机器指标只能提供证据，最终语义判断必须保留文化解读，不能由阈值直接决定。

## 正交性保证

- 不修改 `compiler-core/`
- 不修改 `schemas/`
- 不修改 `contracts/`
- 不修改 `compiler-intent/`
- 机器断言仅作证据，语义判断独立于 ABI 物理模式

## 阈值来源

评估器**不声明任何审美阈值**。每一条判定阈值（焦点偏移、主辅分离、对比度、层次数、各语义维度的证据阈值……）
都是 chinese-aesthetic-skill 的决策（规则族 `CAS-EV`），随 AestheticConstraintSheet 交付，经 `DecisionPack`
读取（`evaluator/decisions.ts`）；留白（负空间）比例的合理区间取当前上下文的有效区间（时代区间 ∩ 物理区间 ∩
硬下限，ADR-0001）。缺少决策即报错，不存在默认值。仅物理有效性（如粗糙度/金属度的物理定义域）与测量机制的数值保护
留在代码中，并以 `ssot-ok(<CLASS>)` 内联标注。原 `profiles/default.json` 已迁入技能规则库并删除。

## 使用

评估器须在一个 DecisionPack 作用域内运行（没有 DecisionPack 时报错，不会回退到内置数值）：

```typescript
import { evaluateMachineAssertions, evaluateSemanticDimensions } from "./chinese-aesthetic";
import { withDecisionPack } from "./skill-bridge/active-pack";

withDecisionPack(pack, () => {
  // 第一层：机器断言
  const machineReport = evaluateMachineAssertions({
    evaluatedAt: "2026-09-15T00:00:00Z",
  });

  // 第二层：语义判断
  const semanticReport = evaluateSemanticDimensions({
    machineReport,
    evaluatedAt: "2026-09-15T00:00:00Z",
  });
});
```

## 文件结构

```
chinese-aesthetic/
├── index.ts                          # 入口
├── matrix/
│   ├── machine-assertions.ts         # 机器断言类型定义
│   └── semantic-dimensions.ts        # 语义维度类型定义
├── evaluator/
│   ├── decisions.ts                  # 评估器读取技能决策的唯一入口（DecisionPack）
│   ├── machine-evaluator.ts          # 机器断言评估器
│   └── semantic-evaluator.ts         # 语义判断评估器
└── README.md
```
