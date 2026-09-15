/**
 * Dense-Sparse Deriver — 疏密关系推导
 *
 * 基于 8×8 Block 局部频域方差计算疏密势能。
 * 纯物理测量。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation } from "../types";

export function deriveDenseSparse(
  evidence: ObservableEvidenceSet,
  denseNode: AestheticNode,
  sparseNode: AestheticNode,
): AestheticRelation {
  const laplacianVar = evidence.pixel.spatialLaplacianVariance.value;
  const blockGrad = evidence.pixel.blockLuminanceMeanGradient.value;
  const edgeRatio = evidence.pixel.edgePixelRatio.value;

  // 密度度量：高频能量 + 块梯度 + 边缘密度
  // 归一化：laplacianVar 通常 [0, ~10000]，blockGrad [0, 255]
  const denseScore = Math.min(1,
    laplacianVar / 5000 * 0.4 +
    blockGrad / 128 * 0.3 +
    edgeRatio / 0.3 * 0.3
  );
  const sparseScore = 1 - denseScore;

  // 疏密对比强度 = |dense - sparse|
  const magnitude = Math.min(1, Math.abs(denseScore - sparseScore));

  const confidence = Math.min(
    denseNode.confidence,
    sparseNode.confidence,
    evidence.pixel.spatialLaplacianVariance.confidence,
    evidence.pixel.blockLuminanceMeanGradient.confidence,
  );

  return {
    sourceId: denseNode.id,
    targetId: sparseNode.id,
    relationType: "DENSE_SPARSE",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:dense-sparse",
      evidence.pixel.spatialLaplacianVariance.evidenceRef,
      evidence.pixel.blockLuminanceMeanGradient.evidenceRef,
      evidence.pixel.edgePixelRatio.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
