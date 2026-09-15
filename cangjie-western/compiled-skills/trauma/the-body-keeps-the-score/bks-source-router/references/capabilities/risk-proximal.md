# 近端风险因子筛查

## R — 原文（Reading，行号程序抽取·逐字可回链）
来源 `raw/full_text_open/NBK207192_numbered.txt`（public domain (SAMHSA TIP57)）
- raw/full_text_open/NBK207192_numbered.txt L00199–L00206: - A history of prior trauma - Problems with behavioral health prior to the trauma (including preexisting mental disorders) - A family history of behavioral health disorders - A perceived threat to one’s life during the traumatic event - Perceived social support following the trauma - Intensely negat …

## I — 义理与心理学对齐（Interpretation）
越贴近事件本身的因子预测越强:对生命威胁的感知、围创伤解离、创伤后社会支持、即时强烈负性情绪(恐惧/无助/羞耻),加上既往创伤史与创伤前行为健康问题。它们是'要不要早介入'的客观标尺,且全部去责备化。

## A1 — 判定算法与 AST 证明节点
逐项核查: 生命威胁感知Y/N、围创伤解离Y/N、创伤后支持低/高、即时负性情绪强烈度、既往创伤史Y/N。命中≥3项→建议早期评估;命中围创伤解离→单列高危标记。输出为筛查建议而非诊断。AST: factors→weight→early-intervention。

## A2 — 业务场景与 NVC 提示
场景:亲友经历车祸后解离、说'当时我已经死了'。NVC: '你当时感到自己可能活不下来,这对任何人的身体都是最重的信号。你现在愿意先见评估师聊聊吗?不是为了翻旧账,是为了让身体别一直停在警报。'

## E — 正反测试用例（正向/红线/噪声/仲裁）
| 类型 | 输入 | 期望 |
|---|---|---|
| 正向命中 | 事故后出现解离+生命威胁感知+支持不足 | 建议早期专业评估 |
| 红线抵消 | 对方拒绝且情绪极不稳定 | 不强迫,先提供安全支持通道 |
| 噪声防误判 | 仅一次失眠无其他因子 | 不触发高危筛查建议 |
| 跨卡仲裁 | 同时命中自伤风险卡 | 自伤卡risk_floor更高,优先危机处置 |

## B — 失效红线（Bounding）
筛查≠诊断;因子命中不构成病理标签;禁止据此预测个体必然发展PTSD。
