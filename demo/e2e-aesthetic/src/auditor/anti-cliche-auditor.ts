/**
 * anti-cliche-auditor.ts
 *
 * Post-generation anti-cliché gate. It scans the *generated* HTML document
 * against the constraints the aesthetic sheet declared:
 *
 *   1. No hard-fail hex may appear anywhere (pure red / pure gold / pure black / cyan ...)
 *   2. No forbidden visual clichés named by the sheet (guochao sticker, purple
 *      gradient, glassmorphism, emoji-as-icon ...) may appear as code tokens
 *   3. No banned motion vocabulary (bounce / particle) may leak into the script
 *   4. WCAG contrast between compiler-approved bg and ink must be ≥ 4.5
 *
 * This is the "反俗套审查" stage of the demo pipeline.
 */

import type { AntiClicheReport, ScenarioDefinition, ThemeTokens } from "../types";

// ── WCAG contrast helpers ─────────────────────────────────────────────────

function srgbToLinear(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a #RRGGBB hex color. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.x contrast ratio between two hex colors (1 – 21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// ── Auditor ────────────────────────────────────────────────────────────────

/**
 * Audit a generated HTML document against its aesthetic sheet, folded together
 * with the violations raised by the REAL DC G2.5 gate (passed in).
 */
export function auditAgainstCliche(
  scenario: ScenarioDefinition,
  theme: ThemeTokens,
  html: string,
  gateViolations: string[] = [],
): AntiClicheReport {
  const lower = html.toLowerCase();
  const warnings: string[] = [];

  // 1. Hard-fail hex values anywhere in the document
  const hardFailHexFound: string[] = [];
  for (const bad of scenario.sheet.colorSystem.hardFailHex) {
    if (lower.includes(bad.toLowerCase())) hardFailHexFound.push(bad);
  }

  // 2. Forbidden cliché tokens as literal code substrings
  const forbiddenTokensFound: string[] = [];
  for (const token of scenario.sheet.antiCliche.forbidden) {
    if (lower.includes(token.toLowerCase())) forbiddenTokensFound.push(token);
  }

  // 3. Banned motion vocabulary in the emitted script
  const bannedMotionHits: string[] = [];
  for (const word of scenario.sheet.motion.hardFail) {
    if (lower.includes(word.toLowerCase())) bannedMotionHits.push(word);
  }

  // 4. Contrast gate (bg vs ink, compiler-approved tokens)
  const ratio = contrastRatio(theme.bg, theme.ink);
  if (ratio < 4.5) {
    warnings.push(`Contrast ${ratio} < 4.5:1 between ${theme.bg} and ${theme.ink}`);
  }

  const passed =
    gateViolations.length === 0 &&
    hardFailHexFound.length === 0 &&
    forbiddenTokensFound.length === 0 &&
    bannedMotionHits.length === 0 &&
    ratio >= 4.5;

  return {
    passed, hardFailHexFound, forbiddenTokensFound, bannedMotionHits,
    contrastRatio: ratio, warnings, gateViolations,
  };
}
