/**
 * fidelity-evaluator.ts
 *
 * The evaluation closed loop: compare the *generated frontend* against the
 * compiler-approved aesthetic tokens and the user's original intent.
 *
 * Dimensions (weights sum to 100):
 *   colorUse       25 — every palette role actually rendered
 *   voidRespect    15 — negative-space token honoured
 *   layoutAxis     15 — layout symmetry matches the validated axis
 *   typography     10 — semantic heading hierarchy present
 *   interaction    15 — the scenario's required interaction is wired
 *   antiCliche     20 — auditor passed clean
 */

import type {
  AntiClicheReport,
  FidelityReport,
  ScenarioDefinition,
  ThemeTokens,
} from "../types";
import { layoutMode } from "../generator/css-generator";

/** Scenario-specific interaction hook that MUST exist in the output. */
function requiredHook(kind: string): string {
  switch (kind) {
    case "song-login":
      return "login-form";
    case "zen-portfolio":
      return "filter-btn";
    case "tang-shop":
      return "carousel-track";
    default:
      return "addEventListener";
  }
}

/**
 * Score one dimension; returns {score, evidence}.
 */
export function evaluateFidelity(
  scenario: ScenarioDefinition,
  theme: ThemeTokens,
  html: string,
  audit: AntiClicheReport,
): FidelityReport {
  const lower = html.toLowerCase();
  const dimensions: FidelityReport["dimensions"] = [];

  // ── colorUse ──────────────────────────────────────────────────────────
  const usedBg = lower.includes(theme.bg.toLowerCase());
  const usedInk = lower.includes(theme.ink.toLowerCase());
  const usedAccent = lower.includes(theme.accent.toLowerCase());
  const colorScore =
    (usedBg ? 40 : 0) + (usedInk ? 35 : 0) + (usedAccent ? 25 : 0);
  dimensions.push({
    name: "colorUse",
    score: colorScore,
    weight: 25,
    evidence: `bg=${usedBg} ink=${usedInk} accent=${usedAccent}`,
  });

  // ── voidRespect ────────────────────────────────────────────────────────
  const hasVoidToken = lower.includes("--void:");
  const voidScore = hasVoidToken ? 100 : 40;
  dimensions.push({
    name: "voidRespect",
    score: voidScore,
    weight: 15,
    evidence: `negativeSpaceRatio=${theme.negativeSpaceRatio} → --void emitted=${hasVoidToken}`,
  });

  // ── layoutAxis ────────────────────────────────────────────────────────
  const expected = layoutMode(theme.symmetry);
  const layoutScore = lower.includes(`--layout: ${expected}`) ? 100 : 50;
  dimensions.push({
    name: "layoutAxis",
    score: layoutScore,
    weight: 15,
    evidence: `validated symmetry=${theme.symmetry} → --layout: ${expected}`,
  });

  // ── typography ────────────────────────────────────────────────────────
  const hasH1 = lower.includes("<h1");
  const hasFont = lower.includes("font-family");
  const typeScore = (hasH1 ? 50 : 0) + (hasFont ? 50 : 0);
  dimensions.push({
    name: "typography",
    score: typeScore,
    weight: 10,
    evidence: `<h1>=${hasH1} font-family chain=${hasFont}`,
  });

  // ── interaction ───────────────────────────────────────────────────────
  const hook = requiredHook(scenario.content.kind);
  const hasHook = lower.includes(hook);
  const hasListener = lower.includes("addeventlistener");
  const interScore = (hasHook ? 50 : 0) + (hasListener ? 50 : 0);
  dimensions.push({
    name: "interaction",
    score: interScore,
    weight: 15,
    evidence: `required hook "${hook}"=${hasHook}, listeners=${hasListener}`,
  });

  // ── antiCliche ────────────────────────────────────────────────────────
  const antiScore = audit.passed ? 100 : 45;
  dimensions.push({
    name: "antiCliche",
    score: antiScore,
    weight: 20,
    evidence: audit.passed
      ? `audit passed, contrast ${audit.contrastRatio}:1`
      : `audit failed: ${[
          audit.hardFailHexFound.join(","),
          audit.forbiddenTokensFound.join(","),
        ].join(" | ")}`,
  });

  // ── Weighted total ────────────────────────────────────────────────────
  const total = Math.round(
    dimensions.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0),
  );

  const verdict =
    total >= 85 ? "EXCELLENT" : total >= 70 ? "GOOD" : total >= 55 ? "ACCEPTABLE" : "POOR";

  return { total, verdict, dimensions };
}
