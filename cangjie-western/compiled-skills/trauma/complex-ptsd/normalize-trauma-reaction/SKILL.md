---
name: normalize-trauma-reaction
description: |
  当用户因创伤后症状 (闪回/噩梦/易怒/回避) 自我攻击、自责"我太脆弱/我不正常"， 或伴侣把对方的创伤反应误解为"针对我/不爱我"时使用。心理教育：这些是对异常经历的 正常适应反应，不是疯了或软弱。不用于淡化真实功能损害；不阻止必要的专业转介。
metadata:
  cangjie.generated-by: cangjie-tools v2.5.0
  cangjie.capability-id: cap.complex-ptsd.normalize-trauma-reaction
  cangjie.capability-revision: 1
  cangjie.bundle-id: bundle.complex-ptsd
  cangjie.source-title: "Complex PTSD: From Surviving to Thriving"
  cangjie.tags: psychoeducation, normalization, stigma, alliance
---
# 创伤反应正常化（去病理化同盟）

## R — 原文行号偏移 (Reading, line-anchored)
- raw/full_text_open/NBK207191_numbered.txt L00007–L00007: “This chapter begins with an overview of common responses, emphasizing that traumatic stress reactions are normal reactions to abnormal circumstances. It highlights common short- and long-term responses to traumatic experiences in the context of individuals who may seek behavioral health services. Th …”
- raw/full_text_open/NBK207191_numbered.txt L00012–L00012: “Initial reactions to trauma can include exhaustion, confusion, sadness, anxiety, agitation, numbness, dissociation, confusion, physical arousal, and blunted affect. Most responses are normal in that they affect most survivors and are socially acceptable, psychologically effective, and self-limited.  …”
- raw/full_text_open/NBK207191_numbered.txt L00126–L00126: “ASD represents a normal response to stress. Symptoms develop within 4 weeks of the trauma and can cause significant levels of distress. Most individuals who have acute stress reactions never develop further impairment or PTSD. Acute stress disorder is highly associated with the experience of one spe …”

## I — 义理与心理学对齐 (Interpretation)
创伤后出现的疲惫、混乱、悲伤、焦虑、麻木、解离、躯体唤起等，绝大多数是普通人面对异常处境时的**正常应激谱**，而非‘此人脆弱/变坏/矫情’。这与现代创伤心理学的‘反应—事件匹配’观一致：判断异常与否要看相对于‘暴露于何种事件’，而不是拿无创伤人群的稳态当唯一基线。在心镜关系诊断里，它充当**解释层降压器**——先摘除道德评判，关系中的一方才听得见后续建议。注意正常化≠保证没事：阈下症状也可能显著损害功能(L110)，正常化必须与风险筛查并行。

## A1 — 判定算法与 AST 证明节点
**算法步骤**
  S1 采集事件暴露：是否存在一次性/多次/长期重复的异常事件及其时间
  S2 采集反应谱：情绪/躯体/认知/行为四域是否出现应激反应
  S3 匹配判定：反应能被‘异常事件’合理解释且未达功能崩溃→进入正常化；若功能持续受损→转 complex-profile
  S4 输出正常化陈述并同步做自伤/自杀快速筛查

**AST 判定节点**
```
MATCH(has_event E, reaction_set R): IF E.present AND R⊂normal_stress_spectrum AND function_impairment<PERSISTENT THEN route=NORMALIZE; ELIF impairment≥PERSISTENT THEN route=complex-trauma-profile; ALWAYS run safety_screen
```

## A2 — 业务场景与 NVC 提示 ★
**心镜关系场景**
1. 伴侣哭诉‘我是不是疯了/我是不是坏妻子’
2. 幸存者因麻木、易怒而自责
3. 家人不理解‘这么久了为什么还走不出来’

**非暴力沟通(NVC)落地话术**
NVC四步：①观察(只说事件与反应事实,不评价)‘那次之后你一直睡不好、容易惊跳’；②感受‘这让你又累又怕’；③需要‘你需要先确认这些反应是正常的、你不是坏掉了’；④请求‘我们一起花十分钟了解创伤后的正常反应,好吗’。禁止说‘你想太多/你要坚强’。

## E — 正反测试用例 (Evidence)
- 正向命中:
- 被家暴后长期失眠、一听关门声就抖→正常化命中,标注高唤起属正常应激
- B红线抵消/反向:
- 已连续数月无法工作+频繁解离→正常化被红线抵消,转复杂创伤画像并评估转介
- 噪声防误判:
- 只是加班两天没睡好、无异常事件→噪声,不套用创伤框架
- 安全/仲裁红线:
- 正常化陈述后仍要问自伤/自杀,绝不因‘看起来稳定’跳过筛查(L83)

## B — 失效红线 (Boundary) ★
- 不得用正常化淡化明确的功能崩溃或危险,禁止‘大家都这样会过去的’式安慰
- 文化误判红线:某些文化中的解离样体验不必然是症状(L62),不强行套病理
- 观察不到任何异常事件却被要求‘按创伤解释’时,不臆造创伤史
