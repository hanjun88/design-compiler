/**
 * Feedback Engine — GrammarAdjustmentProposal 生成
 *
 * 职责：
 * 1. 接收 Fidelity Failure（评测未通过）
 * 2. 生成 GrammarAdjustmentProposal（规则调整提案）
 * 3. 提案进入 Shadow Simulation（沙箱回归测试）
 * 4. 通过 Promotion Gate 后需 Human/Arch Lead Approval
 * 5. 禁止在线评测结果直接修改生产规则（防漂移）
 *
 * 注意：本文件为框架占位，具体逻辑待实现。
 */

import type { FidelityEvaluationResult } from '../compiler-core/contracts';

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
 * 从评测失败结果生成 GrammarAdjustmentProposal。
 * 框架占位 — 具体逻辑待实现。
 */
export function generateProposal(
  evaluationResult: FidelityEvaluationResult,
  options?: {
    targetGrammarVersion?: string;
    autoApprove?: boolean;
  }
): GrammarAdjustmentProposal {
  // 框架占位：返回默认提案
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

/**
 * 执行沙箱回归测试（Shadow Simulation）。
 * 框架占位 — 具体逻辑待实现。
 */
export async function runShadowSimulation(
  proposal: GrammarAdjustmentProposal,
  goldenCasesPath: string
): Promise<GrammarAdjustmentProposal> {
  // 框架占位：返回未变提案
  return {
    ...proposal,
    status: 'SHADOW_SIMULATION',
    shadowSimulation: {
      ...proposal.shadowSimulation,
      status: 'RUNNING',
    },
  };
}

/**
 * 执行 Promotion Gate 检查。
 * 框架占位 — 具体逻辑待实现。
 */
export function runPromotionGate(
  proposal: GrammarAdjustmentProposal,
  maxRegressionRate: number = 0.0
): { passed: boolean; reason: string } {
  return {
    passed: proposal.shadowSimulation.regressionRate <= maxRegressionRate,
    reason: proposal.shadowSimulation.regressionRate <= maxRegressionRate
      ? '回归率在阈值内'
      : `回归率 ${proposal.shadowSimulation.regressionRate} 超过阈值 ${maxRegressionRate}`,
  };
}
