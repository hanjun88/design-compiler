/**
 * ============================================================================
 * Compiler Error Codes (ABI 1.0.0 SSOT)
 * ============================================================================
 * 所有编译器内部错误必须使用本文件定义的错误码，禁止自由字符串。
 * 错误码按模块前缀分组：
 *   SCHEMA_*    — Schema 校验与同构违规
 *   PATCH_*     — Patch Engine 与 JSON Pointer 违规
 *   HASH_*      — 哈希流契约违规
 *   DATA_*      — Data Gate 准入违规
 *   CAP_*       — Capability Negotiation 违规
 *   GOV_*       — Governance 与规则漂移违规
 * ============================================================================
 */

export enum CompilerErrorCode {
  // Schema & Isomorphism
  SCHEMA_INVALID = "SCHEMA_INVALID",
  SCHEMA_ISOMORPHISM_VIOLATION = "SCHEMA_ISOMORPHISM_VIOLATION",
  SCHEMA_ADDITIONAL_PROPERTY = "SCHEMA_ADDITIONAL_PROPERTY",

  // Patch Engine & JSON Pointer
  PATCH_POINTER_INVALID = "PATCH_POINTER_INVALID",
  PATCH_OP_UNSUPPORTED = "PATCH_OP_UNSUPPORTED",
  PATCH_PATH_NOT_FOUND = "PATCH_PATH_NOT_FOUND",
  PATCH_TEST_FAILED = "PATCH_TEST_FAILED",
  PATCH_ORDER_VIOLATION = "PATCH_ORDER_VIOLATION",

  // Hash Flow Contract
  HASH_INTEGRITY_MISMATCH = "HASH_INTEGRITY_MISMATCH",
  HASH_SOURCE_REF_MISMATCH = "HASH_SOURCE_REF_MISMATCH",
  HASH_CANONICALIZATION_FAILED = "HASH_CANONICALIZATION_FAILED",
  HASH_INJECTION_DETECTED = "HASH_INJECTION_DETECTED",

  // Data Gate
  DATA_GATE_BLOCKED = "DATA_GATE_BLOCKED",
  DATA_CONFIDENCE_BELOW_THRESHOLD = "DATA_CONFIDENCE_BELOW_THRESHOLD",
  DATA_SOURCE_UNVERIFIED = "DATA_SOURCE_UNVERIFIED",

  // Capability Negotiation
  CAPABILITY_UNAVAILABLE = "CAPABILITY_UNAVAILABLE",
  CAPABILITY_TIER_DOWNGRADE = "CAPABILITY_TIER_DOWNGRADE",

  // Governance
  GOVERNANCE_RULE_DRIFT = "GOVERNANCE_RULE_DRIFT",
  GOVERNANCE_PROMOTION_REJECTED = "GOVERNANCE_PROMOTION_REJECTED",

  // Evaluation
  EVAL_GATE_DECISION_MISMATCH = "EVAL_GATE_DECISION_MISMATCH",
  EVAL_METRIC_REF_NOT_FOUND = "EVAL_METRIC_REF_NOT_FOUND",
  EVAL_METRIC_REF_TYPE_MISMATCH = "EVAL_METRIC_REF_TYPE_MISMATCH",
  EVAL_TERMINAL_STATE_LEAKAGE = "EVAL_TERMINAL_STATE_LEAKAGE",
  EVAL_TERMINAL_STATE_TIER_MISMATCH = "EVAL_TERMINAL_STATE_TIER_MISMATCH",
}

export class CompilerError extends Error {
  public readonly code: CompilerErrorCode;
  public readonly timestamp: string;

  constructor(code: CompilerErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "CompilerError";
    this.code = code;
    this.timestamp = new Date().toISOString();
  }

  public toJSON(): {
    code: CompilerErrorCode;
    message: string;
    timestamp: string;
  } {
    return {
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}
