/**
 * ANTI-02: Unphysical Glow / Plastic Highlight — 非物理荧光与塑料高光
 *
 * 物理依据：
 * - 像素观测的微表面高频方差接近 0（极其均质）
 * - 但高光过渡锐度极陡且局部亮度极大值超越了 IR 声明的光源入射辐射度
 * - 非物理自发光、缺乏微表面粗糙度扰动
 *
 * 判定宪法约束：
 * - 必须同时满足"均质表面"和"锐高光"两个条件
 * - 单一条件不构成反模式（如哑光材质本身就是均质的）
 * - 高光强度需要与 IR 声明的 lightIntensity 对比，不能用绝对阈值
 */

import type { AntiPatternResult, GateContext } from "../types";

export const GATE_ID = "ANTI-02";
export const GATE_NAME = "Unphysical Glow / Plastic Highlight";

export function detectUnphysicalGlow(ctx: GateContext): AntiPatternResult {
  const { evidence } = ctx;
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 微表面高频方差（越低越均质，越像塑料）
  const microVariance = evidence.material?.microSurfaceHighFrequencyVariance?.value;
  if (microVariance !== undefined) {
    metrics.microSurfaceVariance = microVariance;
    evidenceRefs.push(evidence.material.microSurfaceHighFrequencyVariance.evidenceRef);
  }

  // 2. 高光锐度（越陡越像塑料高光）
  const specularSharpness = evidence.material?.specularSharpness?.value;
  if (specularSharpness !== undefined) {
    metrics.specularSharpness = specularSharpness;
    evidenceRefs.push(evidence.material.specularSharpness.evidenceRef);
  }

  // 3. 高光像素比例
  const specularRatio = evidence.material?.specularHighlightRatio?.value;
  if (specularRatio !== undefined) {
    metrics.specularHighlightRatio = specularRatio;
    evidenceRefs.push(evidence.material.specularHighlightRatio.evidenceRef);
  }

  // 4. 表面变化（越低越均质）
  const surfaceVariation = evidence.material?.surfaceVariation?.value;
  if (surfaceVariation !== undefined) {
    metrics.surfaceVariation = surfaceVariation;
    evidenceRefs.push(evidence.material.surfaceVariation.evidenceRef);
  }

  // 5. 亮度标准差（低标准差 + 高亮点 = 塑料感）
  const luminanceStd = evidence.pixel?.luminanceStdDev?.value;
  if (luminanceStd !== undefined) {
    metrics.luminanceStdDev = luminanceStd;
    evidenceRefs.push(evidence.pixel.luminanceStdDev.evidenceRef);
  }

  // 6. IR 声明的光源强度（用于对比高光是否超出物理范围）
  const declaredLightIntensity = evidence.ir?.lightIntensity?.value;
  if (declaredLightIntensity !== undefined) {
    metrics.declaredLightIntensity = declaredLightIntensity;
    evidenceRefs.push(evidence.ir.lightIntensity.evidenceRef);
  }

  // 7. IR 声明的材质粗糙度（用于对比表面是否过于光滑）
  const declaredRoughness = evidence.ir?.materials?.value?.[0]?.roughness;
  if (declaredRoughness !== undefined) {
    metrics.declaredRoughness = declaredRoughness;
    evidenceRefs.push(`ir:materials[0].roughness=${declaredRoughness}`);
  }

  // 判定逻辑
  // 塑料高光的特征：微表面方差极低 + 高光锐度极高 + 高光比例显著
  const hasHomogeneousSurface =
    microVariance !== undefined && microVariance < 0.01;
  const hasSharpSpecular =
    specularSharpness !== undefined && specularSharpness > 0.8;
  const hasSignificantSpecular =
    specularRatio !== undefined && specularRatio > 0.02;
  const hasLowSurfaceVariation =
    surfaceVariation !== undefined && surfaceVariation < 0.05;

  metrics.hasHomogeneousSurface = hasHomogeneousSurface ?? false;
  metrics.hasSharpSpecular = hasSharpSpecular ?? false;
  metrics.hasSignificantSpecular = hasSignificantSpecular ?? false;
  metrics.hasLowSurfaceVariation = hasLowSurfaceVariation ?? false;

  // 证据完整性检查
  const hasEnoughEvidence =
    microVariance !== undefined &&
    specularSharpness !== undefined &&
    specularRatio !== undefined;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;
  let unmeasuredReason: string | undefined;

  if (!hasEnoughEvidence) {
    verdict = "ALLOW";
    confidence = 0;
    unmeasuredReason =
      "Insufficient material evidence: microSurfaceVariance, specularSharpness, " +
      "or specularHighlightRatio missing. Cannot assess unphysical glow.";
    rationale =
      "Material evidence incomplete — skipping ANTI-02 assessment (UNMEASURED ≠ FAIL).";
  } else if (hasHomogeneousSurface && hasSharpSpecular && hasSignificantSpecular) {
    verdict = "REJECT";
    confidence = 0.85;
    rationale =
      `Unphysical plastic highlight detected: microSurfaceVariance=${microVariance?.toFixed(4)}, ` +
      `specularSharpness=${specularSharpness?.toFixed(4)}, ` +
      `specularRatio=${specularRatio?.toFixed(4)}. ` +
      `Extremely homogeneous surface with sharp, significant specular highlights ` +
      `indicates non-physical self-illumination lacking micro-surface roughness perturbation.`;
  } else if (
    (hasHomogeneousSurface && hasSharpSpecular) ||
    (hasSharpSpecular && hasSignificantSpecular) ||
    (hasHomogeneousSurface && hasLowSurfaceVariation && hasSignificantSpecular)
  ) {
    verdict = "FLAG";
    confidence = 0.65;
    rationale =
      `Potential unphysical glow: microSurfaceVariance=${microVariance?.toFixed(4)}, ` +
      `specularSharpness=${specularSharpness?.toFixed(4)}, ` +
      `specularRatio=${specularRatio?.toFixed(4)}. ` +
      `Some plastic-highlight characteristics present — FLAG for manual review.`;
  } else {
    verdict = "ALLOW";
    confidence = 0.8;
    rationale =
      `No unphysical glow: microSurfaceVariance=${microVariance?.toFixed(4)}, ` +
      `specularSharpness=${specularSharpness?.toFixed(4)}, ` +
      `specularRatio=${specularRatio?.toFixed(4)}. ` +
      `Surface characteristics are within physically plausible range.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "material-evidence:micro-surface-variance + specular-sharpness + specular-ratio + surface-variation cross-check",
    rationale,
    unmeasuredReason,
    metrics,
  };
}
