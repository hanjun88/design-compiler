# 蒸馏产物独立审查报告 — 集群3（创伤）+ 集群4（关系）

- 审查对象根目录: `/home/user/Doubao/chats/38441674128328962/books_distillation/`
- 审查范围: cluster3_trauma（6 本）+ cluster4_relationships（5 本有效）
- 审查日期: 2026-09-15
- 审查方式: 文件系统静态审计 + YAML 解析校验 + 证据回链抽查（R 段引用 → raw/ 源文件逐行核对）+ 能力卡六段结构抽查

---

## 1. 总体评分（每本书 1–10）

| 书 | 卡片数 | 评分 | 一句话结论 |
|---|---|---|---|
| cluster3/complex-ptsd | 10 | **8.5** | 本批标杆；证据最厚（Pete Walker 官网 27 篇 + TIP57），唯一硬伤是跨书 also_read 指向了不存在的 capability_id |
| cluster3/waking-the-tiger | 7 | **8.5** | 旧 5 卡正确降级并留痕，新卡为 SE 特异协议，三重验证记录完整 |
| cluster3/the-body-keeps-the-score | 9 | **8.0** | 框架完整、B 段安全红线齐；跨书 also_read 同样存在悬空引用 |
| cluster3/internal-family-systems | 7 | **8.0** | is_actionable=true 卡的 E 段真正可执行（step-back 步骤+完成标准）；rejected/ 空目录 |
| cluster3/in-an-unspoken-voice | 6 | **7.0** | 卡片合格；verified.yaml 中 source 路径缺 `raw/` 前缀，证据路径不与编译器一致 |
| cluster3/polyvagal-theory | 7 | **5.0** | **能力卡本身优秀，但 verified.yaml 不可解析（严重阻断编译）**，唯一编译事实源失效 |
| cluster4/why-does-he-do-that | 9 | **8.5** | 暴力安全红线最强（danger-lethality risk_floor=1.0、禁止沟通修复），证据回链真实 |
| cluster4/seven-principles | 9 | **7.5** | 四骑士/修复尝试卡片扎实；目录命名与任务清单不一致，Adler 应用步偏弱 |
| cluster4/mating-in-captivity | 6 | **7.5** | 欲望-安全四象限矩阵转化到位；个别卡残留 HTML 注释式 frontmatter |
| cluster4/zimbaro-psychology | 6 | **7.5** | 认知偏差→关系扭曲映射清晰；source 路径缺 `raw/` 前缀 |
| cluster4/getting-the-love-you-want | 6 | **7.0** | Imago 三步对话可操作；source 路径缺 `raw/` 前缀，证据体量偏薄（单源） |

> 集群均值：创伤 ≈ 7.5，关系 ≈ 7.6。整体达到"Bundle 事实源 + 能力卡"可交付水平，但存在 1 个编译阻断性缺陷和系统性跨书链接断链。

---

## 2. 问题清单（按严重程度）

### 🔴 严重（阻断编译 / 违反质量红线）

**S1. polyvagal-theory 的 verified.yaml 不可解析**
- 文件: `cluster3_trauma/polyvagal-theory/.cangjie/capabilities/verified.yaml` 第 47 行
- 现象: `one_liner: "没来由"的紧绷是神经感受在意识下把场景扫成了危险` —— 行内中文双引号未转义，YAML 解析器在 `"没来由"` 后把 `的紧绷…` 当作多余标量报错（`expected <block end>, but found '<scalar>'`，line 40/47）。`yaml.safe_load` 直接抛异常。
- 影响: verified.yaml 是 v2.5 唯一编译事实源（ADR-002）。此文件无法解析 → `cangjie.py compile` 必然失败 → 整个 polyvagal 集群能力链断在编译入口。
- 修复建议: 把该值整体改用单引号包裹并转义内部引号，或改用块标量：
  `one_liner: '“没来由”的紧绷是神经感受在意识下把场景扫成了危险'`。修复后用 `python3 -c "import yaml;yaml.safe_load(open('...'))"` 回归验证。

**S2. 跨书 also_read 指向不存在的 capability_id（悬空引用）**
- 涉及: `complex-ptsd`、`the-body-keeps-the-score`
- 悬空 ID 实证:
  - `cap.waking-the-tiger.somatic-experiencing` —— waking-the-tiger 实际能力为 `cap.waking-the-tiger.freeze-third-response / animal-release-cycle / resourcing-first / titration / pendulation / biological-completion / discharge-signs`，**没有任何** `somatic-experiencing`。
  - `cap.polyvagal.polyvagal-theory` —— polyvagal 实际命名空间为 `cap.poly.*`（如 `cap.poly.autonomic-ladder`），不存在 `cap.polyvagal.polyvagal-theory`。
- 命中位置（complex-ptsd/verified.yaml）: 第 60–61 行（four-f-trauma-typology）、four-f 链；emotional-flashback-13-steps；optimal-arousal-window。the-body-keeps-the-score 的 body-memory、multi-modal-recovery 同样指向 `cap.waking-the-tiger.somatic-experiencing`。
- 影响: 阶段3 要求 also_read 形成"4F 识别→躯体释放→神经调节→Parts 协调"能力链；当前链头两个指针全部落空，Zettelkasten 链接图是断的。
- 修复建议: 把悬空 ID 改写为真实 ID，例如
  - `cap.waking-the-tiger.somatic-experiencing` → `cap.waking-the-tiger.biological-completion`（或 `titration`/`pendulation`）；
  - `cap.polyvagal.polyvagal-theory` → `cap.poly.autonomic-ladder`（或 `cap.poly.state-tracking-log`）。
  并对全集群做一次 also_read 闭包校验（见建议工具脚本）。

### 🟠 中等（一致性 / 规范偏离）

**M1. verified.yaml 证据路径前缀不统一（缺 `raw/`）**
- 涉及: `in-an-unspoken-voice`、`waking-the-tiger`、`getting-the-love-you-want`、`mating-in-captivity`、`zimbaro-psychology`
- 现象: 这些书 `source_evidence.source` 写的是 `legal_open/LE03_payne2015.txt`，但文件实际位于 `raw/legal_open/LE03_payne2015.txt`。对比 complex-ptsd 用的是 `raw/legal_open/...` 全路径。
- 影响: 证据文件本身存在（已核实），并非编造；但同一 Bundle 内/跨 Bundle 路径根不一致，编译器若按 Bundle 根解析会找不到文件，审计回链也会误报缺失。
- 修复建议: 统一为 `raw/legal_open/...`，或在 Bundle 元数据声明 `evidence_root: raw/`，让编译器统一拼接。二选一，全集群一致。

**M2. 目录命名不一致（任务清单 seven-principles-marriage 为空壳）**
- 现象: 任务要求审查 `cluster4_relationships/seven-principles-marriage/`，该目录**完全为空**（无 .cangjie、无 candidates、无 PIPELINE_STATE），实际内容在 `seven-principles/`（9 张卡，完整流水线）。
- 影响: 目录契约与命名脱节，自动化巡检/编译器按 `seven-principles-marriage` 扫描会认为该书缺失。
- 修复建议: 二选一——(a) 把 `seven-principles/` 重命名/软链为 `seven-principles-marriage/`；(b) 删除空壳 `seven-principles-marriage/` 并在 SHARED_SPEC 中登记正式 slug 为 `seven-principles`。

**M3. 阶段4 压力测试无独立产物，全部内嵌 E/B 段**
- 现象: 全集群（cluster3+cluster4）**没有**独立的 test-prompts / 评测用例文件（`find` 未命中）。PIPELINE_STATE 均自述"压测用例内嵌各卡 E/B 段"。
- 影响: 与 cangjie-skill 阶段4"产出 darwin 兼容评测用例、缺失输出计入分母"的要求有差距；当前无法在不读全文的情况下批量跑评测。
- 修复建议: 至少为 promoted 能力（complex-ptsd 5 张、body-keeps-score 4 张、seven-principles 3 张、why-does-he-do-that 5 张、IFS 2 张、polyvagal 2 张）抽取独立 `tests/*.yaml` 正反用例，供 darwin 自动进化。

**M4. seven-principles 的 BOOK_OVERVIEW 缺 Adler 第四步（应用）**
- 文件: `cluster4_relationships/seven-principles/BOOK_OVERVIEW.md`
- 现象: 有"主旨/骨架/关键术语/批判"，但 Adler 四步中的"应用（Application）"未独立成节，Adler 关键词命中仅 3 次（全集群最低）。
- 修复建议: 补一节"## 应用（Application）"，说明在"双方善意可修复关系"场景下四骑士/5:1/爱情地图的落地顺序，以及与 WDHDT 的切换触发。

**M5. 能力卡残留 frontmatter 注释**
- 文件: `cluster4_relationships/mating-in-captivity/.cangjie/capabilities/cards/desire-safety-matrix.md` 第 1 行
- 现象: 卡片正文顶部仍有 `<!-- capability_id: ... | revision: 1 | status: active -->` HTML 注释。v2.5 要求卡片正文**不带 frontmatter**（frontmatter 已并入 verified.yaml）。
- 修复建议: 删除该行注释，保持卡片纯正文。

### 🟡 轻微（风格 / 完整性）

**L1. empty `rejected/` 目录未留记录文件**
- 涉及: `internal-family-systems/rejected/`、`polyvagal-theory/rejected/`（空目录，无 rejected_units.md）。
- 对比: waking-the-tiger 的 rejected_units.md 对旧 5 卡降级原因记录详尽（标杆）。
- 修复建议: 若确无淘汰单元，放一行 `# (本批无淘汰单元)` 占位；若有历史草稿未登记，补记。

**L2. complex-ptsd / the-body-keeps-the-score 缺 `is_actionable` 字段**
- 现象: 这两本用 `promotion.destination` 内联表达去向，但能力级没有 `is_actionable` 布尔；其余 9 本均有。审查规范要求"IFS/Polyvagal 可操作协议应为 true"——这两本虽不是重点标注对象，但字段缺失造成元数据不齐。
- 修复建议: 为每张卡补 `is_actionable:`（如 selfharm-safety-triage / body-memory 按实际可操作性标注 true/false）。

**L3. 证据行号约定为"内部编号行"而非物理行，存在误读风险**
- 说明: 抽查确认 polyvagal P03、IFS E01 的 R 段引用**真实命中**（如 IFS E01 内部 15–16 行确为 Diane step-back 原文；P03 内部 9、11 行确为 dorsal 方向规则原文）。证据**非编造**。但文件内部以 `1  …` 前缀编号，物理行 ≠ 编号行，跨工具复用时易误读。
- 修复建议: 在各 Bundle 的 book/overview.md 注明"行号指 raw 文件内编号行，非物理行"。

---

## 3. 流程合规性检查表

图例: ✅ 存在且合格 / ⚠️ 存在但有缺陷 / ❌ 缺失或失败

| 阶段 | complex-ptsd | body-keeps | waking-tiger | in-unspoken | IFS | polyvagal |
|---|---|---|---|---|---|---|
| 0 BOOK_OVERVIEW (Adler四步) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1 candidates/ 五类提取器 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.5 verified.md 三重验证 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.6 destinations.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 verified.yaml 可解析 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **S1** |
| 3 GLOSSARY + also_read | ⚠️ S2 | ⚠️ S2 | ✅ | ✅ | ✅ | ✅ |
| 4 压力测试 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 |
| PIPELINE_STATE.md | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejected/ 留痕 | ✅ | ✅ | ✅ | ✅ | 🟡 L1 | 🟡 L1 |

| 阶段 | zimbaro | mating | getting-love | seven-principles | WDHDT |
|---|---|---|---|---|---|
| 0 BOOK_OVERVIEW (Adler四步) | ✅ | ✅ | ✅ | ⚠️ M4 | ✅ |
| 1 candidates/ 五类提取器 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.5 verified.md 三重验证 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1.6 destinations.json | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 verified.yaml 可解析 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 GLOSSARY + also_read | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 压力测试 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 | ⚠️ M3 |
| PIPELINE_STATE.md | ✅ | ✅ | ✅ | ✅ | ✅ |

> 说明: `seven-principles-marriage/` 为空壳目录（M2），不计入合规表。所有书的 candidates/ 均含 frameworks/principles/cases/counter-examples/glossary 五件套。

---

## 4. 能力卡质量抽查结果

抽查 8 张代表性卡，逐段核对 R/I/A1/A2/E/B 六段完整性与证据真实性：

| 卡片 | 六段完整 | R 行号回链 | A1 标注 | A2 触发信号 | E 步骤+完成标准 | B 反场景+红线 | 结论 |
|---|---|---|---|---|---|---|---|
| complex-ptsd/selfharm-safety-triage | ✅ | ✅ NBK207191 L68/79/81-91 | 原书 | ✅ | ✅ S1-S5+AST | ✅ 强制转人工 | 标杆 |
| IFS/step-back-protocol | ✅ | ✅ E01 内部15-16（Diane 原文逐字命中） | 原书 | ✅ 中英信号 | ✅ 4步+完成标准 | ✅ 不用于暴露 | 优质 |
| polyvagal/dorsal-climb-through-sympathetic | ✅ | ✅ P03 内部9/10/11（逐字命中） | ✅明确标"合成演练" | ✅ | ✅ 先动后静两步 | ✅ 仅背侧成立 | 优质 |
| WDHDT/danger-lethality | ✅ | ✅ 官网文章 L21-57 + NBK618997 | 合成已标注 | ✅ 中英信号 | ✅ 4步+3资源 | ✅ risk_floor=1.0 禁止沟通修复 | 标杆 |
| WDHDT/abuser-typing | ✅ | ✅ 官网两文 L16-51 | 合成已标注 | ✅ | ✅ 3步 | ✅ 不诊断/不拖延安全计划 | 优质 |
| seven-principles/four-horsemen | ✅ | ✅ gottman.com L339-354 | 合成已标注 | ✅ 中英信号 | ✅ | ✅ 转 WDHDT 边界 | 优质 |
| mating/desire-safety-matrix | ✅ | ✅ OnBeing L33-55 | 原书映射 | ✅ | ✅ 四象限 | ✅ 虐待关系先修安全 | 优质（仅 M5 残留注释） |
| waking-tiger/titration | ✅（PIPELINE 记录） | ✅ verified.md 列 LE02/LE03 | — | — | — | — | 记录可信 |

**关键判定 — 有无"凭记忆编造"**:
- 抽查的 R 段引用全部**真实命中**源文件对应行号（IFS Diane 案例、Polyvagal dorsal 规则、Gottman 四骑士、Bancroft 类型学、Walker 自伤定义均逐字或近逐字可回链）。
- A1 段凡非原书案例均**显式标注"合成演练"**，未把合成内容冒充书中事实（符合质量红线 2）。
- 未发现无来源行号的具体断言编造。主要"证据问题"是路径前缀（M1）与悬空 ID（S2），而非内容杜撰。

---

## 5. 集群转化目标达成度

### 创伤集群目标：4F 识别 → 躯体释放 → 神经状态调节 → Parts 协调

| 目标能力 | 落地卡片 | 达成度 |
|---|---|---|
| 4F 反应识别 | complex-ptsd/four-f-trauma-typology（critical, promoted） | ✅ 达标 |
| 躯体释放 / 完成动作 | waking-the-tiger/biological-completion, discharge-signs, pendulation, titration | ✅ 达标（SE 特异协议，非通用疗法） |
| 迷走神经状态追踪 | polyvagal/autonomic-ladder, state-tracking-log, regulation-menu-by-rung | ✅ 能力到位，但 Bundle 编译被 S1 阻断 |
| 次人格(IFS)协调 | IFS/step-back-protocol, parts-system-map, protector-permission-check, unburdening | ✅ 达标，E 段真正可操作 |

- **链条完整性**: 概念层链条已设计（PIPELINE_STATE 写明 `4F → body-memory → multi-modal-recovery`、Polyvagal↔SE、IFS Parts↔4F 互参），但**实际 also_read 字段的跨书指针是断的（S2）**——即"链条画在 PIPELINE_STATE 里，没写进 verified.yaml 的有效 ID"。修复 S2 后链条才真正可导航。
- 安全红线: 创伤类所有抽查卡 B 段均含"不替代专业医疗/暴露需专业在场"，selfharm-safety-triage 为安全兜底 ✅。

### 关系集群目标：末日四骑士识别 / 欲望-安全冲突矩阵 / 控制型人格解构

| 目标能力 | 落地卡片 | 达成度 |
|---|---|---|
| 末日四骑士识别 | seven-principles/four-horsemen（+ thermostat-ratio, repair-attempts） | ✅ 达标 |
| 欲望 vs 安全感冲突矩阵 | mating/desire-safety-matrix（四象限工具） | ✅ 达标，转化最完整 |
| 控制型人格解构 | WDHDT/abuser-typing, entitlement-control, entrapment-recognize, blame-shift-detect, danger-lethality | ✅ 达标，暴力安全红线最强 |
| 认知偏差矫正（支撑层） | zimbaro 6 卡（归因/确认偏差/认知失调/从众服从/ELM） | ✅ 作为关系认知扭曲支撑层 |

- **跨书边界做得好**: four-horsemen 与 desire-safety-matrix 的 B 段都明确"遇暴力/控制关系立即转 WDHDT/danger-lethality，不做 Gottman/Perel 沟通修复"——这是关系集群最重要的安全隔离，已正确建立。
- **跨书 also_read**: 关系集群内部（seven-principles↔getting-the-love-you-want Imago↔EFT 互补定位）已互链；与创伤集群的跨集群指针相对少。

---

## 6. 优先修复建议（Top 10）

1. **[S1 阻断]** 修复 `polyvagal-theory/verified.yaml:47` 的未转义中文引号，使 Bundle 可解析——否则整个迷走神经能力无法编译交付。
2. **[S2]** 全集群扫描 also_read 闭包，把 `cap.waking-the-tiger.somatic-experiencing`、`cap.polyvagal.polyvagal-theory` 等悬空 ID 替换为真实 ID（`cap.waking-the-tiger.biological-completion`、`cap.poly.autonomic-ladder`）。
3. **[S2 配套]** 写一个一次性校验脚本：收集全部 capability_id 集合后，校验每张卡 also_read 都在集合内，CI 化。
4. **[M2]** 处理空壳 `seven-principles-marriage/`：删除或软链到 `seven-principles/`，并在 SHARED_SPEC 登记正式 slug。
5. **[M1]** 统一证据路径前缀：5 本新书的 `legal_open/...` 改为 `raw/legal_open/...`，与 complex-ptsd 对齐。
6. **[M3]** 为全部 promoted 能力抽取独立 `tests/*.yaml` 正反用例（当前仅内嵌 E/B），满足 darwin 自动进化输入。
7. **[M4]** 给 seven-principles 的 BOOK_OVERVIEW 补 Adler 第四步"应用"节。
8. **[M5]** 删除 `mating-in-captivity/.../desire-safety-matrix.md` 首行 HTML 注释式 frontmatter。
9. **[L2]** 给 complex-ptsd、the-body-keeps-the-score 每张卡补 `is_actionable` 布尔，对齐其余 9 本元数据。
10. **[L1/L3]** 给 IFS/polyvagal 的空 rejected/ 加占位说明；在各 Bundle overview 注明"行号=文件内编号行"，降低跨工具误读。

---

## 附：审查中已排除的"疑似问题"（避免误报）

- ~~MISSING_EVID 文件~~：初扫报缺失，核实后是脚本去 `raw/` 前缀所致，源文件**全部存在**，证据真实。
- ~~IFS step-back R 段疑编造~~：核对 E01 内部 15–16 行，Diane "step back" 案例原文逐字命中。
- ~~polyvagal dorsal 引用疑编造~~：核对 P03 内部 9、11 行，"path up from dorsal runs through sympathetic" 与"therapists who try to talk a collapsed client into safety..."逐字命中。
- waking-the-tiger 旧卡淘汰：rejected/rejected_units.md 已正确记录 5 张 TIP57 通用卡降级理由，符合预期。

**总体结论**: 11 本产物在能力卡内容质量、证据回链真实性、安全红线三个核心维度表现良好，complex-ptsd / waking-tiger / WDHDT 可作标杆。**唯一必须在交付前修复的阻断项是 polyvagal-theory 的 YAML 解析错误（S1）**；其次是跨书 also_read 断链（S2）——它让精心设计的创伤能力链在数据层不可导航。其余为一致性与规范类改进。
