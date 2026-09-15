# 解离识别与回收

## R — 原文行号偏移 (Reading, line-anchored)
- raw/full_text_open/NBK207191_numbered.txt L00057–L00058: “Dissociation is a mental process that severs connections among a person’s thoughts, memories, feelings, actions, and/or sense of identity. Most of us have experienced dissociation—losing the ability to recall or track a particular action (e.g., arriving at work but not remembering the last minutes o …”
- raw/full_text_open/NBK207191_numbered.txt L00059–L00063: “- Sudden flattening of affect - Responses not congruent with the present context or situation - Excessive intellectualization The characteristics of DID can be commonly accepted experiences in other cultures, rather than being viewed as symptomatic of a traumatic experience. For example, in non-West …”

## I — 义理与心理学对齐 (Interpretation)
解离是切断思维、记忆、情感、行动或身份联结的心理过程(L57);经历严重/发育性创伤者学会把自己从痛苦中剥离以求生,可非常弥散(L58)。外显信号包括情感突然扁平、反应与当下情境不符、过度理智化(L59-61)。长期后果是难以与自身经验和他人保持联结(L63)。关系诊断里,解离常被伴侣误判为‘冷淡/不在乎/冷暴力’,实为防御性‘离线’,干预方向是温和回收注意而非施加关系压力。

## A1 — 判定算法与 AST 证明节点
**算法步骤**
  S1 三信号扫描:情感骤平/反应与场域不符/过度理智化
  S2 命中≥2→判解离,降低语速与信息量
  S3 用身体锚点回收:双脚踩地、手持凉物、说出姓名与地点
  S4 连贯恢复后再继续,并向伴侣解释这是生理保护非态度

**AST 判定节点**
```
signals=[flat_affect,mismatched_response,intellectualization]; IF count(signals)>=2 THEN state=DISSOCIATED; DO reorient UNTIL coherence; PARTNER relabel=defense NOT coldness
```

## A2 — 业务场景与 NVC 提示 ★
**心镜关系场景**
1. 吵架到一半对方眼神发直、开始讲大道理
2. 被批评时忽然‘灵魂出窍’般平静
3. 伴侣抱怨‘你从来都不在场’

**非暴力沟通(NVC)落地话术**
对解离者:轻声、单句、可执行‘把脚放平踩在地上,感受鞋底;说出你现在在哪。’ 对其伴侣(事后):‘他当时不是在拒绝你,是神经系统在保护他离线,我们可以学会一起把他接回来。’

## E — 正反测试用例 (Evidence)
- 正向命中:
- 冲突中突然面无表情+大段理智化→判解离,停火做回收
- 关系里反复‘人在心不在’→识别为创伤性抽离
- B红线抵消/反向:
- 对方明确说‘我不想谈’且保持清晰一致→是设置边界而非解离,尊重边界
- 噪声防误判:
- 疲劳走神→提醒即回、无情感扁平与不符反应,不算解离
- 安全/仲裁红线:
- 文化背景下被接纳的附体/替代性存在体验不直接判症状(L62);伴现实检验丧失则转介

## B — 失效红线 (Boundary) ★
- 不把解离当冷战而惩罚、不逼其当场表态
- 文化敏感,避免把常态灵性体验病理化
- 频繁/长时间解离指向复杂创伤,转 complex-trauma-profile
