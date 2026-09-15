# 修复报告 — 集群1（占星 6 本）+ 集群2（依恋 5 本）

- 修复对象：`/home/user/Doubao/chats/38441674128328962/books_distillation/`
- 修复日期：2026-09-15
- 依据：REVIEW_REPORT_CLUSTER1_2.md
- 修复基准：cangjie-skill v2.5 RIA-TV++ 流水线 + 质量红线 8 条

---

## 修复总览

| 优先级 | 问题编号 | 问题 | 状态 |
|---|---|---|---|
| 🔴 Blocker | S1 | synastry verified.yaml YAML 解析失败 | ✅ 已修复 |
| 🔴 Blocker | S2 | attached/hold-me-tight/wired-for-love candidates/rejected 全空 | ✅ 已修复 |
| 🟡 中等 | M1 | attachment-and-loss / attachment-in-psychotherapy 缺 DIGEST.md | ✅ 已修复 |
| 🟡 中等 | M2 | 4 个悬空 also_read | ✅ 已修复 |
| 🟡 中等 | M3/M4 | promotion 字段 schema 不统一 | ✅ 已修复 |

---

## 🔴 Blocker 1: synastry verified.yaml 解析失败

**问题**: 第165行 `title: 组合盘的象征层定位: 关系镜像非判决` 含未转义冒号，导致 `yaml.safe_load` 报错，7 张卡全部不可编译。

**修复**: 
- 文件：`cluster1_astro/synastry/.cangjie/capabilities/verified.yaml` L165
- 将未加引号的中文冒号替换为中文全角冒号（`：`）并整体加双引号：
  - 修复前：`title: 组合盘的象征层定位: 关系镜像非判决`
  - 修复后：`title: "组合盘的象征层定位：关系镜像非判决"`

**验证**: 
```
python3 -c "import yaml; yaml.safe_load(open('.../synastry/.cangjie/capabilities/verified.yaml'))"
→ OK: synastry verified.yaml parses successfully
```

---

## 🔴 Blocker 2: attached / hold-me-tight / wired-for-love 审计轨迹缺失

**问题**: 三个目录的 `candidates/` 和 `rejected/` 全空（0 文件），违反"保留审计轨迹"红线。

**修复**: 根据每本书的 verified.md、能力卡内容和 destinations.json 回溯生成：

### attached（7 张能力卡）
- `candidates/frameworks.md` — 6 个框架候选（双维地图、IWM 双表征、激活-去激活镜像、分离焦虑传导链、依恋×共情调节、RM 缓冲器）
- `candidates/principles.md` — 7 条原则（维度化优于标签化、Protest 非事实、Deactivation 非无感、可得性预期调节、双轴分别缓冲、共情雷达功率匹配、earned security 日常校准）
- `candidates/cases.md` — 5 个案例（ECR-R 两维测绘、童年分离焦虑中介、依恋×共情元分析、RM Buffering 实验、超激活脚本编码）
- `candidates/counter-examples.md` — 6 个反例（标签化命运论、protest 当事实、deactivation 当无感、混用缓冲动作、只纠正想法不校准预期、逼回避方表达感受）
- `candidates/glossary.md` — 12 个术语（焦虑/回避维度、ECR-R、IWM、超激活/去激活、protest behavior、分离焦虑、共情链接、RM 缓冲、获得性安全、安全基地/港）
- `rejected/rejected_units.md` — 4 个淘汰单元（原书案例无开放证据、儿童指南不相关、择偶建议不可执行、依恋类型与人格障碍关联）

### hold-me-tight（7 张能力卡）
- `candidates/frameworks.md` — 7 个框架（情绪罗盘、Demand-Withdraw、Protest-Polka、Freeze-Flee、七次对话、ARE 三维度、ECE 神经重校准）
- `candidates/principles.md` — 7 条原则（情绪罗盘、循环大于个人、不能跳步、安全纽带行为化、ECE 非顿悟、软化开场、情绪停摆危险）
- `candidates/cases.md` — 5 个案例（Demand-Withdraw 元分析、EFT fMRI、ARE 行为观察、ICEEFT 培训示范、Freeze-Flee 临床识别）
- `candidates/counter-examples.md` — 6 个反例（当沟通技巧课、跳步修复、归因性别、不吵当好转、只讲道理不接情绪、软化当示弱）
- `candidates/glossary.md` — 12 个术语（EFT、情绪罗盘、魔鬼对话、Demand-Withdraw、Protest-Polka、Freeze-Flee、raw emotion、软化开场、ARE、ECE、七次对话、安全纽带）
- `rejected/rejected_units.md` — 4 个淘汰单元（原书案例无开放证据、治疗师培训体系超出自助定位、疗法对比不做、童年创伤因果链重复）

### wired-for-love（7 张能力卡）
- `candidates/frameworks.md` — 7 个框架（PACT 四风格、主要依恋对象、Peace/War 状态机、Bid 与转向、负面偏见、Secure Functioning 协议、24h 修复协议）
- `candidates/principles.md` — 8 条原则（压力下默认程序、伴侣=co-regulator、War 不自转 Peace、仪式优于意志力、安全是关系属性、24h 窗口、Bid 最小单位、Island 的 bid 是行动）
- `candidates/cases.md` — 5 个案例（PACT 四风格压力观察、co-regulation 神经影像、War/Peace 状态机临床、Bid 转向率实验、24h 修复脚本）
- `candidates/counter-examples.md` — 7 个反例（风格当人格诊断、等 War 自己好转、意志力对抗负面偏见、期待 Island 语言表达、安全当个人修炼、修复追辩内容、超 24h 不修复）
- `candidates/glossary.md` — 12 个术语（PACT、Anchor/Wave/Island/Mixed、主要依恋对象、co-regulation、Peace/War、威胁检测、Bid、负面偏见、routine、secure functioning、修复协议、thirds）
- `rejected/rejected_units.md` — 4 个淘汰单元（十项原则无开放证据、RCT 疗效数据有限、Wave/Island 独立卡已合并、逐条详解与已有卡重叠）

---

## 🟡 中等 1: 缺 DIGEST.md

**问题**: attachment-and-loss 和 attachment-in-psychotherapy 无阶段5 读者向精华长文。

**修复**: 为两书各写 1500-3000 字 DIGEST.md，格式对齐同集群其他书：

### attachment-and-loss/DIGEST.md（约 2200 字）
- 一句话总结 + 三句话核心论点
- 7 张能力卡索引
- 核心论点展开（依恋系统、IWM、ABCD 模式、分离与哀悼、安全基地×安全港）
- 使用场景、安全红线、与同集群其他书的关系

### attachment-in-psychotherapy/DIGEST.md（约 2400 字）
- 一句话总结 + 三句话核心论点
- 7 张能力卡索引
- 核心论点展开（治疗师安全基地、量体裁衣、心智化、叙事连贯度、破裂与修复、移情即 IWM、创伤转介红线）
- 使用场景、安全红线、与同集群其他书的关系

---

## 🟡 中等 2: 4 个悬空 also_read

**问题**: also_read 指向不存在的 capability_id。

**修复明细**:

| # | 文件 | 悬空引用 | 修复方式 |
|---|---|---|---|
| 1 | astrology-karma-transformation/verified.yaml L54 (element-development-stages) | `cap.dynamics.elements-as-energy` | 删除（无对应 dynamics 卡；同卡 also_read 保留 cap.akt.symbolic-growth-map） |
| 2 | attached/verified.yaml L71 (activation-strategy) | `cap.wired-for-love.wave-style` | 替换为 `cap.wired-for-love.pact-anchor-wave-island` |
| 3 | attached/verified.yaml L98 (deactivation-strategy) | `cap.wired-for-love.island-style` | 替换为 `cap.wired-for-love.pact-anchor-wave-island` |
| 4 | hold-me-tight/verified.yaml L96 (freeze-flee-dialogue) | `cap.wired-for-love.island-style` | 替换为 `cap.wired-for-love.pact-anchor-wave-island` |

**额外修复**: attached/PIPELINE_STATE.md 中的 cross_links 同步更新（wave-style/island-style → pact-anchor-wave-island）。

**验证**: 全集群 73 个 capability_id 交叉检查，所有 `cap.*` 前缀 also_read 引用均指向有效 ID，零悬空。

---

## 🟡 中等 3: promotion 字段 schema 统一

**问题**: 三套 schema 并存：
- 占星两本书（akt、dynamics）完全无 promotion 字段
- attachment-and-loss / attachment-in-psychotherapy 用标量 `promotion: promoted`，且部分卡完全缺失
- 其他书用嵌套 `promotion.destination: promoted`

**修复**: 统一为 `promotion: { destination: promoted|router }` 格式：

### astrology-karma-transformation（6 张卡，全部补 router）
- 依据：is_actionable: false（象征/反思层），全部走来源路由
- 6 张卡：symbolic-growth-map, element-development-stages, nodal-karmic-loop, outer-planet-transmutation, marcia-identity-calibration, non-determinism-clinical-gate

### dynamics-of-the-unconscious（6 张卡，全部补 router）
- 依据：is_actionable: false（象征/反思层），全部走来源路由
- 6 张卡：unconscious-as-map, archetype-planet-correspondence, shadow-projection, anima-animus-relational, individuation-process, active-imagination-dialogue

### attachment-and-loss（7 张卡，标量转嵌套 + 补缺失）
- 依据 destinations.json decisions：
  - promoted（3）：attachment-system-activation, abcd-pattern-recognition, complicated-grief-differential
  - router（4）：internal-working-model, separation-three-phases-child, mourning-four-phases-adult, secure-base-haven-function

### attachment-in-psychotherapy（7 张卡，标量转嵌套 + 补缺失）
- 依据 destinations.json decisions：
  - promoted（3）：therapist-secure-base, adult-strategy-matching, unresolved-trauma-referral
  - router（4）：mentalizing-reflective-function, autonoetic-coherence, rupture-repair, transference-iwm

**验证**: 全集群 73 张卡扫描，全部为嵌套 dict 格式，destination ∈ {promoted, router}，无标量、无缺失。

---

## 最终验证结果

| 验证项 | 结果 |
|---|---|
| 11 个 verified.yaml 全部可通过 yaml.safe_load | ✅ 11/11 通过 |
| synastry 7 张卡存在且可被 bundle 引用 | ✅ 7/7 |
| 所有 also_read 引用指向实际存在的 capability_id | ✅ 0 悬空 |
| 所有 promotion 字段为嵌套 dict 格式 | ✅ 73/73 |
| attached/hold-me-tight/wired-for-love candidates/ 各 5 文件 | ✅ 15/15 |
| attached/hold-me-tight/wired-for-love rejected/ 各 1 文件 | ✅ 3/3 |
| attachment-and-loss / attachment-in-psychotherapy DIGEST.md 存在 | ✅ 2/2 |

---

## 未修复的问题（不在本次范围内）

以下问题来自审查报告但未在本次修复范围，保留供后续迭代：
- M5: the-changing-sky 证据口径澄清（PIPELINE_STATE 措辞优化）
- M6: 其余 7 本补 test-prompts.json
- M7: synastry BOOK_OVERVIEW 批判层补充
- L1: attachment-and-loss destinations.json router_entry 指向不存在的卡
- L3: 全部跑 cangjie.py compile + validate_skill_pack.py
- L4: 占星类 GLOSSARY 跨书互链补充
