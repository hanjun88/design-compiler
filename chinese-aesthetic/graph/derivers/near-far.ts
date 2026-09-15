/**
 * Near-Far Deriver — 远近关系推导
 *
 * 基于真实深度缓冲推导 NEAR_FAR 关系。
 * 无深度缓冲时返回 null（显式标记未测量），严禁从 RGB 推断深度。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation, UnmeasuredRelation } from "../types";

/**
 * 推导 NEAR_FAR 关系。
 * 无深度缓冲时返回 null（调用方应标记为未测量）。
 */
export function deriveNearFar(
  evidence: ObservableEvidenceSet,
  nearNode: AestheticNode,
  farNode: AestheticNode,
): AestheticRelation | null {
  if (!evidence.depth.depthBufferAvailable) {
    return null;
  }

  // 有真实深度缓冲时的推导（当前 SoftwareRenderer 不输出深度，此分支主要为 WebGL2 预留）
  const depthLayerCount = evidence.depth.depthLayerCount;
  const layerSeparation = evidence.depth.layerSeparation;

  // 如果深度层数据也是 UNMEASURED，返回 null
  if ("status" in depthLayerCount && depthLayerCount.status === "UNMEASURED_SEMANTIC") {
    return null;
  }
  if ("status" in layerSeparation && layerSeparation.status === "UNMEASURED_SEMANTIC") {
    return null;
  }

  const layers = "value" in depthLayerCount ? depthLayerCount.value : 0;
  const separation = "value" in layerSeparation ? layerSeparation.value : 0;

  // 远近对比强度 = 深度层数 × 层间分离度
  const magnitude = Math.min(1, (layers / 5) * separation);

  const confidence = Math.min(
    nearNode.confidence,
    farNode.confidence,
    "confidence" in depthLayerCount ? depthLayerCount.confidence : 0,
  );

  return {
    sourceId: nearNode.id,
    targetId: farNode.id,
    relationType: "NEAR_FAR",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:near-far",
      "depth-buffer:layer-count",
      "depth-buffer:layer-separation",
    ],
    confidence: round4(confidence),
  };
}

/**
 * 无深度缓冲时的未测量关系标记。
 */
export function unmeasuredNearFar(): UnmeasuredRelation {
  return {
    relationType: "NEAR_FAR",
    reason: "No physical depth buffer available. Near-far relation requires real Z-buffer data; RGB inference is prohibited.",
    semanticInterpretationRef: "semantic:depth-interpretation:requires-depth-buffer",
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
