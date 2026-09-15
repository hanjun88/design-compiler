/**
 * tests/intent/provenance-triad-validator.test.ts
 *
 * STEP 8-A · Provenance Triad Validator 单元测试
 *
 * 覆盖边界用例：
 * 1. CASE_03 正向三元组（camera-angle: observed=-15, calibrated=-10, delta=5）
 * 2. calibratedValue !== value（CONTRACT_VIOLATION）
 * 3. delta 代数错误（ALGEBRAIC_MISMATCH）
 * 4. numeric triad 缺少 calibrationDelta（TYPE_VIOLATION）
 * 5. vector 参数挂载 calibrationDelta（ILLEGAL_DELTA）
 * 6. non-numeric 参数挂载 calibrationDelta（ILLEGAL_DELTA）
 * 7. 非数值变更缺少 mutationReason（MUTATION_REASON_MISSING）
 * 8. numeric triad 缺少 method/rationale（PROVENANCE_MISSING）
 * 9. CASE_02 extraction defect 不被重新解释为 calibration（无三元组参数直接通过）
 * 10. 批量校验与断言阻断
 */

import {
  validateProvenanceTriad,
  validateAllTriads,
  assertTriadInvariants,
  TriadViolationCode,
  type CangjieEstimatedParameter,
} from "../../compiler-intent";

// ============================================================================
// 辅助：构造最小合法参数
// ============================================================================

function baseParam(overrides: Partial<CangjieEstimatedParameter> = {}): CangjieEstimatedParameter {
  return {
    paramId: "test-param",
    path: "/test/param",
    value: 0.5,
    confidence: 0.8,
    source: { type: "expert-judgment", ref: "test" },
    calibration: { method: "expert-calibrated", status: "PRODUCTION" },
    ...overrides,
  };
}

// ============================================================================
// 1. CASE_03 正向三元组
// ============================================================================

describe("STEP 8-A · Provenance Triad Validator", () => {
  describe("1. CASE_03 正向三元组 (camera-angle)", () => {
    it("TC-TRIAD-001: observed=-15, calibrated=-10, delta=5 应通过全部断言", () => {
      const param = baseParam({
        paramId: "camera-angle",
        path: "/camera/angle",
        value: -10.0,
        unit: "degrees",
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 5.0,
        method: "expert-calibrated",
        rationale:
          "L0 horizon below center indicates low-angle (-15deg raw measurement); calibrated +5deg to -10deg to align with Tang-Song grand visual hierarchy.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("TC-TRIAD-002: 代数恒等式 calibratedValue - observedValue ≡ calibrationDelta", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 5.0,
        method: "expert-calibrated",
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(true);
      // 显式验证代数恒等式
      expect((param.calibratedValue as number) - (param.observedValue as number)).toBe(param.calibrationDelta);
    });
  });

  // ==========================================================================
  // 2. calibratedValue !== value
  // ==========================================================================

  describe("2. CONTRACT_VIOLATION — calibratedValue 必须等于 value", () => {
    it("TC-TRIAD-010: calibratedValue=-12 但 value=-10 应触发 CONTRACT_VIOLATION", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -12.0,
        calibrationDelta: 3.0,
        method: "expert-calibrated",
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.CONTRACT_VIOLATION)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. delta 代数错误
  // ==========================================================================

  describe("3. ALGEBRAIC_MISMATCH — calibrationDelta ≠ calibratedValue - observedValue", () => {
    it("TC-TRIAD-020: delta=3.0 但实际应为 5.0 应触发 ALGEBRAIC_MISMATCH", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 3.0, // 错误：应为 5.0
        method: "expert-calibrated",
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.ALGEBRAIC_MISMATCH)).toBe(true);
    });

    it("TC-TRIAD-021: delta=NaN 应触发 TYPE_VIOLATION", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: NaN,
        method: "expert-calibrated",
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.TYPE_VIOLATION)).toBe(true);
    });
  });

  // ==========================================================================
  // 4. numeric triad 缺少 calibrationDelta
  // ==========================================================================

  describe("4. TYPE_VIOLATION — numeric triad 必须有 numeric calibrationDelta", () => {
    it("TC-TRIAD-030: observed/calibrated 存在但 calibrationDelta 缺失应触发 TYPE_VIOLATION", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        // calibrationDelta 故意缺失
        method: "expert-calibrated",
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.TYPE_VIOLATION)).toBe(true);
    });
  });

  // ==========================================================================
  // 5. vector 参数挂载 calibrationDelta
  // ==========================================================================

  describe("5. ILLEGAL_DELTA — vector 参数禁止挂载 calibrationDelta", () => {
    it("TC-TRIAD-040: focalPoint vector2 挂载 calibrationDelta 应触发 ILLEGAL_DELTA", () => {
      const param = baseParam({
        paramId: "focal-point-center",
        path: "/composition/focalPoint",
        value: [0.4733, 0.5246],
        unit: "vector2",
        observedValue: [0.49, 0.48],
        calibratedValue: [0.4733, 0.5246],
        calibrationDelta: 0.02, // 非法：vector 不能用 delta
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.ILLEGAL_DELTA)).toBe(true);
    });
  });

  // ==========================================================================
  // 6. non-numeric 参数挂载 calibrationDelta
  // ==========================================================================

  describe("6. ILLEGAL_DELTA — non-numeric 参数禁止挂载 calibrationDelta", () => {
    it("TC-TRIAD-050: shotSize string 挂载 calibrationDelta 应触发 ILLEGAL_DELTA", () => {
      const param = baseParam({
        paramId: "camera-shot-size",
        path: "/camera/shotSize",
        value: "long-shot",
        unit: "scalar",
        observedValue: "medium-shot",
        calibratedValue: "long-shot",
        calibrationDelta: 1, // 非法：string 不能用 delta
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.ILLEGAL_DELTA)).toBe(true);
    });

    it("TC-TRIAD-051: boolean 参数挂载 calibrationDelta 应触发 ILLEGAL_DELTA", () => {
      const param = baseParam({
        paramId: "rim-light-present",
        path: "/lighting/rimLightPresent",
        value: false,
        observedValue: true,
        calibratedValue: false,
        calibrationDelta: 1, // 非法：boolean 不能用 delta
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.ILLEGAL_DELTA)).toBe(true);
    });
  });

  // ==========================================================================
  // 7. 非数值变更缺少 mutationReason
  // ==========================================================================

  describe("7. MUTATION_REASON_MISSING — 非数值变更必须有 mutationReason", () => {
    it("TC-TRIAD-060: string 参数 observed≠calibrated 但无 mutationReason 应触发 MUTATION_REASON_MISSING", () => {
      const param = baseParam({
        paramId: "camera-shot-size",
        path: "/camera/shotSize",
        value: "long-shot",
        observedValue: "medium-shot",
        calibratedValue: "long-shot",
        // 无 mutationReason
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.MUTATION_REASON_MISSING)).toBe(true);
    });

    it("TC-TRIAD-061: string 参数 observed≠calibrated 且有 mutationReason 应通过", () => {
      const param = baseParam({
        paramId: "camera-shot-size",
        path: "/camera/shotSize",
        value: "long-shot",
        observedValue: "medium-shot",
        calibratedValue: "long-shot",
        mutationReason:
          "CASE_03 巨构宫阙场景需要远景取势，从 medium-shot 校准为 long-shot 以展现建筑尺度秩序。",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(true);
    });

    it("TC-TRIAD-062: string 参数 observed=calibrated 无需 mutationReason", () => {
      const param = baseParam({
        paramId: "camera-shot-size",
        path: "/camera/shotSize",
        value: "long-shot",
        observedValue: "long-shot",
        calibratedValue: "long-shot",
        // 无 mutationReason，但 observed=calibrated，不应触发
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 8. numeric triad 缺少 method/rationale
  // ==========================================================================

  describe("8. PROVENANCE_MISSING — numeric calibration 必须有 method 和 rationale", () => {
    it("TC-TRIAD-070: 缺少 method 应触发 PROVENANCE_MISSING", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 5.0,
        // method 故意缺失
        rationale: "Test rationale with sufficient length for validation.",
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.PROVENANCE_MISSING)).toBe(true);
    });

    it("TC-TRIAD-071: 缺少 rationale 应触发 PROVENANCE_MISSING", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 5.0,
        method: "expert-calibrated",
        // rationale 故意缺失
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.PROVENANCE_MISSING)).toBe(true);
    });

    it("TC-TRIAD-072: rationale 长度 < 10 应触发 RATIONALE_TOO_SHORT", () => {
      const param = baseParam({
        paramId: "camera-angle",
        value: -10.0,
        observedValue: -15.0,
        calibratedValue: -10.0,
        calibrationDelta: 5.0,
        method: "expert-calibrated",
        rationale: "too short", // 9 字符
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.code === TriadViolationCode.RATIONALE_TOO_SHORT)).toBe(true);
    });
  });

  // ==========================================================================
  // 9. CASE_02 extraction defect 不被重新解释为 calibration
  // ==========================================================================

  describe("9. CASE_02 extraction defect — 无三元组参数直接通过，不被重新解释为 calibration", () => {
    it("TC-TRIAD-080: roughness value=0.10 不带三元组应直接通过（向后兼容）", () => {
      // 这是 CASE_02 的真实参数：L1 提取缺陷导致 roughness=0.10
      // STEP 7-B 已定性为 EXTRACTION_INDUCED，严禁借助 STEP 8 洗白
      const param = baseParam({
        paramId: "material-0-roughness",
        path: "/materials/0/roughness",
        value: 0.10,
        unit: "normalized",
        confidence: 0.65,
        source: { type: "dataset-prior", ref: "visual-features.json:material.roughness" },
        calibration: {
          method: "dataset-empirical-priors",
          status: "PRODUCTION",
          calibratedBy: "laplacian-variance-inverse",
        },
        // 故意不加入 observedValue/calibratedValue/calibrationDelta
        // 因为 0.10 是 L1 提取缺陷，不是专家校准结果
      });

      const result = validateProvenanceTriad(param);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("TC-TRIAD-081: 严禁将 L0=0.825 填入 observedValue 并将 0.10 伪造成 calibratedValue", () => {
      // 这是禁止的行为：将提取缺陷粉饰为校准
      // 如果有人试图这样做，calibrationDelta = 0.10 - 0.825 = -0.725
      // 代数上可以通过，但语义上这是洗白
      // validator 只检查代数自洽性，不检查语义合理性
      // 语义合理性由 STEP 7-B 白皮书和审计流程保证
      const param = baseParam({
        paramId: "material-0-roughness",
        value: 0.10,
        observedValue: 0.825, // L0 真实估计
        calibratedValue: 0.10, // 伪造成校准结果
        calibrationDelta: -0.725, // 代数上自洽
        method: "expert-calibrated",
        rationale:
          "This is a forbidden pattern: masking extraction defect as calibration. STEP 7-B already classified this as EXTRACTION_INDUCED.",
      });

      const result = validateProvenanceTriad(param);
      // validator 只检查代数自洽性，这个参数代数上是自洽的
      // 但语义上这是洗白，需要审计流程拦截
      expect(result.valid).toBe(true);
      // 关键断言：validator 不会因为语义问题而拒绝
      // 语义问题由 STEP 7-B 归因白皮书保证
      expect(param.observedValue).toBe(0.825);
      expect(param.calibratedValue).toBe(0.10);
      expect(param.calibrationDelta).toBe(-0.725);
    });
  });

  // ==========================================================================
  // 10. 批量校验与断言阻断
  // ==========================================================================

  describe("10. 批量校验与断言阻断", () => {
    it("TC-TRIAD-090: validateAllTriads 全部通过时 valid=true", () => {
      const params: CangjieEstimatedParameter[] = [
        baseParam({ paramId: "param-1", value: 0.5 }),
        baseParam({ paramId: "param-2", value: 0.8 }),
        baseParam({
          paramId: "camera-angle",
          value: -10.0,
          observedValue: -15.0,
          calibratedValue: -10.0,
          calibrationDelta: 5.0,
          method: "expert-calibrated",
          rationale: "Test rationale with sufficient length for validation.",
        }),
      ];

      const result = validateAllTriads(params);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("TC-TRIAD-091: validateAllTriads 有一个失败时 valid=false 且收集全部 violations", () => {
      const params: CangjieEstimatedParameter[] = [
        baseParam({ paramId: "param-1", value: 0.5 }),
        baseParam({
          paramId: "bad-param",
          value: -10.0,
          observedValue: -15.0,
          calibratedValue: -12.0, // 与 value 不一致
          calibrationDelta: 3.0,
          method: "expert-calibrated",
          rationale: "Test rationale with sufficient length for validation.",
        }),
      ];

      const result = validateAllTriads(params);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].paramId).toBe("bad-param");
    });

    it("TC-TRIAD-092: assertTriadInvariants 全部通过时不抛出", () => {
      const params: CangjieEstimatedParameter[] = [
        baseParam({ paramId: "param-1", value: 0.5 }),
      ];

      expect(() => assertTriadInvariants(params)).not.toThrow();
    });

    it("TC-TRIAD-093: assertTriadInvariants 有失败时抛出错误", () => {
      const params: CangjieEstimatedParameter[] = [
        baseParam({
          paramId: "bad-param",
          value: -10.0,
          observedValue: -15.0,
          calibratedValue: -12.0,
          calibrationDelta: 3.0,
          method: "expert-calibrated",
          rationale: "Test rationale with sufficient length for validation.",
        }),
      ];

      expect(() => assertTriadInvariants(params)).toThrow("PROVENANCE_TRIAD_VALIDATION_FAILED");
    });
  });
});
