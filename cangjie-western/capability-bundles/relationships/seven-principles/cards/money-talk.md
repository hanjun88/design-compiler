# 金钱对话的'我们对问题'重构

## R — 原文（Reading，行号程序抽取·逐字可回链）
来源 `raw/legal_open/08_talking_about_finances_a_touchy_topic_ma.txt`（gottman.com官网公开文章）
- raw/legal_open/08_talking_about_finances_a_touchy_topic_ma.txt L00007–L00015: Sam said, “Whenever we talk about money, I walk on eggshells because Charlie doesn’t trust me. I used to have a problem with online shopping. Even though I’m better now, every purchase I make gets questioned. We argue about even small things like buying sneakers for our kids.” Us against each other  …

## I — 义理与心理学对齐（Interpretation）
案例:Sam有网购历史,Charlie对他每笔消费都质疑——买孩子运动鞋都吵。机制:这对夫妻在金钱上是'我们对抗彼此'而非'我们对问题',结果负债累积、无法构建财务愿景。文章要点:①金钱关系始于童年(家庭背景+你对金钱在幸福中角色的独特看法),情绪对钱'违背逻辑'且充满控制、权力与隐藏意义;②'为什么钱这么难'的知识就是力量;③理想是婚前/同居前开放财务披露,否则尽快补做;④信任必须先于预算——被质疑的每一笔消费都在消耗信任。识别价值:金钱冲突是关系健康的仪表盘——吵钱的频率=信任账本的亏空度;解法不是记账,是重建'我们对问题'的同盟感。

## A1 — 判定算法与 AST 证明节点
1) 主题归类:本次争吵是关于钱,还是关于信任/权力/意义?;2) 溯源:各自'钱的信念'从哪来(童年脚本);3) 披露:建立全貌财务透明(收入/债务/消费/目标);4) 同盟重构:从'你乱花钱'改为'我们的预算怎么定';5) 信任先行:先约定'不被质疑的消费额度'(自主区),再谈管控;6) 共同愿景:钱为'我们的目标'(旅行/买房/教育)服务。AST: classify→origin→disclose→alliance→autonomy→vision。

## A2 — 业务场景与 NVC 提示
场景:'他买双鞋我都要过问,我知道我像监控,但我控制不住。'NVC:'你们吵的不是鞋,是账本——上次网购的信任赤字还在计息。先做两件事:第一,财务披露(把全部收入、债务、消费摊开,信息对称是信任的底料);第二,设'自主消费区'(每月一笔金额,他自由支配不报备,你也一样)。有了同盟感('我们对问题'),再谈预算;没有同盟,预算只是新战场。钱是你们的工具,不是你们的法官。'

## E — 正反测试用例（正向/红线/噪声/仲裁）
| 类型 | 输入 | 期望 |
|---|---|---|
| 正向命中 | 高频金钱冲突 | 主题归类+披露+自主区 |
| 红线抵消 | 经济控制(掐断经济=控制手段) | 走安全评估,不搞预算协商 |
| 噪声防误判 | 单纯财务知识不足(无信任问题) | 教育类建议即可 |
| 跨卡仲裁 | 与plan-partnership同命中 | 财务愿景并入关系计划 |

## B — 失效红线（Bounding）
禁止在经济控制(限制基本生活/独裁财务)语境中套'同盟重构'——那是施虐不是分歧;披露须双向自愿。
