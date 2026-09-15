# Chinese Aesthetic Foundation — 中国美学设计智能本体与关系图谱

**阶段**: chinese-aesthetic-foundation / Phase 1: Theory & Modeling
**版本**: 0.1.0 (Draft — Ontology Frozen Pending Review)
**基线**: `feature/step8-contract-provenance-hardening` @ `86e8d3a` (FROZEN)
**分支**: `feature/chinese-aesthetic-foundation`
**日期**: 2026-09-16
**规则**: ZERO COMMIT TO COMPILER CORE / ZERO CODE UNTIL ONTOLOGY FROZEN

---

## 0. 文档定位与阶段声明

### 0.1 本文档是什么

本文档是 `chinese-aesthetic/` 模块从 **Evaluation Prototype** 升级为 **Chinese Aesthetic Design Intelligence Provider** 的理论基础与本体规范。它定义：

- 中国美学的八大母语法（Ontology）
- 母语法之间的动态关系拓扑（Relationship Graph）
- 六大生成语法体系（Composition / Spatial / Material / Light-Temporal / Period / Anti-Pattern）
- 机器设计算子（Design Operations）
- 证据纯度规范（Evidence Purity Specification）

### 0.2 本文档不是什么

- **不是**代码实现规范。Phase 1 只做理论与模型，不写实现代码。
- **不是**对现有 `machine-assertions.ts` / `semantic-evaluator.ts` 的修补。现有原型将在 Phase 2 逐步迁移到本模型，而非在旧架构上打补丁。
- **不是**"中国美学 = 红 + 金 + 龙"的符号堆砌指南。本文档的核心立场是反符号堆砌。

### 0.3 现有原型的 P0 缺陷定性

在进入本体定义之前，必须正式记录现有 `chinese-aesthetic/` 原型的核心缺陷，作为本重构的动因与验收对照：

| 缺陷 ID | 定性 | 位置 | 具体表现 |
|---|---|---|---|
| P0-01 | Fake Evidence Injection | `machine-evaluator.ts` | 13 处硬编码常数：`visualDensityVariance=0.15`, `edgeDensitySkew=0.1`, `chromaticContinuity=0.75`, `depthContinuity=0.70`, `occlusionCount=2`, `atmosphericDepth=0.6`, `focalDepthSeparation=0.55`, `luminanceHierarchy=0.7`, `surfaceVariation=0.35`, `microDetailDistribution=0.55`, `secondaryArea=0.20`, `accentArea=0.15`, `dominantArea fallback=0.25` |
| P0-02 | Proxy Usurpation | `machine-assertions.ts` + `semantic-evaluator.ts` | Farneback 光流 → "气韵"；焦点偏移 → "宾主揖让"；负空间比例 → "计白当黑"。单维度代理指标僭越文化本体 |
| P1-01 | Ontology Confusion | `semantic-dimensions.ts` | 八大维度将诠释层概念（含蓄、形神、时间感）与生成机制层概念（经营位置、尺度、材质、天时）混为一谈，无法导出确定性 Design Operations |
| P1-02 | Soft Threshold → Cultural Judgment | `semantic-evaluator.ts` | `evidenceStrength >= 0.8 → PASS`，`inIdealRange && hasContinuity → PASS`。理念上宣称"语义不等于指标"，实现上仍用标量阈值做文化伪判定 |

**裁决**: 现有原型保留为 `prototype-archive/`（Phase 2 处理），新架构从本文档定义的本体出发重建。

---

## 1. Ontology — 八大母语法

### 1.1 母语法的定义原则

**母语法**（Generative Axiom）是中国美学中不可再分解的生成性原则。每个母语法必须满足：

1. **生成性**: 能导出至少一个确定性 Design Operation（而非仅能被评估）。
2. **关系性**: 定义的是实体之间的关系或力场，而非孤立属性。
3. **可观测性**: 存在至少一个物理可测量的代理维度，但代理维度 ≠ 母语法本身。
4. **不可还原性**: 不能被简化为单一标量阈值的 PASS/FAIL。

### 1.2 八大母语法总览

| # | 母语法 ID | 名称 | 层级 | 核心关系 | 生成性方向 |
|---|---|---|---|---|---|
| 1 | `AXIOM-QIYUN` | 气韵贯通 | 元原则 | 能量流的连续性与节奏 | 运动势 / 视觉流向 / 光色呼吸 |
| 2 | `AXIOM-XUSHI` | 虚实相生 | 元原则 | 虚境与实境的辩证互构 | 空间深度 / 透明度 / 遮挡 |
| 3 | `AXIOM-JIBAI` | 计白当黑 | 空间原则 | 留白作为正形的构成力 | 负空间拓扑 / 空域连通 |
| 4 | `AXIOM-BINZHU` | 宾主揖让 | 秩序原则 | 主体与辅从的礼序关系 | 视觉层级 / 质心矢量 / 面积包络 |
| 5 | `AXIOM-JINGYING` | 经营位置 | 构造原则 | 画面元素的结构性排布 | 构图骨架 / 网格 / 视平线 |
| 6 | `AXIOM-CHIDU` | 尺度与气势 | 感知原则 | 尺度差产生的气势张力 | 比例系统 / 仰视角度 / 巨构感 |
| 7 | `AXIOM-CAIZHI` | 材质与时间 | 物质原则 | 材质经时间作用后的痕迹 | 包浆 / 风化 / 磨损 / 沁色 |
| 8 | `AXIOM-GUANGZHAO` | 光照与天时 | 氛围原则 | 光源属性与时间氛围的同构 | 色温 / 光比 / 柔和度 / 时辰 |

### 1.3 层级划分

八大母语法分为三个层级：

**元原则层（Meta-Axioms）** — 贯穿所有其他母语法的底层动力学：
- `AXIOM-QIYUN` 气韵贯通
- `AXIOM-XUSHI` 虚实相生

**空间-秩序层（Spatial-Order Axioms）** — 定义画面结构与礼序：
- `AXIOM-JIBAI` 计白当黑
- `AXIOM-BINZHU` 宾主揖让
- `AXIOM-JINGYING` 经营位置
- `AXIOM-CHIDU` 尺度与气势

**物质-氛围层（Material-Atmosphere Axioms）** — 定义质感与时间氛围：
- `AXIOM-CAIZHI` 材质与时间
- `AXIOM-GUANGZHAO` 光照与天时

层级关系：元原则层渗透并约束空间-秩序层与物质-氛围层；空间-秩序层与物质-氛围层在 Design Operations 中交汇。

### 1.4 各母语法详细定义

#### 1.4.1 AXIOM-QIYUN 气韵贯通

**定义**: 画面中视觉能量的流动具有连续性、方向性与节奏感。气者，能量之运行；韵者，能量之节律。气韵不是"运动平滑"，而是能量在空间-时间中的组织方式。

**生成哲学**:
- 气韵要求画面存在可辨识的视觉流向（主气脉），而非能量均匀散布。
- 气韵要求节奏变化（疏密、急缓、聚散），而非匀速运动。
- 气韵要求虚实转换中的能量守恒（虚处不是能量消失，而是能量的弥散与蓄势）。

**形式化结构约束**:
- 存在至少一条主气脉（dominant flow path），其方向矢量在画面中可追踪。
- 气脉沿线存在节奏变化点（至少 2 个疏密转折点）。
- 气脉的起止点与宾主关系（AXIOM-BINZHU）对齐：气脉通常起于宾、汇于主，或反之。

**可观测代理维度**（仅作证据，不作判定）:
- 光流场方向一致性（optical flow direction coherence）
- 亮度梯度场的主方向（brightness gradient dominant direction）
- 相机运动轨迹的曲率变化（camera motion curvature variation）

**不可还原声明**: 光流方向一致性高 ≠ 气韵贯通。气韵还要求节奏变化、虚实转换、与宾主关系的对齐。单一代理指标通过不能判定气韵 PASS。

---

#### 1.4.2 AXIOM-XUSHI 虚实相生

**定义**: 虚境与实境不是二元对立，而是相互构成、相互转化的辩证关系。实中有虚（实形内部的通透与呼吸），虚中有实（虚境中的暗示与蓄势）。

**生成哲学**:
- 虚实是梯度而非开关：不存在"纯实"或"纯虚"的区域，只有虚实比例的连续变化。
- 虚实转换产生深度：虚实梯度的方向与陡峭程度定义空间纵深。
- 虚境具有构成力：留白（虚）不是"没有内容"，而是对实形的衬托与引导。

**形式化结构约束**:
- 画面虚实分布为连续梯度，不存在大面积纯实或纯虚的均质区域（除非作为刻意的极简表达，但需其他母语法支撑）。
- 存在至少一条虚实转换带（void-solid transition band），其梯度方向定义空间纵深方向。
- 虚境区域与实境区域的面积比在文化范式约束内（见 §7 Period Grammar）。

**可观测代理维度**:
- 亮度直方图的分布形态（是否存在双峰/多峰，而非单峰集中）
- 深度图层的层间过渡平滑度（layer transition smoothness）
- 透明度/遮挡关系的复杂度（occlusion graph complexity）

**不可还原声明**: `depthLayerCount >= 3` ≠ 虚实相生。虚实相生要求的是辩证转换关系，而非层数计数。三层全实或三层全虚都不构成虚实相生。

---

#### 1.4.3 AXIOM-JIBAI 计白当黑

**定义**: 留白（白/虚）与实形（黑/实）具有同等的构成地位。白处不是"未画"，而是"画"的有机组成部分。计白当黑要求将留白作为正形来经营其形状、位置、连通性与张力。

**生成哲学**:
- 留白有形状：留白区域的轮廓不是随机的，而是经过经营的几何形态。
- 留白有连通性：留白区域之间的连通/分割关系构成画面的"气路"。
- 留白有张力：留白与实形的边界产生视觉张力，张力的大小与方向引导视线。

**形式化结构约束**:
- 主要留白区域（面积 > 5% 画面）具有可辨识的几何形态（非随机噪声形）。
- 留白区域的连通图（connectivity graph）非平凡：存在至少 2 个连通的留白区域，或 1 个具有复杂拓扑的留白区域。
- 留白与实形的边界长度与曲率分布非均匀（存在张力集中点）。

**可观测代理维度**:
- 负空间比例（negative space ratio）— 仅作面积证据
- 空域连通分量数（empty region connected component count）
- 留白区域边界的曲率方差（boundary curvature variance）

**不可还原声明**: `negativeSpaceRatio in [0.12, 0.50]` ≠ 计白当黑。计白当黑要求的是留白的**形状经营**与**构成力**，而非面积比例落在某个区间。面积合适但留白形状为随机噪声的画面不构成计白当黑。

---

#### 1.4.4 AXIOM-BINZHU 宾主揖让

**定义**: 画面中存在主体（主）与辅从（宾）的礼序关系。主体突出而不孤立，辅从承托而不僭越。宾主之间是"揖让"——相互致意、相互成就的动态关系，而非静态的大小层级。

**生成哲学**:
- 宾主是关系而非属性：一个元素是否为"主"取决于它与其他元素的关系，而非自身的绝对大小。
- 揖让是动态的：主对宾有引导力，宾对主有承托力，两者形成力的平衡。
- 宾主可转换：在画面的不同区域或不同时间点，宾主关系可以发生合法的转换（如长镜头中的视线转移）。

**形式化结构约束**:
- 存在可辨识的主体（视觉质心权重最大的元素组）与至少一个辅从。
- 主体与辅从之间存在视觉力的矢量关系（质心矢量差非零且方向可解释）。
- 辅从不僭越：辅从的视觉权重（面积×对比度×运动速度）不超过主体的 70%（范式相关，见 §7）。

**可观测代理维度**:
- 焦点中心偏移（focal center offset）— 仅作主体位置证据
- 主辅面积比（dominant/secondary area ratio）
- 视觉质心矢量差（visual centroid vector difference）

**不可还原声明**: `focalCenterOffset < 0.3 && dominanceSeparation > 0.02` ≠ 宾主揖让。宾主揖让要求的是**礼序关系**与**揖让动力学**，而非焦点位置与面积差的阈值通过。焦点居中但辅从僭越的画面不构成宾主揖让。

---

#### 1.4.5 AXIOM-JINGYING 经营位置

**定义**: 画面元素的排布是经过结构性经营的，而非随机或自然主义的堆砌。经营位置关注的是画面的骨架结构——网格、轴线、视平线、分割比例——这些结构性元素决定了画面的秩序感与稳定性。

**生成哲学**:
- 画面有骨架：存在可辨识的构图骨架（中轴线、对角线、三分线、L 形等）。
- 骨架有比例：骨架的分割比例遵循特定的比例系统（非严格黄金分割，而是文化范式相关的比例，如中式建筑的开间比例）。
- 元素有定位：主要元素的位置与骨架对齐，而非漂浮在画面中。

**形式化结构约束**:
- 存在至少一条主导构图轴线（dominant composition axis），其方向与位置可检测。
- 主要元素（宾主）的质心位置与构图骨架的对齐误差在范式容差内。
- 画面分割比例（如天地分割、左右分割）可辨识且非 1:1 均分（除非刻意对称表达）。

**可观测代理维度**:
- 构图主轴方向（composition axis direction）
- 元素质心与骨架的对齐误差（alignment error）
- 画面分割比例（division ratio）

**不可还原声明**: 存在中轴线 ≠ 经营位置。经营位置要求的是**结构性经营**，即骨架、比例、定位三者的统一。有中轴线但元素随意漂浮的画面不构成经营位置。

---

#### 1.4.6 AXIOM-CHIDU 尺度与气势

**定义**: 通过尺度差（元素之间、元素与画面之间、元素与观者之间）产生气势张力。尺度不是物理尺寸，而是**感知尺度**——观者对元素大小、远近、高低的主观感受。气势是尺度差产生的情感张力。

**生成哲学**:
- 尺度是相对的：一个元素的"大"或"小"取决于它与参照系的关系，而非绝对像素数。
- 尺度差产生气势：主体与辅从的尺度差、前景与背景的尺度差、仰视角度产生的巨构感，都是气势的来源。
- 尺度有文化范式：不同时代范式对尺度的偏好不同（唐式尚大、宋式尚精、明式尚雅）。

**形式化结构约束**:
- 主体与辅从之间存在可辨识的尺度差（感知尺度比 > 范式阈值）。
- 存在至少一个尺度参照系（如人物、门窗、台阶等可辨识尺度的元素），使尺度差可被感知。
- 相机角度与尺度感知匹配：仰视增强巨构感，俯视增强全局感，平视增强亲和感。

**可观测代理维度**:
- 主辅感知尺度比（perceived scale ratio）
- 相机俯仰角（camera pitch angle）
- 尺度参照元素的存在性（scale reference presence）

**不可还原声明**: 主体面积大 ≠ 尺度与气势。气势来自**尺度差的张力**，而非绝对大小。主体占满画面但无尺度参照的画面不产生气势。

---

#### 1.4.7 AXIOM-CAIZHI 材质与时间

**定义**: 材质不是静态的物理属性，而是时间作用于物质的痕迹记录。包浆、风化、磨损、沁色、锈蚀——这些时间痕迹是材质"活"的证据。中国美学对材质的欣赏本质上是对时间的欣赏。

**生成哲学**:
- 材质有时间深度：好的材质表现不是"全新"或"完美"，而是带有可辨识的时间痕迹。
- 时间痕迹有方向性：磨损通常发生在接触面/受力面，风化通常发生在暴露面，沁色通常从裂隙渗入。时间痕迹的分布应符合物理因果。
- 材质与范式相关：不同时代范式对材质时间痕迹的偏好不同（唐式尚金石重器、宋式尚素雅瓷玉、明式尚硬木包浆）。

**形式化结构约束**:
- 主导材质存在至少一种可辨识的时间痕迹（磨损/风化/包浆/沁色/锈蚀）。
- 时间痕迹的空间分布符合物理因果（磨损在受力面、风化在暴露面）。
- 时间痕迹的强度与材质类别、范式约束匹配（如青铜器应有锈蚀/包浆，新木器应有较少磨损）。

**可观测代理维度**:
- 表面粗糙度方差（roughness variance across surface）— 时间痕迹导致粗糙度不均匀
- 高光分布的不规则性（specular highlight irregularity）— 磨损/包浆改变高光
- 颜色变化的空间梯度（color variation spatial gradient）— 沁色/风化的颜色渐变

**不可还原声明**: `roughness in [0.25, 0.55]` ≠ 材质与时间。材质与时间要求的是**时间痕迹的因果分布**，而非粗糙度参数落在某个区间。粗糙度合适但表面完美无瑕（无时间痕迹）的材质不构成材质与时间。

**与 PBR Matrix 的关系**: Matrix Contract v1.0.1 中的材质类别区间（WOOD/GLAZE/BRONZE/STONE）定义的是材质的**物理参数域**，是本母语法的输入约束。本母语法在此基础上增加**时间痕迹**维度。两者不冲突：物理参数域保证材质类别正确，时间痕迹保证材质有"活"的证据。

---

#### 1.4.8 AXIOM-GUANGZHAO 光照与天时

**定义**: 光照不是单纯的照明参数（色温/强度/方向），而是与时间氛围（天时）同构的表达系统。晨光、正午、黄昏、月夜、烛火——每种光照都对应一种时间氛围与文化意境。光照的选择应服务于天时的表达。

**生成哲学**:
- 光照有天时属性：每种光照配置对应一个可辨识的时辰/氛围（晨光/正午/黄昏/月夜/烛火/阴天）。
- 光照与材质交互：光照在不同材质上产生不同的反应（金属高光、釉面反射、木材亚光、玉石半透），这种交互是光照表达的一部分。
- 光照有叙事性：光照的变化（如从晨光到黄昏）可以表达时间流逝与叙事推进。

**形式化结构约束**:
- 光照配置可辨识为至少一种天时类型（色温/强度/方向/柔和度的组合落在天时区间内）。
- 光照与主导材质的交互可观测（高光位置/反射率/半透效果与材质类别匹配）。
- 光照意图（lightingIntent）与范式、场景语义一致（如唐式宫殿宜日光/烛火，宋式山水宜阴天/月夜）。

**可观测代理维度**:
- 色温（color temperature）— 天时的主要代理
- 光比（key/fill ratio）— 氛围对比度
- 柔和度（softness / shadow penumbra）— 光源类型代理
- 高光分布与材质的匹配度（highlight-material match）

**不可还原声明**: `colorTemp in [5000, 6500]` ≠ 光照与天时。光照与天时要求的是**光照-天时-材质-范式的同构**，而非色温落在某个区间。色温正确但光比/柔和度/材质交互不匹配的光照不构成光照与天时。

**与 Matrix Contract 的关系**: Matrix Contract v1.0.1 中的 lightingIntent（DAYLIGHT/CANDLELIGHT/DIM）定义的是光照的**语义区间**，是本母语法的输入约束。本母语法在此基础上增加**天时同构**与**材质交互**维度。

---

### 1.5 母语法之间的约束关系

八大母语法不是孤立的，它们之间存在系统性的约束与增强关系：

```
                    ┌─────────────┐
                    │  AXIOM-QIYUN │ (气韵贯通 — 元原则)
                    └──────┬──────┘
                           │ 渗透
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │AXIOM-XUSHI │ │ 空间-秩序层 │ │ 物质-氛围层 │
     │(虚实相生)   │ │            │ │            │
     └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
            │               │               │
     ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
     │  JIBAI 计白  │ │  BINZHU 宾主 │ │  CAIZHI 材质 │
     │  JINGYING 经营│ │  CHIDU 尺度  │ │ GUANGZHAO 光照│
     └─────────────┘ └─────────────┘ └─────────────┘
```

**关键约束对**:
- `QIYUN → BINZHU`: 气脉的起止点必须与宾主关系对齐。
- `XUSHI → JIBAI`: 虚实梯度的方向定义留白的张力方向。
- `JINGYING → BINZHU`: 宾主的位置必须与构图骨架对齐。
- `CHIDU → BINZHU`: 宾主的尺度差是气势的主要来源。
- `CAIZHI ↔ GUANGZHAO`: 材质与光照必须交互匹配（高光/反射/半透）。
- `QIYUN ↔ XUSHI`: 气韵在虚实转换中获得节奏变化。

---

## 2. Relationship Graph — 动态关系拓扑

### 2.1 从"指标先行"到"关系先行"

现有原型的根本架构问题是"指标先行"：先定义可测量的标量指标（focalCenterOffset, negativeSpaceRatio...），然后用阈值判定文化维度。这导致：
1. 指标与文化本体之间是任意映射（为什么 focalCenterOffset < 0.3 就是宾主揖让？）。
2. 无法处理关系性概念（宾主揖让是主与宾的关系，不是主的属性）。
3. 无法导出 Design Operations（只能评估，不能生成）。

本架构采用"关系先行"：先定义画面中的**实体**与**实体之间的关系/力场**，然后母语法是对这些关系的组织原则，可观测指标是关系的物理投影。

### 2.2 实体定义（Entities）

画面中的可操作实体分为四类：

| 实体类型 | ID | 定义 | 属性 |
|---|---|---|---|
| 视觉元素 | `VisualElement` | 画面中可辨识的视觉对象（建筑、山、树、人物、器物等） | 质心位置、包络面积、感知尺度、对比度、运动速度、材质类别 |
| 空域区域 | `VoidRegion` | 画面中无主导视觉元素的区域（留白、天空、水面、雾气等） | 面积、连通性、边界曲率、虚实度 |
| 构图骨架 | `CompositionSkeleton` | 画面的结构性参考线/点（中轴线、视平线、对角线、三分点等） | 类型、方向、位置、比例 |
| 光源 | `LightSource` | 画面中的光照实体 | 方向、色温、强度、柔和度、类型（日光/烛火/月光等） |

### 2.3 关系类型（Relation Types）

实体之间的关系分为五大类：

#### 2.3.1 秩序关系（Order Relations）

| 关系 ID | 名称 | 定义 | 关联母语法 |
|---|---|---|---|
| `REL-HOST-GUEST` | 宾主关系 | 主体与辅从之间的礼序关系 | AXIOM-BINZHU |
| `REL-SCALE-HIERARCHY` | 尺度层级 | 元素之间的感知尺度差序 | AXIOM-CHIDU |
| `REL-ALIGNMENT` | 对齐关系 | 元素质心与构图骨架的对齐 | AXIOM-JINGYING |

#### 2.3.2 空间关系（Spatial Relations）

| 关系 ID | 名称 | 定义 | 关联母语法 |
|---|---|---|---|
| `REL-VOID-SOLID` | 虚实关系 | 空域区域与视觉元素之间的辩证构成 | AXIOM-XUSHI |
| `REL-VOID-COMPOSITION` | 留白构成 | 空域区域作为正形的形状/连通/张力 | AXIOM-JIBAI |
| `REL-OCCLUSION` | 遮挡关系 | 视觉元素之间的前后遮挡 | AXIOM-XUSHI |
| `REL-DEPTH-GRADIENT` | 深度梯度 | 元素在纵深方向的排列与过渡 | AXIOM-XUSHI |

#### 2.3.3 动力学关系（Dynamic Relations）

| 关系 ID | 名称 | 定义 | 关联母语法 |
|---|---|---|---|
| `REL-FLOW-PATH` | 气脉关系 | 视觉能量流的路径与方向 | AXIOM-QIYUN |
| `REL-RHYTHM-VARIATION` | 节奏变化 | 能量流沿路径的疏密/急缓变化 | AXIOM-QIYUN |
| `REL-VISUAL-FORCE` | 视觉力 | 元素之间的吸引力/排斥力矢量 | AXIOM-BINZHU, AXIOM-QIYUN |

#### 2.3.4 物质关系（Material Relations）

| 关系 ID | 名称 | 定义 | 关联母语法 |
|---|---|---|---|
| `REL-MATERIAL-CONTRAST` | 材质对比 | 相邻元素之间的材质类别差异 | AXIOM-CAIZHI |
| `REL-TIME-TRACE-CAUSALITY` | 时间痕迹因果 | 时间痕迹的空间分布与物理因果的匹配 | AXIOM-CAIZHI |
| `REL-LIGHT-MATERIAL-INTERACTION` | 光材交互 | 光源在材质上产生的高光/反射/半透效果 | AXIOM-GUANGZHAO, AXIOM-CAIZHI |

#### 2.3.5 氛围关系（Atmosphere Relations）

| 关系 ID | 名称 | 定义 | 关联母语法 |
|---|---|---|---|
| `REL-LIGHT-TEMPORAL-ISOMORPHISM` | 光天同构 | 光照配置与时辰/氛围的同构映射 | AXIOM-GUANGZHAO |
| `REL-ATMOSPHERE-COHERENCE` | 氛围一致性 | 光照、材质、虚实共同营造的氛围统一性 | AXIOM-GUANGZHAO, AXIOM-XUSHI |

### 2.4 力场模型（Force Field Model）

宾主揖让、气韵贯通等母语法本质上描述的是**视觉力场**。本架构引入力场模型作为关系的数学表达：

**视觉力**（Visual Force）是一个矢量场，定义在画面平面上，每个点有一个力矢量。力的来源包括：
- **元素引力**：高对比度/大面积/快速运动的元素对视线产生引力。
- **骨架引导力**：构图轴线/对角线对视线产生引导力。
- **留白张力**：留白与实形边界产生的张力。
- **气脉流动力**：沿气脉方向的能量流动力。

**力场的可观测代理**:
- 视线追踪热力图（saliency map）— 元素引力的代理
- 亮度梯度场（brightness gradient field）— 骨架引导力与气脉的代理
- 边缘密度场（edge density field）— 留白张力的代理

**力场与母语法的关系**:
- 气韵贯通 = 力场存在主方向 + 沿主方向有节奏变化
- 宾主揖让 = 力场存在主引力源 + 辅从引力源对主源有承托（力的平衡）
- 计白当黑 = 留白区域的力场梯度非零（留白有构成力）

### 2.5 拓扑不变量（Topological Invariants）

关系图中存在一些在文化范式变化下保持不变的拓扑性质，这些是中国美学的**结构不变量**：

| 不变量 ID | 名称 | 定义 |
|---|---|---|
| `INV-BINZHU-NONTRIVIAL` | 宾主非平凡 | 任何中国美学画面中，宾主关系必须是非平凡的（不存在"无主"或"全主"状态） |
| `INV-VOID-NONEMPTY` | 留白非空 | 任何中国美学画面中，留白区域必须非空（不存在"满实"状态，除非作为刻意反例） |
| `INV-FLOW-CONNECTED` | 气脉连通 | 画面中的视觉能量流必须是连通的（不存在完全断裂的气脉） |
| `INV-LIGHT-MATERIAL-MATCH` | 光材匹配 | 光源类型与主导材质的交互必须是物理合理的（不存在"金属在烛光下无高光"等矛盾） |

这些不变量是 Anti-Pattern Gate（§8）的基础判定依据。

---

## 3. Composition Grammar — 经营位置语法

### 3.1 构图骨架类型库

| 骨架 ID | 名称 | 描述 | 典型范式关联 |
|---|---|---|---|
| `SKEL-CENTRAL-AXIS` | 中轴对称 | 垂直中轴线贯穿画面，元素左右对称或准对称 | 唐式宫殿、明式厅堂 |
| `SKEL-DIAGONAL-LEFT` | 左对角线 | 主对角线从左下到右上，元素沿对角线排布 | 宋式山水、边角构图 |
| `SKEL-DIAGONAL-RIGHT` | 右对角线 | 主对角线从左上到右下 | 宋式山水 |
| `SKEL-L-SHAPE` | L 形构图 | 水平+垂直构成 L 形骨架，留出大面积空白 | 宋式小品、明式园林 |
| `SKEL-TRIPARTITION` | 三分法 | 画面按水平/垂直三分，元素位于三分线交点 | 通用 |
| `SKEL-HORIZON-LAYER` | 水平分层 | 多条水平线将画面分为天/地/中景等层次 | 山水长卷、巨构建筑 |

### 3.2 构图比例系统

中国美学的构图比例不是严格的黄金分割，而是文化范式相关的比例系统：

| 比例 ID | 名称 | 比值 | 用途 |
|---|---|---|---|
| `RATIO-HEAVEN-EARTH` | 天地分割 | 上:下 = 3:7 或 4:6（天小于地）或 6:4（天大于地，高远景） | 山水画天地分割 |
| `RATIO-CENTRAL-RESERVE` | 中心留边 | 中心主体区域:边白 = 7:3 或 8:2 | 中轴对称构图 |
| `RATIO-BAY-MODULE` | 开间模数 | 建筑开间按 3/5/7/9 奇数间，明间大于次间 | 建筑构图 |
| `RATIO-GOLDEN-APPROX` | 近似黄金 | 3:5, 5:8（斐波那契近似） | 通用元素比例 |

### 3.3 视平线取态

视平线（horizon line）的位置决定了观者的感知立场：

| 取态 ID | 视平线位置 | 感知效果 | 典型范式 |
|---|---|---|---|
| `HORIZON-LOW` | 下 1/3 以下 | 仰视，巨构感，崇高 | 唐式宫殿、巨构 |
| `HORIZON-MID` | 中 1/2 | 平视，亲和，稳定 | 明式厅堂、人物 |
| `HORIZON-HIGH` | 上 1/3 以上 | 俯视，全局感，深远 | 宋式山水、长卷 |

---

## 4. Spatial Grammar — 空间语法

### 4.1 空间纵深系统

| 纵深类型 ID | 名称 | 机制 | 关联母语法 |
|---|---|---|---|
| `DEPTH-ATMOSPHERIC` | 大气透视 | 远景亮度/对比度/饱和度衰减 | AXIOM-XUSHI |
| `DEPTH-OCCLUSION` | 遮挡纵深 | 前景遮挡中景，中景遮挡背景 | AXIOM-XUSHI |
| `DEPTH-SCALE` | 尺度纵深 | 近大远小的感知尺度梯度 | AXIOM-CHIDU |
| `DEPTH-FOCAL` | 焦深纵深 | 前景/中景/背景的虚实（焦外）差异 | AXIOM-XUSHI |

### 4.2 空间虚实转换带

虚实转换带（void-solid transition band）是虚实相生的核心空间结构：

- **转换带宽度**: 决定虚实转换的柔和/锐利程度。宽转换带 = 柔和过渡（雾气、渐变），窄转换带 = 锐利对比（硬边、剪影）。
- **转换带方向**: 定义空间纵深方向。转换带通常从前景（实）向背景（虚）渐变。
- **转换带数量**: 多层转换带 = 多层空间纵深。至少 1 条主转换带，复杂场景可有 2-3 条。

### 4.3 留白拓扑

留白（空域区域）的拓扑性质是计白当黑的空间表达：

- **连通分量数**: 1 个大连通留白 = 整体气脉贯通；多个分离留白 = 气脉分节。
- **欧拉示性数**: 留白区域的孔洞数（被实形包围的留白）定义留白的拓扑复杂度。
- **边界曲率**: 留白边界的曲率分布定义留白的"形状经营"程度。高曲率方差 = 刻意经营的形状，低曲率方差 = 随机/自然形状。

---

## 5. Material Grammar — 材质语法

### 5.1 材质类别与时间痕迹

| 材质类别 | 典型时间痕迹 | 痕迹物理因果 | 范式偏好 |
|---|---|---|---|
| WOOD 木 | 包浆、磨损、开裂、虫蛀 | 包浆在接触面/手持处；磨损在受力面；开裂在顺纹方向 | 明式（黄花梨/紫檀包浆） |
| GLAZE 釉/琉璃 | 开片、土沁、风化剥釉 | 开片在釉面应力集中处；土沁从胎釉交界处渗入 | 宋式（青瓷开片）、唐式（琉璃） |
| BRONZE 青铜/金 | 锈蚀、包浆、磨损 | 锈蚀在暴露面/裂隙处；包浆在低凹处；磨损在高凸处 | 唐式（鎏金铜器） |
| STONE 石/玉 | 风化、沁色、磨损、包浆 | 风化在暴露面；沁色从裂隙/孔隙渗入；磨损在接触面 | 宋式（砚石/玉器）、通用 |
| LACQUER 漆 | 断纹、磨损、包浆 | 断纹在应力方向；磨损在边缘/接触面 | 明式（雕漆/螺钿） |
| SILK 绢/丝 | 老化、褪色、折痕 | 老化在暴露面；褪色在光照强处；折痕在折叠处 | 宋式（绢本山水） |

### 5.2 时间痕迹强度等级

| 等级 ID | 名称 | 描述 | 典型场景 |
|---|---|---|---|
| `TRACE-NONE` | 无痕迹 | 全新/完美表面，无时间痕迹 | 新造器物（不推荐用于中国美学表达） |
| `TRACE-LIGHT` | 轻度 | 轻微包浆/磨损，需仔细观察 | 日常使用不久的器物 |
| `TRACE-MODERATE` | 中度 | 可辨识的包浆/磨损/开片，时间痕迹明显 | 有年代感的器物（推荐） |
| `TRACE-HEAVY` | 重度 | 显著锈蚀/风化/沁色，时间痕迹主导视觉 | 出土文物/古建 |
| `TRACE-DEGRADED` | 劣化 | 材质结构已受损（碎裂/残缺），时间痕迹破坏了材质完整性 | 残器（需刻意表达时使用） |

中国美学表达推荐 `TRACE-LIGHT` 到 `TRACE-HEAVY`，避免 `TRACE-NONE`（无时间感）和 `TRACE-DEGRADED`（材质破坏）。

### 5.3 材质对比原则

相邻元素之间的材质对比是材质语法的重要组成：

- **类别对比**: 不同材质类别相邻（如木与石、金与玉）产生材质张力。
- **时间痕迹对比**: 新与旧、光滑与粗糙、明亮与晦暗的对比。
- **光泽对比**: 金属高光与木材亚光、釉面反射与石器漫反射的对比。

材质对比不应是随机的，而应服务于宾主关系（主体材质更突出）与范式表达。

---

## 6. Light / Temporal Grammar — 光照与时序语法

### 6.1 天时类型库

| 天时 ID | 名称 | 色温区间 | 光比 | 柔和度 | 氛围 | 典型范式 |
|---|---|---|---|---|---|---|
| `TIME-DAWN` | 晨光 | 3500-4500K | 中 | 中高 | 清新、苏醒、希望 | 宋式山水（晨雾） |
| `TIME-NOON` | 正午 | 5500-6500K | 高 | 低 | 明亮、清晰、强烈 | 唐式宫殿（日光普照） |
| `TIME-DUSK` | 黄昏 | 2500-3500K | 中高 | 中 | 温暖、沉静、归息 | 通用（夕阳） |
| `TIME-MOON` | 月夜 | 3500-4500K（冷调） | 高 | 中高 | 神秘、沉静、诗意 | 宋式山水（月夜） |
| `TIME-CANDLE` | 烛火 | 2700-3200K | 高 | 高 | 温暖、私密、仪式 | 唐式（灯火）、明式（夜读） |
| `TIME-OVERCAST` | 阴天 | 5500-6500K | 低 | 高 | 素雅、沉静、内敛 | 宋式（水墨意境） |

### 6.2 光材交互规范

光源在不同材质上必须产生物理合理的交互效果：

| 材质 | 高光特征 | 反射特征 | 半透特征 |
|---|---|---|---|
| BRONZE 金属 | 锐利高光，高光颜色 = 光源色 × 材质色 | 高反射率，环境映射明显 | 不透明 |
| GLAZE 釉 | 中等锐利高光，clearcoat 层 | 中高反射率，釉面反射 | 半透（厚釉不透明，薄釉微透） |
| WOOD 木 | 柔和漫反射高光，无 clearcoat（除非上漆） | 低反射率，漫反射主导 | 不透明 |
| STONE 石 | 柔和高光，粗糙面无明显高光 | 低-中反射率，漫反射 | 不透明（玉石微透） |
| LACQUER 漆 | 锐利高光（大漆镜面效果） | 高反射率 | 不透明 |
| SILK 绢 | 柔和高光，织物纹理 | 低反射率，漫反射 | 半透（薄绢透光） |

**光材交互的可观测断言**: 高光位置应在光源方向的镜面反射方向上；高光锐利度应与材质粗糙度匹配；半透材质应有背光透射效果。

### 6.3 光照叙事性

在序列帧/视频中，光照的变化可以表达时间流逝与叙事推进：

- **时间推进**: 晨光 → 正午 → 黄昏 → 月夜，表达一天的时间流逝。
- **情绪转换**: 冷调 → 暖调，表达情绪从沉静到温暖的转换。
- **焦点转移**: 光照方向/强度的变化引导视线转移，配合宾主关系的转换。

光照叙事性必须与画面内容一致，不能为了变化而变化。

---

## 7. Period Grammar — 时代范式语法

### 7.1 三大范式定义

| 范式 ID | 名称 | 核心气质 | 尺度偏好 | 材质偏好 | 色彩偏好 | 构图偏好 | 光照偏好 |
|---|---|---|---|---|---|---|---|
| `PERIOD-TANG` | 唐式 | 雄浑、华丽、开放、大气 | 尚大、巨构、仰视 | 青铜、鎏金、琉璃、石 | 朱红、鎏金、石青，高饱和 | 中轴对称，低角度仰视 | 日光普照、烛火辉煌 |
| `PERIOD-SONG` | 宋式 | 清雅、含蓄、内敛、意境 | 尚精、小品、平视/俯视 | 青瓷、玉石、砚石、绢 | 墨灰、淡赭、花青，极低饱和 | 不对称，大量留白，对角线 | 阴天、月夜、晨雾 |
| `PERIOD-MING` | 明式 | 精严、简雅、温润、秩序 | 适中、比例精严、平视 | 硬木（黄花梨/紫檀）、大漆、玉 | 木色、月白、黛青，低饱和 | 中轴对称，水平延展 | 北窗日光、夜读烛火 |

### 7.2 范式参数约束

每个范式对八大母语法的参数域有特定约束：

| 参数 | TANG | SONG | MING |
|---|---|---|---|
| 负空间比例 | 0.15-0.35 | 0.40-0.65 | 0.25-0.45 |
| 主辅尺度比 | 2.5-5.0 | 1.5-3.0 | 2.0-4.0 |
| 色彩饱和度 | 高 (0.6-1.0) | 极低 (0.05-0.3) | 低-中 (0.2-0.5) |
| 主导材质时间痕迹 | MODERATE-HEAVY | LIGHT-MODERATE | MODERATE |
| 视平线 | LOW (仰视) | HIGH (俯视) | MID (平视) |
| 光照天时 | NOON / CANDLE | OVERCAST / MOON / DAWN | DAYLIGHT(北窗) / CANDLE |

### 7.3 范式纯度与混合

- **范式纯度**: 一个画面的所有参数应落在同一范式的约束域内，称为"范式纯度高"。
- **范式混合**: 不同范式的参数可以混合（如唐式建筑 + 宋式山水背景），但混合必须有明确的语义理由（如时间叠加、空间对比），不能是随机混合。
- **Anti-Pattern**: 范式参数随机混合（如唐式高饱和色彩 + 宋式极简构图 + 明式木材质）且无语义理由，判定为范式混乱（§8）。

---

## 8. Anti-Pattern Grammar — 伪国风淘汰语法

### 8.1 六大伪国风淘汰门禁

| 门禁 ID | 名称 | 判定规则 | 严重度 |
|---|---|---|---|
| `ANTI-SYMBOL-STACK` | 符号堆砌 | 画面中存在 3 个以上无结构关系的"中国风符号"（龙/凤/祥云/回纹/印章/书法等），且符号之间无构图骨架对齐、无宾主关系 | P0 |
| `ANTI-PLASTIC-GLOSS` | 塑料高光 | 主导材质（尤其是木/石/玉/青铜）出现不符合材质物理的镜面高光（clearcoat 强度 > 0.8 且粗糙度 < 0.1），且无时间痕迹 | P0 |
| `ANTI-TIMELESS-SURFACE` | 均质无时间感 | 所有材质的时间痕迹等级为 TRACE-NONE，表面完美无瑕，无磨损/包浆/风化/沁色 | P1 |
| `ANTI-DEAD-WHITE-BG` | 死白背景 | 背景为纯白光（RGB > 250 且饱和度 < 0.05），且无虚实转换、无大气透视、无光照氛围 | P1 |
| `ANTI-PERIOD-CHAOS` | 范式混乱 | 画面参数跨越 2 个以上范式的约束域（如唐式高饱和 + 宋式极简留白 + 明式木材质），且无语义理由 | P1 |
| `ANTI-FAKE-EVIDENCE` | 伪证据 | 美学评估中使用硬编码常数/默认值作为"测量结果"，或在无物理证据的情况下输出 PASS | P0 (系统级) |

### 8.2 符号堆砌的精确定义

符号堆砌（ANTI-SYMBOL-STACK）是最常见的伪国风模式，精确定义如下：

**中国风符号**（非穷举）: 龙、凤、麒麟、祥云、回纹、万字纹、印章、书法汉字、水墨画笔触、青花瓷纹样、唐草纹、斗拱形象、飞檐形象等。

**判定条件**（全部满足时触发）:
1. 画面中存在 ≥ 3 个不同类型的中国风符号。
2. 符号之间无构图骨架对齐（不落在中轴/对角线/三分线上）。
3. 符号之间无宾主关系（无明确的主体与辅从，视觉权重相近）。
4. 符号之间无材质/光照的统一性（每个符号似乎来自不同的渲染场景）。

**合法例外**: 符号数量 ≥ 3 但满足以下任一条件时，不判定为符号堆砌：
- 符号作为建筑装饰元素（如斗拱+飞檐+彩绘，统一在建筑构图骨架内）。
- 符号作为画面主体的纹饰（如青铜器上的饕餮纹+云雷纹，统一在器物材质上）。
- 符号有明确的叙事/语义关系（如书法+印章+绘画的统一手卷构图）。

### 8.3 Anti-Pattern Gate 的执行位置

Anti-Pattern Gate 在评估管线中的位置：

```
RawDesignIR
    ↓
Core Compiler (Step 0~5) — 锁定，不修改
    ↓
ExecutionPlan → Render
    ↓
Physical Evidence Extraction (视觉特征/光流/深度)
    ↓
┌─────────────────────────────────┐
│  Anti-Pattern Gate (本层)        │
│  - 符号堆砌检测                   │
│  - 塑料高光检测                   │
│  - 无时间感检测                   │
│  - 死白背景检测                   │
│  - 范式混乱检测                   │
│  - 伪证据检测（系统级）            │
└─────────────────────────────────┘
    ↓ (通过门禁后)
Chinese Aesthetic Evaluation (母语法评估)
    ↓
Semantic Interpretation
```

**关键原则**: Anti-Pattern Gate 是**淘汰门禁**，不是评分维度。触发 P0 门禁的画面直接判定为"非中国美学表达"，不进入母语法评估。触发 P1 门禁的画面进入母语法评估，但在最终报告中标记警告。

---

## 9. Design Operations — 机器设计算子

### 9.1 从评估到生成

现有原型只能评估（evaluate），不能生成（generate）。本架构的核心升级之一是从母语法导出**确定性的 Design Operations**——可以作用于 RawDesignIR / ExecutionPlan 的机器设计算子。

每个 Design Operation 必须满足：
1. **确定性**: 相同输入产生相同输出（无随机性，除非显式声明）。
2. **可追溯**: 操作的每个参数变更都有母语法依据。
3. **可逆**: 操作可以被撤销（记录变更前的值）。
4. **边界安全**: 操作不修改 ABI 1.0.0 不允许的字段。

### 9.2 设计算子库

#### 9.2.1 构图算子（Composition Operations）

| 算子 ID | 名称 | 输入 | 输出 | 母语法依据 |
|---|---|---|---|---|
| `OP-ALIGN-TO-SKELETON` | 骨架对齐 | 元素列表 + 骨架类型 | 元素位置调整（对齐到骨架） | AXIOM-JINGYING |
| `OP-SET-HORIZON` | 视平线设定 | 视平线取态（LOW/MID/HIGH） | 相机俯仰角调整 | AXIOM-CHIDU, AXIOM-JINGYING |
| `OP-RESERVE-CENTRAL` | 中心留边 | 边白比例 | 主体区域缩放 + 居中 | AXIOM-JIBAI, AXIOM-BINZHU |
| `OP-BALANCE-BINZHU` | 宾主平衡 | 主体 + 辅从列表 | 辅从位置/尺度调整（不僭越主体） | AXIOM-BINZHU |

#### 9.2.2 空间算子（Spatial Operations）

| 算子 ID | 名称 | 输入 | 输出 | 母语法依据 |
|---|---|---|---|---|
| `OP-CREATE-VOID-REGION` | 留白区域创建 | 位置 + 面积 + 形状 | 空域区域定义 | AXIOM-JIBAI |
| `OP-SET-DEPTH-LAYERS` | 纵深分层 | 层数 + 层间分离度 | 元素深度排序 + 大气透视参数 | AXIOM-XUSHI |
| `OP-CREATE-TRANSITION-BAND` | 虚实转换带创建 | 位置 + 宽度 + 方向 | 虚实渐变参数 | AXIOM-XUSHI |

#### 9.2.3 材质算子（Material Operations）

| 算子 ID | 名称 | 输入 | 输出 | 母语法依据 |
|---|---|---|---|---|
| `OP-APPLY-TIME-TRACE` | 时间痕迹施加 | 材质 + 痕迹类型 + 强度等级 | 粗糙度/颜色/法线贴图调整 | AXIOM-CAIZHI |
| `OP-MATERIAL-CONTRAST` | 材质对比设置 | 相邻元素对 + 对比类型 | 材质类别/参数调整 | AXIOM-CAIZHI, AXIOM-BINZHU |

#### 9.2.4 光照算子（Light Operations）

| 算子 ID | 名称 | 输入 | 输出 | 母语法依据 |
|---|---|---|---|---|
| `OP-SET-TIME-OF-DAY` | 天时设定 | 天时类型（DAWN/NOON/DUSK/MOON/CANDLE/OVERCAST） | 色温/强度/方向/柔和度调整 | AXIOM-GUANGZHAO |
| `OP-LIGHT-MATERIAL-MATCH` | 光材匹配校正 | 光源 + 材质列表 | 高光/反射/半透参数校正 | AXIOM-GUANGZHAO, AXIOM-CAIZHI |

#### 9.2.5 动力学算子（Dynamic Operations）

| 算子 ID | 名称 | 输入 | 输出 | 母语法依据 |
|---|---|---|---|---|
| `OP-DEFINE-FLOW-PATH` | 气脉定义 | 气脉路径点序列 + 节奏变化点 | 相机运动/元素排列/亮度梯度引导 | AXIOM-QIYUN |
| `OP-SET-RHYTHM` | 节奏设定 | 疏密/急缓/聚散模式 | 元素间距/运动速度/亮度变化调整 | AXIOM-QIYUN |

### 9.3 算子执行的安全性约束

- **不修改 Core Compiler**: Design Operations 作用于 RawDesignIR / ExecutionPlan 的参数层，不修改 compiler-core/ 的代码。
- **不修改 ABI 字段**: 算子只能修改 ABI 1.0.0 定义中允许的参数，不能新增字段或修改 schema。
- **操作可审计**: 每个算子的执行记录在 `transformationTrace` 中（与 3.3-c 建立的机制一致），包含操作 ID、输入值、输出值、母语法依据。
- **Anti-Pattern 优先**: 算子执行前先通过 Anti-Pattern Gate 检查，不允许算子生成触发 P0 门禁的结果。

---

## 10. Evidence Model — 证据纯度规范

### 10.1 证据纯度铁律

**铁律 E-01: 零硬编码常数**
任何机器可断言指标的数值必须来自以下三个来源之一，严禁在函数内部硬编码默认值：
1. **物理证据文件**: 从 `visual-features.json` / `motion-summary.json` / `depth-buffer` 等物理证据中提取。
2. **Core IR 字段**: 从 `RawDesignIR` / `ValidatedDesignIR` / `ExecutionPlan` 中读取。
3. **实机渲染输出**: 从渲染帧的像素缓冲中计算（如亮度直方图、边缘密度）。

违反铁律 E-01 的代码判定为 P0 伪证据注入，必须修复。

**铁律 E-02: 不可测量即标记**
如果某个维度无法从上述三个来源获得测量值，必须显式标记为 `UNMEASURED_SEMANTIC`，严禁用虚假默认值填补。

**铁律 E-03: 证据可追溯**
每个指标值必须携带 `evidenceRef`，指向其来源（文件路径 + 字段路径，或 Core IR 字段路径，或渲染帧计算方法）。无 `evidenceRef` 的指标值判定为不可信。

**铁律 E-04: 代理不僭越**
可观测代理指标（如光流相干性）只能作为母语法（如气韵贯通）的**证据**，不能直接等同于母语法的判定。母语法的判定需要多个代理维度的综合 + 语义诠释层的参与。

### 10.2 现有原型的伪证据清单

以下是现有 `machine-evaluator.ts` 中违反铁律 E-01 的硬编码常数完整清单，作为 Phase 2 迁移时的修复对照：

| 位置 | 变量 | 硬编码值 | 应来源 |
|---|---|---|---|
| `evaluateFocalHierarchy` | `secondaryArea` | 0.20 | visual-features palette.secondaryRatio |
| `evaluateFocalHierarchy` | `accentArea` | 0.15 | visual-features palette.accentRatio |
| `evaluateFocalHierarchy` | `dominantArea` fallback | 0.25 | Core IR color.dominant.confidence（已有，但 fallback 仍为硬编码） |
| `evaluateVoidSolid` | `visualDensityVariance` | 0.15 | 渲染帧边缘密度方差（实机计算） |
| `evaluateVoidSolid` | `edgeDensitySkew` | 0.1 | 渲染帧边缘密度偏度（实机计算） |
| `evaluateQiyunContinuity` | `chromaticContinuity` | 0.75 | 关键帧间色差连续性（从 visual-features perFrame 计算） |
| `evaluateQiyunContinuity` | `depthContinuity` | 0.70 | 关键帧间深度连续性（从 depth-buffer 计算） |
| `evaluateSpatialDepth` | `occlusionCount` | 2 | 深度图层遮挡关系数（从 depth-buffer 计算） |
| `evaluateSpatialDepth` | `atmosphericDepth` | 0.6 | 远景亮度/对比度衰减率（从渲染帧计算） |
| `evaluateSpatialDepth` | `focalDepthSeparation` | 0.55 | 焦深分离度（从深度图计算） |
| `evaluateColorRelationship` | `luminanceHierarchy` | 0.7 | 主导/辅助/点缀色亮度排序（从 palette 计算） |
| `evaluateMaterialRelationship` | `surfaceVariation` | 0.35 | 不同材质粗糙度方差（从 Core IR materials 计算） |
| `evaluateMaterialRelationship` | `microDetailDistribution` | 0.55 | 高频纹理能量（从渲染帧 Laplacian 计算） |

**总计: 14 处硬编码常数**，全部违反铁律 E-01。

### 10.3 证据类型体系

| 证据类型 ID | 名称 | 来源 | 示例 |
|---|---|---|---|
| `EVID-PIXEL` | 像素级证据 | 渲染帧 RGBA 缓冲 | 亮度直方图、边缘密度、色彩分布 |
| `EVID-DEPTH` | 深度证据 | 深度缓冲 (Z-buffer) | 深度图层、遮挡关系、焦深 |
| `EVID-MOTION` | 运动证据 | 光流场 / 运动摘要 | 光流相干性、相机运动平滑度 |
| `EVID-IR` | IR 字段证据 | Core IR (Raw/Validated/ExecutionPlan) | 材质参数、光照参数、构图参数 |
| `EVID-SEMANTIC` | 语义证据 | 人工标注 / 范式定义 | 范式标签、文化内涵、诠释理由 |
| `EVID-UNMEASURED` | 不可测量 | — | 标记为无法从物理来源获得的维度 |

### 10.4 证据纯度审计流程

Phase 2 迁移时，对每个机器断言执行以下审计：

1. **来源检查**: 每个指标值是否有合法来源（EVID-PIXEL / EVID-DEPTH / EVID-MOTION / EVID-IR）？
2. **硬编码扫描**: 函数内部是否存在硬编码数值常数？
3. **可追溯性**: 每个指标值是否携带 `evidenceRef`？
4. **代理僭越检查**: 断言是否将代理指标直接等同于母语法判定？
5. **不可测量标记**: 无法测量的维度是否标记为 `UNMEASURED_SEMANTIC`？

全部通过的断言标记为 `EVIDENCE-PURE`，存在问题的标记为 `EVIDENCE-CONTAMINATED` 并列出修复项。

---

## 11. 迁移路线图

### Phase 1: Theory & Modeling（当前阶段）

- ✅ 本文档定义本体、关系图谱、语法体系、设计算子、证据规范
- ⏳ 评审与冻结本体（Ontology Freeze）
- **零代码修改**

### Phase 2: Infrastructure Migration

- 将现有 `machine-assertions.ts` / `semantic-evaluator.ts` 标记为 `prototype-archive/`
- 实现证据提取层（从渲染帧/深度图/光流/Core IR 提取物理证据）
- 实现 Anti-Pattern Gate
- 实现 Relationship Graph 数据结构
- 修复全部 14 处硬编码常数（铁律 E-01）

### Phase 3: Axiom Evaluation

- 实现八大母语法的评估器（基于关系图谱 + 物理证据，非标量阈值）
- 实现语义诠释层（Semantic Interpretation），明确区分机器证据与文化判断
- 实现证据纯度审计

### Phase 4: Design Operations

- 实现设计算子库（§9.2）
- 实现算子执行管线（安全性约束 + transformationTrace 记录）
- 实现算子与母语法的映射

### Phase 5: Integration & Matrix Expansion

- 将 Chinese Aesthetic Provider 接入 Design Compiler 管线
- 扩展 Golden Case Matrix（36-cell 全空间），使用 Chinese Aesthetic 评估
- 与 PBR Pipeline 集成（材质时间痕迹 + 光材交互）

---

## 12. 附录

### 12.1 术语表

| 术语 | 定义 |
|---|---|
| 母语法 (Generative Axiom) | 中国美学中不可再分解的生成性原则，能导出 Design Operations |
| 关系图谱 (Relationship Graph) | 画面实体之间的关系/力场的拓扑表示 |
| 设计算子 (Design Operation) | 从母语法导出的、可作用于 IR 的确定性机器操作 |
| 证据纯度 (Evidence Purity) | 机器指标值必须来自物理来源，无硬编码常数，可追溯 |
| 代理指标 (Proxy Metric) | 母语法的可观测物理维度，仅作证据，不作判定 |
| 伪国风 (Anti-Pattern) | 表面有中国风符号但缺乏中国美学结构的表达模式 |
| 天时 (Time-Atmosphere) | 光照配置与时间氛围的同构表达系统 |
| 时间痕迹 (Time Trace) | 材质经时间作用后产生的物理痕迹（包浆/风化/磨损/沁色） |

### 12.2 与现有系统的边界

| 系统 | 关系 | 边界 |
|---|---|---|
| Core Compiler (Step 0~5) | 被 Chinese Aesthetic Provider 调用 | 不修改 Core Compiler 代码 |
| ABI 1.0.0 | Chinese Aesthetic 操作的字段约束 | 不新增/修改 ABI 字段 |
| Step 6-B Normalizer | Chinese Aesthetic 的 IR 来源 | 不修改 Normalizer |
| 5-Dim Evaluator | 独立于 Chinese Aesthetic 的物理评测 | 不修改 Evaluator 阈值；Chinese Aesthetic 是正交评估层 |
| PBR Pipeline | Chinese Aesthetic 材质/光照的渲染基础 | 不修改 PBR shader；Chinese Aesthetic 定义材质时间痕迹与光材交互的评估标准 |
| Golden Case Matrix | Chinese Aesthetic 的测试用例来源 | Matrix v1.0.1 定义 6-cell 基线；Chinese Aesthetic 扩展后可用于 36-cell 全矩阵 |

### 12.3 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1.0 | 2026-09-16 | 初始草案：八大母语法、关系图谱、六大语法、设计算子、证据规范 |

---

**— Chinese Aesthetic Foundation v0.1.0 Draft —**
**Phase 1: Theory & Modeling. Zero code changes. Ontology pending freeze.**
