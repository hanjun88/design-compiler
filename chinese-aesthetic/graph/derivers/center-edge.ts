/**
 * Center-Edge Deriver — 中边关系推导
 *
 * 基于焦点位置与对称性推导 CENTER_EDGE 关系。
 * 纯物理测量。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation } from "../types";

export function deriveCenterEdge(
  evidence: ObservableEvidenceSet,
  axisNode: AestheticNode,
  boundaryNode: AestheticNode,
): AestheticRelation {
  const focalOffset = evidence.pixel.focalCenterOffset.value; // [0, ~0.707]
  const symmetry = evidence.ir.symmetry.value; // [0, 1]
  const edgeRatio = evidence.pixel.edgePixelRatio.value; // [0, 1]

  // 中心聚集度：对称性高 + 焦点偏移小 → 中心强
  const centeredness = symmetry * (1 - Math.min(1, focalOffset / 0.707));
  // 边缘强度：边缘密度
  const edgeStrength = Math.min(1, edgeRatio / 0.2);

  // 中边张力 = 中心聚集度 × 边缘强度（两者都强时张力最大）
  const magnitude = Math.min(1, centeredness * edgeStrength * 2);

  const confidence = Math.min(
    axisNode.confidence,
    boundaryNode.confidence,
    evidence.pixel.focalCenterOffset.confidence,
    evidence.ir.symmetry.confidence,
  );

  return {
    sourceId: axisNode.id,
    targetId: boundaryNode.id,
    relationType: "CENTER_EDGE",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:center-edge",
      evidence.pixel.focalCenterOffset.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
      evidence.pixel.edgePixelRatio.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
