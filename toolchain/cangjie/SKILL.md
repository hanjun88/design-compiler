---
name: cangjie-meta-compiler
description: Cangjie 离线元编译器 — 将文化文献与经典视听样本蒸馏为五元产物包（ontology / heuristics / assertions / evaluation-matrix / grammar-rules），并通过 Meta Data Gate 准入控制。
version: 0.1.0
---

# Cangjie Meta-Compiler

> 离线元编译器 — 从文化语义到工程参数的形式化蒸馏。

## 五元产物包

| 文件 | 职责 |
|---|---|
| ontology.json | 文化语义 → Design IR 路径投影 |
| heuristics.json | 设计意向 → 工程策略映射 |
| assertions.json | 数值区间与四级约束空间 |
| evaluation-matrix.json | 验收权重与最大允许容差 Δ |
| grammar-rules.json | 四者编译产物，分发资产 |

## 全链路可溯源链

```
《画筌》 → 虚实相生 → NegativeSpace → Warning 0.30 → 阻尼补偿 → 0.38 → WebGL 渲染
```

每个下游生效的 RFC 6902 补丁，必须能够反解为完整的因果溯源向量。

## Meta Data Gate

规则进入 grammar-rules.json 之前必须通过：
1. **Source Grounding** — 明确的文献出处 / 电影镜头语言规范 / Master 样本集聚类方差
2. **Confidence Rating** — 语义解释置信度 ≥ 0.85
3. **Calibration Proof** — expert-calibrated 或 dataset-empirical-priors，未校准标记为 EXPERIMENTAL

## 目录结构

```
cangjie/
├── SKILL.md
├── corpus/          # 古典文献与经典视听样本
├── artifacts/       # 五元输出包
│   ├── ontology.json
│   ├── heuristics.json
│   ├── assertions.json
│   ├── evaluation-matrix.json
│   └── grammar-rules.json
└── meta-gate/       # 规则准入校验器
    └── index.ts
```

## 框架占位

本文件为框架占位，具体蒸馏与编译逻辑待实现。
