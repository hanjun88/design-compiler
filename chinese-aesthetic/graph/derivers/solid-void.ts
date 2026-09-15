/**
 * Solid-Void Deriver — 虚实关系推导
 *
 * 基于负空间连通性与边缘包络推导 SOLID_VOID 关系。
 * 纯物理测量，无主观"意境"断言。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
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
  const negRatio = evidence.pixel.negativeSpaceRatio.value; // [0, 1]
  const componentCount = evidence.pixel.negativeSpaceComponentCount.value;
  const largestVoidRatio = evidence.pixel.largestVoidRegionRatio.value; // [0, 1]

  // 虚实咬合度：负空间比例的"适中度"（0.3-0.5 为最佳咬合区间）
  // 使用三角形函数：在 0.4 处达到峰值 1，向两端递减
  const optimalRatio = 0.4;
  const ratioSpread = 0.3;
  const ratioFit = Math.max(0, 1 - Math.abs(negRatio - optimalRatio) / ratioSpread);

  // 虚空完整性：分量越少、最大分量越大 → 虚空越完整
  const voidIntegrity = largestVoidRatio * Math.max(0, 1 - componentCount / 10);

  // 咬合度 = 比例适中度 × 虚空完整性
  const magnitude = Math.min(1, ratioFit * (0.5 + voidIntegrity * 0.5));

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
