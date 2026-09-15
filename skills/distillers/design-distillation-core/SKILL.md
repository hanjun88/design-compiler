---
name: design-distillation-core
description: 设计蒸馏核心 — 将文化文献、经典视听样本、Master 作品集蒸馏为 EstimatedParameter 列表。执行 Cangjie RIA-TV++ 流水线的在线版本，产出 RawDesignIR。
version: 0.1.0
---

# Design Distillation Core

> 在线蒸馏通道 — 将输入素材蒸馏为带置信度与溯源的参数估计。

## 职责

1. 接收输入素材（文献文本、视频转写、图像集、Master 样本）
2. 执行概念提取 → 策略映射 → 参数估计
3. 为每个参数标注来源、置信度、校准状态
4. 输出 RawDesignIR，供 Compiler Core 消费

## 输入

- 素材文本 / 转写稿 / 图像集
- 目标语法版本（如 chinese-aesthetic@1.1.0）
- 蒸馏配置（置信度阈值、来源要求）

## 输出

- RawDesignIR（符合 schemas/raw-design-ir.schema.json）
- 蒸馏报告（候选池、验证结果、淘汰记录）

## 框架占位

本文件为框架占位，具体蒸馏逻辑待实现。
