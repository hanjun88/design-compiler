# PIPELINE_STATE — synastry

- book: Synastry (Stephen Arroyo, 1975)
- mode: REPAIR from astro_composite draft
- pipeline: cangjie v2.5 RIA-TV++
- current_stage: stage4-complete (repair)
- updated: 2026-09-15

## 进度
- [x] 阶段0 Adler 整书理解 → BOOK_OVERVIEW.md
- [x] 阶段1 五提取器候选 → candidates/*.md
- [x] 阶段1.5 三重验证 → verified.md / coverage-audit.md / references.md / needs-review.md / rejected/
- [x] 阶段1.6 晋级门 → destinations.json
- [x] 阶段2 RIA++ 六段能力卡 → .cangjie/capabilities/cards/*.md（7张，无 frontmatter）
- [x] 阶段3 Zettelkasten 链接 → GLOSSARY.md + book/glossary.md + also_read
- [x] 阶段4 压力测试（象征层读卡核验）→ 见各卡 E/B 段
- [x] 阶段5 编译事实源 → .cangjie/capabilities/verified.yaml（registry.json 已迁移）

## 能力卡清单（7）
1. synastry-dialogue-chart (critical, promoted) — 比较盘两体对话【新增】
2. composite-third-entity (critical, promoted)
3. composite-sun-moon (critical, promoted)
4. composite-aspect-dynamics (high, promoted)
5. composite-symbolic-non-determinism (critical, promoted)
6. composite-ascendant (high, router)
7. composite-house-emphasis (medium, router)

## 修复要点
- 补比较盘(Synastry)主线：新增 synastry-dialogue-chart 卡（原草稿只覆盖组合盘）。
- 旧卡片去 frontmatter（v2.5：frontmatter 入 verified.yaml，卡片只留 R/I/A1/A2/E/B 六段）。
- 补 E 段（可执行步骤+输入输出契约）与 B 段（反场景/失败模式/安全红线）。
- registry.json → verified.yaml；新增 substitute_notice。
- is_actionable 全部 false（占星象征层）；置信带 [0.36,0.40]。

## 断点续跑
从本文件恢复。证据在 raw/legal_open/（4 个开放底本）。
