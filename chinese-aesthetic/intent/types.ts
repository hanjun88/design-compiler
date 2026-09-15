/**
 * Aesthetic Intent IR — 扩展命名空间类型定义
 *
 * 挂载于扩展层 aestheticIntent，与 Core ABI 1.0.0 核心字段物理隔离。
 * 不污染 ValidatedDesignIR 核心契约。
 */

import type { AestheticPeriod } from "../operations/types";

/** 八大母语法枚举 */
export type AestheticPrinciple =
  | "QI_YUN_CONTINUITY"
  | "VOID_SOLID_INTERPLAY"
  | "COUNT_WHITE_AS_BLACK"
  | "GUEST_HOST_COMITY"
  | "POSITION_MANAGEMENT"
  | "SCALE_PROPORTION"
  | "MATERIAL_PATINA"
  | "LIGHT_TEMPORALITY";

/** 激活关系边引用 */
export interface ActiveRelationship {
  relationType: string;
  sourceId: string;
  targetId: string;
  magnitude: number;
}

/** 已应用设计算子记录 */
export interface AppliedOperation {
  opId: string;
  targetNodeId?: string;
  parameters: Record<string, number | string | boolean | number[]>;
  rationale: string;
  provenanceRef: string;
}

/** 反模式门禁合规状态 */
export interface AntiPatternConformance {
  gateReportRef: string;
  allAllowed: boolean;
}

/** 溯源三元组 */
export interface IntentProvenance {
  evidenceHash: string;
  graphHash: string;
  intentHash: string;
}

/**
 * AestheticIntentExtension — 扩展命名空间根对象
 *
 * 此对象挂载于 IR 的 aestheticIntent 字段，不进入 ABI 1.0.0 核心校验。
 * additionalProperties: false 严格约束字段集合。
 */
export interface AestheticIntentExtension {
  system: "chinese-aesthetic@1.0.0";
  period: AestheticPeriod;
  principles: AestheticPrinciple[];
  activeRelationships: ActiveRelationship[];
  appliedOperations: AppliedOperation[];
  antiPatternConformance: AntiPatternConformance;
  provenance: IntentProvenance;
}

/** Builder 输入上下文 */
export interface IntentBuildContext {
  period: AestheticPeriod;
  principles: AestheticPrinciple[];
  evidenceHash: string;
  graphHash: string;
  gateReportRef: string;
  allAllowed: boolean;
  activeRelationships?: ActiveRelationship[];
  appliedOperations?: AppliedOperation[];
}
