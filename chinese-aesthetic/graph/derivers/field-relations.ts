/**
 * Field Relations Deriver — 场关系推导（HIGH_LOW, HEAVY_LIGHT, OLD_NEW, OPEN_CLOSE）
 *
 * 基于光照、材质、时间、空间场的物理测量推导场间关系。
 * 纯物理测量，无主观评分。
 */

import type { ObservableEvidenceSet } from "../../extraction/types";
import type { AestheticNode, AestheticRelation } from "../types";

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * HIGH_LOW: 光照(LIGHT)与虚空(VOID)的高低层级对比。
 * 高亮度区域 vs 低亮度/虚空区域的对比度。
 */
export function deriveHighLow(
  evidence: ObservableEvidenceSet,
  lightNode: AestheticNode,
  voidNode: AestheticNode,
): AestheticRelation {
  const meanLuma = evidence.pixel.meanLuminance.value; // [0, 255]
  const lumaStd = evidence.pixel.luminanceStdDev.value; // [0, ~128]
  const contrast = evidence.pixel.contrastRatio.value; // [1, 21]

  // 高低对比 = 亮度标准差 × WCAG 对比度（归一化）
  const lumaContrast = Math.max(0, lumaStd / 64); // 归一化到 [0, ~2]
  const wcagContrast = Math.max(0, (contrast - 1) / 20); // 归一化到 [0, 1]，防御 contrast<1 边缘情况
  const magnitude = Math.min(1, Math.max(0, lumaContrast * 0.5 + wcagContrast * 0.5));

  const confidence = Math.min(
    lightNode.confidence,
    voidNode.confidence,
    evidence.pixel.meanLuminance.confidence,
    evidence.pixel.luminanceStdDev.confidence,
  );

  return {
    sourceId: lightNode.id,
    targetId: voidNode.id,
    relationType: "HIGH_LOW",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:high-low",
      evidence.pixel.meanLuminance.evidenceRef,
      evidence.pixel.luminanceStdDev.evidenceRef,
      evidence.pixel.contrastRatio.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * HEAVY_LIGHT: 材质(MATERIAL)与光照(LIGHT)的轻重对比。
 * 高金属度/高粗糙度材质（重）vs 明亮/柔和光照（轻）。
 */
export function deriveHeavyLight(
  evidence: ObservableEvidenceSet,
  materialNode: AestheticNode,
  lightNode: AestheticNode,
): AestheticRelation {
  const metalness = evidence.material.dominantMetalness.value; // [0, 1]
  const roughness = evidence.material.dominantRoughness.value; // [0, 1]
  const meanLuma = evidence.pixel.meanLuminance.value / 255; // [0, 1]
  const softness = evidence.ir.lightSoftness.value; // [0, 1]

  // 重量感 = 金属度 × 0.6 + 粗糙度 × 0.4（高金属+高粗糙=重）
  const heaviness = metalness * 0.6 + roughness * 0.4;
  // 轻盈感 = 亮度 × 0.5 + 柔和度 × 0.5
  const lightness = meanLuma * 0.5 + softness * 0.5;

  // 轻重对比 = |heaviness - lightness|
  const magnitude = Math.min(1, Math.abs(heaviness - lightness));

  const confidence = Math.min(
    materialNode.confidence,
    lightNode.confidence,
    evidence.material.dominantMetalness.confidence,
    evidence.ir.lightSoftness.confidence,
  );

  return {
    sourceId: materialNode.id,
    targetId: lightNode.id,
    relationType: "HEAVY_LIGHT",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:heavy-light",
      evidence.material.dominantMetalness.evidenceRef,
      evidence.material.dominantRoughness.evidenceRef,
      evidence.pixel.meanLuminance.evidenceRef,
      evidence.ir.lightSoftness.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * OLD_NEW: 时间(TIME)与材质(MATERIAL)的新旧对比。
 * 包浆/风化痕迹（旧）vs 材质原始态（新）。
 */
export function deriveOldNew(
  evidence: ObservableEvidenceSet,
  timeNode: AestheticNode,
  materialNode: AestheticNode,
): AestheticRelation {
  const wear = evidence.material.dominantWear.value; // [0, 1]
  const timeTrace = evidence.material.timeTraceDetectability.value; // [0, 1]
  const surfaceVar = evidence.material.surfaceVariation.value; // 观测值
  const colorVarGrad = evidence.material.colorVariationSpatialGradient.value; // 观测值

  // 旧化程度 = 磨损度 × 0.4 + 时间痕迹可检测性 × 0.3 + 表面变化 × 0.3
  const oldness = wear * 0.4 + timeTrace * 0.3 + Math.min(1, surfaceVar / 50) * 0.3;
  // 新鲜度 = 1 - 旧化程度（但颜色变化梯度高时新鲜度降低）
  const newness = 1 - oldness * (1 - Math.min(1, colorVarGrad / 100) * 0.3);

  // 新旧对比 = |oldness - newness|
  const magnitude = Math.min(1, Math.abs(oldness - newness));

  const confidence = Math.min(
    timeNode.confidence,
    materialNode.confidence,
    evidence.material.dominantWear.confidence,
    evidence.material.timeTraceDetectability.confidence,
  );

  return {
    sourceId: timeNode.id,
    targetId: materialNode.id,
    relationType: "OLD_NEW",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:old-new",
      evidence.material.dominantWear.evidenceRef,
      evidence.material.timeTraceDetectability.evidenceRef,
      evidence.material.surfaceVariation.evidenceRef,
      evidence.material.colorVariationSpatialGradient.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * OPEN_CLOSE: 空间(SPACE)与边界(BOUNDARY)的开合对比。
 * 开放空间（低边缘密度/高负空间）vs 围合边界（高边缘密度）。
 */
export function deriveOpenClose(
  evidence: ObservableEvidenceSet,
  spaceNode: AestheticNode,
  boundaryNode: AestheticNode,
): AestheticRelation {
  const negRatio = evidence.pixel.negativeSpaceRatio.value; // [0, 1]
  const edgeRatio = evidence.pixel.edgePixelRatio.value; // [0, 1]
  const largestVoid = evidence.pixel.largestVoidRegionRatio.value; // [0, 1]
  const symmetry = evidence.ir.symmetry.value; // [0, 1]

  // 开放度 = 负空间比例 × 0.5 + 最大虚空比例 × 0.3 + (1 - 边缘密度) × 0.2
  const openness = negRatio * 0.5 + largestVoid * 0.3 + (1 - Math.min(1, edgeRatio / 0.3)) * 0.2;
  // 围合度 = 边缘密度 × 0.6 + 对称性 × 0.4（高边缘+对称=围合）
  const closeness = Math.min(1, edgeRatio / 0.3) * 0.6 + symmetry * 0.4;

  // 开合对比 = |openness - closeness|
  const magnitude = Math.min(1, Math.abs(openness - closeness));

  const confidence = Math.min(
    spaceNode.confidence,
    boundaryNode.confidence,
    evidence.pixel.negativeSpaceRatio.confidence,
    evidence.pixel.edgePixelRatio.confidence,
  );

  return {
    sourceId: spaceNode.id,
    targetId: boundaryNode.id,
    relationType: "OPEN_CLOSE",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:open-close",
      evidence.pixel.negativeSpaceRatio.evidenceRef,
      evidence.pixel.edgePixelRatio.evidenceRef,
      evidence.pixel.largestVoidRegionRatio.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * SCALE_SPACE: 尺度(SCALE)与空间(SPACE)的层级开合关系。
 * 天地人级差（高尺度层级）vs 空间围合（低尺度层级）。
 * 复用 OPEN_CLOSE 关系类型。
 */
export function deriveScaleSpace(
  evidence: ObservableEvidenceSet,
  scaleNode: AestheticNode,
  spaceNode: AestheticNode,
): AestheticRelation {
  const horizon = evidence.ir.horizonPosition.value; // [0, 1]
  const focalOffset = evidence.pixel.focalCenterOffset.value; // [0, ~0.707]
  const cameraPitch = evidence.ir.cameraPitch.value; // degrees
  const symmetry = evidence.ir.symmetry.value; // [0, 1]

  // 尺度层级强度 = 视平线偏离中心 × 0.4 + 焦点偏移 × 0.3 + |俯仰角|/45 × 0.3
  const scaleHierarchy = Math.abs(horizon - 0.5) * 2 * 0.4 + Math.min(1, focalOffset / 0.707) * 0.3 + Math.min(1, Math.abs(cameraPitch) / 45) * 0.3;
  // 空间围合度 = 对称性 × 0.6 + (1 - 尺度层级) × 0.4
  const spatialEnclosure = symmetry * 0.6 + (1 - scaleHierarchy) * 0.4;

  // 尺度-空间对比 = |scaleHierarchy - spatialEnclosure|
  const magnitude = Math.min(1, Math.abs(scaleHierarchy - spatialEnclosure));

  const confidence = Math.min(
    scaleNode.confidence,
    spaceNode.confidence,
    evidence.ir.horizonPosition.confidence,
    evidence.ir.cameraPitch.confidence,
  );

  return {
    sourceId: scaleNode.id,
    targetId: spaceNode.id,
    relationType: "OPEN_CLOSE",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:scale-space",
      evidence.ir.horizonPosition.evidenceRef,
      evidence.ir.cameraPitch.evidenceRef,
      evidence.pixel.focalCenterOffset.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}

/**
 * VIEW_AXIS: 视角(VIEW)与轴线(AXIS)的中边关系。
 * 相机俯仰/视平线（视角）vs 中轴对称/边缘（轴线）。
 * 复用 CENTER_EDGE 关系类型。
 */
export function deriveViewAxis(
  evidence: ObservableEvidenceSet,
  viewNode: AestheticNode,
  axisNode: AestheticNode,
): AestheticRelation {
  const cameraPitch = evidence.ir.cameraPitch.value; // degrees
  const horizon = evidence.ir.horizonPosition.value; // [0, 1]
  const symmetry = evidence.ir.symmetry.value; // [0, 1]
  const focalPoint = evidence.pixel.focalPoint.value; // [x, y]

  // 视角偏离度 = |俯仰角|/45 × 0.5 + |视平线-0.5|×2 × 0.5
  const viewDeviation = Math.min(1, Math.abs(cameraPitch) / 45) * 0.5 + Math.abs(horizon - 0.5) * 2 * 0.5;
  // 轴线中心度 = 对称性 × 0.6 + (1 - |焦点x-0.5|×2) × 0.4
  const axisCentrality = symmetry * 0.6 + (1 - Math.min(1, Math.abs(focalPoint[0] - 0.5) * 2)) * 0.4;

  // 视角-轴线对比 = |viewDeviation - axisCentrality|
  const magnitude = Math.min(1, Math.abs(viewDeviation - axisCentrality));

  const confidence = Math.min(
    viewNode.confidence,
    axisNode.confidence,
    evidence.ir.cameraPitch.confidence,
    evidence.ir.symmetry.confidence,
  );

  return {
    sourceId: viewNode.id,
    targetId: axisNode.id,
    relationType: "CENTER_EDGE",
    magnitude: round4(magnitude),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:view-axis",
      evidence.ir.cameraPitch.evidenceRef,
      evidence.ir.horizonPosition.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
      evidence.pixel.focalPoint.evidenceRef,
    ],
    confidence: round4(confidence),
  };
}
