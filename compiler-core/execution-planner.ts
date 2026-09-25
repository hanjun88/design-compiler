/**
 * Execution Planner — 执行步骤编排
 *
 * 负责把能力协商结果和已应用补丁装配为可验证、确定性的执行计划。
 * 计划体不包含自身 hash；hash 只作为计划结果返回给调用方。
 */

import { HashPolicy } from './hash-policy';
import type {
  ExecutionStep,
  ExecutionStepType,
  CompileContext,
  RuntimeCapability,
  AppliedPatch,
} from './types';

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

const PIPELINE: Array<{ type: ExecutionStepType; durationMs: number }> = [
  { type: 'setup-context', durationMs: 1 },
  { type: 'load-assets', durationMs: 8 },
  { type: 'compile-shaders', durationMs: 12 },
  { type: 'apply-patches', durationMs: 2 },
  { type: 'render-frame', durationMs: 16 },
  { type: 'post-process', durationMs: 6 },
  { type: 'composite', durationMs: 3 },
  { type: 'output', durationMs: 1 },
];

function assertPositiveDimension(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero`);
  }
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(config);
}

/**
 * 创建单个执行步骤。stepId 只由类型和序号组成，保证同一计划可复现。
 */
export function createStep(
  type: ExecutionStepType,
  order: number,
  config: Record<string, unknown>,
  dependsOn: string[] = [],
  estimatedDurationMs?: number,
): ExecutionStep {
  if (!Number.isInteger(order) || order < 0) {
    throw new RangeError('Execution step order must be a non-negative integer');
  }
  if (!Array.isArray(dependsOn) || dependsOn.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new TypeError('Execution step dependencies must be non-empty step ids');
  }
  return {
    stepId: `step-${type}-${order}`,
    order,
    type,
    config: cloneConfig(config),
    dependsOn: [...dependsOn],
    ...(estimatedDurationMs === undefined ? {} : { estimatedDurationMs }),
  };
}

/**
 * 构建标准 8 步管线，并建立显式的串行依赖链。
 */
export function buildStandardPipeline(config: Record<string, unknown>): ExecutionStep[] {
  return PIPELINE.map(({ type, durationMs }, index) => {
    const previous = index === 0 ? [] : [`step-${PIPELINE[index - 1].type}-${index - 1}`];
    const stepConfig = config[type];
    if (stepConfig !== undefined && (typeof stepConfig !== 'object' || stepConfig === null || Array.isArray(stepConfig))) {
      throw new TypeError(`Execution step config ${type} must be an object`);
    }
    return createStep(
      type,
      index,
      (stepConfig ?? {}) as Record<string, unknown>,
      previous,
      durationMs,
    );
  });
}

/**
 * 计算执行步骤的预估总时长。负数或非法时长按 0 处理，避免生成不可执行计划。
 */
export function estimateTotalDuration(steps: ExecutionStep[]): number {
  return steps.reduce((sum, step) => {
    const duration = step.estimatedDurationMs;
    return sum + (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : 0);
  }, 0);
}

/**
 * 验证步骤 ID、依赖存在性和依赖图无环。
 */
export function validateStepDependencies(steps: ExecutionStep[]): {
  valid: boolean;
  cycles: string[][];
} {
  const ids = new Set<string>();
  const invalid = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.stepId)) invalid.add(step.stepId);
    ids.add(step.stepId);
    if (!Array.isArray(step.dependsOn) || step.dependsOn.some((id) => typeof id !== 'string')) {
      invalid.add(step.stepId);
    }
  }
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency) || dependency === step.stepId) invalid.add(step.stepId);
    }
  }

  const graph = new Map<string, string[]>();
  for (const step of steps) {
    if (!invalid.has(step.stepId)) graph.set(step.stepId, step.dependsOn.filter((id) => ids.has(id)));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycles.push([...path.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    path.push(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    path.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);

  return { valid: invalid.size === 0 && cycles.length === 0, cycles };
}

/**
 * 按依赖关系进行稳定拓扑排序；存在非法图时拒绝排序。
 */
export function topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
  const validation = validateStepDependencies(steps);
  if (!validation.valid) {
    throw new Error('Cannot sort an execution plan with invalid or cyclic dependencies');
  }
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const indegree = new Map(steps.map((step) => [step.stepId, step.dependsOn.length]));
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      const list = dependents.get(dependency) ?? [];
      list.push(step.stepId);
      dependents.set(dependency, list);
    }
  }
  const ready = steps.filter((step) => indegree.get(step.stepId) === 0)
    .sort((a, b) => a.order - b.order || a.stepId.localeCompare(b.stepId));
  const sorted: ExecutionStep[] = [];
  while (ready.length > 0) {
    const step = ready.shift()!;
    sorted.push(step);
    for (const dependentId of dependents.get(step.stepId) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        const dependent = byId.get(dependentId)!;
        const insertAt = ready.findIndex((candidate) =>
          candidate.order > dependent.order ||
          (candidate.order === dependent.order && candidate.stepId.localeCompare(dependent.stepId) > 0)
        );
        if (insertAt === -1) ready.push(dependent);
        else ready.splice(insertAt, 0, dependent);
      }
    }
  }
  if (sorted.length !== steps.length) throw new Error('Execution plan dependency graph is not acyclic');
  return sorted;
}

/**
 * 编排执行计划。计划 Hash 基于不含 planId/planHash 的计划体计算。
 */
export function planExecution(
  context: CompileContext,
  capability: RuntimeCapability,
  patches: AppliedPatch[],
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    pixelRatio?: number;
  },
): ExecutionPlanResult {
  if (!context || typeof context.compileId !== 'string') throw new TypeError('Compile context is required');
  if (!capability || typeof capability.runtime !== 'string' || typeof capability.runtimeVersion !== 'string') {
    throw new TypeError('Runtime capability is invalid');
  }
  if (!Array.isArray(patches)) throw new TypeError('Applied patches must be an array');

  const width = options?.targetWidth ?? 1920;
  const height = options?.targetHeight ?? 1080;
  const pixelRatio = options?.pixelRatio ?? 1;
  assertPositiveDimension('targetWidth', width);
  assertPositiveDimension('targetHeight', height);
  assertPositiveDimension('pixelRatio', pixelRatio);

  const pipelineConfig: Record<string, Record<string, unknown>> = {
    'setup-context': { runtime: capability.runtime, runtimeVersion: capability.runtimeVersion },
    'load-assets': { assetCount: 0 },
    'compile-shaders': { renderer: capability.runtime, webgl2: capability.webgl2.supported },
    'apply-patches': { patchCount: patches.length },
    'render-frame': { width, height, pixelRatio },
    'post-process': { fallbackCount: capability.fallbacks.length },
    composite: { outputColorSpace: 'srgb-linear' },
    output: { format: 'rgba8' },
  };
  const steps = buildStandardPipeline(pipelineConfig);
  const patchStep = steps.find((step) => step.type === 'apply-patches');
  if (!patchStep) throw new Error('Standard pipeline is missing apply-patches');
  patchStep.patches = patches.flatMap((patch) => patch.rfc6902);

  const validation = validateStepDependencies(steps);
  if (!validation.valid) throw new Error('Generated execution plan has invalid dependencies');
  const orderedSteps = topologicalSort(steps);
  const renderParams = { width, height, pixelRatio };
  const planBody = {
    steps: orderedSteps,
    renderParams,
    assetManifest: [],
    estimatedTotalDurationMs: estimateTotalDuration(orderedSteps),
  };
  const planHash = HashPolicy.computeHash(planBody);
  const planId = `plan-${planHash.slice('sha256:'.length, 'sha256:'.length + 16)}`;

  return { planId, ...planBody, planHash };
}
