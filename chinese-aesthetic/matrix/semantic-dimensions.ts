/**
 * Chinese Aesthetic Evaluation Matrix — Semantic Dimensions
 *
 * 第二层：审美语义裁决。保留文化本体论判定，
 * 接收机器代理数据作为 evidenceRefs，输出带结构化 rationale 的独立语义结果。
 *
 * 关键规则：Semantic Judgment ≠ Machine Metric
 * - 不能 negativeSpaceRatio >= 0.48 → 宾主揖让 PASS
 * - 不能 depthLayerCount >= 3 → 气韵 PASS
 * - 机器指标只能提供证据，最终语义判断必须保留 judgment/evidenceRefs/rationale
 */

export type SemanticJudgment = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface SemanticDimensionResult {
  /** 文化维度名称，如 宾主揖让 */
  dimension: string;
  /** 语义判断 */
  judgment: SemanticJudgment;
  /** 证据引用（指向机器断言指标） */
  evidenceRefs: string[];
  /** 结构化理由（中文，说明判断依据与文化内涵） */
  rationale: string;
  /** 关联的机器指标值（仅作证据展示，不作判定依据） */
  machineMetrics: Record<string, number>;
}

// ============================================================================
// 八大审美语义维度
// ============================================================================

/** 宾主揖让 — 主体与辅从的秩序关系 */
export interface BinzhuYirang extends SemanticDimensionResult {
  dimension: "宾主揖让";
}

/** 计白当黑 — 留白与实形的辩证关系 */
export interface JibaiDanghei extends SemanticDimensionResult {
  dimension: "计白当黑";
}

/** 虚实相生 — 虚境与实景的互生关系 */
export interface XushiXiangsheng extends SemanticDimensionResult {
  dimension: "虚实相生";
}

/** 气韵连贯 — 生命气息与运动韵律的连贯性 */
export interface QiyunLiangguan extends SemanticDimensionResult {
  dimension: "气韵连贯";
}

/** 含蓄与留白 — 不尽之意与空白的张力 */
export interface HanxuYuliubai extends SemanticDimensionResult {
  dimension: "含蓄与留白";
}

/** 层次与远近 — 空间纵深与远近关系 */
export interface CengciYyuanjin extends SemanticDimensionResult {
  dimension: "层次与远近";
}

/** 形神关系 — 外在形态与内在精神的统一 */
export interface XingshenGuanxi extends SemanticDimensionResult {
  dimension: "形神关系";
}

/** 时间感/动势 — 时间流逝与运动态势的表达 */
export interface ShijianGanDongshi extends SemanticDimensionResult {
  dimension: "时间感/动势";
}

// ============================================================================
// 完整语义评估报告
// ============================================================================

export interface SemanticEvaluationReport {
  /** 评估用例ID */
  testCaseId: string;
  /** 评估时间 (确定性输入) */
  evaluatedAt: string;
  /** 八大维度结果 */
  dimensions: {
    binzhuYirang: SemanticDimensionResult;
    jibaiDanghei: SemanticDimensionResult;
    xushiXiangsheng: SemanticDimensionResult;
    qiyunLiangguan: SemanticDimensionResult;
    hanxuYuliubai: SemanticDimensionResult;
    cengciYyuanjin: SemanticDimensionResult;
    xingshenGuanxi: SemanticDimensionResult;
    shijianGanDongshi: SemanticDimensionResult;
  };
  /** 总体语义评估通过率 */
  passRate: number;
  /** 总体评估总结 */
  summary: string;
}
