# 蒸馏产物独立审查报告 — 集群1（占星 6 本）+ 集群2（依恋 5 本）

- 审查对象：`/home/user/Doubao/chats/38441674128328962/books_distillation/`
- 审查日期：2026-09-15
- 审查基准：cangjie-skill v2.5 RIA-TV++ 流水线 + 质量红线 8 条
- 审查方法：逐书文件系统审计 + YAML 解析校验 + 证据行号抽查 + 跨书 also_read 图一致性检查 + 能力卡六段抽查

---

## 1. 总体评分（每本书 1–10）

| 集群 | 书 | 卡片数 | 评分 | 一句话结论 |
|---|---|---|---|---|
| 占星 | the-inner-sky | 7 | **8.0** | 骨架最完整；有 test-prompts；诚实标注 needs_review |
| 占星 | the-changing-sky | 6 | **7.5** | 压测 JSON 规范；但 100 证据文件仅 7 张被实际引用 |
| 占星 | astrology-karma-transformation | 6 | **7.0** | destinations.json 规范；但 verified.yaml 缺 promotion 字段 |
| 占星 | dynamics-of-the-unconscious | 6 | **7.0** | 卡质量好；有 1 个悬空 also_read（elements-as-energy） |
| 占星 | light-on-life | 6 | **6.5** | substitute_notice 诚实；置信带 0.37 偏薄但已声明 |
| 占星 | synastry | 7 | **4.0** | **verified.yaml 解析失败（L165 未转义冒号），bundle 不可编译** |
| 依恋 | attachment-and-loss | 7 | **7.5** | PRESSURE_TESTS 扎实、安全红线强；缺 DIGEST.md |
| 依恋 | attachment-in-psychotherapy | 7 | **7.5** | 转介卡 B 段最严谨；缺 DIGEST.md |
| 依恋 | attached | 7 | **7.0** | 卡质量好；但 candidates/ 与 rejected/ 目录全空 |
| 依恋 | hold-me-tight | 7 | **7.0** | 同上，审计轨迹缺失 |
| 依恋 | wired-for-love | 7 | **6.5** | 状态机转化到位；但有 2 个悬空 also_read + 审计轨迹缺失 |

**加权总评：约 6.9/10。** 内容层（卡片六段、安全红线、跨书链接）质量高于流程层（审计轨迹、YAML 格式一致性）。

---

## 2. 问题清单（按严重程度）

### 🔴 严重（Blocker，阻止交付/编译）

| # | 书名 | 文件 | 问题 | 修复建议 |
|---|---|---|---|---|
| S1 | synastry | `.cangjie/capabilities/verified.yaml` L165 | **YAML 解析错误**：`title: 组合盘的象征层定位: 关系镜像非判决` 中值内含未转义冒号，`yaml.safe_load` 直接失败，整个 bundle 无法被 `cangjie.py compile` 读取，7 张卡全部不可编译。 | 把该行改为 `title: "组合盘的象征层定位：关系镜像非判决"`（中文冒号或加引号）。修复后重跑 `python3 -c "import yaml;yaml.safe_load(open(...))"` 验证。 |
| S2 | attached / hold-me-tight / wired-for-love | `candidates/`、`rejected/` 目录 | **阶段1 审计轨迹完全缺失**：三个目录均为空目录（0 文件），违反"保留审计轨迹"红线。verified.md 仍声称"原 5 张旧卡全部保留"，但 candidates/ 下无 framework/principle/case/counter-example/glossary 五类提取产物，无法回溯候选→验证→淘汰链路。 | 从旧 draft（psych_attached / psych_hold_me_tight）补回五类 candidates 原文；如确系 repair 迁移丢弃，在 candidates/ 写 `README.md` 说明"迁移自旧 draft，原始候选未保留"，并在 rejected/ 写淘汰记录。 |

### 🟡 中等（应修复，影响可维护性/可信度）

| # | 书名 | 文件 | 问题 | 修复建议 |
|---|---|---|---|---|
| M1 | attachment-and-loss / attachment-in-psychotherapy | 根目录 | **缺 DIGEST.md**（阶段5 读者向精华长文）。两书均有 PRESSURE_TESTS.md 但无 DIGEST，PIPELINE_STATE 却声称 stage4-complete 而未说明阶段5 跳过原因。 | 补写 DIGEST.md（面向读者的精华长文），或在 PIPELINE_STATE 显式标注"阶段5 由总控统一交付，本书不单独产出 DIGEST"。 |
| M2 | 跨书 | 多张卡 also_read | **4 个悬空 also_read 链接**：`cap.dynamics.elements-as-energy`（element-development-stages→）、`cap.wired-for-love.wave-style`（activation-strategy→）、`cap.wired-for-love.island-style`（deactivation-strategy→、freeze-flee-dialogue→）。目标 capability_id 不存在，运行时路由会 404。 | 旧 draft 曾把 Wave/Island 拆成独立卡，后并入 `pact-anchor-wave-island`。把悬空指向改为 `cap.wired-for-love.pact-anchor-wave-island`；`elements-as-energy` 改为 `cap.akt.element-development-stages` 或删除该链接。 |
| M3 | astrology-karma-transformation / dynamics-of-the-unconscious | `verified.yaml` | **Bundle 内缺 `promotion.destination` 字段**：6 张卡均无 promotion 键，晋级决策只存在于 destinations.json（用 `served_by`/`route` 旧 schema）。v2.5 要求 Bundle 为唯一编译事实源，编译器读不到 destination。 | 在每张卡补 `promotion: {destination: router, route: astro-karma-transform-router}`（或统一迁移到 destinations.json 的 `routes:{promoted,router}` 新 schema）。 |
| M4 | attachment-and-loss / attachment-in-psychotherapy | `verified.yaml` | promotion 字段用标量 `promotion: promoted`，light-on-life/attached 等用嵌套 `promotion.destination: promoted`，另有书用 destinations.json 的 `decisions[]`。**三套 schema 并存**，编译器需特判。 | 统一为 v2.5 规范 `promotion: {destination: promoted|router, reason: ...}`。 |
| M5 | the-changing-sky | 证据库 | **100 个证据文件仅 7 个被卡片实际引用**（98 个 AstrologyKing 行运页作为"查表库"未进入 R 段）。coverage-audit 已诚实声明，但 PIPELINE_STATE "evidence: 99 open files" 措辞易被误读为 grounding 深度。 | 在 DIGEST/PIPELINE_STATE 明确"98 个为查表 raw 库，仅 ~7 个为卡片 R 段直接证据"；置信带 0.36-0.40 已声明，可接受。 |
| M6 | 7/11 本书 | 阶段4 | **无独立测试工件**：仅 the-changing-sky、the-inner-sky 有 test-prompts.json；attachment-and-loss、attachment-in-psychotherapy 有 PRESSURE_TESTS.md；其余 7 本把测试内嵌在 E/B 段，无"输入→预期→实际通过"记录，阶段4 是否真跑过不可证。 | 对 astro 其余 4 本 + attached/hold-me-tight/wired-for-love，补最小 test-prompts.json（每卡 1 正例 1 redline 例），对齐 darwin 评测格式。 |
| M7 | synastry | `BOOK_OVERVIEW.md` | Adler 四层用"整体/结构/细节/评价"命名，"批判"层薄弱——只有一句"镜子不决定生死"，未对 Arroyo 体系本身做知识批判（如无实证、文化偏见）。 | 在"第四层·评价"补一段局限批判：象征层无 Dean & Kelly 统计支持、西方热带黄道文化局限。 |

### 🟢 轻微（可择机修复）

| # | 书名 | 文件 | 问题 | 修复建议 |
|---|---|---|---|---|
| L1 | attachment-and-loss | `destinations.json` | `router_entry: cap.attachment-and-loss.source-overview` 指向一张不存在的卡。 | 改为实际存在的入口卡（如 abcd-pattern-recognition 或 attachment-system-activation）。 |
| L2 | light-on-life / synastry | `BOOK_OVERVIEW.md` | 未显式使用"结构/解释/批判/应用"四标签，但四层内容实际存在。 | 无需改内容，加一行小标题对齐 Adler 四步命名即可。 |
| L3 | 全部 11 本 | 阶段5 | **均未运行 `cangjie.py compile`**，bundle 停在"待编译"状态；PIPELINE_STATE 已诚实标注。 | 修复 S1/M3/M4 后统一跑 compile 验证 `validate_skill_pack.py` 100% 通过。 |
| L4 | astrology-karma-transformation 等 | `GLOSSARY.md` | 占星类 GLOSSARY 较短（16–19 行），跨书术语未充分互链。 | 非阻断；可在阶段3 补。 |

---

## 3. 流程合规性检查表

| 阶段 | 检查项 | 内占星 |  |  |  |  |  | 依恋 |  |  |  |  |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| | | 内天 | 变天 | 业力 | 动态 | 光生 | 合盘 | 依恋 | 失去 | 治疗 | 抱紧 | 连线 |
| 0 | BOOK_OVERVIEW 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 0 | Adler 四步覆盖 | ◐ | ✅ | ✅ | ◐ | ◐ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1 | candidates/ 5 类齐全 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| 1.5 | verified.md 三重验证表 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.6 | destinations.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.6 | 每卡唯一去向 | ✅ | ✅ | ◐ | ◐ | ✅ | ⛔ | ✅ | ◐ | ◐ | ✅ | ✅ |
| 2 | verified.yaml 可解析 | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | 六字段(cid/slug/title/importance/one_liner/intents/keywords/card) | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | frontmatter.description 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | GLOSSARY.md 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | also_read 跨书链接 | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | also_read 无悬空 | ✅ | ✅ | ✅ | ❌1 | ✅ | ⛔ | ❌2 | ✅ | ✅ | ❌1 | ❌2 |
| 4 | 测试工件(test/压测) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| 5 | DIGEST.md | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| — | PIPELINE_STATE.md | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

图例：✅ 通过 / ◐ 部分通过 / ❌ 缺失 / ⛔ 阻断（解析失败）。
悬空计数：dynamics 1 个（elements-as-energy）；attached/wired-for-love 各 2 个（wave-style/island-style）；hold-me-tight 1 个（island-style）。

---

## 4. 能力卡质量抽查结果

抽查了 6 张代表卡：`outer-planet-crisis-trigger`（变天）、`nine-graha`（光生）、`complicated-grief-differential`（Bowlby）、`unresolved-trauma-referral`（Wallin）、`threat-repair-state-machine`（Wired）、`outer-planet-crisis-trigger`。

| 检查项 | 结果 |
|---|---|
| R/I/A1/A2/E/B 六段齐全 | **全部 70 张卡通过**（脚本扫描，无缺段） |
| 卡片残留 frontmatter | **0 张**（v2.5 去 frontmatter 要求执行到位） |
| R 段引用带文件+行号 | 抽查均带 `raw/legal_open/XX_*.txt L000xx-L000xx` 或 `PMCxxxxx:n` |
| R 段引用长度合规 | 中文 ≤150 字、英文 ≤100 词均通过（脚本扫描） |
| 引用内容与原文一致性 | 抽查变天 3 处引用（71/20/41 号文件）逐行核对，**文字与行号完全吻合**，未发现编造引用 |
| A1 合成演练 vs 原书案例 | 心理/占星类 A1 均明确标注"合成演练"，未把合成案例冒充原书事实 ✅ |
| A2 触发场景+语言信号 | 抽查均有"何时用/语言信号/与相邻卡区分"三段 ✅ |
| E 段可执行步骤+完成标准 | 均有编号步骤 + 每步完成标准 + 输入/输出契约 ✅ |
| B 段反场景+失败模式 | 均有；**心理/创伤类安全红线到位**（complicated-grief、unresolved-trauma-referral 两张卡的自杀/自伤/暴力→紧急转介红线表述规范，未提供疗法/药物建议） |
| 占星 is_actionable=false | 除 synastry 解析失败外，5 本占星全部 `is_actionable: False` ✅ |
| 占星断言是否超证据 | 抽查 nine-graha、outer-planet 两卡：九曜心理原型、外行星主题词均能在 cited 行号找到对应；未发现"凭记忆编造"的无来源断言。薄证据风险已通过 `confidence_band: 0.36-0.55` 诚实披露。 |

**关键结论：未发现严重的"凭记忆编造"内容。** 所有抽查到的具体断言均可定位到 cited 证据行号；合成演练均明确标注。最薄弱的是占星类置信带整体偏低（0.36–0.55），但这属于证据本身薄，而非编造。

---

## 5. 集群转化目标达成度评估

### 5.1 占星集群 → 心理原型 / 行运危机触发点 / 演化决策树

| 转化目标 | 达成度 | 证据 |
|---|---|---|
| 心理原型（非吉凶占星） | ✅ 达成 | nine-graha（九曜=原型节点）、planets-as-teachers（行星=十位老师）、archetype-translation（符号→现代原型词）、shadow-projection、individuation-process |
| 行运危机触发点 | ✅ 达成 | outer-planet-crisis-trigger（土=结构/天=突破/海=溶解/冥=剥离）、transit-mirror、lifecycle-milestones（土星回归/天王对冲） |
| 演化决策树 | ◐ 部分 | signs-as-virtues（星座=待养成美德）、nodal-karmic-loop（南交舒适区→北交成长边缘）、element-development-stages 提供了演化方向；但未形成显式"决策树"流程图，更多是词典+原则 |
| 非决定论安全阀 | ✅ 突出 | 每本占星都有一张 *-non-determinism 卡作为 critical 安全阀，B 段明确"不预测事件/不替代心理咨询/家暴让位安全评估" |

**跨书能力链**：the-inner-sky（本命语法）→ the-changing-sky（行运时间轴）→ astrology-karma-transformation（业力演化）→ dynamics-of-the-unconscious（无意识原型）→ synastry（关系镜像）形成"本命→行运→演化→深层→关系"的闭环；light-on-life 作为吠陀并行体系。also_read 互链密度高（除 4 个悬空外均有效）。

### 5.2 依恋集群 → 伴侣防御模式 / 激活-去激活策略 / 安全岛状态机

| 转化目标 | 达成度 | 证据 |
|---|---|---|
| 伴侣防御模式识别 | ✅ 达成 | style-map（焦虑×回避双维图）、abcd-pattern-recognition、pact-anchor-wave-island（Anchor/Wave/Island/Mixed） |
| 激活/去激活策略 | ✅ 达成 | activation-strategy（hyperactivation/protest）、deactivation-strategy（deactivation）、protest-polk-dialogue、freeze-flee-dialogue、demand-withdraw 魔鬼对话 |
| 安全岛构建状态机 | ✅ 达成（本集群最大亮点） | threat-repair-state-machine（Peace↔War 双态+转移条件+修复按钮）、secure-island-protocol、repair-protocol（24h 修复）、secure-buffering、secure-base-haven-function |
| 临床转介红线 | ✅ 突出 | complicated-grief-differential、unresolved-trauma-referral 两张卡 B 段把自杀/自伤/解离/暴力→紧急服务写为最高优先级，符合心理内容安全要求 |

**跨书能力链**：attachment-and-loss（Bowlby 理论地基）→ attached（大众双维地图）→ hold-me-tight（EFT 七次对话）→ wired-for-love（PACT 状态机+安全岛）→ attachment-in-psychotherapy（治疗师端转介）形成"理论→自助→伴侣→临床"完整链路；also_read 互相引用密集且语义合理（如 demand-withdraw 双向链接 activation/deactivation，threat-repair-state-machine 链接 repair-protocol）。

---

## 6. 优先修复建议（Top 10）

1. **【S1】修复 synastry `verified.yaml` L165** 的未转义冒号——这是唯一 blocker，不修则 synastry 整本 7 卡不可编译。
2. **【S2】补齐 attached / hold-me-tight / wired-for-love 的 candidates/ 与 rejected/ 审计轨迹**（或写迁移说明 README）——红线"保留审计轨迹"。
3. **【M2】修复 4 个悬空 also_read**：`elements-as-energy`、`wave-style`、`island-style` 指向已合并的卡（pact-anchor-wave-island / element-development-stages）。
4. **【M1】为 attachment-and-loss、attachment-in-psychotherapy 补 DIGEST.md**（或在 PIPELINE_STATE 显式声明阶段5 由总控统一交付）。
5. **【M3/M4】统一 promotion schema**：astrology-karma-transformation、dynamics-of-the-unconscious 在 verified.yaml 补 `promotion.destination`；attachment-and-loss/psychotherapy 把标量 `promotion: promoted` 改为嵌套结构；消除三套 destinations.json 并存。
6. **【L1】修复 attachment-and-loss 的 `router_entry: source-overview`** 悬空指针。
7. **【M6】为其余 7 本补最小 test-prompts.json**（每卡 1 正例 1 redline），使阶段4 可独立验证、可喂 darwin 自动进化。
8. **【M5】澄清 the-changing-sky 证据口径**：在 PIPELINE_STATE/DIGEST 写明"100 文件中 93 个为未逐张引用的查表 raw 库"，避免"100 文件支撑"被误读。
9. **【M7】补 synastry BOOK_OVERVIEW 批判层**：加入象征层无实证、西方黄道文化局限的诚实声明。
10. **【L3】全部修复后统一跑 `cangjie.py compile` + `validate_skill_pack.py`**，确认 11 个 bundle 100% 格式通过、相对引用无死链，再交付。

---

## 附：审查覆盖说明

- 脚本扫描：70 张能力卡的六段完整性、frontmatter 残留、YAML 可解析性、also_read 图一致性、R 段引用长度。
- 行号抽查：the-changing-sky 3 个 cited 证据文件（71/20/41 号）逐行比对，引用准确。
- 深读卡片：outer-planet-crisis-trigger、nine-graha、complicated-grief-differential、unresolved-trauma-referral、threat-repair-state-machine。
- 未深读：其余 60+ 张卡（因六段扫描全通过、代表卡质量稳定，按抽样原则不再逐张通读）；如需逐卡复核可二次委托。
- 未验证：evidence 原文是否逐字与 R 段引号完全一致（仅抽查变天 3 处 + complicated-grief 2 处引用标注规范）。
