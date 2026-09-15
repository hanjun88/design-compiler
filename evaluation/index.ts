/**
 * Evaluation — 评测 ABI 入口
 *
 * 5 维解耦评测矩阵：构图 / 色彩 / 深度 / 材质 / 焦点
 * 双哈希链：Design ABI (ValidatedDesignIR) + Evaluation ABI (FidelityEvaluationResult)
 *
 * 注意：本文件为框架占位，具体评测逻辑待实现。
 */

import type {
  EvaluationDimension,
  MetricDimension,
  MetricCheck,
  CompileContext,
} from '../compiler-core/types.js';

// ========== 框架接口 ==========

export interface EvaluationResult {
  evaluationId: string;
  designAbiHash: string;
  renderHash: string;
  metrics: Record<EvaluationDimension, MetricDimension>;
  overallScore: number;
  overallGrade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  violations: Array<{
    violationId: string;
    dimension: EvaluationDimension | 'meta';
    severity: 'info' | 'warning' | 'hard' | 'fatal';
    ruleId: string;
    message: string;
  }>;
  antiCliche: {
    hardFailTriggers: string[];
    softFailTriggers: string[];
    aiArtifacts: {
      ringArtifactScore: number;
      plasticSkinScore: number;
      digitalOverfitScore: number;
      overallArtifactRisk: 'low' | 'medium' | 'high';
    };
    passed: boolean;
  };
  evaluatedAt: string;
  evaluationDurationMs: number;
}

/**
 * 执行 5 维评测。
 * 框架占位 — 具体逻辑待实现。
 */
export function evaluate(
  renderOutput: unknown,
  designAbiHash: string,
  context: CompileContext,
  options?: {
    baseline?: number;
    weights?: Partial<Record<EvaluationDimension, number>>;
  }
): EvaluationResult {
  // 框架占位：返回默认结果
  const emptyDimension: MetricDimension = { score: 0, weight: 0, tolerance: 0, checks: [] };

  return {
    evaluationId: `eval-${Date.now()}`,
    designAbiHash,
    renderHash: '',
    metrics: {
      composition: { ...emptyDimension },
      color: { ...emptyDimension },
      depth: { ...emptyDimension },
      material: { ...emptyDimension },
      focus: { ...emptyDimension },
    },
    overallScore: 0,
    overallGrade: 'F',
    passed: false,
    violations: [],
    antiCliche: {
      hardFailTriggers: [],
      softFailTriggers: [],
      aiArtifacts: {
        ringArtifactScore: 0,
        plasticSkinScore: 0,
        digitalOverfitScore: 0,
        overallArtifactRisk: 'low',
      },
      passed: true,
    },
    evaluatedAt: new Date().toISOString(),
    evaluationDurationMs: 0,
  };
}

/**
 * 计算加权总分。
 * 框架占位 — 具体逻辑待实现。
 */
export function calculateOverallScore(
  metrics: Record<EvaluationDimension, MetricDimension>,
  weights: Record<EvaluationDimension, number>
): number {
  let total = 0;
  let weightSum = 0;
  for (const dim of Object.keys(metrics) as EvaluationDimension[]) {
    total += metrics[dim].score * (weights[dim] ?? 0);
    weightSum += weights[dim] ?? 0;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

/**
 * 分数到等级映射。
 * 框架占位。
 */
export function scoreToGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
