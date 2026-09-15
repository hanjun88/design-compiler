/**
 * Execution Planner — 执行步骤编排
 *
 * 职责：
 * 1. 将 ValidatedDesignIR + Capability Negotiation 结果编排为有序执行步骤
 * 2. 每个步骤声明类型、配置、依赖关系、预估时长
 * 3. 生成 ExecutionPlan，供运行时执行
 * 4. 计算 ExecutionPlan 哈希，写入溯源链
 *
 * 执行步骤类型：
 * setup-context → load-assets → compile-shaders → apply-patches → render-frame → post-process → composite → output
 *
 * 注意：本文件为框架占位，具体逻辑待实现。
 */

import type {
  ExecutionStep,
  ExecutionStepType,
  CompileContext,
  RuntimeCapability,
  AppliedPatch,
} from './types.js';

// ========== 框架接口 ==========

export interface ExecutionPlanResult {
  planId: string;
  steps: ExecutionStep[];
  renderParams: Record<string, unknown>;
  assetManifest: Array<{
    assetId: string;
    type: string;
    url: string;
    hash: string;
    loadingStrategy: 'eager' | 'lazy' | 'on-demand';
  }>;
  estimatedTotalDurationMs: number;
  planHash: string;
}

/**
 * 编排执行计划。
 * 框架占位 — 具体逻辑待实现。
 */
export function planExecution(
  context: CompileContext,
  capability: RuntimeCapability,
  patches: AppliedPatch[],
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    pixelRatio?: number;
  }
): ExecutionPlanResult {
  // 框架占位：返回默认空计划
  return {
    planId: `plan-${Date.now()}`,
    steps: [],
    renderParams: {
      width: options?.targetWidth ?? 1920,
      height: options?.targetHeight ?? 1080,
      pixelRatio: options?.pixelRatio ?? 1,
    },
    assetManifest: [],
    estimatedTotalDurationMs: 0,
    planHash: '',
  };
}

/**
 * 创建单个执行步骤。
 * 框架占位 — 具体逻辑待实现。
 */
export function createStep(
  type: ExecutionStepType,
  order: number,
  config: Record<string, unknown>,
  dependsOn: string[] = []
): ExecutionStep {
  return {
    stepId: `step-${type}-${order}`,
    order,
    type,
    config,
    dependsOn,
  };
}

/**
 * 构建标准执行步骤序列（8 步管线）。
 * 框架占位 — 具体逻辑待实现。
 */
export function buildStandardPipeline(
  config: Record<string, unknown>
): ExecutionStep[] {
  const types: ExecutionStepType[] = [
    'setup-context',
    'load-assets',
    'compile-shaders',
    'apply-patches',
    'render-frame',
    'post-process',
    'composite',
    'output',
  ];

  return types.map((type, i) =>
    createStep(type, i, config[type] ?? {}, i > 0 ? [`step-${types[i - 1]}-${i - 1}`] : [])
  );
}

/**
 * 计算执行计划的预估总时长。
 * 框架占位 — 具体逻辑待实现。
 */
export function estimateTotalDuration(steps: ExecutionStep[]): number {
  return steps.reduce((sum, s) => sum + (s.estimatedDurationMs ?? 0), 0);
}

/**
 * 验证执行步骤的依赖关系是否存在循环。
 * 框架占位 — 具体逻辑待实现。
 */
export function validateStepDependencies(steps: ExecutionStep[]): {
  valid: boolean;
  cycles: string[][];
} {
  return { valid: true, cycles: [] }; // 框架占位
}

/**
 * 对执行步骤按依赖关系进行拓扑排序。
 * 框架占位 — 具体逻辑待实现。
 */
export function topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
  return [...steps].sort((a, b) => a.order - b.order); // 框架占位
}
