/**
 * Compiler Core — 全局类型定义
 *
 * 定义编译管线中流转的所有核心类型。
 * 注意：本文件为框架占位，具体类型细节待完善。
 */

// ========== 版本指纹 ==========

export interface VersionFingerprint {
  compilerVersion: string;
  distillerVersion: string;
  grammarVersion: string;
  adapterVersion: string;
}

// ========== 哈希链 ==========

export type SHA256Hash = string;

export interface ProvenanceChain {
  inputHash: SHA256Hash;
  rawIrHash: SHA256Hash;
  validatedIrHash: SHA256Hash;
  executionPlanHash: SHA256Hash;
  renderHash?: SHA256Hash;
  chain: Array<{
    stage: string;
    hash: SHA256Hash;
    timestamp: string;
  }>;
}

// ========== 四级约束空间 ==========

export type ConstraintLevel = 'preferred' | 'warning' | 'hard' | 'fatal';

export interface ConstraintSpace {
  preferred: [number, number];
  warning: [number, number];
  hard: [number, number];
  fatalBelow: number;
}

export interface FocalProtection {
  maxFocalDisplacement: number;
  weightReductionOnConflict: number;
}

// ========== RFC 6902 补丁 ==========

export type PatchOp = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

export interface RFC6902Operation {
  op: PatchOp;
  path: string;
  value?: unknown;
  from?: string;
}

export interface AppliedPatch {
  patchId: string;
  rfc6902: RFC6902Operation[];
  trigger: {
    paramId: string;
    rangeLevel: ConstraintLevel;
    actualValue: number;
    targetValue: number;
    focalDisplacement?: number;
  };
  dampingFactor: number;
  appliedAt: string;
  appliedBy: string;
}

// ========== 编译状态 ==========

export type CompileStatus =
  | 'PENDING'
  | 'DATA_GATE_PASSED'
  | 'PATCHES_APPLIED'
  | 'CAPABILITY_NEGOTIATED'
  | 'EXECUTION_PLANNED'
  | 'COMPLETE'
  | 'BLOCKED_DATA'
  | 'BLOCKED_ENV'
  | 'BLOCKED_AESTHETIC'
  | 'FAILED';

export interface CompileContext {
  compileId: string;
  status: CompileStatus;
  versionFingerprint: VersionFingerprint;
  provenance: ProvenanceChain;
  startTime: string;
  endTime?: string;
  errors: CompileError[];
  warnings: CompileWarning[];
}

export interface CompileError {
  code: string;
  message: string;
  stage: string;
  paramId?: string;
  fatal: boolean;
}

export interface CompileWarning {
  code: string;
  message: string;
  stage: string;
  paramId?: string;
  level: 'info' | 'warning';
}

// ========== 运行时能力 ==========

export interface WebGL2Capabilities {
  supported: boolean;
  maxTextureSize: number;
  maxRenderBufferSize: number;
  maxVertexAttribs: number;
  maxVertexUniformVectors: number;
  maxFragmentUniformVectors: number;
  maxVaryingVectors: number;
  maxTextureImageUnits: number;
  extensions: string[];
}

export interface RuntimeCapability {
  runtime: string;
  runtimeVersion: string;
  webgl2: WebGL2Capabilities;
  capabilities: Record<string, boolean | number | string>;
  fallbacks: Array<{
    feature: string;
    reason: string;
    fallbackStrategy: string;
    qualityLoss: 'none' | 'minor' | 'moderate' | 'severe';
  }>;
}

// ========== 执行步骤 ==========

export type ExecutionStepType =
  | 'setup-context'
  | 'load-assets'
  | 'compile-shaders'
  | 'apply-patches'
  | 'render-frame'
  | 'post-process'
  | 'composite'
  | 'output';

export interface ExecutionStep {
  stepId: string;
  order: number;
  type: ExecutionStepType;
  config: Record<string, unknown>;
  patches?: RFC6902Operation[];
  dependsOn: string[];
  estimatedDurationMs?: number;
}

// ========== 评测维度 ==========

export type EvaluationDimension = 'composition' | 'color' | 'depth' | 'material' | 'focus';

export interface MetricCheck {
  checkId: string;
  name: string;
  ruleId?: string;
  assertionId?: string;
  passed: boolean;
  severity: ConstraintLevel;
  actualValue: number | string | boolean | number[];
  expectedValue?: number | string | boolean | number[];
  expectedRange?: { min: number; max: number };
  deviation?: number;
  message: string;
}

export interface MetricDimension {
  score: number;
  weight: number;
  tolerance: number;
  checks: MetricCheck[];
}

// ========== 框架导出 ==========

export const COMPILER_VERSION = '0.1.0';
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;
export const DEFAULT_FOCAL_DISPLACEMENT = 0.05;
export const DEFAULT_DAMPING_FACTOR = 0.7;
