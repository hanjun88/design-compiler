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
**严禁**：`negativeSpaceRatio >= 0.48 → 宾主揖让 PASS` 这种还原论。
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

## 使用

```typescript
import { evaluateMachineAssertions, evaluateSemanticDimensions } from "./chinese-aesthetic";

// 第一层：机器断言
const machineReport = evaluateMachineAssertions({
  evaluatedAt: "2026-09-15T00:00:00Z",
});

// 第二层：语义判断
const semanticReport = evaluateSemanticDimensions({
  machineReport,
  evaluatedAt: "2026-09-15T00:00:00Z",
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
│   ├── machine-evaluator.ts          # 机器断言评估器
│   └── semantic-evaluator.ts         # 语义判断评估器
├── profiles/
│   └── default.json                  # 默认评估配置
└── README.md
```
