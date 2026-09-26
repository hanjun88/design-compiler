import { CompilerErrorCode } from "./error-codes";

/**
 * ============================================================================
 * HASH FLOW CONTRACT (ABI 1.0.0 SSOT)
 * ============================================================================
 * 1. rawIRHash:
 *    - 存储宿主: RawDesignIR.provenance.rawIRHash
 *    - 预映像: RFC8785(RawDesignIR \ { /provenance/rawIRHash })
 *    - 校验者: G2 Semantic Gate (自闭环校验)
 *
 * 2. validatedIRHash:
 *    - 存储宿主: 仅存于下游 FidelityEvaluationResult.provenance.hashChain.validatedIRHash
 *    - 预映像: RFC8785(ValidatedDesignIR) 全量计算 (因果锁定 sourceRef.rawIRHash)
 *    - 物理约束: ValidatedDesignIR 内部严禁存在任何自身 hash 字段
 *
 * 3. executionPlanHash:
 *    - 存储宿主: 仅存于下游 FidelityEvaluationResult.provenance.hashChain.executionPlanHash
 *    - 预映像: RFC8785(RuntimeExecutionPlan) 全量计算
 *    - 物理约束: RuntimeExecutionPlan 内部严禁存在任何自身 hash 字段
 *
 * 4. renderHash:
 *    - 存储宿主: 仅存于下游 FidelityEvaluationResult.provenance.hashChain.renderHash
 *    - 预映像: CanonicalPixelBuffer 规范化内存字节流
 *
 * 5. PATCH DETERMINISM CONTRACT:
 *    - Grammar / Patch Engine 生成补丁流时，必须按 audit.ruleId 字典序 (ASCII 升序) 排列。
 *    - HashPolicy 不得执行隐式重排，保持输入即哈希。
 * ============================================================================
 */

export type ParameterUnit =
  | "normalized"
  | "kelvin"
  | "degrees"
  | "ratio"
  | "ms"
  | "scalar"
  | "hex"
  | "vector2"
  | "vector3";

export type RawParameterStatus = "observed" | "estimated" | "derived" | "unknown";
export type ValidatedParameterStatus = RawParameterStatus | "grammar-derived";

export interface EstimatedParameterBase {
  unit: ParameterUnit;
  confidence: number;
  evidence: string[];
  source: string;
  derivedFrom?: string;
}

export interface RawEstimatedParameter<T = number | string | number[] | null> extends EstimatedParameterBase {
  value: T;
  status: RawParameterStatus;
  source: "vision-estimation" | "depth-estimator" | "optical-flow" | "fallback-default";
}

export interface ValidatedEstimatedParameter<T = number | string | number[] | null> extends EstimatedParameterBase {
  value: T;
  status: ValidatedParameterStatus;
  source: "vision-estimation" | "depth-estimator" | "optical-flow" | "fallback-default" | "grammar-rule";
}

// ----------------------------------------------------------------------------
// RawDesignIR 契约
// ----------------------------------------------------------------------------

export interface RawDesignIR {
  $schema: string;
  meta: {
    sourceType: "image" | "video";
    aspectRatio: string;
    duration?: number;
    timestamp: string;
  };
  composition: {
    focalPoint: RawEstimatedParameter<[number, number]>;
    negativeSpaceRatio: RawEstimatedParameter<number>;
    depthLayerCount: RawEstimatedParameter<number>;
    symmetry: RawEstimatedParameter<number>;
  };
  camera: {
    fov: RawEstimatedParameter<number>;
    shotSize: RawEstimatedParameter<string>;
    angle: RawEstimatedParameter<number>;
    height: RawEstimatedParameter<number>;
  };
  lighting: {
    keyLight: {
      azimuth: RawEstimatedParameter<number>;
      elevation: RawEstimatedParameter<number>;
      colorTemp: RawEstimatedParameter<number>;
      intensity: RawEstimatedParameter<number>;
      softness: RawEstimatedParameter<number>;
    };
    ambientRatio: RawEstimatedParameter<number>;
    rimLightPresent: RawEstimatedParameter<boolean>;
  };
  materials: Array<{
    role: "dominant" | "secondary" | "accent" | "ground";
    baseType: RawEstimatedParameter<string>;
    roughness: RawEstimatedParameter<number>;
    metalness: RawEstimatedParameter<number>;
    wear: RawEstimatedParameter<number>;
  }>;
  color: {
    dominant: RawEstimatedParameter<string>;
    secondary: RawEstimatedParameter<string>;
    accent: RawEstimatedParameter<string>;
    contrastRatio: RawEstimatedParameter<number>;
    temperatureBias: RawEstimatedParameter<number>;
  };
  provenance: {
    extractorVersion: string;
    inferenceExecutionMs: number;
    rawIntegrityStatus: "READY" | "BLOCKED_DATA";
    hashManifest: {
      algorithm: "SHA-256";
      canonicalization: "RFC8785";
    };
    inputHash: string;
    rawIRHash: string;
    lowConfidenceWarnings?: string[];
  };
}

// ----------------------------------------------------------------------------
// ValidatedDesignIR 契约 (P0 物理同构定义)
// ----------------------------------------------------------------------------

export interface AuditMetadata {
  ruleId: string;
  principle: string;
  reason: string;
  fromValue?: unknown;
}

export type RFC6902Op =
  | { op: "add"; path: string; value: unknown; audit: AuditMetadata }
  | { op: "remove"; path: string; audit: AuditMetadata }
  | { op: "replace"; path: string; value: unknown; audit: AuditMetadata }
  | { op: "move"; from: string; path: string; audit: AuditMetadata }
  | { op: "copy"; from: string; path: string; audit: AuditMetadata }
  | { op: "test"; path: string; value: unknown; audit: AuditMetadata };

export interface ValidatedComposition {
  focalPoint: ValidatedEstimatedParameter<[number, number]>;
  negativeSpaceRatio: ValidatedEstimatedParameter<number>;
  depthLayerCount: ValidatedEstimatedParameter<number>;
  symmetry: ValidatedEstimatedParameter<number>;
}

export interface ValidatedCamera {
  fov: ValidatedEstimatedParameter<number>;
  shotSize: ValidatedEstimatedParameter<string>;
  angle: ValidatedEstimatedParameter<number>;
  height: ValidatedEstimatedParameter<number>;
}

export interface ValidatedLighting {
  keyLight: {
    azimuth: ValidatedEstimatedParameter<number>;
    elevation: ValidatedEstimatedParameter<number>;
    colorTemp: ValidatedEstimatedParameter<number>;
    intensity: ValidatedEstimatedParameter<number>;
    softness: ValidatedEstimatedParameter<number>;
  };
  ambientRatio: ValidatedEstimatedParameter<number>;
  rimLightPresent: ValidatedEstimatedParameter<boolean>;
}

export interface ValidatedMaterialItem {
  role: "dominant" | "secondary" | "accent" | "ground";
  baseType: ValidatedEstimatedParameter<string>;
  roughness: ValidatedEstimatedParameter<number>;
  metalness: ValidatedEstimatedParameter<number>;
  wear: ValidatedEstimatedParameter<number>;
}

export interface ValidatedColor {
  dominant: ValidatedEstimatedParameter<string>;
  secondary: ValidatedEstimatedParameter<string>;
  accent: ValidatedEstimatedParameter<string>;
  contrastRatio: ValidatedEstimatedParameter<number>;
  temperatureBias: ValidatedEstimatedParameter<number>;
}

export interface ValidatedSceneGraph {
  composition: ValidatedComposition;
  camera: ValidatedCamera;
  lighting: ValidatedLighting;
  materials: ValidatedMaterialItem[];
  color: ValidatedColor;
}

export interface RuleCoverageEntry {
  ruleId: string;
  targetPath: string;
  targetFound: boolean;
  triggered: boolean;
}

/**
 * Compile-time rule-target coverage audit.
 *
 * Observability layer for the SILENT_NOOP behavior: when a grammar rule's
 * targetPath cannot be resolved against the RawDesignIR scene graph, the
 * rule is skipped silently (no patch, no error). ruleCoverage makes this
 * skippage observable without changing execution semantics.
 *
 * perRule is sorted by ruleId (ASCII ascending) for deterministic hashing.
 */
export interface RuleCoverageReport {
  total: number;
  targetFound: number;
  targetMissing: number;
  triggerable: number;
  missingTargets: string[];
  perRule: RuleCoverageEntry[];
}

export interface ValidatedDesignIR {
  $schema: string;
  meta: {
    grammarPack: string;
    grammarVersion: string;
    compiledAt: string;
  };
  sourceRef: {
    rawIRHash: string;
    rawSchemaVersion: string;
  };
  rawSnapshot?: {
    rawIRHash: string;
    snapshotPayload: Record<string, unknown>;
  };
  patches: RFC6902Op[];
  validated: ValidatedSceneGraph;
  auditReport: {
    rulesEvaluated: number;
    patchesEvaluated: number;
    mutationsApplied: number;
    testsPassed: number;
    testsFailed: number;
    complianceScore: number;
    violations: Array<{
      ruleId: string;
      severity: "P0_CRITICAL" | "P1_WARNING" | "P2_INFO";
      actionTaken: "MUTATED" | "TESTED" | "REJECTED_ERROR";
      message: string;
    }>;
    ruleCoverage: RuleCoverageReport;
  };
}

// ----------------------------------------------------------------------------
// RuntimeExecutionPlan 契约
// ----------------------------------------------------------------------------

export type ExecutionTier = "TIER_A" | "TIER_B" | "TIER_C" | "TIER_D" | "NONE";
export type ResolutionStatus = "ACCEPTED" | "DEGRADED" | "BLOCKED_ENV" | "BLOCKED_DATA";

export interface RuntimeExecutionPlan {
  $schema: string;
  negotiation: {
    resolutionStatus: ResolutionStatus;
    selectedTier: ExecutionTier;
    requirements: {
      requiredCapabilities: string[];
      preferredCapabilities: string[];
    };
    capabilities: Record<string, boolean | number>;
    downgrades: Array<{
      feature: string;
      reason: string;
      fallbackStrategy: string;
    }>;
    blockingFailures: string[];
  };
  runtimePlan: {
    pipeline: {
      rendererType: "WebGL2Renderer" | "WebGL1Renderer" | "CSS3D" | "DOMCanvas" | "HeadlessNull";
      toneMapping: "AgXToneMapping" | "ACESFilmicToneMapping" | "LinearToneMapping";
      colorSpace: "srgb-linear" | "srgb";
      postprocessing: string[];
    };
    sceneBindings: {
      cameraRig: { type: string; params: Record<string, unknown> };
      lights: Array<{ type: string; parameters: Record<string, unknown> }>;
      materials: Array<{ bindingId: string; shaderType: string; uniforms: Record<string, unknown> }>;
    };
  };
  assetManifest: {
    shaders: string[];
    geometryBuffers: string[];
    textures: string[];
  };
}

// ----------------------------------------------------------------------------
// Evaluation 契约与流水线门禁联合类型
// ----------------------------------------------------------------------------

export interface EvaluationMetricItem {
  score: number;
  threshold: number;
  weight: number;
  metricVersion: string;
  evaluationMethod: string;
}

export interface FocalPointMetricItem extends EvaluationMetricItem {
  displacementDistance: number;
}

export interface GateDecision {
  metricRef: string;
  passed: boolean;
}

export interface FidelityEvaluationResult {
  $schema: string;
  testCaseId: string;
  executedAt: string;
  status: "PASS" | "FAIL" | "BLOCKED_ENV" | "BLOCKED_DATA" | "NOT_RUN";
  tierExecuted: ExecutionTier;
  versions: {
    compiler: string;
    distiller: string;
    grammar: string;
    adapter: string;
    evaluator: string;
  };
  metrics?: {
    composition: EvaluationMetricItem;
    color: {
      composite: EvaluationMetricItem;
      palette: EvaluationMetricItem;
      dominantArea: EvaluationMetricItem;
      temperature: EvaluationMetricItem;
      contrast: EvaluationMetricItem;
    };
    depth: EvaluationMetricItem;
    material: EvaluationMetricItem;
    focalPointDisplacement: FocalPointMetricItem;
  };
  gates?: {
    composition: GateDecision;
    color: GateDecision;
    depth: GateDecision;
    material: GateDecision;
    focalDisplacement: GateDecision;
  };
  diagnostics?: string[];
  provenance: {
    hashManifest: {
      algorithm: "SHA-256";
      canonicalization: "RFC8785";
    };
    hashChain: {
      inputHash: string;
      rawIRHash?: string;
      validatedIRHash?: string;
      executionPlanHash?: string;
      renderHash?: string;
    };
    timing: {
      distillationExecutionMs: number;
      grammarExecutionMs?: number;
      adapterExecutionMs?: number;
      renderExecutionMs?: number;
    };
  };
}

export type DataGateResult =
  | {
      kind: "PASS";
      rawIR: RawDesignIR;
    }
  | {
      kind: "BLOCKED_DATA";
      evaluation: FidelityEvaluationResult;
    };

export type CapabilityNegotiationResult =
  | {
      kind: "ACCEPTED" | "DEGRADED";
      plan: RuntimeExecutionPlan;
    }
  | {
      kind: "BLOCKED_ENV";
      evaluation: FidelityEvaluationResult;
    };
