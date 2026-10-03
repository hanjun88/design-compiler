/**
 * Aesthetic-to-ExecutionPlan Compiler — Phase 3.4
 *
 * 类型定义：将 AestheticIntentExtension 确定性编译为 AestheticExecutionPlan。
 *
 * 核心原则：
 * - 零隐式规则：每个算子入选必须由 principles + activeRelationships 双重激活
 * - 完整溯源：每个操作绑定 principleRef → relationRef → operationId → parameterMutation
 * - 确定性：相同输入 → 字节级相同输出
 * - 不修改历史：只读 AestheticIntent / Graph / Evidence，只生成新计划
 * - 零语义泄漏：不生成 ChineseScore，不以指标反向定义审美
 */

import type { AestheticPeriod, DesignOperationId, OperationCategory } from "../operations/types";
import { OPERATION_CATEGORIES } from "../operations/types";
import type { AestheticPrinciple, ActiveRelationship } from "../intent/types";
import { requireDecisionPack } from "../../skill-bridge/active-pack";
import { MissingDecisionError, type DecisionPack } from "../../skill-bridge/decision-pack";

// ---------------------------------------------------------------------------
// 操作溯源链（法医级五元组）
// ---------------------------------------------------------------------------

/**
 * 操作溯源元数据。
 * 每个发射到 ExecutionPlan 的操作必须携带完整溯源链，
 * 支持从操作反推至：美学原则 → 关系边 → 算子 → 参数变更。
 */
export interface OperationProvenance {
  /** 驱动此操作的美学原则（如 COUNT_WHITE_AS_BLACK） */
  principleRef: AestheticPrinciple;
  /** 触发此操作的关系边引用（如 "node:subject --[SOLID_VOID]--> node:void"） */
  relationRef: string;
  /** 设计算子标识 */
  operationId: DesignOperationId;
  /** 参数变更追踪（原始值 → 目标值） */
  parameterMutation: ParameterMutation[];
  /** 溯源哈希（对 principleRef+relationRef+operationId+parameters 的确定性哈希） */
  provenanceHash: string;
}

/** 参数变更记录 */
export interface ParameterMutation {
  /** 参数路径（如 "scene.composition.negativeSpaceRatio"） */
  target: string;
  /** 原始值（来自 IR 或默认） */
  from: number | string | boolean | number[];
  /** 目标值（算子推导） */
  to: number | string | boolean | number[];
  /** 变更理由 */
  rationale: string;
}

// ---------------------------------------------------------------------------
// 计划操作
// ---------------------------------------------------------------------------

/**
 * ExecutionPlan 中的单个操作。
 * 按 seq 单调递增编号，下游 Runtime 按序执行。
 */
export interface PlanOperation {
  /** 执行序号（从 0 开始，单调递增） */
  seq: number;
  /** 设计算子标识 */
  operationId: DesignOperationId;
  /** 算子分类（用于冲突解析优先级） */
  category: OperationCategory;
  /** 目标参数路径 */
  target: string;
  /** 操作参数（由图拓扑 + 时代先验推导） */
  parameters: Record<string, number | string | boolean | number[]>;
  /** 时代先验约束应用记录 */
  periodConstraintApplied?: string;
  /** 完整溯源链 */
  provenance: OperationProvenance;
  /** 跳过原因（如条件不满足，非空表示此操作未实际执行） */
  skippedReason?: string;
}

// ---------------------------------------------------------------------------
// 冲突解析
// ---------------------------------------------------------------------------

/** 算子分类集合（来自算子表，属结构信息而非美学判断）。 */
const OPERATION_CATEGORY_LIST: readonly OperationCategory[] = [...new Set(Object.values(OPERATION_CATEGORIES))];

/**
 * 冲突优先级：各算子分类的数值秩（秩越大越优先）。
 *
 * 优先顺序本身是 skill 的 PRIORITY_ORDER 决策（由高到低），经 DecisionPack 读取；
 * 把顺序位置换算成秩（n … 1）是结构性运算，不含美学数值。
 * 只对算子分类排序：顺序中的其他角色（如 color / governance）不占秩。
 */
export function conflictPriority(pack: DecisionPack = requireDecisionPack()): Record<OperationCategory, number> {
  const order = pack
    .priorityOrder()
    .filter((role): role is OperationCategory => (OPERATION_CATEGORY_LIST as readonly string[]).includes(role));
  const ranks = {} as Record<OperationCategory, number>;
  for (const category of OPERATION_CATEGORY_LIST) {
    const position = order.indexOf(category);
    // ssot-ok(PROTOCOL): indexOf returns -1 when the category is absent from the order (array-index sentinel, not a magnitude)
    if (position < 0) throw new MissingDecisionError(`PRIORITY_ORDER position of operation category ${category}`);
    ranks[category] = order.length - position;
  }
  return ranks;
}

/**
 * conflictPriority() 的即时视图（保留原有的 CONFLICT_PRIORITY[category] 调用方式）：
 * 每次读取都解析当前生效的 DecisionPack，没有 pack 时直接失败，不存在本地默认值。
 */
export const CONFLICT_PRIORITY: Readonly<Record<OperationCategory, number>> = (() => {
  const view = {} as Record<OperationCategory, number>;
  for (const category of OPERATION_CATEGORY_LIST) {
    Object.defineProperty(view, category, { enumerable: true, get: () => conflictPriority()[category] });
  }
  return Object.freeze(view);
})();

/** 冲突解析记录 */
export interface ConflictResolution {
  /** 冲突的目标参数路径 */
  target: string;
  /** 竞争此参数的操作列表 */
  competingOperations: Array<{
    operationId: DesignOperationId;
    category: OperationCategory;
    proposedValue: number | string | boolean | number[];
    priority: number;
  }>;
  /** 解析策略：priority（按优先级）/ intersection（区间求交）/ merge（加权合并） */
  resolutionStrategy: "priority" | "intersection" | "merge";
  /** 最终选定值 */
  resolvedValue: number | string | boolean | number[];
  /** 胜出的操作（如有） */
  winnerOperationId?: DesignOperationId;
  /** 解析理由 */
  rationale: string;
}

// ---------------------------------------------------------------------------
// 时代先验约束
// ---------------------------------------------------------------------------

/** 参数区间约束 */
export interface ParameterRangeConstraint {
  /** 参数路径 */
  target: string;
  /** 最小值（含） */
  min: number;
  /** 最大值（含） */
  max: number;
  /** 约束理由 */
  rationale: string;
}

/** 时代先验约束集 */
export interface PeriodConstraintSet {
  period: AestheticPeriod;
  /** 参数区间约束列表（来自 AestheticConstraintSheet 的 PERIOD_BAND 决策，按参数路径排序） */
  constraints: ParameterRangeConstraint[];
  /** 约束来源描述（中性的溯源说明；不含美学表述，美学表述属于 skill） */
  description: string;
}

// ---------------------------------------------------------------------------
// 编译结果
// ---------------------------------------------------------------------------

/** 算子选择记录 */
export interface OperationSelectionRecord {
  operationId: DesignOperationId;
  category: OperationCategory;
  /** 是否被选中 */
  selected: boolean;
  /** 驱动原则（如选中） */
  principleRef?: AestheticPrinciple;
  /** 触发关系（如选中） */
  relationRef?: string;
  /** 跳过原因（如未选中） */
  skippedReason?: string;
}

/**
 * AestheticExecutionPlan — 美学执行计划
 *
 * 这是 Phase 3.4 的核心产物，描述了：
 * "哪些美学原则驱动了哪些设计操作，修改了哪些参数，完整溯源链是什么"
 *
 * 此计划可被下游 Core Compiler 消费，或作为独立的美学编译产物。
 * 不直接生成 Core Compiler 的 RuntimeExecutionPlan（那是 Core 的职责）。
 */
export interface AestheticExecutionPlan {
  /** 计划标识 */
  planId: string;
  /** 计划版本 */
  planVersion: "1.0.0";
  /** 目标时代范式 */
  period: AestheticPeriod;
  /** 编译时间（确定性输入，非实际时间） */
  compiledAt: string;
  /** 输入意图哈希 */
  intentHash: string;
  /** 输入图哈希 */
  graphHash: string;
  /** 激活的美学原则 */
  activePrinciples: AestheticPrinciple[];
  /** 激活的关系边 */
  activeRelationships: ActiveRelationship[];
  /** 操作序列（按 seq 排序） */
  operations: PlanOperation[];
  /** 算子选择记录（全部 16 个，含未选中的） */
  selections: OperationSelectionRecord[];
  /** 冲突解析记录 */
  conflictResolutions: ConflictResolution[];
  /** 时代先验约束应用记录 */
  periodConstraintsApplied: string[];
  /** 编译统计 */
  stats: {
    totalOperations: number;
    appliedOperations: number;
    skippedOperations: number;
    conflictsResolved: number;
    periodConstraintsApplied: number;
  };
  /** 计划摘要（对 operations 的确定性哈希，不含自身） */
  planDigest: string;
}

/** 编译错误 */
export interface CompilationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** 编译结果 */
export interface CompilationResult {
  /** 是否成功 */
  success: boolean;
  /** 执行计划（成功时） */
  plan?: AestheticExecutionPlan;
  /** 错误列表（失败时） */
  errors: CompilationError[];
  /** 编译耗时（ms） */
  durationMs: number;
}
