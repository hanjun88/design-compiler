---
name: four-f-trauma-typology
description: |
  当用户描述自己或伴侣在冲突/亲密中反复出现固定模式——讨好息事宁人 (fawn)、停不下来忙碌 (flight)、退缩消失 (freeze)、必须占上风 (fight)——时使用。识别 4F 主导类型并指出互补康复方向。 不用于贴人格障碍标签；不用于现实暴力关系中单方面建议反抗。
metadata:
  cangjie.generated-by: cangjie-tools v2.5.0
  cangjie.capability-id: cap.complex-ptsd.four-f-trauma-typology
  cangjie.capability-revision: 1
  cangjie.bundle-id: bundle.complex-ptsd
  cangjie.source-title: "Complex PTSD: From Surviving to Thriving"
  cangjie.tags: cptsd, 4f, defense, typology, codependency, trauma
---
# 4F 创伤类型识别与互补康复

## R — 原文（Reading，逐字引用·绑物理行号）
来源 `raw/legal_open/10_the_fourf_s_a_trauma_typology.txt`：
- L66：四种防御"develop out of our instinctive Fight, Flight, Freeze and Fawn responses to severe abandonment and trauma (…the 4Fs)…specializing in narcissistic (fight), obsessive/compulsive (flight), dissociative (freeze) or codependent (fawn) defenses."
- L67：足够好的养育者成年后"have appropriate access to all of their 4F choices"（战立边界、逃以避险、僵在徒劳时放手、讨好则在"play-space"中灵活）。
- L70：四种固着都是"a strategy to purchase some illusion or modicum of attachment"，并因此对真正亲密矛盾——深关系易触发情绪闪回。
- Fight（L72-L77）：相信"power and control can create safety"；以轻蔑/暴怒胁迫他人成为自己的延伸（L73）；与其它类型不同，fight 型把内在批判者的完美主义**投射到他人**（L77）；康复需学会把被弃感先感受而非转成暴怒，并补足互补的 fawn（共情他人，L77）。
- Flight（L78-L80）：启动键像卡在"on"，相信完美带来安全与被爱，以持续忙碌象征性逃离，易工作狂/忙碌成瘾/肾上腺成瘾。
- （Freeze 解离型、Fawn 共依赖/讨好型定义见 L66；fawn 的"over-listening, over-eliciting or overdoing for the other…never risking real self-exposure"见 L70；另见 `04_codependency_fawn_response.txt`。）

## I — 义理与心理学对齐（含 UPIV V1.4 六维）
- **机制**：4F 是脊椎动物防御级联（fight/flight/freeze 为经典防御，Walker 增补 fawn=人类社会化的"讨好求附"）。创伤使其从"可灵活切换的工具箱"固化为"单一默认人格防御"，代价是亲密能力受损。
- **循证对齐（OA）**：fight/flight/freeze 与多迷走理论的交感动员/背侧迷走僵住对应（见 psych_waking_tiger/oa_papers/PMC5835127）；fawn 与"取悦/从属求安全"及共依赖文献互证（psych_codependent_no_more/oa_papers）。ICD-11 CPTSD 的 DSO"关系紊乱/负性自我概念"可统摄四型的关系表现。
- **六维画像**见 frontmatter；核心区分轴：**控制维度**（fight 过高支配 ↔ freeze/fawn 过低）、**边界维度**（fight 过刚侵入 ↔ fawn 消融自我）、**回避维度**（flight/freeze 高）。健康=六维不过极且四型可灵活切换。

## A1 — 判定算法与 AST 证明节点
```
classify_4f(profile):   # profile 为六维[0..1]+行为标记
  # 先排共病/混合型：允许主次双型(primary+secondary)
  score = {
   fight:  w(control高, boundary侵入, anger_externalize, critic_projected_to_others),
   flight: w(avoidance高, busyness, perfectionism, adrenalizing, 难静止),
   freeze: w(avoidance高, withdrawal, dissociation, low_control, 隐匿/白日梦),
   fawn:   w(boundary低, control低, people_pleasing, over_serving, conflict_avoid, self_erasure)}
  order = top2(score)          # 主型+次型
  IF max(score) < 0.5: RETURN {type:"flexible/healthy-repertoire"}   # L67 健康基准
  complementary = {fight:"fawn(共情/让步)", flight:"freeze(允许静止)",
                   freeze:"fight(自我主张)", fawn:"fight(立边界/说NO)"}[order.primary]
  RETURN {primary:order.primary, secondary:order.secondary,
          grow_toward:complementary,
          upiv_overreach: 列出越过0.8/低于0.2的维度}
```
- AST 证明节点：① 健康基准判定必须存在（L67，避免把正常人误判为创伤型）；② fight 的"批判者投射他人"（L77）是 fight 与其它三型的判别式（其它型批判向内）；③ 康复方向恒为"互补极"，有向且可检验（如 fawn→练习 assertiveness 后 boundary 维度应上升，可前后测）。

## A2 — 业务场景与 NVC 提示
触发语："我一吵架就讨好/立刻讨好息事宁人（fawn）｜我停不下来、一闲就焦虑（flight）｜我只想躲起来消失（freeze）｜我必须压过对方才安心（fight）"。
- **fawn（关系最高频）**：NVC 自我主张四步替代过度服务——观察事实→表达"我"的感受与需要→提出具体请求；练习说"不"而不解释过度。话术："我注意到我又想替你把一切做好（观察）；我其实有点委屈（感受）；我也需要被照顾（需要）；这件事这次我想先顾自己（请求）。"
- **fight**：触发后先 self-timeout（L77），把被弃感命名再表达，禁止轻蔑与胁迫性话术。
- **flight**：安排"允许静止"窗口，把忙碌与价值解绑。
- **freeze**：低强度、小步激活身体与社会接触，不强迫其立刻表态。

## E — 正反测试用例
1. 正命中 fawn：冲突即道歉、把对方需要置于自身之前、说不出自己要什么、boundary≈0.15/control≈0.2 → primary=fawn，grow_toward=fight(立界)。
2. 正命中 fight：必须占上风、批判都指向伴侣、用愤怒换安全、control≈0.9/boundary 侵入 → fight，并识别"批判者投射"判别式。
3. 健康反例（噪声）：能在不同情境恰当坚持、退让、暂停与合作，max(score)<0.5 → flexible，不下病理标签（对应 L67）。
4. 跨卡联动：fawn 型同时发生情绪闪回 → 先 `emotional-flashback-13-steps` 降唤起，再用本卡做类型康复，顺序不可颠倒（高唤起下无法练边界）。
5. 混合/冲突仲裁：fight+fawn 双极摇摆（对强讨好、对弱控制）→ 输出主次双型与各自 grow_toward，不强行单一归类。

## B — 失效红线
- 4F 是**倾向连续谱**不是人格定罪；禁止据此给用户/伴侣贴"自恋型人格障碍"等临床诊断标签（Walker 的 narcissistic defense ≠ NPD）。
- 现实暴力关系中，对 freeze/fawn 型不可只建议"你要 assert/反抗"而不做安全规划（可能激化施害者风险）。
- 文化差异：集体主义情境中的顾他/和谐取向不等于 fawn 病理，须看是否伴随自我消融、羞耻与恐惧。
- 互补康复不是消灭主型（战/逃/僵本身有适应价值，L67），目标是恢复四种反应的可及性与灵活性。
- 置信度 0.83：类型学为作者临床框架 + I 层机制互证；它是自我理解与干预向导，不替代结构化临床评估。
