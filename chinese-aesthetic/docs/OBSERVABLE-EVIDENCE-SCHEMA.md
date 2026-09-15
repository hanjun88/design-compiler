# Observable Evidence Schema — 可观测证据模式规范

**阶段**: chinese-aesthetic-foundation / Phase 2 Step 2.1
**版本**: 0.1.0 (Draft)
**前置依赖**: CHINESE_AESTHETIC_FOUNDATION.md v0.1.0 (FROZEN @ e825a07)
**基线**: `feature/chinese-aesthetic-foundation` @ `e825a07`
**日期**: 2026-09-16
**规则**: Schema 定义优先，实现代码在 Step 2.2 之后；ZERO CORE MODIFICATION

---

## 0. 文档定位

### 0.1 本文档是什么

本文档定义 Chinese Aesthetic Provider 的**可观测证据层（Observable Evidence Layer）**的正式数据模式。它是连接物理渲染输出与美学关系图谱的桥梁：

```
Physical Render Output (像素缓冲 / 深度缓冲 / 光流 / Core IR)
        ↓
Evidence Extraction Layer (Step 2.2 实现)
        ↓
ObservableEvidenceSet (本文档定义)
        ↓
Relationship Evidence Graph (Step 2.3)
        ↓
Mother Grammar Proxy (Step 2.4)
        ↓
Human / Semantic Interpretation
```

### 0.2 本文档不是什么

- **不是**实现代码。本文档定义 TypeScript 接口与数据结构，实际提取逻辑在 Step 2.2 编写。
- **不是**对现有 `visual-features.json` / `motion-summary.json` 的修补。现有证据文件是旧原型的产物，新 Schema 定义的是独立的、可审计的证据结构。
- **不是**美学评分系统。证据层只记录"测量到了什么"，不做"这好不好"的判断。

### 0.3 核心设计原则

| 原则 ID | 原则 | 说明 |
|---|---|---|
| `SCHEMA-01` | 测量即证据 | 每个字段必须有明确的物理来源与计算方法，无来源的字段不允许存在 |
| `SCHEMA-02` | 可追溯 | 每个证据值携带 `evidenceRef`，指向其来源（渲染帧/深度图/光流/Core IR 字段路径） |
| `SCHEMA-03` | 置信度 | 每个测量值携带 `confidence`，反映测量的可靠性（如边缘检测的信噪比、光流的遮挡率） |
| `SCHEMA-04` | 不可测量即标记 | 无法从物理来源获得的维度，显式标记为 `UNMEASURED_SEMANTIC`，严禁用默认值填补 |
| `SCHEMA-05` | 代理不僭越 | 证据字段是母语法的**可观测代理**，字段名不使用文化术语（如不用 `qiyunScore`，而用 `opticalFlowDirectionCoherence`） |

---

## 1. 证据域模型（Evidence Domain Model）

可观测证据分为六大域，每个域对应一类物理来源：

| 域 ID | 名称 | 物理来源 | 核心测量对象 |
|---|---|---|---|
| `DOMAIN-PIXEL` | 像素证据 | 渲染帧 RGBA 缓冲 (480×270, 518400 bytes) | 亮度场、色彩分布、边缘密度、梯度方差 |
| `DOMAIN-DEPTH` | 深度证据 | 深度缓冲 (Z-buffer) / 深度图 | 深度拓扑、层间分离、遮挡关系、焦深 |
| `DOMAIN-MOTION` | 运动证据 | 光流场 (Farneback / dense flow) / 相机运动参数 | 光流张量、运动连续性、帧间色差/深度差 |
| `DOMAIN-MATERIAL` | 材质证据 | Core IR materials[] + 渲染帧表面分析 | 粗糙度分布、微表面方差、高光分布、时间痕迹代理 |
| `DOMAIN-IR` | IR 字段证据 | RawDesignIR / ValidatedDesignIR / ExecutionPlan | 构图参数、光照参数、材质参数、范式标签 |
| `DOMAIN-SEMANTIC` | 语义证据 | 人工标注 / 范式定义 / 设计意图 | 范式标签、文化内涵、诠释理由（不可由机器测量产生） |

### 1.1 域间依赖关系

```
DOMAIN-IR (输入参数)
    │
    ├──→ DOMAIN-PIXEL (渲染输出)
    │         │
    │         ├──→ DOMAIN-DEPTH (渲染深度)
    │         └──→ DOMAIN-MATERIAL (表面分析)
    │
    └──→ DOMAIN-MOTION (序列帧/视频)
              │
              └──→ DOMAIN-SEMANTIC (人工诠释，独立于机器测量)
```

**关键约束**: DOMAIN-SEMANTIC 不依赖任何机器测量域。它是独立的人工输入层，机器测量域不能"推导"出语义证据。

---

## 2. 正式 Schema 定义（TypeScript Interfaces）

### 2.1 顶层容器

```typescript
/**
 * ObservableEvidenceSet — 可观测证据集
 *
 * 单次渲染/评估产生的全部可观测证据的顶层容器。
 * 所有字段均为测量结果，不含任何美学判断。
 */
export interface ObservableEvidenceSet {
  /** 证据集唯一标识（与渲染帧/评估用例关联） */
  evidenceId: string;
  /** 证据生成时间（确定性输入，禁止 new Date()） */
  capturedAt: string;
  /** 渲染参数快照（用于证据可复现性） */
  renderContext: RenderContextSnapshot;
  /** 像素证据域 */
  pixel: PixelEvidence;
  /** 深度证据域 */
  depth: DepthEvidence;
  /** 运动证据域（单帧时为 null，序列帧时填充） */
  motion: MotionEvidence | null;
  /** 材质证据域 */
  material: MaterialEvidence;
  /** IR 字段证据域 */
  ir: IREvidence;
  /** 语义证据域（人工输入，机器不产生） */
  semantic: SemanticEvidence | null;
  /** 证据纯度审计结果 */
  purityAudit: EvidencePurityAudit;
}
```

### 2.2 渲染上下文快照

```typescript
/**
 * RenderContextSnapshot — 渲染上下文快照
 *
 * 记录产生此证据集的渲染参数，用于证据可复现性与溯源。
 */
export interface RenderContextSnapshot {
  /** 渲染器类型 */
  renderer: "software-reference" | "webgl2-tier-a" | string;
  /** 渲染器版本 */
  rendererVersion: string;
  /** 分辨率 */
  resolution: { width: number; height: number };
  /** 像素格式 */
  pixelFormat: "RGBA8888" | string;
  /** 缓冲字节数 */
  bufferByteLength: number;
  /** 渲染帧哈希（sha256，用于证据与渲染输出的绑定） */
  renderHash: string;
  /** Core IR 哈希（用于证据与输入的绑定） */
  irHash: string;
}
```

### 2.3 证据字段基类

```typescript
/**
 * EvidenceField — 证据字段基类
 *
 * 所有可观测证据字段必须继承此结构，确保可追溯性与置信度。
 * 严禁创建不携带 evidenceRef 和 confidence 的测量字段。
 */
export interface EvidenceField<T> {
  /** 测量值 */
  value: T;
  /** 证据引用（来源路径 + 计算方法，如 "pixel-buffer:luminance-histogram:method=rec601"） */
  evidenceRef: string;
  /** 测量置信度 [0, 1]，1=完全可靠，0=不可信 */
  confidence: number;
  /** 测量方法描述 */
  method: string;
}

/**
 * UnmeasuredSemantic — 不可测量语义占位
 *
 * 当某个维度无法从物理来源获得测量值时，使用此占位。
 * 严禁用数值默认值代替此占位。
 */
export interface UnmeasuredSemantic {
  /** 固定标记 */
  status: "UNMEASURED_SEMANTIC";
  /** 维度名称（如 "含蓄程度"、"意境深度"） */
  dimension: string;
  /** 不可测量的原因 */
  reason: string;
  /** 建议的人工诠释入口（指向 SemanticEvidence 的字段路径） */
  semanticInterpretationRef: string;
}
```

### 2.4 像素证据域（DOMAIN-PIXEL）

```typescript
/**
 * PixelEvidence — 像素证据域
 *
 * 从渲染帧 RGBA 缓冲中提取的全部可观测像素级测量。
 * 所有字段必须从实际像素缓冲计算，严禁硬编码。
 */
export interface PixelEvidence {
  // ── 亮度场 ──────────────────────────────────────────────
  /** 全帧平均亮度 (Rec.601 luma, [0, 255]) */
  meanLuminance: EvidenceField<number>;
  /** 亮度标准差（反映对比度） */
  luminanceStdDev: EvidenceField<number>;
  /** 亮度直方图（256 bin，每个 bin 的像素计数） */
  luminanceHistogram: EvidenceField<number[]>;
  /** 亮度直方图峰数（通过峰值检测，反映层次数） */
  luminanceHistogramPeakCount: EvidenceField<number>;

  // ── 梯度场 / 边缘 ───────────────────────────────────────
  /** 空间拉普拉斯方差（反映纹理密度/细节丰富度）
   *  迁移目标: 旧硬编码 visualDensityVariance = 0.15 */
  spatialLaplacianVariance: EvidenceField<number>;
  /** Sobel 边缘梯度偏度（反映边缘分布的对称性）
   *  迁移目标: 旧硬编码 edgeDensitySkew = 0.1 */
  sobelEdgeGradientSkew: EvidenceField<number>;
  /** 边缘像素占比（Sobel 阈值化后的边缘像素 / 总像素） */
  edgePixelRatio: EvidenceField<number>;
  /** 边缘方向直方图（8 方向，每个方向的边缘像素计数） */
  edgeOrientationHistogram: EvidenceField<number[]>;

  // ── 色彩分布 ─────────────────────────────────────────────
  /** 主色（k-means k=5 聚类的最大簇中心色，hex） */
  dominantColor: EvidenceField<string>;
  /** 辅助色（第二大簇中心色） */
  secondaryColor: EvidenceField<string>;
  /** 点缀色（第三大簇中心色） */
  accentColor: EvidenceField<string>;
  /** 主色面积占比 */
  dominantColorRatio: EvidenceField<number>;
  /** WCAG 对比度（主色 vs 辅助色） */
  contrastRatio: EvidenceField<number>;
  /** 色温偏移（从全帧平均色温度量，[-1, 1]，-1=极冷，1=极暖） */
  temperatureBias: EvidenceField<number>;
  /** 分割块亮度均值梯度（将画面分为 N×M 块，计算块间亮度均值的梯度范数）
   *  迁移目标: 旧硬编码 luminanceHierarchy = 0.7 */
  blockLuminanceMeanGradient: EvidenceField<number>;

  // ── 空域结构 ─────────────────────────────────────────────
  /** 负空间比例（高亮度低纹理像素 / 总像素，需定义阈值） */
  negativeSpaceRatio: EvidenceField<number>;
  /** 负空间连通分量数（连通域分析） */
  negativeSpaceComponentCount: EvidenceField<number>;
  /** 最大负空间区域面积占比 */
  largestVoidRegionRatio: EvidenceField<number>;
  /** 焦点位置（视觉显著性图的质心，[x, y] 归一化坐标） */
  focalPoint: EvidenceField<[number, number]>;
  /** 焦点距中心偏移（欧氏距离，[0, ~0.707]） */
  focalCenterOffset: EvidenceField<number>;

  // ── 非零像素 ─────────────────────────────────────────────
  /** 非零像素数（RGBA 不全为 0 的像素数） */
  nonZeroPixels: EvidenceField<number>;
  /** NaN/Inf 像素标记数（浮点渲染时检测，软件渲染固定为 0） */
  nanInfPixelCount: EvidenceField<number>;
}
```

### 2.5 深度证据域（DOMAIN-DEPTH）

```typescript
/**
 * DepthEvidence — 深度证据域
 *
 * 从深度缓冲 (Z-buffer) 中提取的空间纵深测量。
 * 软件渲染器需输出深度缓冲；若深度缓冲不可用，相关字段标记为 UNMEASURED_SEMANTIC。
 */
export interface DepthEvidence {
  /** 深度缓冲是否可用 */
  depthBufferAvailable: boolean;

  // ── 深度分布 ─────────────────────────────────────────────
  /** 深度直方图（N bin，每个 bin 的像素计数） */
  depthHistogram: EvidenceField<number[]> | UnmeasuredSemantic;
  /** 深度直方图峰数（反映景深层次数） */
  depthLayerCount: EvidenceField<number> | UnmeasuredSemantic;
  /** 层间分离度（深度峰之间的距离 / 深度范围） */
  layerSeparation: EvidenceField<number> | UnmeasuredSemantic;

  // ── 遮挡关系 ─────────────────────────────────────────────
  /** 遮挡边数量（深度不连续边的数量，反映前后景交叠） */
  occlusionEdgeCount: EvidenceField<number> | UnmeasuredSemantic;
  /** 遮挡关系图（简化为前景-中景-背景的遮挡链长度） */
  occlusionChainLength: EvidenceField<number> | UnmeasuredSemantic;

  // ── 大气透视 ─────────────────────────────────────────────
  /** 大气透视深度（远景亮度/对比度相对近景的衰减率）
   *  迁移目标: 旧硬编码 atmosphericDepth = 0.6 */
  atmosphericDepth: EvidenceField<number> | UnmeasuredSemantic;

  // ── 焦深 ─────────────────────────────────────────────────
  /** 焦深分离度（前景/中景/背景的虚实差异，需景深渲染支持）
   *  迁移目标: 旧硬编码 focalDepthSeparation = 0.55 */
  focalDepthSeparation: EvidenceField<number> | UnmeasuredSemantic;

  // ── 帧间深度连续性（运动域调用） ─────────────────────────
  /** 深度图运动投影残差（相邻帧深度图经运动投影后的残差均值）
   *  迁移目标: 旧硬编码 depthContinuity = 0.70
   *  注意: 此字段在 MotionEvidence 中计算，此处保留引用 */
  depthMotionProjectionResidual: EvidenceField<number> | UnmeasuredSemantic;
}
```

### 2.6 运动证据域（DOMAIN-MOTION）

```typescript
/**
 * MotionEvidence — 运动证据域
 *
 * 从光流场与序列帧中提取的运动测量。
 * 单帧渲染时此域为 null；序列帧/视频评估时填充。
 */
export interface MotionEvidence {
  /** 帧数（参与运动分析的帧对数） */
  framePairCount: number;

  // ── 光流场 ───────────────────────────────────────────────
  /** 光流方向一致性（所有像素光流方向的余弦相似度均值，[0, 1]） */
  opticalFlowDirectionCoherence: EvidenceField<number>;
  /** 光流幅度稳定性（相邻帧光流幅度的变异系数倒数，[0, 1]） */
  opticalFlowAmplitudeStability: EvidenceField<number>;
  /** 全局位移均值（per-frame globalDx/globalDy 的均值） */
  globalDisplacementMean: EvidenceField<[number, number]>;
  /** 全局位移标准差（反映相机运动平滑度） */
  globalDisplacementStdDev: EvidenceField<number>;
  /** 相机运动平滑度（1 / (1 + stdDx/5)，与旧原型计算一致） */
  cameraMotionSmoothness: EvidenceField<number>;

  // ── 帧间连续性 ───────────────────────────────────────────
  /** 亮度连续性（相邻帧亮度差的倒数归一化，[0, 1]） */
  luminanceContinuity: EvidenceField<number>;
  /** 色彩连续性（相邻帧颜色直方图巴氏距离的倒数，[0, 1]）
   *  迁移目标: 旧硬编码 chromaticContinuity = 0.75 */
  chromaticContinuity: EvidenceField<number>;
  /** 颜色直方图相邻帧巴氏距离（原始距离，越小越连续） */
  colorHistogramBhattacharyyaDistance: EvidenceField<number>;
  /** 运动连续性（相机平滑度与光流相干性的均值） */
  motionContinuity: EvidenceField<number>;

  // ── 节奏变化 ─────────────────────────────────────────────
  /** 光流幅度变化点数（光流幅度序列中显著变化的位置数，反映节奏转折） */
  rhythmChangePointCount: EvidenceField<number>;
  /** 运动速度变异系数（光流幅度的标准差/均值，反映运动节奏的不均匀性） */
  motionSpeedCoefficientOfVariation: EvidenceField<number>;
}
```

### 2.7 材质证据域（DOMAIN-MATERIAL）

```typescript
/**
 * MaterialEvidence — 材质证据域
 *
 * 从 Core IR materials[] 与渲染帧表面分析中提取的材质测量。
 * 材质参数的权威来源是 Core IR；渲染帧分析用于验证材质的视觉表现。
 */
export interface MaterialEvidence {
  /** 材质数量 */
  materialCount: number;
  /** 主导材质索引（面积占比最大的材质） */
  dominantMaterialIndex: EvidenceField<number>;

  // ── Core IR 材质参数（直接从 IR 读取，非渲染计算） ──────
  /** 主导材质粗糙度（来自 Core IR materials[dominant].roughness） */
  dominantRoughness: EvidenceField<number>;
  /** 主导材质金属度（来自 Core IR） */
  dominantMetalness: EvidenceField<number>;
  /** 主导材质磨损度（来自 Core IR） */
  dominantWear: EvidenceField<number>;
  /** 主导材质 baseType（来自 Core IR，如 "BRONZE::tang-gilt-bronze"） */
  dominantBaseType: EvidenceField<string>;
  /** 材质类别（从 baseType 解析的前缀，如 BRONZE/WOOD/GLAZE/STONE） */
  dominantMaterialCategory: EvidenceField<string>;

  // ── 渲染帧表面分析 ───────────────────────────────────────
  /** 表面变化度（不同材质区域粗糙度的方差，需多材质场景）
   *  迁移目标: 旧硬编码 surfaceVariation = 0.35
   *  单材质场景此值为 0，需标记低置信度 */
  surfaceVariation: EvidenceField<number>;
  /** 微表面高频方差（渲染帧法线贴图/高频纹理能量，Laplacian 高频带能量）
   *  迁移目标: 旧硬编码 microDetailDistribution = 0.55 */
  microSurfaceHighFrequencyVariance: EvidenceField<number>;
  /** 高光像素占比（亮度 > 阈值且饱和度低的像素占比，反映金属/釉面高光） */
  specularHighlightRatio: EvidenceField<number>;
  /** 高光锐利度（高光区域的亮度梯度均值，反映材质光滑度） */
  specularSharpness: EvidenceField<number>;

  // ── 时间痕迹代理（从渲染帧推断，非直接测量） ────────────
  /** 粗糙度空间方差（同一材质区域内粗糙度的空间变化，作为磨损/风化的代理）
   *  注意: 这是代理指标，不等于"时间痕迹"本身 */
  roughnessSpatialVariance: EvidenceField<number>;
  /** 颜色变化空间梯度（同一材质区域内颜色的空间渐变，作为沁色/风化的代理） */
  colorVariationSpatialGradient: EvidenceField<number>;
  /** 时间痕迹可检测性（是否存在足够的空间变化来推断时间痕迹，[0, 1]） */
  timeTraceDetectability: EvidenceField<number>;
}
```

### 2.8 IR 字段证据域（DOMAIN-IR）

```typescript
/**
 * IREvidence — IR 字段证据域
 *
 * 直接从 Core IR (RawDesignIR / ValidatedDesignIR / ExecutionPlan) 读取的参数。
 * 这些不是"测量"，而是"输入声明"，但作为证据链的一部分需要记录。
 */
export interface IREvidence {
  /** IR 哈希（与证据集绑定） */
  irHash: string;
  /** IR 类型 */
  irType: "RawDesignIR" | "ValidatedDesignIR" | "ExecutionPlan";

  // ── 构图参数 ─────────────────────────────────────────────
  /** 范式标签（从 concept.name / metadata.tags 解析，如 TANG/MING/SONG） */
  paradigm: EvidenceField<string>;
  /** 构图类型（如 central-axis / diagonal / l-shape / tripartition） */
  compositionType: EvidenceField<string>;
  /** 对称性（从 composition.symmetry 读取，[0, 1]） */
  symmetry: EvidenceField<number>;
  /** 负空间比例声明（从 composition.negativeSpaceRatio 读取） */
  declaredNegativeSpaceRatio: EvidenceField<number>;
  /** 视平线位置（从 camera.horizonPosition 读取，[0, 1]） */
  horizonPosition: EvidenceField<number>;
  /** 相机俯仰角（从 camera.pitch 读取，度） */
  cameraPitch: EvidenceField<number>;

  // ── 光照参数 ─────────────────────────────────────────────
  /** 光照意图（从 intent.heuristicIds 解析，如 DAYLIGHT/CANDLELIGHT/DIM） */
  lightingIntent: EvidenceField<string>;
  /** 色温（从 lighting.colorTemp 读取，K） */
  colorTemp: EvidenceField<number>;
  /** 光强（从 lighting.intensity 读取，[0, 2]） */
  lightIntensity: EvidenceField<number>;
  /** 柔和度（从 lighting.softness 读取，[0, 1]） */
  lightSoftness: EvidenceField<number>;
  /** 环境光比例（从 lighting.ambientRatio 读取，[0, 1]） */
  ambientRatio: EvidenceField<number>;

  // ── 材质参数（输入声明） ─────────────────────────────────
  /** 材质列表（每个材质的 baseType/roughness/metalness/wear） */
  materials: EvidenceField<Array<{
    baseType: string;
    materialCategory: string;
    roughness: number;
    metalness: number;
    wear: number;
  }>>;

  // ── 变换追踪（Core Compiler 的语法重写记录） ─────────────
  /** 变换追踪列表（记录 Core Compiler 对输入参数的重写，如 CA-RULE-03-CANGRUN） */
  transformationTrace: EvidenceField<Array<{
    ruleId: string;
    field: string;
    inputValue: unknown;
    outputValue: unknown;
    action: string;
  }>>;
}
```

### 2.9 语义证据域（DOMAIN-SEMANTIC）

```typescript
/**
 * SemanticEvidence — 语义证据域
 *
 * 人工输入的语义/文化诠释证据。此域**不**由机器测量产生，
 * 只能由人工标注或设计意图声明填充。
 * 机器评估管线可以读取此域作为参考，但不能"推导"出此域的内容。
 */
export interface SemanticEvidence {
  /** 语义证据来源（"human-annotation" / "design-intent" / "expert-judgment"） */
  source: string;
  /** 标注者/来源标识 */
  annotator: string;
  /** 标注时间（确定性输入） */
  annotatedAt: string;

  // ── 文化内涵诠释 ─────────────────────────────────────────
  /** 意境描述（人工撰写的画面意境诠释，中文） */
  artisticConception: string;
  /** 文化典故引用（如引用的诗词、画论、历史典故） */
  culturalReferences: string[];
  /** 范式判定理由（为什么判定为 TANG/SONG/MING，人工理由） */
  paradigmJustification: string;

  // ── 母语法人工评估（不可由机器测量的维度） ───────────────
  /** 各母语法的人工评估（每个母语法的人工判断与理由） */
  axiomHumanAssessment: Record<string, {
    judgment: "PASS" | "FAIL" | "INCONCLUSIVE";
    rationale: string;
  }>;

  // ── 不可测量维度清单 ─────────────────────────────────────
  /** 明确标记为不可机器测量的维度清单 */
  unmeasuredDimensions: Array<{
    dimension: string;
    reason: string;
    humanAssessmentRef: string;
  }>;
}
```

### 2.10 证据纯度审计

```typescript
/**
 * EvidencePurityAudit — 证据纯度审计结果
 *
 * 对证据集进行纯度检查的结果，确保零硬编码、全可追溯。
 */
export interface EvidencePurityAudit {
  /** 审计时间 */
  auditedAt: string;
  /** 总字段数 */
  totalFields: number;
  /** 已测量字段数（有真实 value 的 EvidenceField） */
  measuredFields: number;
  /** 不可测量字段数（UnmeasuredSemantic） */
  unmeasuredFields: number;
  /** 硬编码常数检测（发现的硬编码伪常数列，应为空） */
  hardcodedConstantsFound: string[];
  /** 缺失 evidenceRef 的字段（应为空） */
  fieldsMissingEvidenceRef: string[];
  /** 缺失 confidence 的字段（应为空） */
  fieldsMissingConfidence: string[];
  /** 纯度判定 */
  purityStatus: "PURE" | "CONTAMINATED";
  /** 污染详情（如有） */
  contaminationDetails: string[];
}
```

---

## 3. 证据提取管线（Evidence Extraction Pipeline）

### 3.1 管线阶段

```
Stage 1: Render Output Capture
  ├─ 捕获 RGBA 像素缓冲 (518400 bytes)
  ├─ 捕获深度缓冲 (如可用)
  ├─ 记录 renderHash / irHash
  └─ 输出: RenderContextSnapshot

Stage 2: Pixel Domain Extraction
  ├─ 亮度场计算 (Rec.601)
  ├─ 亮度直方图 + 峰检测
  ├─ Sobel 边缘检测 + 方向直方图
  ├─ 拉普拉斯方差计算
  ├─ k-means 色彩聚类 (k=5)
  ├─ WCAG 对比度计算
  ├─ 块亮度梯度计算
  ├─ 负空间连通域分析
  ├─ 视觉显著性质心计算
  └─ 输出: PixelEvidence

Stage 3: Depth Domain Extraction (如深度缓冲可用)
  ├─ 深度直方图 + 峰检测
  ├─ 遮挡边检测
  ├─ 大气透视衰减计算
  └─ 输出: DepthEvidence

Stage 4: Motion Domain Extraction (序列帧时)
  ├─ Farneback 稠密光流计算
  ├─ 光流方向一致性 / 幅度稳定性
  ├─ 全局位移统计
  ├─ 帧间亮度差 / 颜色直方图巴氏距离
  ├─ 节奏变化点检测
  └─ 输出: MotionEvidence

Stage 5: Material Domain Extraction
  ├─ 从 Core IR 读取材质参数
  ├─ 渲染帧高光检测
  ├─ 微表面高频能量计算
  ├─ 粗糙度空间方差
  └─ 输出: MaterialEvidence

Stage 6: IR Domain Extraction
  ├─ 从 Core IR 读取构图/光照/材质参数
  ├─ 解析范式标签 / 光照意图 / 材质类别
  ├─ 记录 transformationTrace
  └─ 输出: IREvidence

Stage 7: Purity Audit
  ├─ 扫描全部字段的 evidenceRef / confidence
  ├─ 检测硬编码常数
  ├─ 统计 measured / unmeasured 比例
  └─ 输出: EvidencePurityAudit
```

### 3.2 提取顺序约束

**必须先完成 Stage 1-6 的证据提取，才能进入关系图谱计算（Step 2.3）。** 严禁在证据结构未定义、提取未实现的情况下，直接删除旧硬编码常数——否则系统会从"假指标"变成"指标缺失"。

**正确顺序**:
1. ✅ Step 2.1: 定义 Observable Evidence Schema（当前步骤）
2. ⏳ Step 2.2: 实现证据提取层（Stage 1-7）
3. ⏳ Step 2.3: 实现 Relationship Evidence Graph
4. ⏳ Step 2.4: 实现 Anti-Pattern Gate
5. ⏳ Step 2.5: 拔除 14 处硬编码，迁移到新证据结构
6. ⏳ Step 2.6: 纯度法医审计

---

## 4. 14 处旧硬编码迁移映射表

以下是现有原型 `machine-evaluator.ts` 中全部 14 处硬编码伪常数的正式迁移映射。每个常数都有明确的新证据字段归宿，无"暂不修改"的灰色地带。

| # | 旧硬编码伪常数 | 旧位置 | 新证据字段 | 新域 | 计算方法 | 属性 |
|---|---|---|---|---|---|---|
| 1 | `visualDensityVariance = 0.15` | `evaluateVoidSolid()` | `pixel.spatialLaplacianVariance` | DOMAIN-PIXEL | 渲染帧拉普拉斯算子响应的方差 | 实测物理量 |
| 2 | `edgeDensitySkew = 0.1` | `evaluateVoidSolid()` | `pixel.sobelEdgeGradientSkew` | DOMAIN-PIXEL | Sobel 边缘梯度幅值分布的偏度 | 实测物理量 |
| 3 | `luminanceHierarchy = 0.7` | `evaluateColorRelationship()` | `pixel.blockLuminanceMeanGradient` | DOMAIN-PIXEL | N×M 分块亮度均值的梯度范数 | 实测物理量 |
| 4 | `surfaceVariation = 0.35` | `evaluateMaterialRelationship()` | `material.surfaceVariation` | DOMAIN-MATERIAL | 多材质区域粗糙度方差（单材质时=0，低置信度） | 实测物理量 |
| 5 | `microDetailDistribution = 0.55` | `evaluateMaterialRelationship()` | `material.microSurfaceHighFrequencyVariance` | DOMAIN-MATERIAL | 渲染帧高频带（Laplacian 高通）能量方差 | 实测物理量 |
| 6 | `chromaticContinuity = 0.75` | `evaluateQiyunContinuity()` | `motion.chromaticContinuity` | DOMAIN-MOTION | 相邻帧颜色直方图巴氏距离的倒数归一化 | 实测物理量 |
| 7 | `depthContinuity = 0.70` | `evaluateQiyunContinuity()` | `depth.depthMotionProjectionResidual` | DOMAIN-DEPTH | 相邻帧深度图经运动投影后的残差均值 | 实测物理量 |
| 8 | `secondaryArea = 0.20` | `evaluateFocalHierarchy()` | `pixel.dominantColorRatio` + 聚类 | DOMAIN-PIXEL | k-means 第二簇面积占比（从色彩聚类获得） | 实测物理量 |
| 9 | `accentArea = 0.15` | `evaluateFocalHierarchy()` | k-means 第三簇面积占比 | DOMAIN-PIXEL | k-means 第三簇面积占比 | 实测物理量 |
| 10 | `dominantArea fallback = 0.25` | `evaluateFocalHierarchy()` | `pixel.dominantColorRatio` | DOMAIN-PIXEL | k-means 最大簇面积占比（无 fallback） | 实测物理量 |
| 11 | `occlusionCount = 2` | `evaluateSpatialDepth()` | `depth.occlusionEdgeCount` | DOMAIN-DEPTH | 深度不连续边检测计数 | 实测物理量 |
| 12 | `atmosphericDepth = 0.6` | `evaluateSpatialDepth()` | `depth.atmosphericDepth` | DOMAIN-DEPTH | 远景/近景亮度对比度衰减率 | 实测物理量 |
| 13 | `focalDepthSeparation = 0.55` | `evaluateSpatialDepth()` | `depth.focalDepthSeparation` | DOMAIN-DEPTH | 前景/中景/背景虚实差异（需景深渲染） | 实测物理量 |
| 14 | `emptyRegionContinuity = 0.7/0.3` | `evaluateVoidSolid()` | `pixel.negativeSpaceComponentCount` + 连通域分析 | DOMAIN-PIXEL | 负空间连通分量数 + 最大分量面积比 | 实测物理量 |

**语义层阈值（不属于硬编码伪常数，但需废除机器断言）**:

旧 `semantic-evaluator.ts` 中的 `evidenceStrength >= 0.8 → PASS`、`inIdealRange && hasContinuity → PASS` 等软阈值判定，**不迁移到新证据层**。这些判定转移到 `UNMEASURED_SEMANTIC` + 人工诠释层，机器不再对文化维度输出 PASS/FAIL。

---

## 5. UNMEASURED_SEMANTIC 规范

### 5.1 什么是 UNMEASURED_SEMANTIC

`UNMEASURED_SEMANTIC` 是一个**显式占位标记**，用于那些无法从物理来源（像素缓冲/深度图/光流/Core IR）获得测量值的美学维度。它不是"暂时没有数据以后补上"，而是"这个维度在原理上不能被机器测量，必须由人工诠释"。

### 5.2 必须标记为 UNMEASURED_SEMANTIC 的维度

| 维度 | 不可测量原因 | 人工诠释入口 |
|---|---|---|
| 意境深度 | 意境是主观感受，无物理对应量 | `semantic.artisticConception` |
| 含蓄程度 | 含蓄是表达策略，非视觉属性 | `semantic.axiomHumanAssessment["AXIOM-JIBAI"]` |
| 形神关系 | "神"是主观判断，无物理测量 | `semantic.axiomHumanAssessment["形神"]` |
| 文化典故契合度 | 需文化知识推理，非像素测量 | `semantic.culturalReferences` |
| 气韵的"韵"（节奏的美学品质） | 节奏可测（变化点数），但节奏的美学品质不可测 | `semantic.axiomHumanAssessment["AXIOM-QIYUN"]` |
| 宾主揖让的"揖让"（礼序品质） | 主辅关系可测（质心矢量/面积比），但"揖让"的礼序品质不可测 | `semantic.axiomHumanAssessment["AXIOM-BINZHU"]` |

### 5.3 UNMEASURED_SEMANTIC 的使用规则

1. **显式标记**: 不可测量的维度必须使用 `UnmeasuredSemantic` 接口，包含 `dimension`、`reason`、`semanticInterpretationRef`。
2. **禁止默认值**: 严禁用 `0.5`、`0.7` 等数值默认值代替 `UNMEASURED_SEMANTIC`。
3. **禁止推断**: 机器管线不能从可测量维度"推断"不可测量维度的值（如不能从 `opticalFlowDirectionCoherence = 0.8` 推断"气韵 = PASS"）。
4. **人工填充**: `UNMEASURED_SEMANTIC` 维度的评估由 `SemanticEvidence` 域的人工标注填充，机器只读取不产生。
5. **纯度审计**: `EvidencePurityAudit` 统计 `unmeasuredFields` 数量，合理范围是 > 0（如果所有维度都"可测量"，说明存在僭越）。

---

## 6. 证据纯度合规检查清单

Step 2.2 实现证据提取层后，必须通过以下纯度检查：

| 检查项 | 要求 | 验证方法 |
|---|---|---|
| 零硬编码常数 | 机器断言判定中无硬编码浮点数 | 静态扫描 `machine-*.ts` 中的数字字面量 |
| 全字段可追溯 | 每个 EvidenceField 有非空 evidenceRef | 运行时断言 + 纯度审计 |
| 全字段有置信度 | 每个 EvidenceField 有 confidence ∈ [0, 1] | 运行时断言 |
| 不可测量即标记 | 无物理来源的维度使用 UnmeasuredSemantic | 代码审查 + 纯度审计 |
| 代理不僭越 | 字段名不使用文化术语 | 命名审查（不用 qiyunScore，用 opticalFlowDirectionCoherence） |
| 14 常数全迁移 | 旧 14 处硬编码全部有新证据字段归宿 | 迁移映射表逐项核对 |
| 语义独立 | SemanticEvidence 不由机器测量产生 | 架构审查（semantic 域无机器计算路径） |

---

## 7. 与现有系统的边界

| 系统 | 关系 | 边界 |
|---|---|---|
| 旧 `machine-evaluator.ts` | 待迁移 | Step 2.5 逐行替换，迁移期间旧文件标记为 `DEPRECATED` |
| 旧 `visual-features.json` | 参考 | 旧证据文件可作为提取算法的参考输入，但新证据结构不依赖旧文件格式 |
| `motion-summary.json` | 参考 | 同上 |
| Core Compiler | 被读取 | IREvidence 从 Core IR 读取参数，不修改 Core Compiler |
| SoftwareRenderer | 被读取 | 像素缓冲/深度缓冲从渲染器输出读取，不修改渲染器 |
| 5-Dim Evaluator | 正交 | 证据层服务于 Chinese Aesthetic Provider，与 5-Dim Evaluator 独立 |
| Golden Case Matrix | 消费者 | Matrix Cell 可使用 ObservableEvidenceSet 进行美学评估 |

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1.0 | 2026-09-16 | 初始草案：六大证据域 + 正式 TypeScript Schema + 14 常数迁移映射 + UNMEASURED_SEMANTIC 规范 |

---

**— Observable Evidence Schema v0.1.0 Draft —**
**Phase 2 Step 2.1: Schema Definition Complete. Next: Step 2.2 Evidence Extraction Layer Implementation.**
