/**
 * ANTI-05: Toxic Saturation — 高饱和度毒性溢出
 *
 * 物理依据：
 * - HSV 空间中高饱和且高明度的像素，其连续连通域占比突破总面积阈值（该 HSV 统计
 *   目前不在证据集中，下文以代理指标判定；原始设想的数值见 skill 规则的出处）
 * - 且未被标记为微小点缀色
 *
 * 判定：荧光色彩污染，偏离传统正色与低饱和度水墨文人体系
 *
 * 宪法约束：
 * - 必须基于像素统计，不能基于"颜色鲜艳"主观判断
 * - 小面积点缀色（如印章朱红）不应被判定
 * - 传统正色（如唐三彩的高饱和）在特定范式（TANG）下应放宽
 *
 * 阈值与"放宽范式"不在本文件定义：全部来自 skill 的 AestheticConstraintSheet
 * （ANTI_PATTERN_THRESHOLD / toxic-saturation，规则 CAS-AP-GATE-TOXIC-SATURATION）。
 */

import type { AntiPatternResult, GateContext } from "../types";
import { requireDecisionPack } from "../../../skill-bridge/active-pack";

export const GATE_ID = "ANTI-05";
export const GATE_NAME = "Toxic Saturation";
/** Decision subject of this gate in the skill's sheet (kind ANTI_PATTERN_THRESHOLD). */
export const GATE_SUBJECT = "toxic-saturation";

export function detectToxicSaturation(ctx: GateContext): AntiPatternResult {
  const { evidence } = ctx;
  const t = requireDecisionPack().policy("ANTI_PATTERN_THRESHOLD", GATE_SUBJECT);
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 主色占比（过高的单一颜色占比可能意味着色彩溢出）
  const dominantColorRatio = evidence.pixel?.dominantColorRatio?.value;
  if (dominantColorRatio !== undefined) {
    metrics.dominantColorRatio = dominantColorRatio;
    evidenceRefs.push(evidence.pixel.dominantColorRatio.evidenceRef);
  }

  // 2. 对比度（过高对比度可能伴随荧光色）
  const contrastRatio = evidence.pixel?.contrastRatio?.value;
  if (contrastRatio !== undefined) {
    metrics.contrastRatio = contrastRatio;
    evidenceRefs.push(evidence.pixel.contrastRatio.evidenceRef);
  }

  // 3. 亮度标准差（低标准差 + 高饱和 = 大面积荧光色）
  const luminanceStd = evidence.pixel?.luminanceStdDev?.value;
  if (luminanceStd !== undefined) {
    metrics.luminanceStdDev = luminanceStd;
    evidenceRefs.push(evidence.pixel.luminanceStdDev.evidenceRef);
  }

  // 4. 色温偏差（极端色温可能伴随色彩污染）
  const temperatureBias = evidence.pixel?.temperatureBias?.value;
  if (temperatureBias !== undefined) {
    metrics.temperatureBias = temperatureBias;
    evidenceRefs.push(evidence.pixel.temperatureBias.evidenceRef);
  }

  // 5. 主色/次色/强调色（用于判断是否有大面积高饱和色）
  const dominantColor = evidence.pixel?.dominantColor?.value;
  const secondaryColor = evidence.pixel?.secondaryColor?.value;
  const accentColor = evidence.pixel?.accentColor?.value;
  if (dominantColor) {
    metrics.dominantColor = dominantColor;
    evidenceRefs.push(evidence.pixel.dominantColor.evidenceRef);
  }
  if (secondaryColor) {
    metrics.secondaryColor = secondaryColor;
    evidenceRefs.push(evidence.pixel.secondaryColor.evidenceRef);
  }
  if (accentColor) {
    metrics.accentColor = accentColor;
    evidenceRefs.push(evidence.pixel.accentColor.evidenceRef);
  }

  // 6. IR 声明的范式（TANG 范式允许更高饱和度）
  const paradigm = evidence.ir?.paradigm?.value;
  if (paradigm) {
    metrics.paradigm = paradigm;
    evidenceRefs.push(evidence.ir.paradigm.evidenceRef);
  }

  // 7. IR 声明的色温（用于对比像素色温是否超出声明范围）
  const declaredColorTemp = evidence.ir?.colorTemp?.value;
  if (declaredColorTemp !== undefined) {
    metrics.declaredColorTemp = declaredColorTemp;
    evidenceRefs.push(evidence.ir.colorTemp.evidenceRef);
  }

  // 8. 材质类别（金属/矿物材质可能有高饱和反光）
  const materialCategory = evidence.material?.dominantMaterialCategory?.value;
  if (materialCategory) {
    metrics.materialCategory = materialCategory;
    evidenceRefs.push(evidence.material.dominantMaterialCategory.evidenceRef);
  }

  // 判定逻辑
  // 毒性饱和的特征：主色占比极高 + 高对比度 + 低亮度标准差（大面积均匀高饱和）
  // 注意：由于 ObservableEvidence 中没有直接的 HSV 饱和度统计，
  // 我们使用代理指标：主色占比 + 对比度 + 亮度标准差 + 色温偏差

  const hasDominantColorOverflow =
    dominantColorRatio !== undefined && dominantColorRatio > t.num("dominant_color_ratio_above");
  const hasHighContrast =
    contrastRatio !== undefined && contrastRatio > t.num("contrast_ratio_above");
  const hasLowLuminanceVariation =
    luminanceStd !== undefined && luminanceStd < t.num("luminance_std_below");
  const hasExtremeTemperature =
    temperatureBias !== undefined && Math.abs(temperatureBias) > t.num("temperature_bias_abs_above");

  metrics.hasDominantColorOverflow = hasDominantColorOverflow ?? false;
  metrics.hasHighContrast = hasHighContrast ?? false;
  metrics.hasLowLuminanceVariation = hasLowLuminanceVariation ?? false;
  metrics.hasExtremeTemperature = hasExtremeTemperature ?? false;

  // 范式调整：skill 声明的"高饱和是预期特征"的范式（目前为 TANG）允许更高饱和度。
  // 证据里的范式字符串可能是大写或小写，两种写法都认。
  const highSaturationParadigms = t.list("high_saturation_paradigms");
  const isTangParadigm = highSaturationParadigms.some((p) => paradigm === p || paradigm === p.toLowerCase());
  metrics.isTangParadigm = isTangParadigm; // metric key kept as shipped: it is part of the report (and its hash)

  // 证据完整性检查
  const hasEnoughEvidence =
    dominantColorRatio !== undefined &&
    contrastRatio !== undefined &&
    luminanceStd !== undefined;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;
  let unmeasuredReason: string | undefined;

  if (!hasEnoughEvidence) {
    verdict = "ALLOW";
    confidence = 0;
    unmeasuredReason =
      "Insufficient color evidence: dominantColorRatio, contrastRatio, " +
      "or luminanceStdDev missing. Cannot assess toxic saturation.";
    rationale =
      "Color evidence incomplete — skipping ANTI-05 assessment (UNMEASURED ≠ FAIL).";
  } else if (
    hasDominantColorOverflow &&
    hasHighContrast &&
    hasLowLuminanceVariation &&
    !isTangParadigm
  ) {
    verdict = "REJECT";
    confidence = t.num("confidence_reject");
    rationale =
      `Toxic saturation detected: dominantColorRatio=${dominantColorRatio?.toFixed(3)}, ` +
      `contrastRatio=${contrastRatio?.toFixed(3)}, ` +
      `luminanceStd=${luminanceStd?.toFixed(3)}, ` +
      `paradigm=${paradigm}. ` +
      `Large area of uniform high-saturation color with high contrast ` +
      `indicates fluorescent color pollution deviating from low-saturation literati aesthetic.`;
  } else if (
    (hasDominantColorOverflow && hasHighContrast) ||
    (hasDominantColorOverflow && hasExtremeTemperature) ||
    (hasHighContrast && hasLowLuminanceVariation && !isTangParadigm)
  ) {
    verdict = "FLAG";
    confidence = t.num("confidence_flag");
    rationale =
      `Potential toxic saturation: dominantColorRatio=${dominantColorRatio?.toFixed(3)}, ` +
      `contrastRatio=${contrastRatio?.toFixed(3)}, ` +
      `luminanceStd=${luminanceStd?.toFixed(3)}, ` +
      `temperatureBias=${temperatureBias?.toFixed(3)}. ` +
      `Some high-saturation characteristics present — FLAG for manual review.`;
  } else if (isTangParadigm && hasDominantColorOverflow && hasHighContrast) {
    // TANG 范式下的高饱和是预期特征，只记录不判定
    // （注意：此分支当前不可达——前一个 FLAG 条件已包含 overflow && contrast，保持原结构不改行为）
    verdict = "ALLOW";
    confidence = t.num("confidence_allow_paradigm");
    rationale =
      `High saturation present but paradigm=TANG (唐三彩/富丽堂皇): ` +
      `dominantColorRatio=${dominantColorRatio?.toFixed(3)}, ` +
      `contrastRatio=${contrastRatio?.toFixed(3)}. ` +
      `High saturation is expected for Tang paradigm — ALLOW with paradigm-aware note.`;
  } else {
    verdict = "ALLOW";
    confidence = t.num("confidence_allow");
    rationale =
      `No toxic saturation: dominantColorRatio=${dominantColorRatio?.toFixed(3)}, ` +
      `contrastRatio=${contrastRatio?.toFixed(3)}, ` +
      `luminanceStd=${luminanceStd?.toFixed(3)}. ` +
      `Color distribution is within acceptable saturation range.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "pixel-evidence:dominant-color-ratio + contrast-ratio + luminance-std + temperature-bias + paradigm-awareness cross-check",
    rationale,
    unmeasuredReason,
    metrics,
  };
}
