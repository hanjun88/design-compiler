# 心镜 MindMirror · 用户长期粘性与 IP 权威体系 V1.0

> HEARTMIRROR LIFETIME FLYWHEEL：超级IP人格 × 个人终身认知档案 × 时序心理向量 × 每日微觉察 × 主体性毕业 × 三重权威 × 留存变现飞轮

---

## 一、心镜超级IP人格契约（Mirror Persona Contract）

心镜IP不塑造为"通晓天机的算命大师"，也不塑造为"无底线共情的闺蜜"，而是一面高精度、无情绪偏差的心理透视镜。

### 人格基调
冷峻、精准、克制、非评判性（Non-judgmental）、不讨好、不站队。

### 语言风格
- **禁止**："抱歉"、"其实TA还爱你"、"命中注定"、"你要学会忍让"等谄媚或宿命式断语
- **要求**：事实重构与穿透性提问。例如："这不是深情，这是面对不确定性时的强迫性确认。"

### 工程级防漂移配置
- **Logit Bias负偏置拦截**：对软化、谄媚词汇注入-inf偏置
- **破防之刃（Insight Blade V3.0）**：严格执行"表面行为面具 ➔ 潜意识防御利益 ➔ 真实恐惧内核"的三段式语言穿透

---

## 二、「我的心镜」Personal Profile（人生认知档案系统）

用户完成首次30秒自测或发泄沙盒体验后，系统立即开辟唯一永久性认知档案。

### 首页控制台信息架构（Dashboard IA）

**状态总览卡**：
- 用户专属档案编号（如 HM-2026-0911-A89）与累计陪伴天数
- 当前内核稳定度（Core Stability Index, 0~100）：由近期冲动频率、情绪复原周期加权计算
- 当前主体性阶段：明确标识处于Stage 01~Stage 07哪一环
- 最近触发器预警：如"最近一次焦虑激活发生在3天前，持续时长较上月缩短40%"

**六大核心认知视图（The 6 Mirror Views）**：
| 视图 | 内容 |
|---|---|
| 🪞 我的画像（Self Archetype） | 核心人格结构与潜意识防御机制剖析 |
| ❤️ 我的关系（Relationship Dynamics） | 依恋光谱坐标分布、戈特曼冲突末日四骑士易感点 |
| 🧠 我的内核（Core Stability） | 情绪调节阈值、自我自尊基线、沉没成本耐受力 |
| 📈 我的变化（Longitudinal Timeline） | 多维时序变化折线图 |
| 🔮 我的象镜（Symbolic Mirror） | 八字四柱十神、星盘分宫全景，附古籍SHA-256原文索引（纯只读旁注） |
| 🧭 我的成长（Growth Blueprint） | 下一阶段必须攻克的行为边界作业与毕业指标 |

---

## 三、用户长期心理数据模型（Personal Psychological Timeline）

将传统静态用户信息升级为高维时间序列认知事件流。

### Schema定义（PostgreSQL + JSONB）

```sql
CREATE TABLE user_psychological_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(user_id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_event VARCHAR(64) NOT NULL, -- 'DAILY_MIRROR', 'SANDBOX_INTERCEPT', 'REPORT_UPDATE'

    -- UPIV V1.4 六维连续认知特征向量 [0.00, 1.00]
    attachment_anxiety NUMERIC(4,3) NOT NULL,    -- Ax 依恋焦虑
    attachment_avoidance NUMERIC(4,3) NOT NULL,  -- Av 依恋回避
    boundary_defense NUMERIC(4,3) NOT NULL,      -- Bd 边界防御完整度
    psych_resistance NUMERIC(4,3) NOT NULL,      -- Rs 心理阻抗/反思阻力
    emotional_intensity NUMERIC(4,3) NOT NULL,   -- It 情绪烈度
    control_privilege NUMERIC(4,3) NOT NULL,     -- Ct 控制与特权欲

    -- 衍生动力学指标
    core_stability_index INT NOT NULL CHECK (core_stability_index BETWEEN 0 AND 100),
    active_stage VARCHAR(16) NOT NULL,           -- 'STAGE_01' ~ 'STAGE_07'
    gottman_four_horsemen_flags JSONB,           -- 末日四骑士标记与频次
    event_metadata JSONB                         -- 行为锚点（如"发泄沙盒截胡2000字小作文"）
);

CREATE INDEX idx_user_snapshots_timeline ON user_psychological_snapshots (user_id, recorded_at DESC);
```

### 时序对比与变化挖掘引擎（Trajectory Difference Engine）

每次生成对话、报告或微胶囊前，调用时序差分算法对比T_now与T_now-30d/T_now-90d的向量漂移：
- **正向成长判定**：Ax↓（焦虑下降）且Bd↑（边界上升）→ 触发"主体性阶段跃迁"提示
- **防御回潮判定**：It↑（烈度反弹）且Rs↑（阻抗升高）→ 触发"情绪软着陆与减压"提示，抑制激进认知重构

---

## 四、每日心镜（Daily Mirror · 30秒微觉察）

区别于传统"每日星座运势/吉凶打卡"，每日心镜定位为：仪式感载体（Symbolic Trigger）➔ 认知照见 ➔ 微型行为练习（Micro-Action）。

### 结构化交互三步走

1. **心智焦点（3秒阅读）**：
   > "今日天象/干支节律显示火土燥烈。今日你的核心练习不是向外索求回应，而是觉察'急于自证'的冲动。"

2. **镜像自问（15秒思考）**：
   > "今天哪一个时刻，你因为害怕气氛尴尬或让对方失望，而没有说出真实想法？"

3. **单选/微输入沉淀（12秒提交）**：
   用户点选行为标签或输入一句话感受。数据写入user_psychological_snapshots，成为个人档案生长素材。

### 跨周期反馈唤醒（Recall Hook）
- **7天规律呈现**："过去7天里，你在4次'拒绝他人'前都出现了胸口发紧，但实际拒绝后并未发生关系破裂。"
- **30天质变复盘**："一个月前面对对方已读不回，你平均在18分钟内触发焦虑连发；本月该行为已被沙盒成功拦截5次，当前平均静止等待时长提升至6小时。"

---

## 五、心镜成长等级与主体性毕业路线图

```
Stage 01 情绪求生 (Survival) ──> 截胡冲动，保全体面
    │
Stage 02 照见模式 (Mirroring) ──> 识别依恋与投射，看清死结
    │
Stage 03 情绪降噪 (Decoupling) ──> 躯体感受着陆，脱离即时反馈依赖
    │
Stage 04 边界立极 (Boundary) ──> 确立个人红线，学会温和坚决拒绝
    │
Stage 05 价值内收 (Anchoring) ──> 自我认同解耦于对方评价
    │
Stage 06 自主决断 (Autonomy) ──> 不以恐惧为动机做出关系取舍
    │
Stage 07 主体性毕业 (Graduation) ──> 脱离对心镜的依赖，回归真实生活
```

### 毕业典礼与反沉迷退出机制
- 用户在Stage 07持续稳定30天 → 系统主动弹出《主体性毕业证书》与完整认知轨迹全景图
- 权限调整：主动关闭高频咨询入口，系统转为"年检模式"（仅保留年度节律回顾与档案查看），践行"帮用户最终离开产品"的伦理承诺

---

## 六、三重权威感建立机制（Triple Authority）

```
                    ┌────────────────────────────┐
                    │     TRIPLE AUTHORITY       │
                    └─────────────┬──────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
  1. 计算与原典权威         2. 临床与循证权威        3. 终身数据权威
  (Computational Authority) (Clinical Authority)     (Data Authority)
  • Swiss Ephemeris 精度    • ECR 量表连续四象限     • 跨月/跨年动态差分
  • 28本原典 SHA-256 哈希   • 戈特曼末日四骑士分类   • 行为习惯模式识别
  • 零算法黑箱与可逆推导   • 14本底本·82张能力卡     • "它比任何人都记得我"
```

**引用溯源实现**：系统生成任何判断时，下附展开项提供原始计算证明树（AST Proof Tree）与临床能力卡编号（如CARD-CPTSD-03），杜绝黑箱判词。

---

## 七、留存、复访与商业变现全景飞轮

```
[公域内容 / 30秒自测]
       │ (低门槛好奇进入)
       ▼
[生成初级力场画像 & 建立档案] ──> 【低客单 ¥19~¥69 模块解锁】
       │
       ▼ (深夜危机 / 冲动时刻)
[首夜发泄沙盒 SOS Chamber] ──> 【单次急救 ¥0 / 引导体验】
       │
       ▼ (需要系统看清死结)
[综合情感关系全维诊断报告] ──> 【核心交付 ¥199 (三引擎互证)】
       │
       ▼ (开始每日微调频与觉察)
[每日心镜 + 轨迹沉淀] ───────> 【成长陪伴月卡 ¥59/月 / 年度会员 ¥598】
       │
       ▼ (完成阶段突破 / 毕业)
[心镜独立站 HeartMirror Store] ─> 【实体破局信物 POD ¥299~¥399】
       │
       ▼ (口碑传播 / 主体性推荐)
[老用户转介绍与自发分享] ────> 循环回流至公域入口
```

- **前端获客转化**：通过5大典型场景题库建立即时信任
- **中端留存闭环**：以「我的心镜」个人档案作为数据资产沉淀池，提升用户流失成本（转移成本极高）
- **后端实体交付**：通过激光微雕与工单流水线直连，在用户实现关键主体性突破时提供物理仪式锚点

---

## 八、核心破局点

将心镜从"一次性测试工具"升级为"长期留存平台"，核心破局点在于建立**个人认知权威（Personal Cognitive Authority）**——让用户深刻感受到：系统懂我、记住我、以严密的逻辑观察我，并且陪我见证了自己的真实变化。
