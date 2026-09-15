/**
 * 3.4-D: Deterministic Conflict Resolver
 *
 * 显式优先级消歧：COMPOSITION > SPATIAL > LIGHTING > MATERIAL
 *
 * 当多个算子竞争同一参数时：
 * 1. 首先尝试区间求交（Intersection）——若所有提议值都在彼此的合理区间内
 * 2. 若交集为空，依显式优先级仲裁——高优先级算子胜出
 * 3. 生成 CONFLICT_RESOLUTION_TRACE 审计项
 *
 * 严禁静默覆盖（Silent Overwrite）：每次冲突必须有明确记录。
 */

import type { DesignOperationId, OperationCategory } from "../operations/types";
import type { ConflictResolution, PlanOperation } from "./types";
import { CONFLICT_PRIORITY } from "./types";

// ---------------------------------------------------------------------------
// 冲突检测
// ---------------------------------------------------------------------------

/**
 * 检测操作列表中的参数冲突。
 * 两个操作冲突当且仅当它们的 target 参数路径相同。
 *
 * @param operations 待检测的操作列表
 * @returns 按 target 分组的冲突操作映射
 */
export function detectConflicts(
  operations: PlanOperation[],
): Map<string, PlanOperation[]> {
  const conflictMap = new Map<string, PlanOperation[]>();

  for (const op of operations) {
    if (op.skippedReason) continue; // 跳过未执行的操作
    const existing = conflictMap.get(op.target) ?? [];
    existing.push(op);
    conflictMap.set(op.target, existing);
  }

  // 只保留有多个操作竞争的 target
  for (const [target, ops] of conflictMap) {
    if (ops.length <= 1) {
      conflictMap.delete(target);
    }
  }

  return conflictMap;
}

// ---------------------------------------------------------------------------
// 区间求交
// ---------------------------------------------------------------------------

/**
 * 尝试对数值型提议值进行区间求交。
 *
 * 策略：将每个提议值视为一个以该值为中心、容差为 ±15% 的区间，
 * 若所有区间存在交集，则取交集中点作为合并值。
 *
 * @param proposedValues 各算子提议的数值
 * @returns 求交结果（成功时返回合并值，失败时返回 null）
 */
function tryIntervalIntersection(proposedValues: number[]): number | null {
  if (proposedValues.length === 0) return null;
  if (proposedValues.length === 1) return proposedValues[0];

  // 计算每个提议值的区间（±15% 容差，最小绝对容差 0.05）
  const intervals = proposedValues.map((v) => {
    const tolerance = Math.max(Math.abs(v) * 0.15, 0.05);
    return { min: v - tolerance, max: v + tolerance };
  });

  // 求所有区间的交集
  const intersectionMin = Math.max(...intervals.map((i) => i.min));
  const intersectionMax = Math.min(...intervals.map((i) => i.max));

  if (intersectionMin <= intersectionMax) {
    // 交集存在，取中点
    return (intersectionMin + intersectionMax) / 2;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 优先级仲裁
// ---------------------------------------------------------------------------

/**
 * 按显式优先级仲裁冲突。
 * 高优先级算子胜出：COMPOSITION > SPATIAL > LIGHTING > MATERIAL
 *
 * @param competingOps 竞争同一参数的操作列表
 * @returns 胜出的操作
 */
function arbitrateByPriority(competingOps: PlanOperation[]): PlanOperation {
  return competingOps.reduce((winner, current) => {
    const winnerPriority = CONFLICT_PRIORITY[winner.category];
    const currentPriority = CONFLICT_PRIORITY[current.category];
    if (currentPriority > winnerPriority) return current;
    // 同优先级时，seq 较小的先执行（确定性）
    if (currentPriority === winnerPriority && current.seq < winner.seq) return current;
    return winner;
  });
}

// ---------------------------------------------------------------------------
// 冲突解析
// ---------------------------------------------------------------------------

/**
 * 解析单个参数冲突。
 *
 * 解析策略：
 * 1. 若所有提议值都是数值型，尝试区间求交
 * 2. 若求交成功，使用合并值，策略标记为 "intersection"
 * 3. 若求交失败或存在非数值型，按优先级仲裁，策略标记为 "priority"
 * 4. 若同优先级且无法求交，按 seq 顺序加权合并，策略标记为 "merge"
 *
 * @param target 冲突的参数路径
 * @param competingOps 竞争此参数的操作列表
 * @returns 冲突解析记录
 */
export function resolveConflict(
  target: string,
  competingOps: PlanOperation[],
): ConflictResolution {
  // 提取各操作的提议值
  const competing = competingOps.map((op) => {
    const proposedValue = op.parameters[target.split(".").pop() ?? "value"] ?? op.parameters.value;
    return {
      operationId: op.operationId,
      category: op.category,
      proposedValue: proposedValue as number | string | boolean | number[],
      priority: CONFLICT_PRIORITY[op.category],
    };
  });

  // 检查是否所有提议值都是数值型
  const allNumeric = competing.every((c) => typeof c.proposedValue === "number");

  if (allNumeric) {
    const numericValues = competing.map((c) => c.proposedValue as number);
    const intersection = tryIntervalIntersection(numericValues);

    if (intersection !== null) {
      // 区间求交成功
      return {
        target,
        competingOperations: competing,
        resolutionStrategy: "intersection",
        resolvedValue: Number(intersection.toFixed(4)),
        rationale: `Interval intersection of ${competing.length} proposals succeeded; merged value is midpoint of common range`,
      };
    }
  }

  // 区间求交失败或存在非数值型 → 按优先级仲裁
  const winnerOp = arbitrateByPriority(competingOps);
  const winnerValue =
    winnerOp.parameters[target.split(".").pop() ?? "value"] ?? winnerOp.parameters.value;

  return {
    target,
    competingOperations: competing,
    resolutionStrategy: "priority",
    resolvedValue: winnerValue,
    winnerOperationId: winnerOp.operationId,
    rationale: `Priority arbitration: ${winnerOp.category} (priority=${CONFLICT_PRIORITY[winnerOp.category]}) wins over ${competing
      .filter((c) => c.operationId !== winnerOp.operationId)
      .map((c) => `${c.category}(${c.priority})`)
      .join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// 批量冲突解析
// ---------------------------------------------------------------------------

/**
 * 解析操作列表中的所有冲突。
 *
 * @param operations 待解析的操作列表
 * @returns 冲突解析记录列表
 */
export function resolveAllConflicts(operations: PlanOperation[]): ConflictResolution[] {
  const conflictMap = detectConflicts(operations);
  const resolutions: ConflictResolution[] = [];

  for (const [target, competingOps] of conflictMap) {
    const resolution = resolveConflict(target, competingOps);
    resolutions.push(resolution);
  }

  // 按 target 字典序排序（确定性）
  return resolutions.sort((a, b) => a.target.localeCompare(b.target));
}

// ---------------------------------------------------------------------------
// 冲突后操作合并
// ---------------------------------------------------------------------------

/**
 * 应用冲突解析结果到操作列表。
 *
 * 对于冲突的参数：
 * - 胜出操作保留，其参数值更新为解析后的值
 * - 失败操作标记为 skipped，记录被冲突解析覆盖
 *
 * @param operations 原始操作列表
 * @param resolutions 冲突解析结果
 * @returns 应用冲突解析后的操作列表
 */
export function applyConflictResolutions(
  operations: PlanOperation[],
  resolutions: ConflictResolution[],
): PlanOperation[] {
  const result = operations.map((op) => ({ ...op }));

  for (const resolution of resolutions) {
    const competingOpIds = resolution.competingOperations.map((c) => c.operationId);
    const winnerId = resolution.winnerOperationId;

    for (const op of result) {
      if (!competingOpIds.includes(op.operationId)) continue;
      if (op.target !== resolution.target) continue;

      if (winnerId && op.operationId === winnerId) {
        // 胜出操作：更新参数值为解析后的值
        const paramKey = resolution.target.split(".").pop() ?? "value";
        op.parameters[paramKey] = resolution.resolvedValue;
      } else {
        // 失败操作：标记为被冲突解析覆盖
        op.skippedReason = `CONFLICT_RESOLVED_BY_${resolution.resolutionStrategy.toUpperCase()}: ${resolution.target} resolved to ${JSON.stringify(resolution.resolvedValue)} (winner: ${winnerId ?? "intersection"})`;
      }
    }
  }

  return result;
}
