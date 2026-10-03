---
name: chinese-aesthetic-grammar
description: 中式美学语法 — 在线语法执行通道。消费由 chinese-aesthetic-skill 的 AestheticConstraintSheet 派生的 GrammarRulePack（skill-bridge），对设计输入执行规则匹配与约束判定；本仓库不再持有任何审美规则或阈值。
version: 0.1.0
---

# Chinese Aesthetic Grammar

> 在线语法通道 — 执行中式美学规则的匹配、约束判定与补丁生成。

## 职责

1. 取得经校验的 AestheticConstraintSheet（skill 产出，`skill-bridge/sheet-validator.ts`），由 DecisionPack 派生 GrammarRulePack
2. 对设计输入执行规则匹配
3. 判定参数所处四级约束区间
4. 生成 RFC 6902 补丁建议
5. 输出规则匹配报告

## 规则维度

- 空间秩序（中轴 / 开间 / 层级 / 尺度 / 进深）
- 虚实关系（空 / 界 / 藏 / 露 / 透 / 借）
- 比例与克制
- 材料逻辑（木 / 石 / 土 / 金 / 纸 / 雾 / 光）
- 光影哲学（天光 / 漏光 / 侧光 / 漫反射）
- 建筑精神（界 / 庇护 / 进入 / 递进 / 朝向）
- 时间感（风化 / 包浆 / 痕迹）
- 动势（云 / 水 / 烟 / 风 / 光）
- 色彩体系（青 / 黛 / 月白 / 烟紫 / 古金 / 朱砂）
- 禁忌（国潮贴图感 / 古装影视感 / 仿古景区感 / AI 国风感）
- 交互语义

## 核心判定

> 回答"这个设计为什么是中国的？"，而不是"这里有没有中国元素？"

## 边界

规则、阈值、修复目标全部来自 skill 的规则注册表（`rules/`），经 sheet 的 provenance（rule_id → decision_id → source_ref）可追溯；
执行由 `compiler-core/patch-engine.ts` 完成。此处不得新增审美数值（`npm run lint:ssot` 强制）。
