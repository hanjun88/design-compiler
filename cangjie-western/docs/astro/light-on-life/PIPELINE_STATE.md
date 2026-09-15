# PIPELINE_STATE — light-on-life

- book: Light on Life (Hart de Fouw & Robert Svoboda, 1995)
- mode: REPAIR from vedic_jyotish_core draft
- pipeline: cangjie v2.5 RIA-TV++
- current_stage: stage4-complete (repair)
- updated: 2026-09-15

## 进度
- [x] 阶段0 Adler 整书理解 → BOOK_OVERVIEW.md
- [x] 阶段1 五提取器候选 → candidates/*.md
- [x] 阶段1.5 三重验证 → verified.md / coverage-audit.md / references.md / needs-review.md / rejected/
- [x] 阶段1.6 晋级门 → destinations.json
- [x] 阶段2 RIA++ 六段能力卡 → .cangjie/capabilities/cards/*.md（6张，无 frontmatter）
- [x] 阶段3 Zettelkasten 链接 → GLOSSARY.md + book/glossary.md + also_read
- [x] 阶段4 压力测试（象征层读卡核验）→ 见各卡 E/B 段
- [x] 阶段5 编译事实源 → .cangjie/capabilities/verified.yaml（registry.json 已迁移）

## 能力卡清单（6）
1. bphs-sidereal (critical, promoted) — 恒星黄道/Lahiri 坐标地基
2. nine-graha (critical, promoted) — 九曜心理原型
3. nakshatra-27 (high, promoted) — 二十七宿潜意识动机
4. d9-navamsha (high, promoted) — D9 内在真实自我
5. yogas (high, router) — Yoga 人格配置
6. ashtakoota (medium, router) — Ashtakoota 对话清单

## 修复要点
- 将通用吠陀术语对齐 de Fouw/Svoboda 心理原型框架：Graha=心理原型节点、Nakshatra=潜意识动机脚本、Yoga=天赋/挑战配置、D9=外在 vs 内在真实自我。
- 旧卡片去 frontmatter（v2.5：frontmatter 入 verified.yaml）。
- 补 E 段（可执行步骤+输入输出契约）与 B 段（反场景/失败模式/安全红线）。
- registry.json → verified.yaml；新增 substitute_notice。
- is_actionable 全部 false（占星象征层）；置信带 [0.37,0.39]。
- A1 案例均明确标记为合成演练（未取得原著）。

## 断点续跑
从本文件恢复。证据在 raw/legal_open/（7 个吠陀底本）。
