/**
 * Aesthetic-to-Runtime Adapter — Phase 3.4.1
 *
 * 类型定义：将 AestheticExecutionPlan 转换为 AestheticRuntimePlan。
 *
 * 核心语义隔离：
 * - AestheticExecutionPlan：设计意图与文化归因（"为什么这样改"）
 * - AestheticRuntimePlan：运行时指令计划（"具体怎么执行"）
 *
 * 两者物理分离，不混成一个 IR。
 */

import type { DesignOperationId } from "../operations/types";
import type { AestheticPrinciple } from "../intent/types";

// ---------------------------------------------------------------------------
// 运行时指令类型
// ---------------------------------------------------------------------------

/** 运行时指令类型 */
export type RuntimeInstructionType =
  | "MUTATE_PROPERTY"      // 修改属性值
  | "SET_PARAMETER"         // 设置参数
  | "APPLY_TRANSFORM"      // 应用变换
  | "ENABLE_FEATURE"       // 启用特性
  | "DISABLE_FEATURE";     // 禁用特性

/**
 * 单个运行时指令。
 * 每条指令必须携带 sourceAestheticOp 和溯源元数据。
 */
export interface RuntimeInstruction {
  /** 指令类型 */
  type: RuntimeInstructionType;
  /** 目标属性路径（Runtime 节点路径） */
  targetPath: string;
  /** 指令值 */
  value: number | string | boolean | number[] | Record<string, unknown>;
  /** 来源美学算子标识 */
  sourceAestheticOp: DesignOperationId;
  /** 溯源元数据（完整透传五元溯源链） */
  metadata: {
    /** 驱动此操作的美学原则 */
    principleRef: AestheticPrinciple;
    /** 触发此操作的关系边引用 */
    relationRef: string;
    /** 算子溯源哈希 */
    provenanceHash: string;
    /** 参数变更追踪（原始值 → 目标值） */
    parameterMutation?: Array<{
      target: string;
      from: number | string | boolean | number[];
      to: number | string | boolean | number[];
      rationale: string;
    }>;
  };
  /** 指令序号（确定性排序） */
  seq: number;
}

// ---------------------------------------------------------------------------
// 运行时计划
// ---------------------------------------------------------------------------

/**
 * AestheticRuntimePlan — 美学运行时指令计划。
 *
 * 这是 AestheticExecutionPlan 经 Adapter 转换后的产物，
 * 包含可被下游 Runtime 消费的指令列表。
 *
 * 与 Core Compiler 的 RuntimeExecutionPlan 不同：
 * - 本计划是美学层的运行时指令，不直接包含 WebGL/渲染管线配置
 * - 下游可进一步将本计划转换为 Core Compiler 的 RuntimeExecutionPlan
 */
export interface AestheticRuntimePlan {
  /** 计划标识 */
  executionId: string;
  /** 计划版本 */
  planVersion: "1.0.0";
  /** 来源 AestheticExecutionPlan 的 planId */
  sourcePlanId: string;
  /** 来源 AestheticExecutionPlan 的 planDigest */
  sourcePlanDigest: string;
  /** 时代范式 */
  period: string;
  /** 编译时间（确定性输入） */
  compiledAt: string;
  /** 运行时指令列表（按 seq 排序） */
  instructions: RuntimeInstruction[];
  /** 被 BLOCKED 的算子列表（不支持的算子显式记录，禁止静默丢弃） */
  blockedOperations: BlockedOperation[];
  /** 编译统计 */
  stats: {
    totalInstructions: number;
    blockedCount: number;
    parameterValidations: number;
    parameterValidationPassed: number;
  };
  /** 确定性摘要（对除 deterministicDigest 外的全部字段哈希） */
  deterministicDigest: string;
}

// ---------------------------------------------------------------------------
// BLOCKED 操作
// ---------------------------------------------------------------------------

/**
 * 被 BLOCKED 的操作记录。
 * 当底层 Runtime 暂不支持某个美学算子时，显式记录而非静默丢弃。
 */
export interface BlockedOperation {
  /** 美学算子标识 */
  operationId: DesignOperationId;
  /** 阻断原因 */
  reason: string;
  /** 阻断代码 */
  code: "UNSUPPORTED_OPERATION" | "PARAMETER_OUT_OF_RANGE" | "TARGET_PATH_INVALID" | "ADAPTER_INTERNAL_ERROR";
  /** 原始操作的溯源信息 */
  provenance: {
    principleRef: AestheticPrinciple;
    relationRef: string;
    provenanceHash: string;
  };
  /** 原始操作序号 */
  originalSeq: number;
}

// ---------------------------------------------------------------------------
// 适配器错误
// ---------------------------------------------------------------------------

/** 适配器错误 */
export interface AdapterError {
  code: string;
  message: string;
  operationId?: DesignOperationId;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 适配结果
// ---------------------------------------------------------------------------

/** 适配结果 */
export interface AdapterResult {
  /** 是否成功 */
  success: boolean;
  /** 运行时计划（成功时） */
  plan?: AestheticRuntimePlan;
  /** 错误列表（失败时或有警告时） */
  errors: AdapterError[];
  /** 被 BLOCKED 的操作数量 */
  blockedCount: number;
  /** 适配耗时（ms） */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// 参数范围约束
// ---------------------------------------------------------------------------

/** 参数范围约束 */
export interface ParameterRangeConstraint {
  /** 参数路径 */
  targetPath: string;
  /** 最小值（含） */
  min?: number;
  /** 最大值（含） */
  max?: number;
  /** 允许的枚举值 */
  enum?: (number | string | boolean)[];
  /** 数据类型 */
  type: "number" | "string" | "boolean" | "array" | "object";
  /** 约束描述 */
  description: string;
}
