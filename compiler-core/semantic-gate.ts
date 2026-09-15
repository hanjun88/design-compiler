import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export class SemanticGateError extends Error {
  constructor(public code: string, message: string) {
    super(`[G2_SEMANTIC_GATE_ERROR][${code}] ${message}`);
    this.name = 'SemanticGateError';
  }
}

export function computeRFC8785Hash(payload: unknown): string {
  const canonicalJson = canonicalize(payload);
  if (canonicalJson === undefined) {
    throw new SemanticGateError(
      'CANONICALIZATION_FAILED',
      'Payload contains non-serializable data per RFC 8785'
    );
  }
  return `sha256:${createHash('sha256').update(canonicalJson, 'utf8').digest('hex')}`;
}

export function verifyEvaluationSemanticGate(
  rawIR: any,
  validatedIR: any,
  evaluation: any
): void {
  // 1. P1-1: 校验 RawIR 自身规范化预映像 Hash
  if (rawIR?.provenance?.rawIRHash) {
    const rawPreimage = JSON.parse(JSON.stringify(rawIR));
    delete rawPreimage.provenance.rawIRHash;
    const computedRawHash = computeRFC8785Hash(rawPreimage);

    if (rawIR.provenance.rawIRHash !== computedRawHash) {
      throw new SemanticGateError(
        'HASH_INTEGRITY_MISMATCH',
        `rawIR.provenance.rawIRHash (${rawIR.provenance.rawIRHash}) does not match computed preimage (${computedRawHash})`
      );
    }
  }

  // 2. 校验 ValidatedIR 对 RawIR 的依赖闭环
  if (validatedIR?.sourceRef?.rawIRHash && rawIR?.provenance?.rawIRHash) {
    if (validatedIR.sourceRef.rawIRHash !== rawIR.provenance.rawIRHash) {
      throw new SemanticGateError(
        'SOURCE_REF_HASH_MISMATCH',
        `validatedIR.sourceRef.rawIRHash (${validatedIR.sourceRef.rawIRHash}) !== rawIR.provenance.rawIRHash (${rawIR.provenance.rawIRHash})`
      );
    }
  }

  // 3. 状态机与执行字段物理隔离断言
  const isTerminal = ['BLOCKED_DATA', 'BLOCKED_ENV', 'NOT_RUN'].includes(evaluation.status);
  if (isTerminal) {
    if (evaluation.tierExecuted !== 'NONE') {
      throw new SemanticGateError(
        'TERMINAL_STATE_TIER_MISMATCH',
        `Terminal status ${evaluation.status} must have tierExecuted="NONE"`
      );
    }
    if (evaluation.metrics !== undefined || evaluation.gates !== undefined) {
      throw new SemanticGateError(
        'TERMINAL_STATE_LEAKAGE',
        `Terminal status ${evaluation.status} must not contain metrics or gates`
      );
    }
    return; // 预执行终止态直接放行，不校验视觉决策
  }

  // 4. P1-3 & P1-4: 引用存在性、类型断言与单一事实决策一致性校验
  for (const [gateKey, gate] of Object.entries<any>(evaluation.gates)) {
    const segments = gate.metricRef.split('.');

    if (segments[0] !== 'metrics') {
      throw new SemanticGateError(
        'EVAL_METRIC_REF_NOT_FOUND',
        `Gate ${gateKey} metricRef root must be 'metrics', got: ${gate.metricRef}`
      );
    }

    let target: any = evaluation;
    for (const segment of segments) {
      target = target?.[segment];
    }

    if (!target) {
      throw new SemanticGateError(
        'EVAL_METRIC_REF_NOT_FOUND',
        `Gate ${gateKey} points to non-existent metric: ${gate.metricRef}`
      );
    }

    if (typeof target.score !== 'number' || typeof target.threshold !== 'number') {
      throw new SemanticGateError(
        'EVAL_METRIC_REF_TYPE_MISMATCH',
        `Gate ${gateKey} target is not an EvaluationMetricItem: ${gate.metricRef}`
      );
    }

    const calculatedPass = target.score >= target.threshold;
    if (gate.passed !== calculatedPass) {
      throw new SemanticGateError(
        'EVAL_GATE_DECISION_MISMATCH',
        `Decision conflict at ${gateKey}: score (${target.score}) vs threshold (${target.threshold}) yields ${calculatedPass}, but gate.passed is ${gate.passed}`
      );
    }
  }
}
