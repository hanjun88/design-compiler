/**
 * compiler-intent/types.ts
 *
 * Intent Normalization Engine 类型定义。
 *
 * 基于物理读取的 raw-design-ir.schema.json (ABI 1.0.0) 定义 Cangjie 层 IR 类型。
 * 所有字段严格对齐 schema 的 required / additionalProperties / enum 约束。
 *
 * 九层降维链：本模块负责第 8 层（叙事语义）→ 第 9 层（可计算属性 / Core IR）的
 * 单向、无损降维转译。
 */

// ============================================================================
// Cangjie 层概念 (concept)
// ============================================================================

export interface CangjieConcept {
  /** 文化概念名称，如 气韵生动、虚实相生、留白、借景 */
  name: string;
  /** ontology.json 中的概念路径，如 /aesthetics/void-solid/negative-space */
  ontologyPath: string;
  /** 概念定义（可选） */
  definition?: string;
  /** 概念出处原文（可选） */
  sourceText?: string;
}

// ============================================================================
// Cangjie 层意图 (intent)
// ============================================================================

export interface CangjieIntent {
  /** 工程意图陈述，如 压低高光过曝、保持连续负空间 */
  statement: string;
  /** 关联的 heuristics.json 策略ID列表，minItems=1 */
  heuristicIds: string[];
  /** 优先级，默认 P1 */
  priority?: "P0" | "P1" | "P2";
}

// ============================================================================
// Cangjie 层参数来源 (source)
// ============================================================================

export type CangjieSourceType =
  | "literature"
  | "film-lexicon"
  | "master-cluster"
  | "expert-judgment"
  | "dataset-prior"
  | "derived";

export interface CangjieParameterSource {
  /** 来源类型 */
  type: CangjieSourceType;
  /** 来源引用，如书名+章节、电影名+镜头号 */
  ref: string;
  /** 原文引用片段，中文≤150字，英文≤100词 */
  quote?: string;
  /** Cangjie corpus 中的文献ID */
  corpusId?: string;
}

// ============================================================================
// Cangjie 层参数校准 (calibration)
// ============================================================================

export type CangjieCalibrationMethod =
  | "expert-calibrated"
  | "dataset-empirical-priors"
  | "uncalibrated";

export type CangjieCalibrationStatus = "PRODUCTION" | "EXPERIMENTAL" | "DEPRECATED";

export interface CangjieParameterCalibration {
  /** 校准方法 */
  method: CangjieCalibrationMethod;
  /** PRODUCTION=已校准可合入；EXPERIMENTAL=未校准禁止合入生产Grammar */
  status: CangjieCalibrationStatus;
  /** 校准人或校准过程标识 */
  calibratedBy?: string;
  /** 校准时间（date-time） */
  calibratedAt?: string;
  /** Master样本集聚类方差 */
  variance?: number;
}

// ============================================================================
// Cangjie 层参数范围约束 (range) — 四级连续约束空间
// ============================================================================

export interface CangjieParameterRange {
  /** 合规区间 [min, max] — 零补丁，mutations=0 */
  preferred?: [number, number];
  /** 容忍区间 [min, max] — 触发软告警，执行阻尼平滑 */
  warning?: [number, number];
  /** 破损区间 [min, max] — 触发强制 Patch (replace) */
  hard?: [number, number];
  /** 崩塌阈值 — 低于此值无法修正，编译置为 BLOCKED_AESTHETIC */
  fatalBelow?: number;
}

// ============================================================================
// Cangjie 层焦点保护 (focalProtection)
// ============================================================================

export interface CangjieFocalProtection {
  /** 最大允许焦点位移 D_focal，默认 0.05 */
  maxFocalDisplacement?: number;
  /** 冲突时规则介入权重降低比例，0-1 */
  weightReductionOnConflict?: number;
}

// ============================================================================
// Cangjie 层参数溯源 (provenance)
// ============================================================================

export interface CangjieParameterProvenance {
  /** ontology.json 中的概念节点 */
  ontologyNode?: string;
  /** heuristics.json 中的工程策略ID */
  heuristicId?: string;
  /** assertions.json 中的断言ID */
  assertionId?: string;
  /** 完整溯源向量 */
  chain?: string[];
}

// ============================================================================
// Cangjie 层估计参数 (EstimatedParameter)
// ============================================================================

export interface CangjieEstimatedParameter {
  /** 参数稳定标识，小写字母+连字符，全库唯一，pattern ^[a-z][a-z0-9-]*$ */
  paramId: string;
  /** Design IR 中的 JSON Pointer 路径，如 /composition/negativeSpaceRatio */
  path: string;
  /** 参数估计值，类型由 path 对应的 schema 决定 */
  value: unknown;
  /** 物理单位，如 ratio、deg、px、s、nits */
  unit?: string;
  /**
   * 语义解释置信度 (0-1)。
   * 这是 sourceObservationConfidence — 唯一允许进入 Core IR 的置信度来源。
   * intentResolutionConfidence / mappingConfidence 必须隔离在 NormalizationMetadata 中。
   */
  confidence: number;
  /** 参数来源 */
  source: CangjieParameterSource;
  /** 参数校准信息 */
  calibration: CangjieParameterCalibration;
  /** 四级连续约束空间 */
  range?: CangjieParameterRange;
  /** 焦点保护 */
  focalProtection?: CangjieFocalProtection;
  /** 溯源链 */
  provenance?: CangjieParameterProvenance;
}

// ============================================================================
// Cangjie 层约束 (constraints)
// ============================================================================

export type CangjieConstraintType =
  | "range"
  | "mutual-exclusion"
  | "dependency"
  | "proportion"
  | "threshold";

export interface CangjieConstraint {
  constraintId: string;
  type: CangjieConstraintType;
  /** JSON Pointer */
  targetPath: string;
  /** 约束条件 */
  condition: Record<string, unknown>;
  /** 关联 assertions.json 的断言ID */
  assertionId?: string;
}

// ============================================================================
// Cangjie 层语料来源 (corpusSources)
// ============================================================================

export type CangjieCorpusType =
  | "book"
  | "video-transcript"
  | "course"
  | "interview"
  | "article"
  | "image-corpus";

export type CangjieExtractionMethod =
  | "adler-close-reading"
  | "parallel-extraction"
  | "triple-verify"
  | "cangjie-ria";

export interface CangjieCorpusSource {
  corpusId: string;
  title: string;
  type: CangjieCorpusType;
  author?: string;
  year?: number;
  extractionMethod?: CangjieExtractionMethod;
}

// ============================================================================
// Cangjie 层验证 (verification)
// ============================================================================

export interface CangjieVerification {
  /** V1 来源充分性 */
  v1_sourceAdequacy?: boolean;
  /** V2 可执行性 */
  v2_executability?: boolean;
  /** V3 任务增益 */
  v3_taskGain?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

// ============================================================================
// Cangjie 层溯源 (provenance)
// ============================================================================

export interface CangjieProvenance {
  /** 语料来源列表，minItems=1 */
  corpusSources: CangjieCorpusSource[];
  /** 蒸馏方法描述 */
  distillationMethod: string;
  /** 验证信息 */
  verification?: CangjieVerification;
}

// ============================================================================
// Cangjie 层元数据 (metadata) — additionalProperties: true
// ============================================================================

export interface CangjieMetadata {
  createdAt?: string;
  createdBy?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Cangjie 层完整 IR — 基于 raw-design-ir.schema.json (ABI 1.0.0)
// ============================================================================

export interface CangjieRawDesignIR {
  /** IR 稳定标识，pattern ^ir-[a-z0-9-]+$ */
  irId: string;
  /** 文化概念 */
  concept: CangjieConcept;
  /** 工程意图 */
  intent: CangjieIntent;
  /** 初始参数估计列表，minItems=1 */
  parameters: CangjieEstimatedParameter[];
  /** 参数间约束关系 */
  constraints?: CangjieConstraint[];
  /** 溯源链 */
  provenance: CangjieProvenance;
  /** 蒸馏器版本，pattern ^\d+\.\d+\.\d+$，四元版本指纹之一 */
  distillerVersion: string;
  /** 目标语法版本，如 chinese-aesthetic@1.1.0 */
  grammarVersion?: string;
  /** 额外元数据（additionalProperties: true） */
  metadata?: CangjieMetadata;
}

// ============================================================================
// Normalization Metadata — 内部元数据，严格隔离，不得进入 Core IR
// ============================================================================

/**
 * 正常化过程内部元数据。
 *
 * 严格隔离原则：
 * - intentResolutionConfidence：意图解析置信度，仅存于此处，不得进入 Core IR 的任何字段
 * - mappingConfidence：路径映射置信度，仅存于此处，不得进入 Core IR 的任何字段
 * - Core IR 中每个参数的 confidence 严格来自 Cangjie 层参数的 confidence（sourceObservationConfidence）
 */
export interface NormalizationMetadata {
  /** 意图解析置信度（隔离字段，禁止进入 Core IR） */
  intentResolutionConfidence: number;
  /** 路径映射置信度（隔离字段，禁止进入 Core IR） */
  mappingConfidence: number;
  /** 成功映射到 Core IR 的参数数量 */
  mappedParameters: number;
  /** 未映射的 paramId 列表（path 不在 pointer-map 中） */
  unmappedParameters: string[];
  /** 被覆盖的参数路径列表（同一 path 多个参数，后者覆盖前者） */
  overwrittenParameters: string[];
  /** 正常化引擎版本 */
  normalizationVersion: string;
  /**
   * 显式确定性时间戳。
   * 必须由调用方传入，禁止使用 new Date() 自动生成。
   * 用于 1000× 恒等哈希验证。
   */
  capturedAt: string;
}

// ============================================================================
// Normalization Result
// ============================================================================

export type NormalizationStatus = "PASS" | "FAIL" | "BLOCKED_DATA";

export interface NormalizationResult {
  /** 编译后的 Core Compiler 层 RawDesignIR */
  coreIR: import("../compiler-core/contracts").RawDesignIR;
  /** 正常化元数据（内部使用，不得进入 Core IR） */
  metadata: NormalizationMetadata;
  /** 状态：PASS / FAIL / BLOCKED_DATA */
  status: NormalizationStatus;
  /** 诊断信息 */
  diagnostics: string[];
}

// ============================================================================
// Normalizer 配置
// ============================================================================

export interface IntentNormalizerOptions {
  /**
   * 显式确定性时间戳（ISO 8601 date-time）。
   * 必须传入，禁止使用 new Date()。
   * 用于保证 1000 次调用产生相同哈希。
   */
  capturedAt: string;
  /** 意图解析置信度（默认 0.90，仅存于 metadata，不进入 Core IR） */
  intentResolutionConfidence?: number;
  /** 路径映射置信度（默认 0.95，仅存于 metadata，不进入 Core IR） */
  mappingConfidence?: number;
  /** 推理执行耗时（ms），透传到 Core IR provenance.inferenceExecutionMs */
  inferenceExecutionMs?: number;
}
