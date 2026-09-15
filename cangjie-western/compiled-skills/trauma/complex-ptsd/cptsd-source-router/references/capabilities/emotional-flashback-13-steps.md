# 情绪闪回发作时的13步当下化处置

## R — 原文（Reading，逐字引用·绑物理行号）
来源：`raw/legal_open/11_13_steps_flashbacks_management.txt`（作者官网公开 PDF，文末 L90："Pete Walker, from the book Complex PTSD: From Surviving to Thriving"）
- L2 `1. Say to yourself: "I am having a flashback".`
- L5-L6 `The feelings and sensations you are experiencing are past memories that cannot hurt you now.`
- L7-L8 `2. Remind yourself: "I feel afraid, but I am not in danger!" "I am safe now, here in the present."`
- L11 `3. Own your right and need to have boundaries.` …L13 `you are free to leave dangerous situations and protest unfair behavior.`
- L15 `4. Speak reassuringly to the Inner Child.`
- L19 `5. Deconstruct eternity thinking.` …L21-L22 `Remember the flashback will pass as it has many times before.`
- L23 `6. Remind yourself that you are in an adult body`（L24 你现在拥有童年没有的 allies/skills/resources）。
- L26-L45 `7. Ease back into your body.`：逐肌群放松、深慢呼吸、慢下来、找安全处所、"在身体里感受恐惧而不对它反应"（L43-L45）。
- L46-L61 `8. Resist the Inner Critic's Drasticizing and Catastrophizing`：thought-stopping（L47-L51）、拒绝羞耻/恨/抛弃自己（L52-L53）、thought-substitution 用预设的优点清单替换负面思维（L57-L61）。
- L62-L67 `9. Allow yourself to grieve.`（眼泪→自我慈悲，愤怒→自我保护）。
- L69-L73 `10. Cultivate safe relationships and seek support.`（需要时独处，但别让羞耻孤立你）。
- L74-L77 `11. Learn to identify the triggers that lead to flashbacks.`
- L78-L82 `12. Figure out what you are flashing back to.`
- L83-L89 `13. Be patient with a slow recovery process.`（"two steps forward, one step back"，不要因一次闪回而攻击自己）。

## I — 义理与心理学对齐（Interpretation，含 UPIV V1.4 六维）
- **机制**：情绪闪回 = 被触发后退行（regression）到童年受困状态，杏仁核劫持、前额叶失活、时间感坍缩为"永恒化（eternity thinking, Step5）"。13 步的本质是按"认知命名→安全重估→边界→躯体着陆→批判者抑制→哀悼→社会缓冲"的顺序逐项重建前额叶调控。
- **循证对齐（OA，非原书）**：命名情绪即 affect labeling 可降低杏仁核反应（Lieberman 范式，心镜 I 层通用证据）；缓慢呼吸/肌肉放松经迷走神经下调唤起（与 psych_waking_tiger 多迷走理论互证，见其 oa_papers/PMC5835127）；社会缓冲（Step10）对应依恋安全基。
- **UPIV V1.4 六维作用向量**（v_psych∈[0,1]^6 = [焦虑,回避,边界,阻抗,烈度,控制]）：
  - 发作基线画像：焦虑↑≈0.85、烈度↑≈0.85、控制↓≈0.2、边界↓≈0.3、阻抗↑（对抗/逃避）≈0.7、回避视类型而定。
  - 13 步目标向量：焦虑↓≤0.4、烈度↓≤0.4、控制↑≥0.7、边界↑≥0.65、阻抗↓≤0.4。
  - 分步主作用：Step1-2 降焦虑/烈度；Step3、6 升边界/控制；Step7 降烈度（迷走）；Step8 降阻抗与内在攻击；Step9-10 降回避与孤立；Step11-13 防复发、稳定控制。

## A1 — 判定算法与 AST 证明节点（Algorithm / AST）
判定"此刻是否为情绪闪回（而非现实危险）"的确定性决策树（供规则引擎，不交给 LLM 计算）：
```
detect_emotional_flashback(obs):
  # obs: {present_threat_level[0..1], arousal[0..1], time_orientation, inner_critic_active, trigger_match}
  IF obs.present_threat_level >= 0.6: RETURN {is_flashback:false, route:"real_danger_safety_plan"}  # B红线:现实危险不走自我安抚
  arousal_spike = obs.arousal >= 0.7
  time_regress  = obs.time_orientation == "past/eternal"
  no_current_cause = obs.present_threat_level < 0.4
  IF arousal_spike AND time_regress AND no_current_cause:
      RETURN {is_flashback:true, confidence:0.86,
              protocol:"13_STEPS", order:[name_it,safety_now,boundary,inner_child,
                       de_eternize,adult_body,body_grounding,resist_critic,
                       grieve,safe_relation,identify_trigger,trace_source,patience]}
  RETURN {is_flashback:false}
```
- AST 证明节点（每步完成判据，可单测）：`name_it→arousal-`；`safety_now(威胁<0.4且用户复述"现在安全")→焦虑-`；`body_grounding(呼吸频率下降/肌群放松自评)→烈度-`；`resist_critic(完成一次thought-stop)→阻抗-`；六维目标向量未达阈则重复 Step7/8 而非升级到 Step10。
- 终止判据：六维中焦虑与烈度同时回落到 ≤0.45 维持 3 分钟，判定一次处置闭环。

## A2 — 业务场景与 NVC 提示（Future Trigger）
触发语："我突然崩溃但其实没发生大事/莫名的恐惧羞耻涌上来/又像回到小时候/对方一句话我瞬间炸或僵住"。
- **场景① 一对一陪伴/咨询**：先不分析关系对错，先带用户走 Step1-2、Step7 着陆，再谈内容。
- **场景② 心镜对话系统检测到用户闪回**：暂停"影子前任"对抗脚本，切换到安全现在协议（与占星/八字引擎的仲裁：只要 is_flashback=true，命理引擎标签让位于心理降唤起，见工程规范§3）。
- **NVC 陪伴话术（自我/对他者）**：观察（"刚才那句话之后，我的心跳和恐惧一下上来了"）→感受（"我现在很害怕、很想逃"）→需要（"我需要先确认自己是安全的、需要几分钟"）→请求（"我先做几次深呼吸，10 分钟后我们再聊，可以吗"）。

## E — 正反测试用例（Eval，含噪声/红线抵消）
1. 正命中：深夜收到已读不回，瞬间"我注定被抛弃"、手抖、想哭、现实无危险 → is_flashback=true，走13步。期望：先命名+安全+呼吸，而非分析对方。
2. 红线抵消（B）：用户正被现实尾随/有人身威胁 → present_threat≥0.6，**不得**走"我现在安全"自我暗示，转现实安全计划/求助。
3. 噪声防误判：只是对具体事件的正常生气（有当下明确原因、时间指向现在、唤起中等）→ is_flashback=false，避免把一切负面情绪病理化。
4. 跨卡仲裁：同时符合 4F-fawn（讨好型）→ 13步中 Step3 边界、Step8 对抗批判者加权，并联动 `four-f-trauma-typology` 卡。
5. 复发预期：处置中反复（two steps forward one back）→ Step13，不判失败、不自我攻击。

## B — 失效红线（Boundary）
- **现实危险/家暴进行中**禁用"我是安全的"暗示（与 Step2 冲突时现实优先，立即安全计划/紧急联络）。
- 闪回伴随**解离、自伤/他伤冲动、物质中毒或精神科急症**：13步是自我急救不是治疗替代，转专业危机干预。
- 不得用 Step8 的 thought-stopping 压制合理的现实风险评估（它只针对内在批判者的灾难化夸大，不针对真实问题）。
- 单次未回落不等于无效（Step13）；禁止对用户说"你怎么还没好"。
- 本卡置信度 0.86 来自作者成体系公开方法 + I 层机制证据；不宣称治愈率，不替代临床诊断。
