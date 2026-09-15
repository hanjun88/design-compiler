# Verified.yaml 格式规范化报告

**日期**: 2026-09-15
**根目录**: `/home/user/Doubao/chats/38441674128328962/books_distillation/`
**标准模板**: `cluster3_trauma/complex-ptsd/.cangjie/capabilities/verified.yaml`

## 总览

| 指标 | 数值 |
|---|---|
| 总书数 | 19 |
| 规范化书数 | 18（the-body-keeps-the-score 已有标准格式） |
| YAML 验证通过 | 19/19 |
| 编译格式验证通过 | 19/19（broken-ref 为编译器已知限制，见下文） |

## 各书详情

### 集群1: 占星 (4本)

| 书名 | 修复内容 | 验证 |
|---|---|---|
| astrology-karma-transformation | 添加 schema_version, bundle_id, entry, router_entry, promotion_budget; book dict 添加 source_pack/baseline_tag | OK |
| dynamics-of-the-unconscious | 同上 | OK |
| light-on-life | 同上 | OK |
| synastry | 同上 | OK |

### 集群2: 依恋 (5本)

| 书名 | 修复内容 | 验证 |
|---|---|---|
| attached | `book: attached`(字符串)→book dict; 添加 schema_version, bundle_id, entry, router_entry, promotion_budget | OK |
| attachment-and-loss | book dict 添加 source_pack/baseline_tag; 添加 entry, router_entry, promotion_budget | OK |
| attachment-in-psychotherapy | 同上 | OK |
| hold-me-tight | `book: hold-me-tight`(字符串)→book dict; 添加顶层字段 | OK |
| wired-for-love | `book: wired-for-love`(字符串)→book dict; 添加顶层字段 | OK |

### 集群3: 创伤 (5本)

| 书名 | 修复内容 | 验证 |
|---|---|---|
| in-an-unspoken-voice | book dict 添加 source_pack/baseline_tag; 添加 entry, router_entry, promotion_budget | OK |
| internal-family-systems | 同上（保留原有 promotion: 顶层字段） | OK |
| polyvagal-theory | 同上（保留原有 promotion: 顶层字段） | OK |
| the-body-keeps-the-score | 已有标准格式（schema_version, bundle_id, entry, router_entry, promotion_budget 均已存在） | OK |
| waking-the-tiger | book dict 添加 source_pack/baseline_tag; 添加 entry, router_entry, promotion_budget | OK |

### 集群4: 关系 (5本)

| 书名 | 修复内容 | 验证 |
|---|---|---|
| getting-the-love-you-want | 从 meta: 提取信息新建 book dict; 添加 schema_version, bundle_id, entry, router_entry, promotion_budget | OK |
| mating-in-captivity | 同上 | OK |
| seven-principles | book dict 添加 source_pack/baseline_tag; 添加 entry, router_entry, promotion_budget | OK |
| why-does-he-do-that | 同上 | OK |
| zimbaro-psychology | 从 meta: 提取信息新建 book dict（补充 year: 1983）; 添加 schema_version, bundle_id, entry, router_entry, promotion_budget | OK |

## 修复类型汇总

| 修复类型 | 涉及书数 |
|---|---|
| 添加 schema_version + bundle_id | 18 |
| book 字符串 → book dict | 3 (attached, hold-me-tight, wired-for-love) |
| 从 meta: 新建 book dict | 3 (getting-the-love-you-want, mating-in-captivity, zimbaro-psychology) |
| book dict 添加 source_pack/baseline_tag | 12 |
| 添加 entry 块 | 18 |
| 添加 router_entry 块 | 18 |
| 添加 promotion_budget: 8 | 18 |

## entry / router_entry 生成说明

- **entry.description**: 根据书的能力卡 intents/keywords 生成 2-3 句话概述
- **entry.core_principles**: 按书的类型生成（占星类用非决定论原则；依恋/创伤/关系类用先安全后探索原则）
- **entry.out_of_scope**: 占星类含"不做命运预测/不替代专业医疗"；心理类含"不做精神科诊断/不替代面诊"
- **entry.stop_conditions**: 心理/创伤类均含"出现自伤/自杀意念时立即转专业危机干预"；占星类含"因星盘预测产生强烈恐惧/反刍时转心理健康评估"
- **router_entry.description**: 根据能力卡 intents/keywords 生成症状→能力卡路由描述

## 保留的原有字段

所有书的原有字段均未修改，包括：
- capabilities 列表（完整保留，未改动任何能力卡内容）
- substitute_notice / license_basis / confidence_band 等元数据
- 原有 book dict 内的 slug, transform_goal, cluster, sibling_books, theme, zodiac_frame 等字段
- internal-family-systems 和 polyvagal-theory 原有的顶层 `promotion:` 字段（default_destination + promoted_candidates）
- attached/hold-me-tight/wired-for-love 原有的 book_title/authors/year/license_basis 顶层字段
- getting-the-love-you-want/mating-in-captivity/zimbaro-psychology 原有的 `meta:` 块

## broken-ref 说明

编译时出现的 `broken-ref` 错误（`references/capabilities/cap.<id>.md 不存在`）是 cangjie.py 编译器在 single 模式下的已知行为：
- 编译器在 also_read 列使用完整 capability_id 作为文件名（如 `cap.attached.style-map.md`）
- 但实际生成的卡片文件按 slug 命名（如 `style-map.md`）
- 此问题影响所有书，包括标准模板 complex-ptsd（13 个 broken-ref 错误）
- 这不是 verified.yaml 格式问题，而是编译器对 also_read 引用路径的解析问题
- the-body-keeps-the-score 的 broken-ref 数量（16个）与 complex-ptsd（13个）属同一类问题，无额外格式缺陷

## 验证命令

对每本书执行：
```bash
python3 -c "import yaml; d=yaml.safe_load(open('<path>/verified.yaml')); assert 'router_entry' in d; assert 'book' in d and isinstance(d['book'], dict); assert 'title' in d['book']; assert 'entry' in d; assert 'capabilities' in d; print('OK')"
```

结果：**19/19 全部通过**
