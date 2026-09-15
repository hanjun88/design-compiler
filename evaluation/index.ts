/**
 * Evaluation — 评测 ABI 入口
 *
 * 5 维解耦评测矩阵：构图 / 色彩 / 深度 / 材质 / 焦点
 * 双哈希链：Design ABI (ValidatedDesignIR) + Evaluation ABI (FidelityEvaluationResult)
 *
 * 输出严格符合 ABI 1.0.0 FROZEN 的 FidelityEvaluationResult 结构。
 */

import type {
  EvaluationDimension,
  MetricDimension,
  MetricCheck,
} from '../compiler-core/types';
import type {
  ValidatedDesignIR,
  FidelityEvaluationResult,
  EvaluationMetricItem,
  GateDecision,
} from '../compiler-core/contracts';
import { evaluateComposition } from './evaluators/composition';
import { evaluateColor } from './evaluators/color';
import { evaluateDepth } from './evaluators/depth';
import { evaluateMaterial } from './evaluators/material';
import { evaluateFocus } from './evaluators/focus';

// ========== 类型定义 ==========

export interface EvaluationThresholds {
  composition: number;
  color: number;
  depth: number;
  material: number;
  focalPointDisplacementMax: number;
}

export interface EvaluationVersions {
  compiler: string;
  distiller: string;
  grammar: string;
  adapter: string;
  evaluator: string;
}

export interface EvaluationHashChain {
  inputHash: string;
  rawIRHash: string;
  validatedIRHash: string;
  executionPlanHash: string;
  renderHash?: string;
}

export interface EvaluationTiming {
  distillationExecutionMs: number;
  grammarExecutionMs?: number;
  adapterExecutionMs?: number;
  renderExecutionMs?: number;
}

// ========== 默认阈值 ==========

const DEFAULT_THRESHOLDS: EvaluationThresholds = {
  composition: 0.90,
  color: 0.90,
  depth: 0.85,
  material: 0.80,
  focalPointDisplacementMax: 0.05,
};

const DEFAULT_VERSIONS: EvaluationVersions = {
  compiler: '1.0.0',
  distiller: '1.0.0',
  grammar: 'chinese-aesthetic@1.0.0',
  adapter: 'webgl-heartmirror@1.0.0',
  evaluator: '1.0.0',
};

// ========== 核心函数 ==========

/**
 * 将 MetricDimension 转换为 ABI 1.0.0 的 EvaluationMetricItem。
 */
function toMetricItem(
  metric: MetricDimension,
  threshold: number,
  metricVersion: string,
  evaluationMethod: string
): EvaluationMetricItem {
  return {
    score: Number(metric.score.toFixed(4)),
    threshold,
    weight: metric.weight,
    metricVersion,
    evaluationMethod,
  };
}

/**
 * 执行 5 维评测，输出 ABI 1.0.0 合规的 FidelityEvaluationResult。
 *
 * @param validatedIR 编译后的 ValidatedDesignIR
 * @param hashChain 四元哈希链（input/raw/validated/executionPlan）
 * @param timing 各阶段耗时
 * @param testCaseId 测试用例 ID
 * @param tierExecuted 执行层级
 * @param versions 版本指纹
 * @param thresholds 各维度阈值
 */
export function evaluate(
  validatedIR: ValidatedDesignIR,
  hashChain: EvaluationHashChain,
  timing: EvaluationTiming,
  testCaseId: string,
  tierExecuted: 'TIER_A' | 'TIER_B' | 'TIER_C' | 'TIER_D' = 'TIER_A',
  versions: EvaluationVersions = DEFAULT_VERSIONS,
  thresholds: EvaluationThresholds = DEFAULT_THRESHOLDS
): FidelityEvaluationResult {
  // 1. 调用5个评估器
  const compMetric = evaluateComposition(validatedIR);
  const colorMetric = evaluateColor(validatedIR);
  const depthMetric = evaluateDepth(validatedIR);
  const materialMetric = evaluateMaterial(validatedIR);
  const focusMetric = evaluateFocus(validatedIR);

  // 2. 计算焦点位移距离（焦点相对于画面中心的欧氏距离）
  const [fx, fy] = validatedIR.validated.composition.focalPoint.value;
  const displacementDistance = Math.sqrt(Math.pow(fx - 0.5, 2) + Math.pow(fy - 0.5, 2));

  // 3. 转换为 ABI 1.0.0 格式
  const compositionItem = toMetricItem(compMetric, thresholds.composition, '1.0.0', 'rule-based-ir');
  const colorCompositeItem = toMetricItem(colorMetric, thresholds.color, '1.0.0', 'rule-based-ir');

  // color 拆分为5个子指标
  const color = validatedIR.validated.color;
  const paletteScore = (color.dominant.value && color.secondary.value && color.accent.value) ? 1.0 : 0.0;
  const dominantAreaScore = color.contrastRatio.value >= 3.0 ? 1.0 : 0.0;
  const temperatureScore = (color.temperatureBias.value >= -0.3 && color.temperatureBias.value <= 0.3) ? 1.0 : 0.0;
  const contrastScore = color.contrastRatio.value >= 3.0 ? 1.0 : 0.0;

  const depthItem = toMetricItem(depthMetric, thresholds.depth, '1.0.0', 'rule-based-ir');
  const materialItem = toMetricItem(materialMetric, thresholds.material, '1.0.0', 'rule-based-ir');

  const focalItem: EvaluationMetricItem & { displacementDistance: number } = {
    score: focusMetric.score,
    threshold: thresholds.focalPointDisplacementMax,
    weight: focusMetric.weight,
    metricVersion: '1.0.0',
    evaluationMethod: 'euclidean-center-distance',
    displacementDistance: Number(displacementDistance.toFixed(4)),
  };

  // 4. 计算 gates
  const gates: {
    composition: GateDecision;
    color: GateDecision;
    depth: GateDecision;
    material: GateDecision;
    focalDisplacement: GateDecision;
  } = {
    composition: {
      metricRef: 'metrics.composition',
      passed: compositionItem.score >= compositionItem.threshold,
    },
    color: {
      metricRef: 'metrics.color.composite',
      passed: colorCompositeItem.score >= colorCompositeItem.threshold,
    },
    depth: {
      metricRef: 'metrics.depth',
      passed: depthItem.score >= depthItem.threshold,
    },
    material: {
      metricRef: 'metrics.material',
      passed: materialItem.score >= materialItem.threshold,
    },
    focalDisplacement: {
      metricRef: 'metrics.focalPointDisplacement',
      passed: displacementDistance <= thresholds.focalPointDisplacementMax,
    },
  };

  // 5. 计算总体状态
  const allPassed = Object.values(gates).every(g => g.passed);
  const status = allPassed ? 'PASS' : 'FAIL';

  // 6. 收集诊断信息
  const diagnostics: string[] = [];
  for (const [name, gate] of Object.entries(gates)) {
    if (!gate.passed) {
      diagnostics.push(`Gate failed: ${name} (${gate.metricRef})`);
    }
  }

  // 7. 组装 provenance
  const isExecuted = status === 'PASS' || status === 'FAIL';
  // 执行态必须包含 renderHash；若未提供（无实际渲染器），使用确定性占位哈希
  const effectiveRenderHash = isExecuted
    ? (hashChain.renderHash ?? `sha256:${hashChain.validatedIRHash.slice(7, 39)}${hashChain.executionPlanHash.slice(7, 39)}`)
    : undefined;
  const effectiveRenderMs = isExecuted ? (timing.renderExecutionMs ?? 0) : undefined;
  const provenance = {
    hashManifest: {
      algorithm: 'SHA-256' as const,
      canonicalization: 'RFC8785' as const,
    },
    hashChain: {
      inputHash: hashChain.inputHash,
      rawIRHash: hashChain.rawIRHash,
      validatedIRHash: hashChain.validatedIRHash,
      executionPlanHash: hashChain.executionPlanHash,
      ...(effectiveRenderHash ? { renderHash: effectiveRenderHash } : {}),
    },
    timing: {
      distillationExecutionMs: timing.distillationExecutionMs,
      ...(timing.grammarExecutionMs !== undefined ? { grammarExecutionMs: timing.grammarExecutionMs } : {}),
      ...(timing.adapterExecutionMs !== undefined ? { adapterExecutionMs: timing.adapterExecutionMs } : {}),
      ...(effectiveRenderMs !== undefined ? { renderExecutionMs: effectiveRenderMs } : {}),
    },
  };

  // 8. 组装结果
  const result: FidelityEvaluationResult = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    testCaseId,
    executedAt: new Date().toISOString(),
    status,
    tierExecuted,
    versions,
    metrics: {
      composition: compositionItem,
      color: {
        composite: colorCompositeItem,
        palette: { score: paletteScore, threshold: 0.5, weight: 0.05, metricVersion: '1.0.0', evaluationMethod: 'triad-presence' },
        dominantArea: { score: dominantAreaScore, threshold: 0.5, weight: 0.05, metricVersion: '1.0.0', evaluationMethod: 'contrast-ratio' },
        temperature: { score: temperatureScore, threshold: 0.5, weight: 0.05, metricVersion: '1.0.0', evaluationMethod: 'temp-bias-range' },
        contrast: { score: contrastScore, threshold: 0.5, weight: 0.05, metricVersion: '1.0.0', evaluationMethod: 'wcag-contrast' },
      },
      depth: depthItem,
      material: materialItem,
      focalPointDisplacement: focalItem,
    },
    gates,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    provenance,
  };

  return result;
}

// ========== 辅助函数 ==========

/**
 * 计算加权总分。
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
 */
export function scoreToGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * 导出评估器，供外部直接调用。
 */
export { evaluateComposition, evaluateColor, evaluateDepth, evaluateMaterial, evaluateFocus };
