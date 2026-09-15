/**
 * compiler-intent/index.ts
 *
 * Intent Normalization Engine 统一导出。
 *
 * 九层降维链第 8→9 层转译器：将 Cangjie 层 RawDesignIR（扁平 parameters[]）
 * 确定性降维编译为 Core Compiler 层 RawDesignIR（嵌套结构化物理参数）。
 *
 * 执行边界：
 * - 只允许修改 compiler-intent/ 和 tests/intent/
 * - compiler-core/ 和 schemas/ 硬只读
 * - 101/101 回归基线不可破坏
 */

// 类型定义
export type {
  CangjieConcept,
  CangjieIntent,
  CangjieSourceType,
  CangjieParameterSource,
  CangjieCalibrationMethod,
  CangjieCalibrationStatus,
  CangjieParameterCalibration,
  CangjieParameterRange,
  CangjieFocalProtection,
  CangjieParameterProvenance,
  CangjieEstimatedParameter,
  CangjieTriadMethod,
  CangjieConstraintType,
  CangjieConstraint,
  CangjieCorpusType,
  CangjieExtractionMethod,
  CangjieCorpusSource,
  CangjieVerification,
  CangjieProvenance,
  CangjieMetadata,
  CangjieRawDesignIR,
  NormalizationMetadata,
  NormalizationStatus,
  NormalizationResult,
  IntentNormalizerOptions,
} from "./types";

// 路径映射
export {
  POINTER_MAP,
  lookupPointer,
  isValidPointer,
  getRequiredPaths,
  getAllPaths,
  validateValueType,
} from "./pointer-map";
export type { PointerMapEntry, CoreIRValueType } from "./pointer-map";

// 核心引擎
export { normalizeIntent, computeSemanticInputHash } from "./intent-normalizer";

// 置信度隔离
export {
  verifyConfidenceIsolation,
  assertConfidenceIsolation,
  collectCoreParameters,
  buildCangjieParameterIndex,
} from "./confidence-isolator";
export type {
  ConfidenceIsolationReport,
  ConfidenceViolation,
} from "./confidence-isolator";

// STEP 8 · Provenance Triad Validator（前置于 Step 6-B 的外围校验器）
export {
  validateProvenanceTriad,
  validateAllTriads,
  assertTriadInvariants,
  TriadViolationCode,
} from "./src/provenance-triad-validator";
export type {
  TriadViolation,
  TriadValidationResult,
} from "./src/provenance-triad-validator";
