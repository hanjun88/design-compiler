/**
 * Feedback Engine — 评测失败 → 提案（GrammarAdjustmentProposal）→ Shadow Simulation → Promotion Gate
 *
 * 边界（见 docs/closure/ADR-0001 与 contracts/README.md）：
 * - 美学规则、阈值与决策的唯一来源是 chinese-aesthetic-skill 的规则注册表。本模块不作美学裁决，
 *   `generateProposal` 只把评测失败的证据（diagnostics）整理成交给技能库的提案骨架，`adjustments` 恒为空，
 *   由技能库作者在注册表中修改规则。
 * - 修改后的规则以新一代 AestheticConstraintSheet 的形式回到编译器：`governance/GrammarGovernor.submit`
 *   负责校验、金丝雀编译与激活，失败时 `rollbackGrammar` 回滚。
 * - Shadow Simulation 通过注入的 executor 真实执行 Golden Case；没有 executor 时明确失败，不伪造通过。
 * - 严禁在线评测结果直接修改生产规则（防漂移）。
 */

import type { FidelityEvaluationResult } from '../compiler-core/contracts';
import {
  runFullRegression,
  type GoldenCaseExecutor,
} from '../governance/regression-runner';

// ========== 框架接口 ==========

export type ProposalStatus =
  | 'DRAFT'
  | 'SHADOW_SIMULATION'
  | 'PROMOTION_GATE'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RELEASED';

export interface GrammarAdjustmentProposal {
  proposalId: string;
  status: ProposalStatus;
  createdAt: string;
  createdBy: string;
  sourceEvaluationId: string;
  sourceViolations: Array<{
    ruleId: string;
    dimension: string;
    severity: string;
    message: string;
  }>;
  adjustments: Array<{
    ruleId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    reason: string;
  }>;
  shadowSimulation: {
    status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
    regressionRate: number;
    targetSceneImprovement: number;
    goldenCasesRun: number;
    goldenCasesPassed: number;
    reportPath?: string;
  };
  promotionGate: {
    passed: boolean;
    regressionThreshold: number;
    actualRegressionRate: number;
    checkedAt?: string;
  };
  approval: {
    required: boolean;
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    approvalNote?: string;
  };
  release: {
    targetGrammarVersion: string;
    releasedAt?: string;
    releaseNote?: string;
  };
}

/**
 * 从评测失败结果生成 GrammarAdjustmentProposal 骨架：记录失败证据，不生成任何美学调整
 * （`adjustments` 为空；调整只能由技能库作者在规则注册表中给出）。
 */
export function generateProposal(
  evaluationResult: FidelityEvaluationResult,
  options?: {
    targetGrammarVersion?: string;
    autoApprove?: boolean;
  }
): GrammarAdjustmentProposal {
  return {
    proposalId: `proposal-${Date.now()}`,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    createdBy: 'feedback-engine',
    sourceEvaluationId: evaluationResult.testCaseId,
    sourceViolations: (evaluationResult.diagnostics ?? []).map((v: string) => ({
      ruleId: 'unknown',
      dimension: 'unknown',
      severity: 'unknown',
      message: v,
    })),
    adjustments: [],
    shadowSimulation: {
      status: 'PENDING',
      regressionRate: 0,
      targetSceneImprovement: 0,
      goldenCasesRun: 0,
      goldenCasesPassed: 0,
    },
    promotionGate: {
      passed: false,
      regressionThreshold: 0,
      actualRegressionRate: 0,
    },
    approval: {
      required: true,
      approved: false,
    },
    release: {
      targetGrammarVersion: options?.targetGrammarVersion ?? '0.1.0',
    },
  };
}

export async function runShadowSimulation(
  proposal: GrammarAdjustmentProposal,
  goldenCasesPath: string,
  executor?: GoldenCaseExecutor,
  baselineGrammarVersion = 'baseline',
): Promise<GrammarAdjustmentProposal> {
  const report = await runFullRegression(
    goldenCasesPath,
    baselineGrammarVersion,
    proposal.release.targetGrammarVersion,
    executor,
  );
  const passed = report.totalCases > 0 && report.failedCases === 0;
  return {
    ...proposal,
    status: passed ? 'PROMOTION_GATE' : 'SHADOW_SIMULATION',
    shadowSimulation: {
      ...proposal.shadowSimulation,
      status: passed ? 'PASS' : 'FAIL',
      regressionRate: report.regressionRate,
      targetSceneImprovement: report.averageScoreDelta,
      goldenCasesRun: report.totalCases,
      goldenCasesPassed: report.passedCases,
    },
    promotionGate: {
      ...proposal.promotionGate,
      passed: false,
      actualRegressionRate: report.regressionRate,
      checkedAt: new Date().toISOString(),
    },
  };
}

export function runPromotionGate(
  proposal: GrammarAdjustmentProposal,
  maxRegressionRate: number = 0.0,
): { passed: boolean; reason: string } {
  if (!Number.isFinite(maxRegressionRate) || maxRegressionRate < 0 || maxRegressionRate > 1) {
    throw new RangeError('maxRegressionRate must be in [0, 1]');
  }
  const simulation = proposal.shadowSimulation;
  if (proposal.status !== 'PROMOTION_GATE') {
    return { passed: false, reason: '提案尚未进入 PROMOTION_GATE 状态' };
  }
  if (simulation.status !== 'PASS' || simulation.goldenCasesRun === 0 || simulation.goldenCasesPassed !== simulation.goldenCasesRun) {
    return { passed: false, reason: 'Shadow Simulation 尚未完整通过' };
  }
  if (simulation.regressionRate > maxRegressionRate) {
    return { passed: false, reason: `回归率 ${simulation.regressionRate} 超过阈值 ${maxRegressionRate}` };
  }
  return { passed: true, reason: 'Shadow Simulation 通过且回归率在阈值内' };
}
