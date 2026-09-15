# 西方心理与占星典籍 Cangjie 蒸馏成果

> 基于 [cangjie-skill v2.5](https://github.com/) RIA-TV++ 流水线蒸馏的 22 部西方心理学与占星学典籍，转化为可执行的 Agent 能力卡与技能包。

## 蒸馏概览

| 集群 | 典籍数 | 能力卡数 | 编译 Skills | 转化目标 |
|---|---|---|---|---|
| 西方/进化占星 | 6 | 38 | 20 | 心理原型、行运危机触发点与演化决策树 |
| 依恋与主体间性 | 5 | 35 | 23 | 伴侣防御模式、激活/去激活策略与安全岛构建状态机 |
| 创伤恢复与躯体疗愈 | 6 | 46 | 20 | 4F反应识别、迷走神经状态追踪与次人格(IFS)协调协议 |
| 认知/行为/亲密关系实战 | 5 | 36 | 5 | 末日四骑士识别、欲望与安全感冲突矩阵及控制型人格解构规则 |
| **合计** | **22** | **155** | **68** | |

## 典籍清单

### 集群1：西方/进化占星
- 《The Inner Sky》Steven Forrest (2007)
- 《The Changing Sky》Steven Forrest (1988)
- 《Astrology, Karma & Transformation》Stephen Arroyo (1978)
- 《Dynamics of the Unconscious》Stephen Arroyo (1975)
- 《Synastry》Stephen Arroyo (1975)
- 《Light on Life》Hart de Fouw & Robert Svoboda (1995)

### 集群2：依恋与主体间性
- 《Attached》Amir Levine & Rachel Heller (2010)
- 《Hold Me Tight》Sue Johnson (2008)
- 《Wired for Love》Stan Tatkin (2012)
- 《Attachment in Psychotherapy》David J. Wallin (2007)
- 《Attachment and Loss》John Bowlby (1969-1980)

### 集群3：创伤恢复与躯体疗愈
- 《Complex PTSD》Pete Walker (2013)
- 《The Body Keeps the Score》Bessel van der Kolk (2014)
- 《Waking the Tiger》Peter A. Levine (1997)
- 《In an Unspoken Voice》Peter A. Levine (2010)
- 《Internal Family Systems Therapy》Richard C. Schwartz (1995/2019)
- 《The Polyvagal Theory in Therapy》Deb Dana (2018)

### 集群4：认知/行为/亲密关系实战
- 《津巴多普通心理学》Philip G. Zimbardo (1983+)
- 《Mating in Captivity》Esther Perel (2006)
- 《Getting the Love You Want》Harville Hendrix (1988)
- 《Why Does He Do That?》Lundy Bancroft (2002)
- 《The Seven Principles for Making Marriage Work》John Gottman (1999)

## 目录结构

```
cangjie-western/
├── README.md                    # 本文件
├── compiled-skills/             # cangjie.py compile 编译后的技能包 (pack模式)
│   ├── astro/                   # 占星集群 6本书
│   ├── attachment/              # 依恋集群 5本书
│   ├── trauma/                  # 创伤集群 6本书
│   └── relationships/           # 关系集群 5本书
├── capability-bundles/          # Capability Bundle (编译事实源)
│   └── <cluster>/<book>/
│       ├── verified.yaml        # 唯一编译事实源 (capability_id/intents/keywords/source_evidence)
│       ├── destinations.json    # 晋级/路由去向映射
│       ├── cards/               # RIA++ 六段能力卡 (R/I/A1/A2/E/B)
│       └── book/                # overview.md + glossary.md
├── source-evidence/             # 合法开放证据文件 (逐行编号)
│   └── <cluster>/<book>/
│       ├── legal_open/          # 作者官网/NCBI/PMC/权威机构公开内容
│       └── full_text_open/      # NCBI Bookshelf 全文章节 + manifest.json
├── docs/                        # 流水线文档
│   └── <cluster>/<book>/
│       ├── BOOK_OVERVIEW.md     # 阶段0 Adler 四步整书理解
│       ├── DIGEST.md            # 面向读者的精华长文
│       ├── GLOSSARY.md          # 全书共享术语词典
│       ├── verified.md          # 阶段1.5 三重验证结果
│       └── coverage-audit.md    # 关键任务覆盖审计
└── reports/                     # 审查与修复报告
    ├── REVIEW_REPORT_CLUSTER1_2.md
    ├── REVIEW_REPORT_CLUSTER3_4.md
    ├── FIX_REPORT_CLUSTER1_2.md
    ├── FIX_REPORT_CLUSTER3_4.md
    ├── FORMAT_NORMALIZATION_REPORT.md
    └── SHARED_SPEC.md
```

## 方法论

### RIA-TV++ 流水线
1. **阶段0** Adler 整书理解 → BOOK_OVERVIEW.md
2. **阶段1** 5类提取器并行提取 (框架/原则/案例/反例/术语) → candidates/
3. **阶段1.5** 三重验证 (V1来源充分性/V2可执行性/V3任务增益) → verified.md
4. **阶段1.6** 独立 Skill 晋级门 (promoted/router) → destinations.json
5. **阶段2** RIA++ 构造能力卡 (R/I/A1/A2/E/B 六段) → cards/ + verified.yaml
6. **阶段3** Zettelkasten 链接 → also_read + GLOSSARY.md
7. **阶段4** 压力测试 → 触发/路由 + 实际输出核对
8. **阶段5** 编译交付 → cangjie.py compile (pack模式)

### 合法开放证据法
所有典籍均为受版权保护的商业书籍，未直接蒸馏原文。采用以下合法开放证据层级：
- **NCBI Bookshelf (NBK)**: 美国国立卫生研究院开放书籍章节
- **PubMed Central (PMC)**: 开放获取学术论文
- **作者官方开放内容**: 作者官网公开文章、博客、访谈逐字稿
- **权威机构指南**: NICE、SAMHSA、APA、WHO 等公开临床指南

每个能力卡 R 段引用具体开放证据文件+行号，manifest.json 标注 `substitute_notice`（合法开放同主题权威底本，非目标商业畅销书原文）。

### 能力卡 RIA++ 六段
- **R — Reading**: 原文引用 ≤150字，标注证据文件+行号
- **I — Interpretation**: 用自己的话重写核心骨架
- **A1 — Application Example**: 书中案例或明确标记的合成演练
- **A2 — Future Trigger**: 触发场景 + 语言信号 (中英双写) + 与相邻能力区分
- **E — Execution**: 可执行步骤 + 输入/输出契约 + 完成标准
- **B — Boundary**: 反场景 + 失败模式 + 安全红线

## 质量保证

- ✅ 22/22 本书通过 cangjie.py compile 编译
- ✅ 155 张能力卡全部 R/I/A1/A2/E/B 六段完整
- ✅ 全部能力卡 R 段引用可追溯到具体开放证据文件+行号
- ✅ 2 名独立审查员交叉审查，所有阻断级问题已修复
- ✅ 心理/创伤类能力卡均含安全红线（不替代专业医疗）
- ✅ 占星类能力卡标注 is_actionable=false（象征反思层）

## 使用方法

编译后的技能包可直接喂给 Agent 使用：
1. 将 `compiled-skills/<cluster>/<book>/` 目录放入 Agent 的 skills 目录
2. 来源路由入口 (`*-source-router/SKILL.md`) 根据用户意图路由到具体能力卡
3. 晋级 Skill (promoted) 可独立触发使用

能力卡可通过 `cangjie.py compile` 重新编译：
```bash
python3 scripts/cangjie.py compile \
  --bundle capability-bundles/<cluster>/<book> \
  --out <output_dir> \
  --output pack \
  --allow-over-budget
```
