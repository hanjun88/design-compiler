/**
 * Chinese Aesthetic Evaluation Matrix — 入口
 *
 * 外围评估层，与 ABI 1.0.0 完全正交。
 * 双层架构：
 *   第一层：Machine Assertions（机器可计算断言）
 *   第二层：Semantic Judgment（审美语义裁决）
 *
 * 严禁：将中式美学反向硬编码进 ABI 1.0.0 物理模式。
 * 严禁：negativeSpaceRatio >= X → 文化维度 PASS 这种还原论。
 */

/**
 * @deprecated Phase 2.5: 旧版硬编码评估器，14 处伪常数已在证据版中拔除。
 * 新代码应使用 evaluateMachineAssertionsFromEvidence。
 * 保留仅为向后兼容（golden-case-02 历史测试）。
 */
export { evaluateMachineAssertions } from "./evaluator/machine-evaluator";
export type { MachineEvaluatorInput } from "./evaluator/machine-evaluator";

// Phase 2.5: 证据版机器断言评估器（14 处硬编码伪常数已拔除）
export {
  evaluateMachineAssertionsFromEvidence,
  evaluateFocalHierarchyEvidence,
  evaluateVoidSolidEvidence,
  evaluateQiyunContinuityEvidence,
  evaluateSpatialDepthEvidence,
  evaluateColorRelationshipEvidence,
  evaluateMaterialRelationshipEvidence,
} from "./evaluator/machine-evaluator";

export { evaluateSemanticDimensions } from "./evaluator/semantic-evaluator";
export type { SemanticEvaluatorInput } from "./evaluator/semantic-evaluator";

export type {
  MachineAssertionReport,
  MachineAssertion,
  MachineAssertionStatus,
  FocalHierarchyMetrics,
  VoidSolidMetrics,
  QiyunContinuityMetrics,
  SpatialDepthMetrics,
  ColorRelationshipMetrics,
  MaterialRelationshipMetrics,
} from "./matrix/machine-assertions";

export type {
  SemanticEvaluationReport,
  SemanticDimensionResult,
  SemanticJudgment,
  BinzhuYirang,
  JibaiDanghei,
  XushiXiangsheng,
  QiyunLiangguan,
  HanxuYuliubai,
  CengciYyuanjin,
  XingshenGuanxi,
  ShijianGanDongshi,
} from "./matrix/semantic-dimensions";
