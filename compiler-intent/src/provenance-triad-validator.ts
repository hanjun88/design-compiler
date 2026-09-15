/**
 * compiler-intent/src/provenance-triad-validator.ts
 *
 * STEP 8 · Provenance Triad Validator
 *
 * 外围校验器，在数据流入 Step 6-B LOCKED normalizer 之前执行四道硬性断言。
 * 任一断言失败均抛出对应错误码并阻断，确保 Step 6-B 内部代码零修改。
 *
 * 核心原则：
 * - 彻底切断概念混淆：杜绝将"算法提取缺陷（Extraction Defect）"粉饰为"专家校准（Calibration）"
 * - 物理观测、人为校准、算法偏差、补丁改写四类语义在机器契约层物理隔离
 * - 代数恒等式法典化：calibratedValue - observedValue ≡ calibrationDelta
 * - 标识符零漂移：严格锁定现有 ABI 字段名，禁止引入无根据的新标识
 * - 类型系统硬约束：calibrationDelta 严格为 number，向量与非数值型参数禁止挂载
 *
 * 四道硬性断言：
 * 公理 1: 消费一致性 — calibratedValue 必须等于最终传递给下游的 value
 * 公理 2: 数值标量代数自洽 — calibrationDelta ≡ calibratedValue - observedValue
 * 公理 3: 向量/非数值禁止 delta — 非数值型参数严禁使用 calibrationDelta
 * 公理 4: 非数值变更必须有 mutationReason — observedValue ≠ calibratedValue 时必填
 */

import type { CangjieEstimatedParameter } from "../types";

// ============================================================================
// 错误码定义
// ============================================================================

export enum TriadViolationCode {
  /** calibratedValue ≠ value — 消费一致性违反 */
  CONTRACT_VIOLATION = "CONTRACT_VIOLATION",
  /** 数值三元组要求 numeric calibrationDelta，但类型不符 */
  TYPE_VIOLATION = "TYPE_VIOLATION",
  /** calibrationDelta ≠ calibratedValue - observedValue — 代数自洽性违反 */
  ALGEBRAIC_MISMATCH = "ALGEBRAIC_MISMATCH",
  /** 数值校准缺少 method 或 rationale */
  PROVENANCE_MISSING = "PROVENANCE_MISSING",
  /** 向量/非数值参数定义了 calibrationDelta — 非法 */
  ILLEGAL_DELTA = "ILLEGAL_DELTA",
  /** 非数值参数发生变更但缺少 mutationReason */
  MUTATION_REASON_MISSING = "MUTATION_REASON_MISSING",
  /** rationale 长度不足 10 */
  RATIONALE_TOO_SHORT = "RATIONALE_TOO_SHORT",
  /** mutationReason 长度不足 10 */
  MUTATION_REASON_TOO_SHORT = "MUTATION_REASON_TOO_SHORT",
}

export interface TriadViolation {
  code: TriadViolationCode;
  paramId: string;
  message: string;
}

export interface TriadValidationResult {
  valid: boolean;
  violations: TriadViolation[];
}

// ============================================================================
// 类型判断辅助
// ============================================================================

/**
 * 判断参数是否为纯数值标量型。
 * 纯数值标量：typeof value === 'number' 且不是 Array。
 * 向量型：Array.isArray(value)。
 * 非数值型：string、boolean、object 等。
 */
function isNumericScalar(value: unknown): value is number {
  return typeof value === "number" && !Array.isArray(value);
}

/**
 * 判断参数是否为向量型（Array）。
 */
function isVector(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * 判断参数是否为非数值型（既不是 number 也不是 Array）。
 */
function isNonNumeric(value: unknown): boolean {
  return !isNumericScalar(value) && !isVector(value);
}

// ============================================================================
// 单参数校验
// ============================================================================

/**
 * 校验单个 CangjieEstimatedParameter 的 Provenance Triad 自洽性。
 *
 * @param param 待校验参数
 * @returns TriadValidationResult — valid 为 true 表示全部断言通过
 */
export function validateProvenanceTriad(param: CangjieEstimatedParameter): TriadValidationResult {
  const violations: TriadViolation[] = [];
  const { paramId } = param;

  // 如果没有 observedValue 和 calibratedValue，说明该参数未启用三元组，直接通过
  // （向后兼容：现有 CASE_02 参数不包含三元组字段）
  if (param.observedValue === undefined && param.calibratedValue === undefined) {
    return { valid: true, violations: [] };
  }

  // ==========================================================================
  // 公理 1: 消费一致性断言
  // calibratedValue 必须等于最终传递给下游的 value
  // ==========================================================================
  if (param.calibratedValue !== undefined) {
    // 使用 JSON.stringify 进行深度比较，支持 vector2 等数组类型
    const valueJson = JSON.stringify(param.value);
    const calibratedJson = JSON.stringify(param.calibratedValue);
    if (valueJson !== calibratedJson) {
      violations.push({
        code: TriadViolationCode.CONTRACT_VIOLATION,
        paramId,
        message: `[CONTRACT_VIOLATION] paramId=${paramId}: calibratedValue (${calibratedJson}) !== value (${valueJson})`,
      });
    }
  }

  // ==========================================================================
  // 公理 2: 数值标量三元组代数自洽性
  // 仅当 observedValue 和 calibratedValue 均为数值标量时适用
  // ==========================================================================
  if (isNumericScalar(param.observedValue) && isNumericScalar(param.calibratedValue)) {
    // calibrationDelta 必须存在且为 number
    if (param.calibrationDelta === undefined || typeof param.calibrationDelta !== "number") {
      violations.push({
        code: TriadViolationCode.TYPE_VIOLATION,
        paramId,
        message: `[TYPE_VIOLATION] paramId=${paramId}: numeric triad requires numeric calibrationDelta, got ${typeof param.calibrationDelta}`,
      });
    } else if (Number.isNaN(param.calibrationDelta)) {
      violations.push({
        code: TriadViolationCode.TYPE_VIOLATION,
        paramId,
        message: `[TYPE_VIOLATION] paramId=${paramId}: calibrationDelta is NaN`,
      });
    } else {
      // 代数自洽性：calibrationDelta ≡ calibratedValue - observedValue
      const expectedDelta = param.calibratedValue - param.observedValue;
      if (Math.abs(param.calibrationDelta - expectedDelta) > 1e-6) {
        violations.push({
          code: TriadViolationCode.ALGEBRAIC_MISMATCH,
          paramId,
          message: `[ALGEBRAIC_MISMATCH] paramId=${paramId}: calibrationDelta (${param.calibrationDelta}) !== calibratedValue (${param.calibratedValue}) - observedValue (${param.observedValue}) = ${expectedDelta}`,
        });
      }
    }

    // 数值校准必须携带 method 和 rationale
    if (!param.method) {
      violations.push({
        code: TriadViolationCode.PROVENANCE_MISSING,
        paramId,
        message: `[PROVENANCE_MISSING] paramId=${paramId}: numeric calibration requires method`,
      });
    }
    if (!param.rationale) {
      violations.push({
        code: TriadViolationCode.PROVENANCE_MISSING,
        paramId,
        message: `[PROVENANCE_MISSING] paramId=${paramId}: numeric calibration requires rationale`,
      });
    } else if (param.rationale.trim().length < 10) {
      violations.push({
        code: TriadViolationCode.RATIONALE_TOO_SHORT,
        paramId,
        message: `[RATIONALE_TOO_SHORT] paramId=${paramId}: rationale minLength=10, got ${param.rationale.trim().length}`,
      });
    }
  }

  // ==========================================================================
  // 公理 3: 向量与非数值参数禁止使用 calibrationDelta
  // ==========================================================================
  const isVectorOrNonNumeric = isVector(param.value) || isNonNumeric(param.value);

  if (isVectorOrNonNumeric && param.calibrationDelta !== undefined && param.calibrationDelta !== null) {
    violations.push({
      code: TriadViolationCode.ILLEGAL_DELTA,
      paramId,
      message: `[ILLEGAL_DELTA] paramId=${paramId}: vector/non-numeric parameter must not define calibrationDelta (value type=${Array.isArray(param.value) ? "vector" : typeof param.value})`,
    });
  }

  // ==========================================================================
  // 公理 4: 非数值参数若发生变更，强制要求提供 mutationReason
  // 仅适用于非数值型参数（向量也属于此范畴，因为向量不能用 delta）
  // ==========================================================================
  if (
    isNonNumeric(param.value) ||
    isVector(param.value)
  ) {
    if (
      param.observedValue !== undefined &&
      param.calibratedValue !== undefined &&
      JSON.stringify(param.observedValue) !== JSON.stringify(param.calibratedValue)
    ) {
      if (!param.mutationReason || param.mutationReason.trim().length === 0) {
        violations.push({
          code: TriadViolationCode.MUTATION_REASON_MISSING,
          paramId,
          message: `[MUTATION_REASON_MISSING] paramId=${paramId}: transformed non-numeric parameter requires mutationReason`,
        });
      } else if (param.mutationReason.trim().length < 10) {
        violations.push({
          code: TriadViolationCode.MUTATION_REASON_TOO_SHORT,
          paramId,
          message: `[MUTATION_REASON_TOO_SHORT] paramId=${paramId}: mutationReason minLength=10, got ${param.mutationReason.trim().length}`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ============================================================================
// 批量校验
// ============================================================================

/**
 * 批量校验 CangjieRawDesignIR 中的所有参数。
 *
 * @param parameters CangjieEstimatedParameter 数组
 * @returns TriadValidationResult — valid 为 true 表示全部参数通过
 */
export function validateAllTriads(
  parameters: CangjieEstimatedParameter[],
): TriadValidationResult {
  const allViolations: TriadViolation[] = [];

  for (const param of parameters) {
    const result = validateProvenanceTriad(param);
    if (!result.valid) {
      allViolations.push(...result.violations);
    }
  }

  return {
    valid: allViolations.length === 0,
    violations: allViolations,
  };
}

/**
 * 断言全部参数通过三元组校验，若失败抛出错误。
 * 用于在 Step 6-B normalizer 调用前的前置阻断。
 *
 * @param parameters CangjieEstimatedParameter 数组
 * @throws Error 当任一参数校验失败时
 */
export function assertTriadInvariants(parameters: CangjieEstimatedParameter[]): void {
  const result = validateAllTriads(parameters);
  if (!result.valid) {
    const messages = result.violations.map((v) => v.message).join("\n  ");
    throw new Error(
      `PROVENANCE_TRIAD_VALIDATION_FAILED (${result.violations.length} violations):\n  ${messages}`,
    );
  }
}
