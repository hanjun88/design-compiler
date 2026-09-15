# 共享蒸馏规范 (Shared Distillation Spec)

## 1. 方法论依据

严格遵循 cangjie-skill v2.5 RIA-TV++ 流水线:
- Skill 根目录: `/home/user/.doubao/agent_mode/workspace/.user_skills/cangjie-skill/`
- 方法论: `methodology/00-overview.md` 至 `methodology/07-stage5-deliver.md`
- 提取器: `extractors/{framework,principle,case,counter-example,glossary}-extractor.md`
- 模板: `templates/{BOOK_OVERVIEW,DIGEST,SKILL,test-prompts}.md.template`
- Schema: `schemas/capability-bundle.schema.json`

## 2. 文本来源策略 (合法开放证据法)

**目标书籍均为受版权保护的商业书籍，无法获取原文全文。** 采用以下合法开放证据层级:

1. **NCBI Bookshelf (NBK)**: 美国国立卫生研究院开放书籍章节，URL 格式 `https://www.ncbi.nlm.nih.gov/books/NBK{id}/`
2. **PubMed Central (PMC)**: 开放获取学术论文，URL 格式 `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id}/`
3. **作者官方开放内容**: 作者官网公开文章、博客、访谈逐字稿
4. **权威机构指南**: NICE、SAMHSA、APA、WHO 等公开临床指南
5. **合法公开课程讲义**: 大学开放课程 (OpenCourseWare)

**硬性规则**:
- 每个能力卡 R 段必须引用具体开放证据文件 + 行号，禁止凭记忆编造
- 在 manifest.json 中明确标注: `"substitute_notice": "合法开放同主题权威底本，非目标商业畅销书原文"`
- 置信度 (confidence) 根据证据充分性如实标注: 有直接作者原文 0.7+, 仅有间接学术证据 0.4-0.6, 证据薄弱 <0.4
- `is_actionable`: 有明确可执行步骤且证据充分 = true; 仅象征/反思层面 = false
- 证据文件保存到 `raw/legal_open/` 和 `raw/full_text_open/`，逐行编号

## 3. 每本书必须产出的文件

```
<book-dir>/
├── PIPELINE_STATE.md              # 流水线状态记录
├── BOOK_OVERVIEW.md               # 阶段0: Adler四步整书理解
├── verified.md                    # 阶段1.5: 通过三重验证的单元
├── coverage-audit.md              # 关键任务覆盖审计
├── references.md                  # 参考内容映射
├── needs-review.md                # 待核查内容
├── GLOSSARY.md                    # 阶段3: 术语词典
├── DIGEST.md                      # 阶段5: 精华长文
├── candidates/                    # 阶段1: 5类提取器产出
│   ├── frameworks.md
│   ├── principles.md
│   ├── cases.md
│   ├── counter-examples.md
│   └── glossary.md
├── rejected/                      # 淘汰单元 + 原因
├── raw/
│   ├── legal_open/                # 合法开放证据文件 (逐行编号)
│   ├── full_text_open/            # NCBI/PMC 全文
│   │   └── manifest.json
│   └── open_evidence/             # 证据索引
└── .cangjie/capabilities/
    ├── verified.yaml              # Capability Bundle (唯一编译事实源)
    ├── cards/                     # RIA++ 能力卡 (不带frontmatter)
    │   └── <slug>.md
    ├── destinations.json          # 晋级/路由去向
    └── book/
        ├── overview.md
        └── glossary.md
```

## 4. 能力卡 RIA++ 六段要求

每张能力卡 (`cards/<slug>.md`) 必须包含:

- **R — Reading**: 直接引用 ≤150字 (英文≤100词)，标注开放证据文件+行号
- **I — Interpretation**: 用自己的话重写核心骨架，5-15行
- **A1 — Application Example**: 书中案例或明确标记的合成演练
- **A2 — Future Trigger**: 场景描述 + 语言信号 (中英双写) + 与相邻能力区分
- **E — Execution**: 1-2-3步骤，每步有完成标准，输入/输出契约
- **B — Boundary**: 反场景、失败模式、作者盲点

能力元数据写入 `verified.yaml` (不写在卡片里):
```yaml
capability_id: cap.<book-slug>.<capability-slug>
revision: 1
status: active
slug: <kebab-case>
title: <中文标题>
importance: critical|high|medium|low
importance_rationale: <依据>
one_liner: <一句话决策规则>
intents: [<用户意图>]
keywords: [<中英关键词>]
also_read: []
card: cards/<slug>.md
frontmatter:
  description: <A2浓缩版 ≤300字>
  tags: [<标签>]
source_evidence:
  - source: <证据文件路径>
    lines: <行号范围>
    license: <来源类型>
```

## 5. 三重验证 (阶段1.5)

每个候选单元必须通过:
- **V1 来源充分性**: 可定位开放证据足以支持限定范围内的做法
- **V2 可执行性**: 用合法新输入能完成任务并核验结果
- **V3 任务增益**: 能减少遗漏、统一口径或稳定交付

分流: verified / reference / needs_review / rejected

## 6. 晋级门 (阶段1.6)

五条判据 (前3条必须通过，后2条至少1条):
1. 独立意图 2. 独立契约 3. 独立运行 4. 独立复用 5. 独立评测
去向: promoted (独立Skill) / router (来源路由入口内能力卡)

## 7. 已有工作的修复规则

以下书籍在 `/home/user/Doubao/chats/38440999739418114/books_concept_drafts/<id>/` 有前期工作:
- astro_composite → Synastry
- astro_transit → The Changing Sky
- vedic_jyotish_core → Light on Life
- psych_attached → Attached
- psych_body_keeps_score → The Body Keeps the Score
- psych_cptsd → Complex PTSD
- psych_hold_me_tight → Hold Me Tight
- psych_seven_principles → Seven Principles for Making Marriage Work
- psych_waking_tiger → Waking the Tiger
- psych_why_does_he_do_that → Why Does He Do That?

修复时:
1. 复制已有 raw/ 证据到新目录 (避免重复抓取)
2. 审查已有能力卡质量，补充缺失的 RIA 段落
3. 补齐缺失的流水线产出 (BOOK_OVERVIEW, GLOSSARY, DIGEST, verified.yaml)
4. 将旧格式 (registry.json) 迁移为 v2.5 格式 (verified.yaml)
5. 补充薄弱证据 (增加 NCBI/PMC/作者开放内容)

## 8. 质量红线

1. 每个能力必须通过全部三重验证
2. 每张能力卡有完整 R/I/A1/A2/E/B 六段
3. 原文引用 ≤150字/段，必须有开放证据文件+行号
4. 每个 active 能力在 destinations.json 中恰好一个去向
5. 不凭记忆蒸馏 — 无证据的能力标记为 needs_review，不进入 active
6. 占星类能力默认 is_actionable=false (象征反思层)，除非有明确的心理干预步骤
7. 心理/创伤类能力必须包含安全红线 (B段)，不替代专业医疗建议
