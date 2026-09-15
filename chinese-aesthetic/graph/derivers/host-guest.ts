/**
 * Host-Guest Deriver — 主客关系推导
 *
 * 基于显著性质心与轮廓面积比推导 HOST_GUEST 关系。
 * 纯物理测量，无主观"礼序"断言。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation } from "../types";

/**
 * 推导 HOST_GUEST 关系。
 *
 * 主体(SUBJECT)对空间(SPACE)的支配程度：
 * - 主体越靠近中心、显著度越高 → 支配越强
 * - focalCenterOffset 越小 → 主体越居中 → HOST 越强
 * - dominantColorRatio 越高 → 主体视觉权重越大 → HOST 越强
 *
 * @param evidence 可观测证据集
 * @param subjectNode SUBJECT 节点
 * @param spaceNode SPACE 节点
 * @returns HOST_GUEST 关系边
 */
export function deriveHostGuest(
  evidence: ObservableEvidenceSet,
  subjectNode: AestheticNode,
  spaceNode: AestheticNode,
): AestheticRelation {
  const focalOffset = evidence.pixel.focalCenterOffset.value; // [0, ~0.707]
  const dominantRatio = evidence.pixel.dominantColorRatio.value; // [0, 1]
  const edgeRatio = evidence.pixel.edgePixelRatio.value; // [0, 1]

  // 主体支配度：居中度(1 - normalized offset) × 主色占比 × 边缘密度
  // focalOffset 归一化到 [0, 1]（最大约 0.707）
  const centeredness = 1 - Math.min(1, focalOffset / 0.707);
  const magnitude = Math.min(1, centeredness * dominantRatio * (0.5 + edgeRatio));

  const confidence = Math.min(
    subjectNode.confidence,
    spaceNode.confidence,
    evidence.pixel.focalCenterOffset.confidence,
    evidence.pixel.dominantColorRatio.confidence,
  );

  return {
    sourceId: subjectNode.id,
    targetId: spaceNode.id,
    relationType: "HOST_GUEST",
    magnitude: round4(magnitude),
    polarity: "FORWARD",
    derivedFrom: [
      "deriver:host-guest",
      evidence.pixel.focalCenterOffset.evidenceRef,
      evidence.pixel.dominantColorRatio.evidenceRef,
      evidence.pixel.edgePixelRatio.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
