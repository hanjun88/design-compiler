/**
 * Meta Data Gate — 离线规则准入控制
 *
 * 职责：阻止 LLM 产生不可控幻觉或伪经验数值。
 * 规则进入 grammar-rules.json 之前必须通过本门禁。
 *
 * 三项检查：
 * 1. Source Grounding — 必须具备明确的文献出处、电影镜头语言规范或 Master 样本集聚类方差支撑
 * 2. Confidence Rating — 语义解释置信度 Confidence >= 0.85
 * 3. Calibration Proof — 数值区间必须标注校准方法，未校准规则标记为 EXPERIMENTAL，禁止合入生产 Grammar
 *
 * 注意：本文件为框架占位，具体校验逻辑待实现。
 */

// ========== 类型定义 ==========

export type GateStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | 'BLOCKED';

export type CalibrationMethod = 'expert-calibrated' | 'dataset-empirical-priors' | 'uncalibrated';

export type CalibrationStatus = 'PRODUCTION' | 'EXPERIMENTAL' | 'DEPRECATED';

export interface SourceGroundingResult {
  passed: boolean;
  checkedCount: number;
  failedParams: string[];
  details: string;
}

export interface ConfidenceRatingResult {
  threshold: number;
  minConfidence: number;
  avgConfidence: number;
  failedParams: string[];
  passed: boolean;
}

export interface CalibrationProofResult {
  productionCount: number;
  experimentalCount: number;
  blockedParams: string[];
  passed: boolean;
}

export interface MetaGateResult {
  gateId: string;
  timestamp: string;
  sourceGrounding: SourceGroundingResult;
  confidenceRating: ConfidenceRatingResult;
  calibrationProof: CalibrationProofResult;
  overallStatus: GateStatus;
  rejectedParameters: Array<{
    paramId: string;
    reason: 'low_confidence' | 'uncalibrated' | 'source_insufficient';
    detail: string;
  }>;
}

// ========== 框架接口 ==========

/**
 * 对一组 EstimatedParameter 执行 Meta Data Gate 校验。
 * 框架占位 — 具体校验逻辑待实现。
 */
export function runMetaGate(
  params: unknown[],
  options?: {
    confidenceThreshold?: number;
    allowExperimental?: boolean;
  }
): MetaGateResult {
  // 框架占位：返回默认结果
  return {
    gateId: `meta-gate-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sourceGrounding: {
      passed: false,
      checkedCount: 0,
      failedParams: [],
      details: '框架占位 — 未实现',
    },
    confidenceRating: {
      threshold: options?.confidenceThreshold ?? 0.85,
      minConfidence: 0,
      avgConfidence: 0,
      failedParams: [],
      passed: false,
    },
    calibrationProof: {
      productionCount: 0,
      experimentalCount: 0,
      blockedParams: [],
      passed: false,
    },
    overallStatus: 'FAIL',
    rejectedParameters: [],
  };
}

/**
 * 校验单个参数的 Source Grounding。
 * 框架占位 — 具体校验逻辑待实现。
 */
export function checkSourceGrounding(param: unknown): boolean {
  return false; // 框架占位
}

/**
 * 校验单个参数的置信度是否达到阈值。
 * 框架占位 — 具体校验逻辑待实现。
 */
export function checkConfidence(param: unknown, threshold: number): boolean {
  return false; // 框架占位
}

/**
 * 校验单个参数的校准证明。
 * 框架占位 — 具体校验逻辑待实现。
 */
export function checkCalibration(param: unknown): CalibrationStatus {
  return 'EXPERIMENTAL'; // 框架占位
}
