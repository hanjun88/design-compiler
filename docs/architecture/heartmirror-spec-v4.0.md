# HeartMirror System Architecture Specification v4.0

> 认知编译与安全仲裁体系（Cognitive Compiler & Safety Architecture）
> 战略总纲："心镜不是替用户解决人生，而是帮助用户重新获得解决人生的能力。玄学负责把人带进来，心理学负责把人带出来，主体性负责让人最终离开产品。"

---

## 一、6项关键缺陷的工程化重构方案

### 1. 跨学科映射注册表（Symbolic-to-Psychological Mapping Registry）

杜绝"八字/星盘直接确定性推演心理病理"的伪科学表述。建立透明的声明式映射协议：

```python
from pydantic import BaseModel, Field
from typing import Literal, List

class SymbolicPsychMapping(BaseModel):
    mapping_id: str = Field(..., description="唯一映射ID，如 MAP-BAZI-AX-001")
    symbolic_engine: Literal["BAZI", "ASTROLOGY", "ZIWEI"]
    symbolic_feature: str = Field(..., description="如 辛金生子月水旺无丙 / 月土四分")
    target_upiv_dimension: Literal["Ax", "Av", "Bd", "Rs", "It", "Ct"]
    mapping_type: Literal["CORRELATION_HEURISTIC", "ARCHETYPAL_PROJECTION"]
    evidence_level: Literal["LEVEL_E_EXPERIENCE", "LEVEL_D_THEORETICAL"]  # 严禁标注为实证 A/B
    confidence_band: tuple[float, float] = Field(default=(0.36, 0.40))  # 硬锁在低置信度
    is_actionable: bool = False  # 象征映射严禁直接驱动心理干预
    allowed_context: List[str] = ["NARRATIVE_MIRROR", "SELF_INQUIRY"]
    forbidden_context: List[str] = ["CRISIS_TRIAGE", "PSYCHIATRIC_DIAGNOSIS"]
```

### 2. 双轨独立证明树（Dual Proof Trees）

底层IR与前端报告渲染之间拆解为两棵完全隔离的证明树：
- **Computational Proof Tree**（计算推演树）：纯数理确定性。节点记录节气插值、天体经纬度、分宫线、原典古籍SHA-256引用切片
- **Clinical/Evidence Trace**（循证干预链）：纯心理学与行为学。节点记录用户自测行为、Gottman四骑士识别、NVC结构拆解、能力卡干预建议
- 报告层交叉合并：两树在Meta-Arbiter输出后作为同级证据呈现，象征层明确标注为side_annotation

### 3. 认领治理层（Claim Governance Layer）

用"零未授权陈述（Zero Unauthorized Claim）"替代通用的"零幻觉"：
- **实体守恒定理**：LLM生成文本中出现的实体名、分值、状态，必须为输入Ground Truth IR节点的严格子集
- **古籍逐字SHA-256校对**：引用的28本原典段落，必须逐字匹配内部Hash库
- **Fail-Closed熔断**：任何断言不通过，响应流立刻丢弃，回退到预编译静态模板

### 4. 拟真沙盒：反事实关系模拟（Counterfactual Simulation）

首夜发泄沙盒中的Shadow Agent不定位为"模拟对方真实内心"，而是：
- 系统定义：在给定的依恋状态假设与历史互动阻抗下，运行的反事实关系动力学模拟
- 产品目标：提供安全的情绪宣泄沙盒，通过非暴力沟通（NVC）与冷反应阻断高危冲动，守护用户现实边界

### 5. 报告信息架构分层（Progressive Disclosure IA）

解决"10页120+指标"与"用户急性挽回执念"之间的体验张力：
- **L1（默认首屏）· 关系核心洞察**：双方核心节律差异、当前互动死结类型、诚实复合可能性与急性止血建议
- **L2 · 自我心理动力学**：依恋坐标、情绪触发器、边界状态
- **L3 · 时序与成长节律**：近期心理能量潮汐与行动调频
- **L4 · 象征与全息附录**：命盘全维排盘、古籍溯源、计算证明树与能力卡清单

### 6. DTC柔性信物的"成长仪式锚点"定位

信物彻底解耦于推演诊断过程，不承担任何功能性承诺：
- 定位：完成特定认知阶段与行为作业（如连续14天情绪着陆、完成3次健康拒斥）后解锁的物理记忆锚点
- 生产模式：按个人命盘调候卦象激光微雕，采用纯POD（按需生产）一件代发，零库存占用

---

## 二、编制结构与分卷规划（41章 / 5卷）

```
HeartMirror Specification v4.0
├── Volume I: 核心认知引擎与安全仲裁 (Ch 00, 06~14, 16)
├── Volume II: 业务闭环与交互架构 (Ch 01~05, 18, 19, 21~24)
├── Volume III: 数据契约、隐私与编译器 (Ch 15, 17, 20, 26~28)
├── Volume IV: 极简工程拓扑与基础设施 (Ch 29~31, 34, 35)
└── Volume V: 商业交付、合规与红蓝测试 (Ch 25, 32, 33, 36~40)
```

### 完整41章大纲

| 章 | 标题 | 卷 |
|---|---|---|
| 00 | Executive Architecture：系统总体原则、认知编译器模型与4+1架构视图 | I |
| 01 | Business Context：市场痛点、用户心理切片与反操纵商业伦理 | II |
| 02 | User Lifecycle：从急性危机、情绪平复到主体性重构的全生命周期 | II |
| 03 | Product Matrix：自测探针、清醒舱、动力学切片、全维报告与微胶囊 | II |
| 04 | Domain Model：核心领域实体与聚合根（Profile, Session, Report, Assertion） | II |
| 05 | Five Core Experience Loops：五大核心体验闭环详细交互时序 | II |
| 06 | UPIV Specification：6维连续认知向量数学定义与归一化矩阵 | I |
| 07 | Bazi Engine：子平真诠与盲派做功数理实现、太阳黄经连续插值与120调候字典 | I |
| 08 | Astrology Engine：Swiss Ephemeris集成、合盘容许度高斯衰减算法 | I |
| 09 | Psychology Engine：ECR依恋量表、Gottman四骑士分类器与NVC规则 | I |
| 10 | Meta-Arbiter：五级不可逆状态机状态转移方程与仲裁规则 | I |
| 11 | MultiModalRouter：六大冲突判例与路由决策矩阵 | I |
| 12 | Safety State Machine：CRISIS、SAFETY_PLAN等状态转移与12356硬熔断 | I |
| 13 | Ground Truth IR：统一中间表示层Schema与序列化规范 | I |
| 14 | Knowledge/Capability Registry：14本底本与82张标准化能力卡注册规范 | I |
| 15 | LLM Constrained Rendering：CFG / JSON-Schema BNF语法受限与采样参数锁定 | III |
| 16 | Claim Governance：实体守恒断言、Hash校验器与零未授权陈述体系 | I |
| 17 | AST Proof Tree：计算推演树与循证干预链的双轨数据结构 | III |
| 18 | Shadow Agent：反事实关系模拟动力学、冷设防提示词与阻断逻辑 | II |
| 19 | Chat Dynamics Slicer：字数比、时延均值计算与四骑士模式识别 | II |
| 20 | Privacy Architecture：Wasm端侧脱敏、PII擦除与内存阅后即焚（Zero-Fill） | III |
| 21 | Report Engine：四层渐进式披露架构与动态模块组装器 | II |
| 22 | Daily Capsule：晨间能量微胶囊调度与觉察建议生成管线 | II |
| 23 | DTC / Ritual Anchor：POD柔性激光雕刻、工单状态机与仪式交付闭环 | II |
| 24 | CRM & Retention：轻量召回策略与阶段性反思轨迹归档 | II |
| 25 | Payment / Entitlement：定价分层、权限校验与订单防刷保护 | V |
| 26 | Data Model：PostgreSQL关系模式、pgvector向量索引与Redis会话结构 | III |
| 27 | API Contracts：FastAPI RESTful接口与WebSocket双向协议规范 | III |
| 28 | Event Schema：领域事件定义（UserTriageCompleted, ClaimFailed等） | III |
| 29 | Deployment Architecture：全架构/极简部署拓扑（FastAPI + Redis + Cloudflare） | IV |
| 30 | SRE / Observability：Prometheus指标、OpenTelemetry追踪与报警规则 | IV |
| 31 | CI/CD：GitHub Actions流水线、自动化测试门禁与容器镜像构建 | IV |
| 32 | Red-Team Testing：红蓝对抗测试用例库（诱导挽回话术、绕过安全拦截等） | V |
| 33 | Compliance：个保法合规、非医疗免责声明与反封禁策略 | V |
| 34 | Threat Model：STRIDE威胁建模与隐私泄露防护 | IV |
| 35 | Disaster Recovery：轻量化冷备方案与自动化数据恢复演练 | IV |
| 36 | Product Metrics：首屏转化率、发泄沙盒截胡率、主体性觉醒指标 | V |
| 37 | Business Metrics：客单价、月卡留存率与POD履约成本模型 | V |
| 38 | Experiment Framework：提示词与能力卡A/B灰度测试机制 | V |
| 39 | Phase Gates：从MVP到规模化扩展的五阶段里程碑 | V |
| 40 | Open Risks：现存未解决的认知对抗与合规风险防范 | V |

---

## 三、执行路线图

- **第一批次（核心底座）**：Volume I — UPIV规范、Bazi/Astro/Psych引擎契约、Meta-Arbiter状态机、Claim Governance断言机
- **第二批次（交互与管线）**：Volume II + III — 发泄沙盒动力学、Wasm端侧脱敏、双轨证明树Schema
- **第三批次（部署与合规）**：Volume IV + V — 轻量化VPS部署拓扑、自动化红蓝对抗用例

---

## 四、技术分层对齐产品哲学

```
L0 Truth Engine（确定性事实）：命理历算、天体星历、生理/时延客观数据
L1 Evidence Registry（循证知识）：14本底本、82张结构化心理学能力卡
L2 Cognitive Arbiter（认知仲裁）：Meta-Arbiter状态机（CRISIS到SYMBOLIC）
L3 Translation Engine（受限语言生成）：CFG语法受限填空，杜绝谄媚安慰
L4 Claim Firewall（断言防火墙）：实体守恒、原典SHA-256、零未授权陈述
L5 Experience Layer（体验层）：Web/H5、清醒舱、报告渲染
L6 Agency Layer（主体性退出层）：用户独立行动度量与"毕业"状态机
```

**三大认知层级物理隔离**：
- Symbolic Layer（象征投射层）：文化隐喻、情绪投射、低阻抗入口、仪式感（置信度锁[0.36,0.40]）
- Evidence Layer（循证干预层）：关系动力学、依恋模型、NVC、认知重构、行为训练
- Agency Layer（主体性层）：自我觉察、建立边界、独立决断、最终脱离系统
