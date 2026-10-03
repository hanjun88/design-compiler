/**
 * Solid-Void Deriver — 虚实关系推导
 *
 * 基于负空间连通性与边缘包络推导 SOLID_VOID 关系。
 * 纯物理测量，无主观"意境"断言。
 *
 * 解释参数（最优负空间占比、三角形展宽、分量上限、完整性权重）不在本文件定义：
 * 它们是 AestheticConstraintSheet 的 OPERATION_POLICY（subject = GRAPH_SOLID_VOID），
 * 经 DecisionPack 读取，缺失即抛错。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import { requireDecisionPack } from "../../../skill-bridge/active-pack";
import type { AestheticNode, AestheticRelation } from "../types";

/**
 * 推导 SOLID_VOID 关系。
 *
 * 实体(SUBJECT/BOUNDARY)与虚空(VOID)的咬合程度：
 * - negativeSpaceRatio 适中 → 虚实相生（咬合度高）
 * - 负空间连通分量少 → 虚空完整（咬合度高）
 * - largestVoidRegionRatio 高 → 虚空主导
 *
 * @param evidence 可观测证据集
 * @param solidNode 实体节点（SUBJECT 或 BOUNDARY）
 * @param voidNode 虚空节点（VOID）
 * @returns SOLID_VOID 关系边
 */
export function deriveSolidVoid(
  evidence: ObservableEvidenceSet,
  solidNode: AestheticNode,
  voidNode: AestheticNode,
): AestheticRelation {
  // 解释参数：全局决策，与时代无关，因此不指定 period
  const policy = requireDecisionPack().policy("OPERATION_POLICY", "GRAPH_SOLID_VOID");

  const negRatio = evidence.pixel.negativeSpaceRatio.value; // 归一化占比
  const componentCount = evidence.pixel.negativeSpaceComponentCount.value;
  const largestVoidRatio = evidence.pixel.largestVoidRegionRatio.value; // 归一化占比

  // 虚实咬合度：负空间比例的"适中度"
  // 使用三角形函数：在最优占比处达到峰值 1，向两端按展宽线性递减
  const optimalRatio = policy.num("optimal_ratio");
  const ratioSpread = policy.num("ratio_spread");
  const ratioFit = Math.max(0, 1 - Math.abs(negRatio - optimalRatio) / ratioSpread);

  // 虚空完整性：分量越少、最大分量越大 → 虚空越完整
  const voidIntegrity = largestVoidRatio * Math.max(0, 1 - componentCount / policy.num("component_limit"));

  // 咬合度 = 比例适中度 × (基线 + 虚空完整性 × 权重)
  const integrityWeight = policy.num("integrity_weight");
  const magnitude = Math.min(1, ratioFit * ((1 - integrityWeight) + voidIntegrity * integrityWeight));

  const confidence = Math.min(
    solidNode.confidence,
    voidNode.confidence,
    evidence.pixel.negativeSpaceRatio.confidence,
    evidence.pixel.negativeSpaceComponentCount.confidence,
  );

  return {
    sourceId: solidNode.id,
    targetId: voidNode.id,
    relationType: "SOLID_VOID",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:solid-void",
      evidence.pixel.negativeSpaceRatio.evidenceRef,
      evidence.pixel.negativeSpaceComponentCount.evidenceRef,
      evidence.pixel.largestVoidRegionRatio.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
