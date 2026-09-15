# 激情消退与情感外遇

## R — 原文（Reading，行号程序抽取·逐字可回链）
来源 `raw/legal_open/10_passion_and_romance_in_marriage_how_it_g.txt`（gottman.com官网公开文章）
- raw/legal_open/10_passion_and_romance_in_marriage_how_it_g.txt L00011–L00011: Most relationships begin with gelato, and then evolve into true intimacy and love. With infatuation, you’re projecting your ideal lover onto someone who seems like the right fit, but once the real life intrudes, that projection fades. In a long-term relationship, intimacy develops as you see your pa …
- raw/legal_open/10_passion_and_romance_in_marriage_how_it_g.txt L00015–L00015: When bottled-up feelings seek a release, people might seek support from a co-worker or a friend who will listen compassionately. Sometimes when friends get together, the conversation turns to the ways their partner goofed up, let them down, or was clueless, and camaraderie begins—a kind of misery-lo …
- raw/legal_open/10_passion_and_romance_in_marriage_how_it_g.txt L00019–L00019: At this juncture, some partners come to couples counseling because either the emotional affair has been revealed or because mutual unhappiness leads one partner to suggest counseling. If the emotional affair has not been revealed and in fact is continuing, then counseling will most likely be doomed. …

## I — 义理与心理学对齐（Interpretation）
激情三阶段:初期是'凝胶甜筒'(理想投射——把完美恋人投射到对方身上);现实侵入后投射消退,长期关系里亲密来自看见对方的缺陷仍选择在一起、一起扛过困难后深化。危机机制:当压抑的感受寻求释放,人会向外找'慈悲的听众'——同事、朋友,甚至演变成'同病相怜的伴侣贬低'(misery-loves-company partner-bashing),用言语强化伴侣的'迟钝无能',负性思维挤走吸引力。一旦情感外遇开始且未曝光,婚姻咨询多半注定失败——性化的'聆听者'无条件附和,婚姻的旧账难以竞争。识别价值:激情消退不是终点,是转向信号;向外倾诉是警报,向内对话才是灭火。

## A1 — 判定算法与 AST 证明节点
1) 识别阶段:我们处在投射期/真实亲密期/消退期;2) 扫雷:我/他最近在向谁倾诉婚姻不满?内容是否开始贬低伴侣?3) 拦截:把'向外倾诉'转为'向内对话'(写'我需要你听见'清单);4) 重建激情:不是靠浪漫周末,而是'一起克服一个小挑战+看见真实缺陷仍选择靠近';5) 设底线:情感外遇一旦发生且持续,咨询基本无效——先面对真相。AST: stage→radar→intercept→rebuild→boundary。

## A2 — 业务场景与 NVC 提示
场景:'我们各忙各的,他最近总跟女同事聊到很晚,聊的都是家里的事。'NVC:'先看清机制:婚姻里没被听见的话,会自己找耳朵。他不是突然变心,是你们的对话通道在关机,他找了别的接收器。两步走:第一,今晚启动'向内对话'——告诉他'我有话需要你听见,不需要解决,只需要你在';第二,一起划边界——外遇的种子是持续性的私下倾诉,你们要约定'婚姻内的事先回婚姻内谈'。激情不是等来的,是把投射换成真实靠近后长出来的。'

## E — 正反测试用例（正向/红线/噪声/仲裁）
| 类型 | 输入 | 期望 |
|---|---|---|
| 正向命中 | 激情消退+外倾诉倾向 | 向内对话+边界+重建实验 |
| 红线抵消 | 已确认实质出轨/隐瞒 | 先真相后修复,不做预防话术 |
| 噪声防误判 | 正常社交性倾诉(无贬低) | 不泛化定罪 |
| 跨卡仲裁 | 与repair-recovery同命中 | 未曝光走预防,已曝光走修复 |

## B — 失效红线（Bounding）
禁止在无证据时指控外遇;禁止用'激情理论'为出轨开脱;情感外遇持续时咨询无效的判断须诚实告知。
