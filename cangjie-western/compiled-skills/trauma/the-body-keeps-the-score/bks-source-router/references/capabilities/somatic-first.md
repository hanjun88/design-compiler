# 躯体首发信号识别

## R — 原文（Reading，行号程序抽取·逐字可回链）
来源 `raw/full_text_open/NBK207192_numbered.txt`（public domain (SAMHSA TIP57)）
- raw/full_text_open/NBK207192_numbered.txt L00233–L00245: ### Effects of Trauma and Traumatic Stress Reactions on Quality of Life, Health, and Functioning Trauma, in and of itself, appears to have negative effects on quality of life and health, although trauma is not as well researched as the effects of PTSD on these outcomes. NCS-R data indicate that trau …

## I — 义理与心理学对齐（Interpretation）
创伤与PTSD与多种躯体健康问题相关:多数躯体疾病关联可归因于反复创伤暴露(头痛除外);机制含生理差异(高唤起)与自我照护恶化并存。因此'查不出原因'不等于'没事'也不等于'全是心理'。身心两线并行是正确姿势。

## A1 — 判定算法与 AST 证明节点
1) 躯体主诉是否已做过器质排查(未做→先转诊);2) 是否存在创伤暴露史与高唤起症状;3) 两类信息并行呈现给医疗;4) 输出'身心并查'建议而非二选一结论。AST: complaint→(organic? trauma?)→parallel-track。

## A2 — 业务场景与 NVC 提示
场景:对方反复胸闷心慌查不出原因。NVC: '你的身体在用它的方式说话,它不撒谎。我们既把心脏查清楚,也请创伤科看看'警报系统'是否调得太高,两条线都不落下。'

## E — 正反测试用例（正向/红线/噪声/仲裁）
| 类型 | 输入 | 期望 |
|---|---|---|
| 正向命中 | 慢性疼痛+创伤史+查无器质 | 建议身心并查 |
| 红线抵消 | 胸痛伴冷汗疑似心梗 | 先急诊排除器质,心理评估后置 |
| 噪声防误判 | 新发疼痛且无创伤史 | 不默认创伤归因,先常规排查 |
| 跨卡仲裁 | 与脑-身回路卡同时命中 | 器质排查优先级高于解释 |

## B — 失效红线（Bounding）
禁止把未排查的躯体症状解释为纯心理;禁止以创伤史覆盖急性器质事件。
