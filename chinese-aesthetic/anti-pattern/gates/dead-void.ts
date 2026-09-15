/**
 * ANTI-03: Dead Void — 假留白死黑/死白
 *
 * 物理依据：
 * - 负空间连通区域内的 Laplacian 方差 → 0
 * - 色调熵 → 0
 * - 大气消光梯度为 0（缺乏空间进深介质感）
 *
 * 判定宪法约束（最重要）：
 * - 若输入缺乏深度缓冲或雾气介质标记，且负空间有基本梯度方差，
 *   显式保留为 ALLOW 或 UNMEASURED_PASS
 * - 严禁将正常的纯色写意背景误判为死白
 * - UNMEASURED ≠ FAIL
 * - 必须同时满足"大面积负空间"和"零梯度方差"两个条件
 */

import type { AntiPatternResult, GateContext } from "../types";

export const GATE_ID = "ANTI-03";
export const GATE_NAME = "Dead Void";

export function detectDeadVoid(ctx: GateContext): AntiPatternResult {
  const { evidence, graph } = ctx;
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 负空间比例
  const voidRatio = evidence.pixel?.negativeSpaceRatio?.value;
  if (voidRatio !== undefined) {
    metrics.negativeSpaceRatio = voidRatio;
    evidenceRefs.push(evidence.pixel.negativeSpaceRatio.evidenceRef);
  }

  // 2. 最大负空间连通区域比例
  const largestVoidRatio = evidence.pixel?.largestVoidRegionRatio?.value;
  if (largestVoidRatio !== undefined) {
    metrics.largestVoidRegionRatio = largestVoidRatio;
    evidenceRefs.push(evidence.pixel.largestVoidRegionRatio.evidenceRef);
  }

  // 3. Laplacian 方差（负空间内的纹理细节）
  const laplacianVariance = evidence.pixel?.spatialLaplacianVariance?.value;
  if (laplacianVariance !== undefined) {
    metrics.spatialLaplacianVariance = laplacianVariance;
    evidenceRefs.push(evidence.pixel.spatialLaplacianVariance.evidenceRef);
  }

  // 4. 块亮度均值梯度（大气消光/空间进深）
  const blockGradient = evidence.pixel?.blockLuminanceMeanGradient?.value;
  if (blockGradient !== undefined) {
    metrics.blockLuminanceMeanGradient = blockGradient;
    evidenceRefs.push(evidence.pixel.blockLuminanceMeanGradient.evidenceRef);
  }

  // 5. 亮度标准差（整体色调变化）
  const luminanceStd = evidence.pixel?.luminanceStdDev?.value;
  if (luminanceStd !== undefined) {
    metrics.luminanceStdDev = luminanceStd;
    evidenceRefs.push(evidence.pixel.luminanceStdDev.evidenceRef);
  }

  // 6. 深度证据可用性（宪法约束关键）
  const depthAvailable = evidence.depth?.depthBufferAvailable ?? false;
  const atmosphericDepth = evidence.depth?.atmosphericDepth;
  const atmosphericDepthMeasured =
    atmosphericDepth !== undefined &&
    atmosphericDepth !== null &&
    typeof atmosphericDepth === "object" &&
    "value" in atmosphericDepth;
  metrics.depthBufferAvailable = depthAvailable;
  metrics.atmosphericDepthMeasured = atmosphericDepthMeasured;
  evidenceRefs.push(`depth:buffer-available=${depthAvailable}`);
  evidenceRefs.push(`depth:atmospheric-depth-measured=${atmosphericDepthMeasured}`);

  // 7. 图拓扑中的 VOID 节点能量和 SOLID_VOID 关系
  const voidNode = graph.nodes.find((n) => n.type === "VOID");
  if (voidNode) {
    metrics.voidNodeEnergy = voidNode.energy;
    evidenceRefs.push(`graph:void-node-energy=${voidNode.energy}`);
  }
  const solidVoidRelation = graph.relations.find((r) => r.relationType === "SOLID_VOID");
  if (solidVoidRelation) {
    metrics.solidVoidMagnitude = solidVoidRelation.magnitude;
    evidenceRefs.push(`graph:solid-void-magnitude=${solidVoidRelation.magnitude}`);
  }

  // 判定逻辑
  // 死白/死黑的特征：大面积负空间 + 极低 Laplacian 方差 + 极低块梯度
  const hasLargeVoid = voidRatio !== undefined && voidRatio > 0.5;
  const hasDominantVoidRegion = largestVoidRatio !== undefined && largestVoidRatio > 0.4;
  const hasZeroTexture = laplacianVariance !== undefined && laplacianVariance < 1.0;
  const hasZeroGradient = blockGradient !== undefined && blockGradient < 0.5;
  const hasZeroLuminanceVariation = luminanceStd !== undefined && luminanceStd < 2.0;

  metrics.hasLargeVoid = hasLargeVoid ?? false;
  metrics.hasDominantVoidRegion = hasDominantVoidRegion ?? false;
  metrics.hasZeroTexture = hasZeroTexture ?? false;
  metrics.hasZeroGradient = hasZeroGradient ?? false;
  metrics.hasZeroLuminanceVariation = hasZeroLuminanceVariation ?? false;

  // 证据完整性检查
  const hasEnoughEvidence =
    voidRatio !== undefined &&
    laplacianVariance !== undefined &&
    blockGradient !== undefined;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;
  let unmeasuredReason: string | undefined;

  if (!hasEnoughEvidence) {
    verdict = "ALLOW";
    confidence = 0;
    unmeasuredReason =
      "Insufficient void evidence: negativeSpaceRatio, spatialLaplacianVariance, " +
      "or blockLuminanceMeanGradient missing. Cannot assess dead void.";
    rationale =
      "Void evidence incomplete — skipping ANTI-03 assessment (UNMEASURED ≠ FAIL).";
  } else if (
    hasLargeVoid &&
    hasDominantVoidRegion &&
    hasZeroTexture &&
    hasZeroGradient &&
    hasZeroLuminanceVariation &&
    (depthAvailable || atmosphericDepthMeasured)
  ) {
    // 全部信号满足且有深度证据：明确的死白/死黑
    verdict = "REJECT";
    confidence = 0.9;
    rationale =
      `Dead void detected: voidRatio=${voidRatio?.toFixed(3)}, ` +
      `largestVoidRegion=${largestVoidRatio?.toFixed(3)}, ` +
      `laplacianVariance=${laplacianVariance?.toFixed(4)}, ` +
      `blockGradient=${blockGradient?.toFixed(4)}, ` +
      `luminanceStd=${luminanceStd?.toFixed(4)}. ` +
      `Large negative space with zero texture, zero atmospheric gradient, and zero luminance variation ` +
      `indicates fake blank void (dead white/black) lacking spatial depth or media atmosphere.`;
  } else if (
    hasLargeVoid &&
    (hasZeroTexture || hasZeroGradient) &&
    !depthAvailable &&
    !atmosphericDepthMeasured
  ) {
    // 宪法约束：无深度证据时，即使有部分信号也只 FLAG 不 REJECT
    verdict = "FLAG";
    confidence = 0.5;
    unmeasuredReason =
      "Depth buffer unavailable and atmospheric depth not measured. " +
      "Cannot distinguish intentional blank space from dead void. " +
      "Per constitution: UNMEASURED depth ≠ REJECT.";
    rationale =
      `Potential dead void (depth evidence unavailable): voidRatio=${voidRatio?.toFixed(3)}, ` +
      `laplacianVariance=${laplacianVariance?.toFixed(4)}, ` +
      `blockGradient=${blockGradient?.toFixed(4)}. ` +
      `Large void with low texture/gradient, but no depth buffer or atmospheric depth evidence. ` +
      `Per constitution: UNMEASURED depth ≠ REJECT — FLAG only, may be intentional blank space.`;
  } else if (hasLargeVoid && hasZeroTexture && hasZeroGradient) {
    verdict = "FLAG";
    confidence = 0.65;
    rationale =
      `Potential dead void: voidRatio=${voidRatio?.toFixed(3)}, ` +
      `laplacianVariance=${laplacianVariance?.toFixed(4)}, ` +
      `blockGradient=${blockGradient?.toFixed(4)}. ` +
      `Large void with low texture and gradient — FLAG for manual review.`;
  } else {
    verdict = "ALLOW";
    confidence = 0.8;
    rationale =
      `No dead void: voidRatio=${voidRatio?.toFixed(3)}, ` +
      `laplacianVariance=${laplacianVariance?.toFixed(4)}, ` +
      `blockGradient=${blockGradient?.toFixed(4)}. ` +
      `Negative space has sufficient texture or atmospheric gradient.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "pixel-evidence:void-ratio + laplacian-variance + block-gradient + luminance-std + depth-availability cross-check",
    rationale,
    unmeasuredReason,
    metrics,
  };
}
