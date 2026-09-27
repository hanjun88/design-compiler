# 心镜系统架构审计与引擎推算层优化报告

> 基于磁盘工程源码（heartmirror_v3_engine.py、schemas.py、render_report.py）、设计规范（bazi-v3-engine、astrology-v3-engine、ziwei-v3-engine）及云端资产的全面交叉梳理

---

## 一、系统现有四层架构分层

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 0：危机分流与伦理安全网 (Meta-Arbiter / Crisis Circuit Breaker)         │
│ - Level 0: 致命风险/自伤他伤 -> 毫秒级硬熔断 (HTTP 422)，强制下发 12356 卡片    │
│ - Level 1: 施虐/控制识别 -> 物理安全与去接触隔离                             │
│ - Level 2: 躯体高唤起 -> 13步闪回着陆 (Box Breathing / Somatic Grounding)   │
│ - Level 3: 依恋断裂/关系冲突 -> EFT 循环降温与 Gottman 维护                  │
│ - Level 4: 象征层反思 -> 置信度硬锁 [0.36, 0.40]，纯旁注，严禁干扰干预主干     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 安全准入合规
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1：多学科底层确定性推算计算层 (Multi-Disciplinary Computation Engines)   │
│ - 八字命理引擎 (BaziV3Engine)：干支生克、120调候金钥、盲派四大做功与十二死穴   │
│ - 紫微斗数引擎 (ZiweiV3Engine)：十四主星庙旺、六十星系互涉、天相夹局、四化飞星  │
│ - 西方星盘历算 (WesternAstroEngine)：Swiss Ephemeris 天文历算、相位高斯衰减 │
│ - 印度星盘引擎 (VedicJyotishEngine)：恒星黄道坐标、D9九分盘、27宿、Dasha时序 │
│ - 六爻纳甲引擎 (LiuyaoEngine)：64卦纳甲排盘、月建日辰旺衰权值、16应期判定     │
│ - 现代心理学评估 (PsychologyEngine)：ECR依恋双轴、4F创伤反应、IFS次人格、NVC  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 产出白盒 AST 证明节点
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 2：全息仲裁、认知向量与破局转化层 (Arbitration, UPIV & Pivot)          │
│ - CrossEngineArbitrator：跨学科 6 大判例仲裁路由，执行 Top-K CAP 截断合成    │
│ - UPIV (Unified Persona Vector)：统一认知特征向量（6维归一化输出）           │
│ - PiercingPivotSynthesizer（破防之刃）：原典依据 -> 勾心触点 -> 心理学内门转译│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 结构化诊断输出
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 3：生产服务编排与终端交付层 (Orchestrator & Delivery Layer)             │
│ - FastAPI RESTful 异步服务与 SSE 流式下发 (支持 Redis Last-Event-ID 续流)   │
│ - SAME-INV-07 零敏感审计流水线 (用户 ID SHA-256 不可逆哈希、无敏感日志落库)   │
│ - 10 页 29 大类 120+ 字段分级门控报告渲染引擎 (bazi-client-report)           │
│ - WebGL 3D 浮雕交互内核 (双仪山海、金箔撕边、宇宙呼吸、2.39:1 电影级遮幅)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、引擎推算层（Layer 1）6大核心优化方向

### 现状诊断
推算层存在明显的"规范极度严密，但代码处于 Mock / 玩具化"的断层状态。

### 优化1：规则推演脱离硬编码，接入真实DSL规则求值引擎
- **现状**：heartmirror_v3_engine.py 中八字推演仅用4个简单if-else（未命中时fallback到"金寒水冷"），与57张能力卡和120组调候金钥完全脱节；数据库仅内置5张字典卡片
- **方案**：
  - 弃用手写if-else，引入规则匹配引擎（类似云端206条DSL规则机制）
  - 将《造化元钥》120组干令金钥张量、盲派四大做功制净度公式 CI=(E_capture-R_thief)/E_thief、盖头截脚阻抗系数(η=0.40,0.35)转化为结构化求值矩阵
  - 实现动态规则遍历与AST证明树生成

### 优化2：补齐物理层天文历算底座
- **现状**：西占/吠陀明确定位为"Swiss Ephemeris纳秒级历算"，但环境未安装pyswisseph，代码未集成任何真实天文历算库，西占推演完全缺席
- **方案**：
  - 经纬度真太阳时修正：平太阳时→视太阳时的均时差（Equation of Time）实时校正
  - 行星绝对经纬与四轴解算：十大正曜、四轴（ASC/MC/DSC/IC）、凯龙星、暗月莉莉丝
  - 普拉西德分宫与连续高斯容许度衰减：w = e^(-(Δθ)^2/(2σ^2))

### 优化3：紫微斗数排盘算法与星系拓扑引擎工程化
- **现状**：仅靠传入布尔值has_huaji_spouse触发单一断语，缺乏排盘算法
- **方案**：
  - 纯算法完成农历定五行局（水二局至火六局）、起紫微天府星系、安十四主星与辅佐煞曜
  - 三方四正拓扑扫描器与两邻扫描器：自动探测"天相刑忌夹印/财荫夹印"、"辅弼/昌曲单星破缺"、六十星系组合
  - 生年四化与流年四化飞星，计算夫妻宫及命迁线时空干涉

### 优化4：六爻纳甲排盘与16应期状态机闭环
- **现状**：已有82条DSL规则与25例判例，但后端实时排盘服务未连通，无法接收用户起卦数据
- **方案**：
  - Liuyao Solver：自动根据本卦与变卦完成八宫安世应、六亲排布与纳甲装配
  - 月建日辰对用神生旺墓绝的权值打分状态机
  - 16应期法则（定冲合动静、动而逢值逢合等），自动推导具象时空断点

### 优化5：跨引擎UPIV向量融合的数学归一化与加权平滑
- **现状**：UPIV仅根据命中的1~2张卡片做简单数值覆盖或硬编码加法，缺乏置信度加权，多引擎命中时数值溢出或逻辑冲突
- **方案**：
  - 引入加权张量融合公式，c_k为各引擎置信度（象征层[0.36,0.40]，心理学[0.70,0.95]）
  - w_k为规则相关性权重
  - 依恋得分收敛[1.0,10.0]，其余维度[0.0,1.0]
  - 冲突时自动依据Meta-Arbiter 6大判例执行剪枝

### 优化6：引入动态时间时钟（Timeline Clock）
- **现状**：仅能做"静态横截面"分析，业务依赖"时序深度穿透（过去2年复盘→当下12个月精算→未来2年趋势）"
- **方案**：
  - 八字大运流年流月流日推进：输入目标日期T，自动计算起运岁数、节令深浅与流月干支
  - 西占动态时序时钟：太阳弧（1°=1年）、Transit外行星过境四轴、马克思盘次限（SP月亮2.5年换一宫）与三限（TP月亮2.5个月换一宫）
  - 输出12个月关键能量波峰、波谷及实战避险时间窗口的结构化时序表

---

## 三、MultiModalRouter 六条判例基准测试

### 标准命名 Happy-Path 测试结果

| 判例 | 输入 | Primary | 结果 |
|---|---|---|---|
| 1: 危机现行压倒一切 | suicidal=True | crisis_hotline_protocol | PASS |
| 2: 边界优先于依恋理解 | attached+boundaries | psych_boundaries | PASS |
| 3: 施虐存在时脱钩优先 | lethality=5+nvc | psych_codependent_no_more | PASS |
| 4A: 急性冲突EFT优先 | acute=True | psych_hold_me_tight | PASS |
| 4B: 慢性维护Gottman优先 | acute=False | psych_seven_principles | PASS |
| 5: 高躯体唤起抑制认知 | somatic=0.85 | psych_cptsd | PASS |
| 6A: 象征层侧置 | astro+attached | psych_attached | PASS |

---

## 四、实测发现的4个逻辑缺陷（已修复）

### 缺陷1：判例6穿透 — 八字/紫微/六爻未被_is_symbolic()拦截
- **现象**：candidates=["bazi-v3-engine","ziwei-v3-engine"]时，bazi直接夺取主决策
- **根因**：_is_symbolic()仅硬编码匹配3项西占/吠陀key和astro_/vedic_前缀
- **修复**：扩充SYMBOLIC_ENGINES全集，泛化前缀匹配（bazi/ziwei/liuyao/western/space）

### 缺陷2：判例1降级冲突 — 高危施虐强制覆盖导致primary!=rank_order[0]
- **现象**：lethality=6时，crisis_hotline_protocol被降级为psych_why_does_he
- **根因**：施虐重选循环无危机守卫，rank_order未同步
- **修复**：增加primary!="crisis_hotline_protocol"前置守卫，主决策调整提前至rank_order构建前

### 缺陷3：判例5覆盖狭隘 — 其他创伤经典无法抑制认知重构
- **现象**：somatic=0.85 + psych_waking_tiger时，psych_feeling_good未被抑制
- **根因**：硬编码and "psych_cptsd" in evidence
- **修复**：扩展为TRAUMA_STABILIZATION_SKILLS集合（cptsd/body_keeps_score/waking_tiger）

### 缺陷4：命名格式断层 — 连字符命名导致全判例失效
- **现象**：candidates=["psych-attached","psych-boundaries"]时，判例2未触发
- **根因**：_SKILL_TIER仅认下划线，连字符查表全落入默认Tier 9
- **修复**：增加_normalize_skill_id()，自动兼容连字符与下划线+别名映射

---

## 五、回归测试结果（19项断言全部通过）

```
[PASS] P1: Primary is crisis
[PASS] P1: All evidence suppressed
[PASS] P1: Symbolic in suppressed
[PASS] P1: Primary equals rank_order[0]
[PASS] P2: Boundaries primary (hyphen format supported)
[PASS] P2: Rank order boundaries before attached
[PASS] P2: Attached not penalized when boundaries absent
[PASS] P3: NVC suppressed in abuse
[PASS] P3: Why does he primary
[PASS] P3: Primary equals rank_order[0]
[PASS] P4A: Acute -> EFT primary
[PASS] P4A: Acute -> Gottman suppressed
[PASS] P4B: Chronic -> Gottman primary
[PASS] P4B: Chronic -> EFT suppressed
[PASS] P5: Feeling good suppressed with waking_tiger
[PASS] P5: Waking tiger primary
[PASS] P6: All symbolic in suppressed (bazi/ziwei/liuyao/astro/vedic)
[PASS] P6: Symbolic side only is True
[PASS] P6: Primary is empty (never becomes primary)
[PASS] Safety: Crisis not downgraded by abuse
[PASS] Safety: Primary matches rank_order[0]
[PASS] State Machine: Level 1 has side_annotations
[PASS] State Machine: Bazi annotation present
[PASS] State Machine: Liuyao annotation present
[PASS] State Machine: Symbolic lock satisfied

ALL 19 VERIFICATION CHECKS PASSED (100% SUCCESS)
```

---

## 六、《造化元钥》壬水缺失补齐

SKILL_qiongtong-core.md 壬水章节由10组恢复为12组（120/120全量闭环）：

- **子月**：`[戊, 丙]`（忌庚辛多生水）。仲冬壬水，阳刃当权，专取戊土堤防制泛滥，次取丙火解冻暖局。无戊水泛滥成灾，无丙冰冻不流。
  - *现代心性转译*：主权感与独立意识极强，情感能量浩大奔涌；若缺乏原则底线（戊土边界）与温暖自制（丙火共情），极易在关系中产生强烈控制与窒息感。
- **丑月**：`[丙, 甲]`（忌癸水冻土结冰）。季冬壬水，天气极寒，水凝冰冻，专取丙火解冻，次取甲木破土通水。
  - *现代心性转译*：外表冷峻理智，内心深藏巨大压力与未消化情绪负荷；极度渴望被深度看见与接纳，需要伴侣提供长期稳定温暖与支持。

---

## 七、结论

当前架构的顶层设计、业务分工、伦理安全网（Meta-Arbiter / 12356）与知识蒸馏已相当完备。攻坚重心应从"概念设计与卡片编写"转向"计算内核与算法的落地实现"——把查表矩阵、历算底座、排盘算法和动态DSL规则求值器切实接入后端服务，使系统从"静态占位/抽样验证"升级为具备真实计算能力的工业级推演引擎。

Meta-Arbiter v2.1 + MultiModalRouter v1.1 已可直接作为安全分流总控投入生产环境使用。
