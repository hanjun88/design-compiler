/**
 * Observable Evidence Types — 可观测证据类型定义
 *
 * 从 OBSERVABLE-EVIDENCE-SCHEMA.md v0.1.0 落地的正式 TypeScript 类型。
 * 所有证据字段必须携带 evidenceRef + confidence + method，严禁硬编码测量默认值。
 */

// ---------------------------------------------------------------------------
// 基础类型
// ---------------------------------------------------------------------------

/** 证据字段基类：每个可观测测量值必须携带溯源与置信度 */
export interface EvidenceField<T> {
  /** 测量值 */
  value: T;
  /** 证据引用（来源路径 + 计算方法，如 "pixel-buffer:laplacian-variance:method=3x3-conv"） */
  evidenceRef: string;
  /** 测量置信度 [0, 1]，1=完全可靠，0=不可信 */
  confidence: number;
  /** 测量方法描述 */
  method: string;
}

/** 不可测量语义占位：无法从物理来源获得的维度显式标记，严禁用默认值填补 */
export interface UnmeasuredSemantic {
  status: "UNMEASURED_SEMANTIC";
  /** 维度名称 */
  dimension: string;
  /** 不可测量的原因 */
  reason: string;
  /** 建议的人工诠释入口 */
  semanticInterpretationRef: string;
}

/** 证据字段或不可测量占位的联合类型 */
export type EvidenceFieldOrUnmeasured<T> = EvidenceField<T> | UnmeasuredSemantic;

// ---------------------------------------------------------------------------
// 渲染上下文快照
// ---------------------------------------------------------------------------

export interface RenderContextSnapshot {
  renderer: string;
  rendererVersion: string;
  resolution: { width: number; height: number };
  pixelFormat: string;
  bufferByteLength: number;
  renderHash: string;
  irHash: string;
}

// ---------------------------------------------------------------------------
// 像素证据域 (DOMAIN-PIXEL)
// ---------------------------------------------------------------------------

export interface PixelEvidence {
  // 亮度场
  meanLuminance: EvidenceField<number>;
  luminanceStdDev: EvidenceField<number>;
  luminanceHistogram: EvidenceField<number[]>;
  luminanceHistogramPeakCount: EvidenceField<number>;

  // 梯度场 / 边缘
  spatialLaplacianVariance: EvidenceField<number>;
  sobelEdgeGradientSkew: EvidenceField<number>;
  edgePixelRatio: EvidenceField<number>;
  edgeOrientationHistogram: EvidenceField<number[]>;

  // 色彩分布
  dominantColor: EvidenceField<string>;
  secondaryColor: EvidenceField<string>;
  accentColor: EvidenceField<string>;
  dominantColorRatio: EvidenceField<number>;
  contrastRatio: EvidenceField<number>;
  temperatureBias: EvidenceField<number>;
  blockLuminanceMeanGradient: EvidenceField<number>;

  // 空域结构
  negativeSpaceRatio: EvidenceField<number>;
  negativeSpaceComponentCount: EvidenceField<number>;
  largestVoidRegionRatio: EvidenceField<number>;
  focalPoint: EvidenceField<[number, number]>;
  focalCenterOffset: EvidenceField<number>;

  // 非零像素
  nonZeroPixels: EvidenceField<number>;
  nanInfPixelCount: EvidenceField<number>;
}

// ---------------------------------------------------------------------------
// 深度证据域 (DOMAIN-DEPTH)
// ---------------------------------------------------------------------------

export interface DepthEvidence {
  depthBufferAvailable: boolean;

  depthHistogram: EvidenceFieldOrUnmeasured<number[]>;
  depthLayerCount: EvidenceFieldOrUnmeasured<number>;
  layerSeparation: EvidenceFieldOrUnmeasured<number>;
  occlusionEdgeCount: EvidenceFieldOrUnmeasured<number>;
  occlusionChainLength: EvidenceFieldOrUnmeasured<number>;
  atmosphericDepth: EvidenceFieldOrUnmeasured<number>;
  focalDepthSeparation: EvidenceFieldOrUnmeasured<number>;
  depthMotionProjectionResidual: EvidenceFieldOrUnmeasured<number>;
}

// ---------------------------------------------------------------------------
// 运动证据域 (DOMAIN-MOTION)
// ---------------------------------------------------------------------------

export interface MotionEvidence {
  framePairCount: number;

  opticalFlowDirectionCoherence: EvidenceField<number>;
  opticalFlowAmplitudeStability: EvidenceField<number>;
  globalDisplacementMean: EvidenceField<[number, number]>;
  globalDisplacementStdDev: EvidenceField<number>;
  cameraMotionSmoothness: EvidenceField<number>;

  luminanceContinuity: EvidenceField<number>;
  chromaticContinuity: EvidenceField<number>;
  colorHistogramBhattacharyyaDistance: EvidenceField<number>;
  motionContinuity: EvidenceField<number>;

  rhythmChangePointCount: EvidenceField<number>;
  motionSpeedCoefficientOfVariation: EvidenceField<number>;
}

// ---------------------------------------------------------------------------
// 材质证据域 (DOMAIN-MATERIAL)
// ---------------------------------------------------------------------------

export interface MaterialEvidence {
  materialCount: number;
  dominantMaterialIndex: EvidenceField<number>;

  // Core IR 声明参数（直接从 IR 读取，非渲染计算）
  dominantRoughness: EvidenceField<number>;
  dominantMetalness: EvidenceField<number>;
  dominantWear: EvidenceField<number>;
  dominantBaseType: EvidenceField<string>;
  dominantMaterialCategory: EvidenceField<string>;

  // 渲染帧表面分析（观测值，与 IR 声明值物理隔离）
  surfaceVariation: EvidenceField<number>;
  microSurfaceHighFrequencyVariance: EvidenceField<number>;
  specularHighlightRatio: EvidenceField<number>;
  specularSharpness: EvidenceField<number>;

  // 时间痕迹代理（从渲染帧推断，非直接测量）
  roughnessSpatialVariance: EvidenceField<number>;
  colorVariationSpatialGradient: EvidenceField<number>;
  timeTraceDetectability: EvidenceField<number>;
}

// ---------------------------------------------------------------------------
// IR 字段证据域 (DOMAIN-IR)
// ---------------------------------------------------------------------------

export interface IRMaterialEntry {
  baseType: string;
  materialCategory: string;
  roughness: number;
  metalness: number;
  wear: number;
}

export interface IRTransformationEntry {
  ruleId: string;
  field: string;
  inputValue: unknown;
  outputValue: unknown;
  action: string;
}

export interface IREvidence {
  irHash: string;
  irType: "RawDesignIR" | "ValidatedDesignIR" | "ExecutionPlan";

  paradigm: EvidenceField<string>;
  compositionType: EvidenceField<string>;
  symmetry: EvidenceField<number>;
  declaredNegativeSpaceRatio: EvidenceField<number>;
  horizonPosition: EvidenceField<number>;
  cameraPitch: EvidenceField<number>;

  lightingIntent: EvidenceField<string>;
  colorTemp: EvidenceField<number>;
  lightIntensity: EvidenceField<number>;
  lightSoftness: EvidenceField<number>;
  ambientRatio: EvidenceField<number>;

  materials: EvidenceField<IRMaterialEntry[]>;
  transformationTrace: EvidenceField<IRTransformationEntry[]>;
}

// ---------------------------------------------------------------------------
// 语义证据域 (DOMAIN-SEMANTIC) — 人工输入，机器永不产生
// ---------------------------------------------------------------------------

export interface SemanticEvidence {
  source: string;
  annotator: string;
  annotatedAt: string;

  artisticConception: string;
  culturalReferences: string[];
  paradigmJustification: string;

  axiomHumanAssessment: Record<string, {
    judgment: "PASS" | "FAIL" | "INCONCLUSIVE";
    rationale: string;
  }>;

  unmeasuredDimensions: Array<{
    dimension: string;
    reason: string;
    humanAssessmentRef: string;
  }>;
}

// ---------------------------------------------------------------------------
// 证据纯度审计
// ---------------------------------------------------------------------------

export interface EvidencePurityAudit {
  auditedAt: string;
  totalFields: number;
  measuredFields: number;
  unmeasuredFields: number;
  hardcodedConstantsFound: string[];
  fieldsMissingEvidenceRef: string[];
  fieldsMissingConfidence: string[];
  purityStatus: "PURE" | "CONTAMINATED";
  contaminationDetails: string[];
}

// ---------------------------------------------------------------------------
// 顶层容器
// ---------------------------------------------------------------------------

export interface ObservableEvidenceSet {
  evidenceId: string;
  capturedAt: string;
  renderContext: RenderContextSnapshot;
  pixel: PixelEvidence;
  depth: DepthEvidence;
  motion: MotionEvidence | null;
  material: MaterialEvidence;
  ir: IREvidence;
  semantic: SemanticEvidence | null;
  purityAudit: EvidencePurityAudit;
}

// ---------------------------------------------------------------------------
// 提取器输入
// ---------------------------------------------------------------------------

export interface ExtractorInput {
  /** 证据集唯一标识 */
  evidenceId: string;
  /** 捕获时间（确定性输入） */
  capturedAt: string;
  /** 像素缓冲帧序列（单帧或多帧） */
  frames: Uint8Array[];
  /** 帧宽度 */
  width: number;
  /** 帧高度 */
  height: number;
  /** 深度缓冲（如可用，否则为 null） */
  depthBuffers: (Float32Array | null)[] | null;
  /** Core IR（用于 IR 证据域） */
  ir: {
    irHash: string;
    irType: "RawDesignIR" | "ValidatedDesignIR" | "ExecutionPlan";
    paradigm: string;
    compositionType: string;
    symmetry: number;
    negativeSpaceRatio: number;
    horizonPosition: number;
    cameraPitch: number;
    lightingIntent: string;
    colorTemp: number;
    lightIntensity: number;
    lightSoftness: number;
    ambientRatio: number;
    materials: IRMaterialEntry[];
    transformationTrace: IRTransformationEntry[];
  };
  /** 渲染哈希（用于 renderContext 绑定） */
  renderHash: string;
  /** 渲染器信息 */
  rendererInfo: {
    type: string;
    version: string;
  };
}
