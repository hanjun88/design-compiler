/**
 * Meta Data Gate — 离线规则准入控制。
 * 只有具备来源、达到置信度阈值且完成校准的参数才能进入 PRODUCTION Grammar。
 */

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

type ParamRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ParamRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function paramId(param: ParamRecord, index: number): string {
  return typeof param.paramId === 'string' && param.paramId.length > 0 ? param.paramId : `param[${index}]`;
}

export function checkSourceGrounding(param: unknown): boolean {
  if (!isRecord(param) || !isRecord(param.source)) return false;
  const source = param.source;
  const allowed = new Set(['literature', 'film-lexicon', 'master-cluster', 'expert-judgment', 'dataset-prior', 'derived']);
  return typeof source.type === 'string' && allowed.has(source.type) && typeof source.ref === 'string' && source.ref.trim().length > 0;
}

export function checkConfidence(param: unknown, threshold: number): boolean {
  return isRecord(param) && typeof param.confidence === 'number' && Number.isFinite(param.confidence) && param.confidence >= threshold;
}

export function checkCalibration(param: unknown): CalibrationStatus {
  if (!isRecord(param) || !isRecord(param.calibration)) return 'EXPERIMENTAL';
  const calibration = param.calibration;
  if (calibration.status === 'DEPRECATED') return 'DEPRECATED';
  if (calibration.method === 'uncalibrated') return 'EXPERIMENTAL';
  if (calibration.status === 'PRODUCTION' && (calibration.method === 'expert-calibrated' || calibration.method === 'dataset-empirical-priors')) {
    return 'PRODUCTION';
  }
  return 'EXPERIMENTAL';
}

export function runMetaGate(
  params: unknown[],
  options?: { confidenceThreshold?: number; allowExperimental?: boolean },
): MetaGateResult {
  if (!Array.isArray(params)) throw new TypeError('Meta Gate params must be an array');
  const threshold = options?.confidenceThreshold ?? 0.85;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('confidenceThreshold must be in [0, 1]');
  const allowExperimental = options?.allowExperimental ?? false;
  const sourceFailed: string[] = [];
  const confidenceFailed: string[] = [];
  const blocked: string[] = [];
  const rejected: MetaGateResult['rejectedParameters'] = [];
  let confidenceSum = 0;
  let validConfidenceCount = 0;
  let minConfidence = Number.POSITIVE_INFINITY;
  let productionCount = 0;
  let experimentalCount = 0;

  params.forEach((param, index) => {
    const record = isRecord(param) ? param : {};
    const id = paramId(record, index);
    if (!checkSourceGrounding(record)) {
      sourceFailed.push(id);
      rejected.push({ paramId: id, reason: 'source_insufficient', detail: 'source.type/ref missing or unsupported' });
    }
    if (!checkConfidence(record, threshold)) {
      confidenceFailed.push(id);
      rejected.push({ paramId: id, reason: 'low_confidence', detail: `confidence must be >= ${threshold}` });
    } else {
      const confidence = record.confidence as number;
      confidenceSum += confidence;
      validConfidenceCount += 1;
      minConfidence = Math.min(minConfidence, confidence);
    }
    const calibration = checkCalibration(record);
    if (calibration === 'PRODUCTION') productionCount += 1;
    else {
      experimentalCount += 1;
      if (!allowExperimental || calibration === 'DEPRECATED') {
        blocked.push(id);
        rejected.push({ paramId: id, reason: 'uncalibrated', detail: allowExperimental ? 'deprecated parameter' : 'experimental parameter is blocked' });
      }
    }
  });

  const sourcePassed = params.length > 0 && sourceFailed.length === 0;
  const confidencePassed = params.length > 0 && confidenceFailed.length === 0;
  const calibrationPassed = params.length > 0 && blocked.length === 0;
  const overallStatus: GateStatus = params.length === 0
    ? 'BLOCKED'
    : !sourcePassed || !confidencePassed
      ? 'FAIL'
      : allowExperimental && experimentalCount > 0
        ? 'PASS_WITH_WARNINGS'
        : calibrationPassed
          ? 'PASS'
          : 'FAIL';
  const now = new Date().toISOString();
  return {
    gateId: `meta-gate-${now}`,
    timestamp: now,
    sourceGrounding: { passed: sourcePassed, checkedCount: params.length, failedParams: sourceFailed, details: sourcePassed ? 'all sources grounded' : 'one or more sources are not grounded' },
    confidenceRating: { threshold, minConfidence: validConfidenceCount === 0 ? 0 : minConfidence, avgConfidence: validConfidenceCount === 0 ? 0 : confidenceSum / validConfidenceCount, failedParams: confidenceFailed, passed: confidencePassed },
    calibrationProof: { productionCount, experimentalCount, blockedParams: blocked, passed: calibrationPassed },
    overallStatus,
    rejectedParameters: rejected,
  };
}
