/**
 * anti-cliche-rules.ts
 *
 * Pure, deterministic anti-cliche rule functions. Each rule inspects the
 * *post-G2* ValidatedSceneGraph (i.e. after PatchEngine has already applied
 * corrective grammar patches) and reports violations.
 *
 * Division of labor with G2 grammar:
 *   - G2 grammar patches *scalars* (negativeSpaceRatio, symmetry, roughness,
 *     colorTemp, contrastRatio, …). It is corrective and never refuses.
 *   - G2.5 anti-cliche rules veto *structural/semantic* cliches G2 cannot
 *     express: forbidden hex swatches, the pure-red + pure-green combination,
 *     dead-center focal stacking, font-family mixing. G2 never touches the
 *     `/color/*` hex strings nor `/composition/focalPoint`, so these survive
 *     grammar patches and are caught here.
 *
 * Every function is side-effect free and never mutates its input.
 *
 * @module aesthetic-integration/anti-cliche-rules
 */

import type {
  AestheticClicheViolation,
  AestheticGateContext,
} from "../compiler-core/aesthetic-gate-types";
import type { ValidatedSceneGraph } from "../compiler-core/contracts";

import {
  hexToHsl,
  isNearPureHue,
  normalizeHex,
} from "./color-utils";

// ============================================================================
// Config shape (mirrors config/anti-cliche-rules.json)
// ============================================================================

export interface AntiClicheThresholds {
  forbiddenHex: string[];
  dominantSaturationHardLimit: number;
  complementaryHueToleranceDeg: number;
  complementaryMinSaturation: number;
  deadCenterEpsilon: number;
  deadCenterSymmetryFloor: number;
  minNegativeSpaceRatio: number;
  maxFontFamilies: number;
  calligraphyFontPattern: string;
}

export interface AntiClicheConfig {
  enabled: boolean;
  thresholds: AntiClicheThresholds;
  remediation?: Record<string, string>;
}

// ============================================================================
// Small helpers
// ============================================================================

function hexOf(scene: ValidatedSceneGraph, role: "dominant" | "secondary" | "accent"): string {
  const v = scene.color[role].value;
  return typeof v === "string" ? v : "";
}

function suggestionFor(hex: string, remediation?: Record<string, string>): string {
  const norm = normalizeHex(hex) ?? hex;
  return remediation?.[norm] ?? `Replace ${norm} with a desaturated, low-saturation equivalent (S ≤ 50%).`;
}

// ============================================================================
// Category 1 — Color cliches (配色俗套)
// ============================================================================

/**
 * AC-COLOR-001 — Forbidden pure/neon swatch.
 * Any of dominant / secondary / accent whose normalized hex is on the
 * configurable forbidden list (#FF0000, #00FF00, #FFD700, #000000, #FFFFFF, …).
 */
export function checkForbiddenPalette(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
): AestheticClicheViolation[] {
  const out: AestheticClicheViolation[] = [];
  const forbidden = new Set(cfg.thresholds.forbiddenHex.map((h) => h.toUpperCase()));

  for (const role of ["dominant", "secondary", "accent"] as const) {
    const raw = hexOf(scene, role);
    const norm = normalizeHex(raw);
    if (!norm) continue;
    if (forbidden.has(norm.toUpperCase())) {
      out.push({
        ruleId: "AC-COLOR-001",
        category: "color",
        message: `Forbidden pure/neon swatch "${norm}" used as ${role} color.`,
        location: `/color/${role}/value`,
        severity: "P0_HARD",
        suggestion: suggestionFor(norm, cfg.remediation),
        evidence: { role, hex: norm, forbiddenList: [...forbidden] },
      });
    }
  }
  return out;
}

/**
 * AC-COLOR-002 — Pure red paired with pure green (纯红配纯绿).
 * Flags the cliche when one palette role is near-pure-red (hue≈0°) and another
 * is near-pure-green (hue≈120°), both at high saturation.
 */
export function checkRedGreenCliché(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
): AestheticClicheViolation[] {
  const tol = cfg.thresholds.complementaryHueToleranceDeg;
  const minSat = cfg.thresholds.complementaryMinSaturation;

  const roles = (["dominant", "secondary", "accent"] as const)
    .map((role) => ({ role, hsl: hexToHsl(hexOf(scene, role)) }))
    .filter((x): x is { role: typeof x.role; hsl: NonNullable<typeof x.hsl> } => x.hsl !== null);

  const hasRed = roles.some(({ hsl }) => isNearPureHue(hsl, 0, { hueTolerance: tol, minSaturation: minSat }));
  const hasGreen = roles.some(({ hsl }) => isNearPureHue(hsl, 120, { hueTolerance: tol, minSaturation: minSat }));

  if (!hasRed || !hasGreen) return [];

  return [
    {
      ruleId: "AC-COLOR-002",
      category: "color",
      message: "Pure red paired with pure green — the classic clashing complementary cliche.",
      location: "/color",
      severity: "P0_HARD",
      suggestion:
        "Desaturate both hues to S ≤ 50% and shift to an analogous scheme (e.g. cinnabar + dai-blue), or separate them by value contrast instead of hue.",
      evidence: {
        redRoles: roles.filter(({ hsl }) => isNearPureHue(hsl, 0, { hueTolerance: tol, minSaturation: minSat })).map((r) => r.role),
        greenRoles: roles.filter(({ hsl }) => isNearPureHue(hsl, 120, { hueTolerance: tol, minSaturation: minSat })).map((r) => r.role),
        toleranceDeg: tol,
      },
    },
  ];
}

/**
 * AC-COLOR-003 — Over-saturated dominant color.
 * The dominant swatch drives the whole mood; an S > hard-limit reads as
 * synthetic / posterized.
 */
export function checkDominantSaturation(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
): AestheticClicheViolation[] {
  const hsl = hexToHsl(hexOf(scene, "dominant"));
  if (!hsl) return [];
  const limit = cfg.thresholds.dominantSaturationHardLimit;
  if (hsl.s <= limit) return [];

  return [
    {
      ruleId: "AC-COLOR-003",
      category: "color",
      message: `Dominant color saturation ${(hsl.s * 100).toFixed(0)}% exceeds the ${limit * 100}% hard limit.`,
      location: "/color/dominant/value",
      severity: "P0_HARD",
      suggestion: `Desaturate the dominant swatch to S ≤ ${(limit * 100).toFixed(0)}% for a muted, paper-like tone.`,
      evidence: { hex: hexOf(scene, "dominant"), saturation: hsl.s, limit },
    },
  ];
}

// ============================================================================
// Category 2 — Layout / composition cliches (布局俗套)
// ============================================================================

/**
 * AC-LAYOUT-001 — Dead-centered stacking (居中堆砌).
 * G2 grammar never patches `/composition/focalPoint`; when the focal point sits
 * on the exact center AND symmetry is still high post-patch, the composition is
 * the template "everything piled in the middle" cliche.
 */
export function checkDeadCenterStacking(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
): AestheticClicheViolation[] {
  const fp = scene.composition.focalPoint.value;
  const symmetry = scene.composition.symmetry.value;
  const eps = cfg.thresholds.deadCenterEpsilon;
  const symFloor = cfg.thresholds.deadCenterSymmetryFloor;

  if (!Array.isArray(fp) || fp.length !== 2) return [];
  const [fx, fy] = fp;
  if (typeof fx !== "number" || typeof fy !== "number") return [];

  const nearCenter = Math.abs(fx - 0.5) <= eps && Math.abs(fy - 0.5) <= eps;
  if (!nearCenter || typeof symmetry !== "number" || symmetry < symFloor) return [];

  return [
    {
      ruleId: "AC-LAYOUT-001",
      category: "layout",
      message: `Focal point pinned at [${fx.toFixed(2)}, ${fy.toFixed(2)}] with symmetry ${symmetry.toFixed(2)} — dead-centered stacking.`,
      location: "/composition/focalPoint/value",
      severity: "P0_HARD",
      suggestion:
        "Offset the focal point toward a golden-ratio anchor (~0.62, 0.38) and reduce symmetry to 0.7–0.85 so the composition breathes off-axis.",
      evidence: { focalPoint: [fx, fy], symmetry, epsilon: eps, symmetryFloor: symFloor },
    },
  ];
}

/**
 * AC-LAYOUT-002 — No breathing room (画面塞满).
 * Negative-space ratio below the hard floor even after G2 patching means the
 * design is irredeemably stuffed; grammar usually lifts <0.35 up to ~0.45, so a
 * residual <0.22 is a hard backstop.
 */
export function checkNegativeSpaceSuffocation(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
): AestheticClicheViolation[] {
  const nsr = scene.composition.negativeSpaceRatio.value;
  if (typeof nsr !== "number") return [];
  const floor = cfg.thresholds.minNegativeSpaceRatio;
  if (nsr >= floor) return [];

  return [
    {
      ruleId: "AC-LAYOUT-002",
      category: "layout",
      message: `Negative-space ratio ${nsr.toFixed(2)} is below the ${floor} hard floor — the frame is stuffed.`,
      location: "/composition/negativeSpaceRatio/value",
      severity: "P0_HARD",
      suggestion: `Expand negative space to ≥ ${floor} (target 0.45–0.55); empty space is a design element, not leftover canvas.`,
      evidence: { negativeSpaceRatio: nsr, floor },
    },
  ];
}

// ============================================================================
// Category 3 — Typography cliches (字体俗套)
// ============================================================================

/**
 * AC-TYPE-001 — Too many font families mixed.
 * Only fires when upstream supplied typography context (the scene graph itself
 * does not carry fonts).
 */
export function checkFontFamilyCount(
  _scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
  context?: AestheticGateContext,
): AestheticClicheViolation[] {
  const families = context?.typography?.families;
  if (!families || families.length === 0) return [];
  const max = cfg.thresholds.maxFontFamilies;
  if (families.length <= max) return [];

  return [
    {
      ruleId: "AC-TYPE-001",
      category: "typography",
      message: `${families.length} distinct font families in use exceeds the ${max} limit — visual chaos.`,
      location: "/typography/families",
      severity: "P0_HARD",
      suggestion: `Consolidate to ≤${max} families: one serif for headings, one sans for body; drop decorative faces.`,
      evidence: { families, count: families.length, limit: max },
    },
  ];
}

/**
 * AC-TYPE-002 — Calligraphy / brush font used as a typeface.
 * Calligraphy faces (maobi / xingkai / brush script) are a cliche when used as
 * heading or body fonts; they belong only as ≤8% accent seals.
 */
export function checkCalligraphyCliche(
  _scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
  context?: AestheticGateContext,
): AestheticClicheViolation[] {
  const families = context?.typography?.families;
  if (!families || families.length === 0) return [];

  let pattern: RegExp;
  try {
    pattern = new RegExp(cfg.thresholds.calligraphyFontPattern);
  } catch {
    return [];
  }

  const hit = families.find((f) => pattern.test(f));
  if (!hit) return [];

  return [
    {
      ruleId: "AC-TYPE-002",
      category: "typography",
      message: `Calligraphy/brush face "${hit}" used as a typeface — the national-trend sticker cliche.`,
      location: "/typography/families",
      severity: "P0_HARD",
      suggestion:
        "Replace calligraphy headings with a serif (Song-style) face with loose letter-spacing; reserve brush scripts for ≤8% seal/落款 accents only.",
      evidence: { offendingFamily: hit, allFamilies: families, pattern: cfg.thresholds.calligraphyFontPattern },
    },
  ];
}

// ============================================================================
// Aggregator
// ============================================================================

/**
 * Run every registered anti-cliche rule against the post-G2 scene graph.
 * Returns all violations (the gate treats any P0 as a hard veto).
 */
export function evaluateAntiClicheRules(
  scene: ValidatedSceneGraph,
  cfg: AntiClicheConfig,
  context?: AestheticGateContext,
): AestheticClicheViolation[] {
  return [
    ...checkForbiddenPalette(scene, cfg),
    ...checkRedGreenCliché(scene, cfg),
    ...checkDominantSaturation(scene, cfg),
    ...checkDeadCenterStacking(scene, cfg),
    ...checkNegativeSpaceSuffocation(scene, cfg),
    ...checkFontFamilyCount(scene, cfg, context),
    ...checkCalligraphyCliche(scene, cfg, context),
  ];
}
