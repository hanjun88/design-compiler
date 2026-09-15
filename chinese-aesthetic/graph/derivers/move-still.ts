/**
 * Move-Still Deriver — 动静关系推导
 *
 * 基于光流相干性与静态区域边界推导 MOVE_STILL 关系。
 * 单帧输入时返回 null（运动证据不可用），不脑补。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation, UnmeasuredRelation } from "../types";

/**
 * 推导 MOVE_STILL 关系。
 * 单帧时 motion 为 null，返回 null（调用方应标记为未测量）。
 */
export function deriveMoveStill(
  evidence: ObservableEvidenceSet,
  motionNode: AestheticNode,
  spaceNode: AestheticNode,
): AestheticRelation | null {
  if (evidence.motion === null) {
    return null;
  }

  const flowCoherence = evidence.motion.opticalFlowDirectionCoherence.value; // [0, 1]
  const motionContinuity = evidence.motion.motionContinuity.value; // [0, 1]
  const rhythmPoints = evidence.motion.rhythmChangePointCount.value;
  const camSmoothness = evidence.motion.cameraMotionSmoothness.value; // [0, 1]

  // 运动强度：光流相干性 × 运动连续性 × (1 - 节奏突变率)
  const rhythmStability = Math.max(0, 1 - rhythmPoints / 10);
  const moveStrength = flowCoherence * motionContinuity * (0.5 + rhythmStability * 0.5);

  // 静态强度 = 1 - 运动强度（但相机平滑度高时静态感增强）
  const stillStrength = 1 - moveStrength * (1 - camSmoothness * 0.3);

  // 动静对比 = |move - still|
  const magnitude = Math.min(1, Math.abs(moveStrength - stillStrength));

  const confidence = Math.min(
    motionNode.confidence,
    spaceNode.confidence,
    evidence.motion.opticalFlowDirectionCoherence.confidence,
    evidence.motion.motionContinuity.confidence,
  );

  return {
    sourceId: motionNode.id,
    targetId: spaceNode.id,
    relationType: "MOVE_STILL",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:move-still",
      evidence.motion.opticalFlowDirectionCoherence.evidenceRef,
      evidence.motion.motionContinuity.evidenceRef,
      evidence.motion.rhythmChangePointCount.evidenceRef,
      evidence.motion.cameraMotionSmoothness.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * 单帧时的未测量关系标记。
 */
export function unmeasuredMoveStill(): UnmeasuredRelation {
  return {
    relationType: "MOVE_STILL",
    reason: "Single-frame input: no optical flow or temporal continuity available. Motion evidence requires >= 2 frames.",
    semanticInterpretationRef: "semantic:motion-interpretation:requires-sequence",
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
