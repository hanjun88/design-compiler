/**
 * 4.A-2: Scene Compilation Contract Validator
 *
 * 验证 SceneCompilationIR 的契约合法性：
 * 1. 结构校验（必填字段、类型、范围）
 * 2. 溯源合法性校验（每个指令引用均能在 AestheticRuntimePlan 中找到）
 * 3. 确定性摘要校验
 *
 * 不包含具体编译生成逻辑，纯验证器。
 */

import type {
  SceneCompilationIR,
  TracedSceneParameter,
  ContractValidationResult,
  ContractViolation,
  ContractWarning,
} from "./types";
import type { AestheticRuntimePlan, RuntimeInstruction } from "../adapter/types";

// ---------------------------------------------------------------------------
// 确定性哈希（FNV-1a）
// ---------------------------------------------------------------------------

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deterministicStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? obj.toString() : obj.toFixed(4);
  }
  if (typeof obj === "boolean" || typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => deterministicStringify(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as unknown as Record<string, unknown>).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${deterministicStringify((obj as unknown as Record<string, unknown>)[k])}`);
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// 参数范围约束表
// ---------------------------------------------------------------------------

interface ParameterRange {
  min?: number;
  max?: number;
  integer?: boolean;
}

const PARAMETER_RANGES: Record<string, ParameterRange> = {
  // Composition
  "composition.negativeSpaceRatio": { min: 0, max: 1 },
  "composition.focalOffset": { min: 0, max: 1 },
  "composition.clusterDensity": { min: 0, max: 1 },
  "composition.axialSymmetry": { min: 0, max: 1 },
  // Spatial
  "spatial.depthLayers": { min: 1, max: 10, integer: true },
  "spatial.atmosphericDensity": { min: 0, max: 1 },
  "spatial.horizonPosition": { min: 0, max: 1 },
  "spatial.occlusionRatio": { min: 0, max: 1 },
  // Material
  "material.patinaLevel": { min: 0, max: 1 },
  "material.specularSharpness": { min: 0, max: 100 },
  "material.contrastRatio": { min: 0, max: 1 },
  "material.surfaceEntropy": { min: 0, max: 1 },
  // Lighting
  "lighting.skyLuminance": { min: 0, max: 1 },
  "lighting.shadowTemperature": { min: 0, max: 1 },
  "lighting.mistDensity": { min: 0, max: 1 },
  "lighting.accentLuminance": { min: 0, max: 1 },
  // Camera
  "camera.fov": { min: 10, max: 170 },
  "camera.pitch": { min: -90, max: 90 },
  "camera.yaw": { min: -180, max: 180 },
  "camera.parallaxLayers": { min: 1, max: 10, integer: true },
  // Motion
  "motion.cameraMotionSmoothness": { min: 0, max: 1 },
  "motion.opticalFlowCoherence": { min: 0, max: 1 },
  "motion.motionContinuity": { min: 0, max: 1 },
};

// ---------------------------------------------------------------------------
// 验证器
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** 可选：提供 AestheticRuntimePlan 以验证溯源链合法性 */
  runtimePlan?: AestheticRuntimePlan;
  /** 是否验证确定性摘要（默认 true） */
  verifyDigest?: boolean;
}

/**
 * 验证 SceneCompilationIR 的契约合法性。
 */
export function validateSceneCompilationIR(
  ir: unknown,
  options: ValidateOptions = {},
): ContractValidationResult {
  const startTime = Date.now();
  const violations: ContractViolation[] = [];
  const warnings: ContractWarning[] = [];

  // 1. 基础类型检查
  if (typeof ir !== "object" || ir === null) {
    violations.push({
      code: "INVALID_TYPE",
      message: "SceneCompilationIR must be an object",
      path: "$",
      severity: "CRITICAL",
    });
    return { valid: false, violations, warnings, durationMs: Date.now() - startTime };
  }

  const sceneIR = ir as SceneCompilationIR;

  // 2. schemaVersion 检查
  if (sceneIR.schemaVersion !== "1.0.0") {
    violations.push({
      code: "INVALID_SCHEMA_VERSION",
      message: `schemaVersion must be "1.0.0", got "${sceneIR.schemaVersion}"`,
      path: "$.schemaVersion",
      severity: "CRITICAL",
    });
  }

  // 3. sceneId 检查
  if (!sceneIR.sceneId || typeof sceneIR.sceneId !== "string" || sceneIR.sceneId.length === 0) {
    violations.push({
      code: "MISSING_SCENE_ID",
      message: "sceneId is required and must be a non-empty string",
      path: "$.sceneId",
      severity: "CRITICAL",
    });
  }

  // 4. sourceProvenance 检查
  validateSourceProvenance(sceneIR, violations);

  // 5. 六大域检查
  const domains: Array<keyof SceneCompilationIR> = [
    "composition", "spatial", "material", "lighting", "camera", "motion",
  ];
  for (const domain of domains) {
    validateDomain(sceneIR, domain, violations, warnings);
  }

  // 6. assetBindings 检查
  validateAssetBindings(sceneIR, violations);

  // 7. 溯源链合法性校验（如果提供了 runtimePlan）
  if (options.runtimePlan) {
    validateProvenanceChain(sceneIR, options.runtimePlan, violations);
  }

  // 8. 确定性摘要校验
  if (options.verifyDigest !== false) {
    validateDeterministicDigest(sceneIR, violations);
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// 子验证函数
// ---------------------------------------------------------------------------

function validateSourceProvenance(
  ir: SceneCompilationIR,
  violations: ContractViolation[],
): void {
  const prov = ir.sourceProvenance;
  if (!prov) {
    violations.push({
      code: "MISSING_SOURCE_PROVENANCE",
      message: "sourceProvenance is required",
      path: "$.sourceProvenance",
      severity: "CRITICAL",
    });
    return;
  }

  const requiredFields = [
    "validatedDesignIRHash",
    "aestheticExecutionPlanHash",
    "aestheticRuntimePlanHash",
    "compiledAt",
    "compilerVersion",
  ];
  for (const field of requiredFields) {
    const value = (prov as unknown as Record<string, unknown>)[field];
    if (!value || typeof value !== "string" || value.length === 0) {
      violations.push({
        code: "MISSING_PROVENANCE_FIELD",
        message: `sourceProvenance.${field} is required and must be a non-empty string`,
        path: `$.sourceProvenance.${field}`,
        severity: "CRITICAL",
      });
    }
  }
}

function validateDomain(
  ir: SceneCompilationIR,
  domain: keyof SceneCompilationIR,
  violations: ContractViolation[],
  warnings: ContractWarning[],
): void {
  const domainObj = (ir as unknown as Record<string, unknown>)[domain] as Record<string, TracedSceneParameter> | undefined;
  if (!domainObj) {
    violations.push({
      code: "MISSING_DOMAIN",
      message: `${domain} domain is required`,
      path: `$.${domain}`,
      severity: "CRITICAL",
    });
    return;
  }

  for (const [paramName, param] of Object.entries(domainObj)) {
    const path = `$.${domain}.${paramName}`;
    validateTracedParameter(param, path, domain, paramName, violations, warnings);
  }
}

function validateTracedParameter(
  param: TracedSceneParameter,
  path: string,
  domain: string,
  paramName: string,
  violations: ContractViolation[],
  warnings: ContractWarning[],
): void {
  // value 检查
  if (param.value === undefined || param.value === null) {
    violations.push({
      code: "MISSING_PARAMETER_VALUE",
      message: `${path}.value is required`,
      path,
      severity: "CRITICAL",
    });
  }

  // appliedFromInstructionSeq 检查
  if (!param.appliedFromInstructionSeq || !Array.isArray(param.appliedFromInstructionSeq)) {
    violations.push({
      code: "MISSING_INSTRUCTION_TRACE",
      message: `${path}.appliedFromInstructionSeq is required and must be an array`,
      path,
      severity: "CRITICAL",
    });
  } else if (param.appliedFromInstructionSeq.length === 0) {
    warnings.push({
      code: "EMPTY_INSTRUCTION_TRACE",
      message: `${path}.appliedFromInstructionSeq is empty — parameter has no instruction trace`,
      path,
    });
  }

  // provenanceHashes 检查
  if (!param.provenanceHashes || !Array.isArray(param.provenanceHashes)) {
    violations.push({
      code: "MISSING_PROVENANCE_HASHES",
      message: `${path}.provenanceHashes is required and must be an array`,
      path,
      severity: "CRITICAL",
    });
  }

  // 参数范围检查
  const rangeKey = `${domain}.${paramName}`;
  const range = PARAMETER_RANGES[rangeKey];
  if (range && typeof param.value === "number") {
    if (range.min !== undefined && param.value < range.min) {
      violations.push({
        code: "PARAMETER_OUT_OF_RANGE",
        message: `${path}.value (${param.value}) is below minimum ${range.min}`,
        path,
        severity: "ERROR",
      });
    }
    if (range.max !== undefined && param.value > range.max) {
      violations.push({
        code: "PARAMETER_OUT_OF_RANGE",
        message: `${path}.value (${param.value}) is above maximum ${range.max}`,
        path,
        severity: "ERROR",
      });
    }
    if (range.integer && !Number.isInteger(param.value)) {
      violations.push({
        code: "PARAMETER_NOT_INTEGER",
        message: `${path}.value (${param.value}) must be an integer`,
        path,
        severity: "ERROR",
      });
    }
  }
}

function validateAssetBindings(
  ir: SceneCompilationIR,
  violations: ContractViolation[],
): void {
  const bindings = ir.assetBindings;
  if (!bindings) {
    violations.push({
      code: "MISSING_ASSET_BINDINGS",
      message: "assetBindings is required",
      path: "$.assetBindings",
      severity: "CRITICAL",
    });
    return;
  }

  if (!bindings.manifest) {
    violations.push({
      code: "MISSING_ASSET_MANIFEST",
      message: "assetBindings.manifest is required",
      path: "$.assetBindings.manifest",
      severity: "CRITICAL",
    });
  } else {
    // 验证资产清单的一致性
    const manifest = bindings.manifest;
    if (manifest.totalAssets !== manifest.assets.length) {
      violations.push({
        code: "ASSET_COUNT_MISMATCH",
        message: `manifest.totalAssets (${manifest.totalAssets}) does not match assets.length (${manifest.assets.length})`,
        path: "$.assetBindings.manifest.totalAssets",
        severity: "ERROR",
      });
    }
    const physicalCount = manifest.assets.filter((a) => a.lifecycle === "PHYSICAL").length;
    const derivedCount = manifest.assets.filter((a) => a.lifecycle === "DERIVED").length;
    if (manifest.physicalAssetCount !== physicalCount) {
      violations.push({
        code: "PHYSICAL_ASSET_COUNT_MISMATCH",
        message: `manifest.physicalAssetCount (${manifest.physicalAssetCount}) does not match actual physical assets (${physicalCount})`,
        path: "$.assetBindings.manifest.physicalAssetCount",
        severity: "ERROR",
      });
    }
    if (manifest.derivedAssetCount !== derivedCount) {
      violations.push({
        code: "DERIVED_ASSET_COUNT_MISMATCH",
        message: `manifest.derivedAssetCount (${manifest.derivedAssetCount}) does not match actual derived assets (${derivedCount})`,
        path: "$.assetBindings.manifest.derivedAssetCount",
        severity: "ERROR",
      });
    }
  }

  if (!bindings.hashes) {
    violations.push({
      code: "MISSING_ASSET_HASHES",
      message: "assetBindings.hashes is required",
      path: "$.assetBindings.hashes",
      severity: "CRITICAL",
    });
  }
}

function validateProvenanceChain(
  ir: SceneCompilationIR,
  runtimePlan: AestheticRuntimePlan,
  violations: ContractViolation[],
): void {
  // 构建 runtimePlan 中所有有效指令序号的集合
  const validInstructionSeqs = new Set<number>(
    runtimePlan.instructions.map((inst: RuntimeInstruction) => inst.seq),
  );

  // 遍历所有域的所有参数，检查 appliedFromInstructionSeq 是否都在 validInstructionSeqs 中
  const domains: Array<keyof SceneCompilationIR> = [
    "composition", "spatial", "material", "lighting", "camera", "motion",
  ];

  for (const domain of domains) {
    const domainObj = (ir as unknown as Record<string, unknown>)[domain] as Record<string, TracedSceneParameter> | undefined;
    if (!domainObj) continue;

    for (const [paramName, param] of Object.entries(domainObj)) {
      if (!param.appliedFromInstructionSeq) continue;
      for (const seq of param.appliedFromInstructionSeq) {
        if (!validInstructionSeqs.has(seq)) {
          violations.push({
            code: "INVALID_INSTRUCTION_REFERENCE",
            message: `$.${domain}.${paramName}.appliedFromInstructionSeq references instruction seq ${seq}, which does not exist in AestheticRuntimePlan (valid seqs: [${Array.from(validInstructionSeqs).sort().join(", ")}])`,
            path: `$.${domain}.${paramName}.appliedFromInstructionSeq`,
            severity: "ERROR",
          });
        }
      }
    }
  }
}

function validateDeterministicDigest(
  ir: SceneCompilationIR,
  violations: ContractViolation[],
): void {
  if (!ir.deterministicDigest) {
    violations.push({
      code: "MISSING_DETERMINISTIC_DIGEST",
      message: "deterministicDigest is required",
      path: "$.deterministicDigest",
      severity: "CRITICAL",
    });
    return;
  }

  // 重新计算摘要（排除 deterministicDigest 字段）
  const { deterministicDigest: _ignored, ...irWithoutDigest } = ir;
  const expectedDigest = `fnv1a:${fnv1a32(deterministicStringify(irWithoutDigest))}`;

  if (ir.deterministicDigest !== expectedDigest) {
    violations.push({
      code: "DETERMINISTIC_DIGEST_MISMATCH",
      message: `deterministicDigest (${ir.deterministicDigest}) does not match expected (${expectedDigest})`,
      path: "$.deterministicDigest",
      severity: "ERROR",
    });
  }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export { PARAMETER_RANGES };
