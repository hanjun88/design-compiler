/**
 * Design Operations — Phase 3 Step 3.1
 *
 * 16 个确定性设计算子，将 Relationship Graph 拓扑力场转化为 RawDesignIR 变换。
 * 核心原则：
 * - 纯函数：(input, graph, period) => output，无副作用
 * - 确定性：相同输入 → 相同输出
 * - 溯源保留：每个变换记录 rationale + provenanceRef
 * - 不修改历史证据：只读 graph/evidence，只写 IR 变换
 * - 不使用魔法参数：所有变换量由图拓扑代数推导
 */

import type { RawDesignIR } from "../../compiler-core/contracts";
import type { AestheticRelationshipGraph, AestheticNode, AestheticRelation } from "../graph/types";

// ---------------------------------------------------------------------------
// 时代范式
// ---------------------------------------------------------------------------

export type AestheticPeriod = "TANG" | "SONG" | "MING";

// ---------------------------------------------------------------------------
// 算子标识
// ---------------------------------------------------------------------------

export type DesignOperationId =
  | "OP_ENCLOSE_BREATHING_FIELD"
  | "OP_ALIGN_GUEST_HOST_TENSION"
  | "OP_PARTITION_POISSON_CLUSTER"
  | "OP_CALIBRATE_AXIAL_ORDER"
  | "OP_LAYER_DEPTH_RECESSION"
  | "OP_INJECT_ATMOSPHERIC_VOID"
  | "OP_SHIFT_HORIZON_PROPORTION"
  | "OP_FRAME_SECONDARY_OCCLUSION"
  | "OP_APPLY_TIME_PATINA"
  | "OP_DAMPEN_SPECULAR_HARSHNESS"
  | "OP_ORCHESTRATE_MATERIAL_CONTRAST"
  | "OP_WEATHER_SURFACE_ENTROPY"
  | "OP_HARMONIZE_SKY_LUMINANCE"
  | "OP_COOL_SHADOW_CHROMATICITY"
  | "OP_FILTER_MIST_SCATTER"
  | "OP_RESTRICT_ACCENT_LUMINANCE";

// ---------------------------------------------------------------------------
// 算子分类
// ---------------------------------------------------------------------------

export type OperationCategory = "composition" | "spatial" | "material" | "lighting";

export const OPERATION_CATEGORIES: Record<DesignOperationId, OperationCategory> = {
  OP_ENCLOSE_BREATHING_FIELD: "composition",
  OP_ALIGN_GUEST_HOST_TENSION: "composition",
  OP_PARTITION_POISSON_CLUSTER: "composition",
  OP_CALIBRATE_AXIAL_ORDER: "composition",
  OP_LAYER_DEPTH_RECESSION: "spatial",
  OP_INJECT_ATMOSPHERIC_VOID: "spatial",
  OP_SHIFT_HORIZON_PROPORTION: "spatial",
  OP_FRAME_SECONDARY_OCCLUSION: "spatial",
  OP_APPLY_TIME_PATINA: "material",
  OP_DAMPEN_SPECULAR_HARSHNESS: "material",
  OP_ORCHESTRATE_MATERIAL_CONTRAST: "material",
  OP_WEATHER_SURFACE_ENTROPY: "material",
  OP_HARMONIZE_SKY_LUMINANCE: "lighting",
  OP_COOL_SHADOW_CHROMATICITY: "lighting",
  OP_FILTER_MIST_SCATTER: "lighting",
  OP_RESTRICT_ACCENT_LUMINANCE: "lighting",
};

// ---------------------------------------------------------------------------
// 算子输入/输出
// ---------------------------------------------------------------------------

export interface DesignOperationContext {
  /** 待变换的设计 IR（深拷贝，算子不修改原对象） */
  ir: RawDesignIR;
  /** 关系图（只读） */
  graph: AestheticRelationshipGraph;
  /** 目标时代范式 */
  period: AestheticPeriod;
}

export interface OperationTrace {
  /** 算子标识 */
  opId: DesignOperationId;
  /** 目标节点 ID（如适用） */
  targetNodeId?: string;
  /** 变换参数（由图拓扑推导，非魔法常数） */
  parameters: Record<string, number | string | boolean | number[]>;
  /** 变换理由（人类可读） */
  rationale: string;
  /** 溯源引用（指向 graph relation/evidence） */
  provenanceRef: string;
  /** 是否实际执行了变换（false = 条件不满足，未变换） */
  applied: boolean;
}

export interface DesignOperationResult {
  /** 变换后的 IR */
  ir: RawDesignIR;
  /** 变换追踪记录 */
  trace: OperationTrace;
}

// ---------------------------------------------------------------------------
// 算子函数签名
// ---------------------------------------------------------------------------

export type DesignOperation = (ctx: DesignOperationContext) => DesignOperationResult;

// ---------------------------------------------------------------------------
// 图查询辅助函数（纯函数，供算子使用）
// ---------------------------------------------------------------------------

/** 查找指定类型的关系边 */
export function findRelations(
  graph: AestheticRelationshipGraph,
  relationType: string,
): AestheticRelation[] {
  return graph.relations.filter((r) => r.relationType === relationType);
}

/** 查找指定类型的节点 */
export function findNodes(graph: AestheticRelationshipGraph, nodeType: string): AestheticNode[] {
  return graph.nodes.filter((n) => n.type === nodeType);
}

/** 计算 HOST_GUEST 显著性比（主节点能量 / 客节点能量） */
export function hostGuestRatio(graph: AestheticRelationshipGraph): number | null {
  const hostGuest = findRelations(graph, "HOST_GUEST");
  if (hostGuest.length === 0) return null;
  const host = graph.nodes.find((n) => n.id === hostGuest[0].sourceId);
  const guest = graph.nodes.find((n) => n.id === hostGuest[0].targetId);
  if (!host || !guest || guest.energy === 0) return null;
  return host.energy / guest.energy;
}

/** 计算 SOLID_VOID 边的强度 */
export function solidVoidMagnitude(graph: AestheticRelationshipGraph): number | null {
  const sv = findRelations(graph, "SOLID_VOID");
  return sv.length > 0 ? sv[0].magnitude : null;
}

/** 深拷贝 IR（算子必须使用拷贝，不修改原对象） */
export function cloneIR(ir: RawDesignIR): RawDesignIR {
  return JSON.parse(JSON.stringify(ir)) as RawDesignIR;
}

/** 钳制数值到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
