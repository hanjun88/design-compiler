/**
 * css-generator.ts
 *
 * Turns compiler-approved ThemeTokens into a `<style>` body.
 *
 * The tokens are NOT re-derived from the raw user brief — they come from the
 * validated scene graph produced by the real DC pipeline (G1 sanitisation +
 * G2 grammar patches), so the CSS always reflects what the compiler approved.
 */

import type { ThemeTokens } from "../types";

/**
 * Map the validated symmetry value to a layout marker the auditor/evaluator
 * can verify deterministically:
 *   symmetry ≈ 1.0  → "strict"  (centered, mirrored)
 *   symmetry ≈ 0.5  → "offset"  (asymmetric, off-axis)
 *   else             → "hidden"
 */
export function layoutMode(symmetry: number): "strict" | "offset" | "hidden" {
  if (symmetry >= 0.8) return "strict";
  if (symmetry >= 0.3) return "offset";
  return "hidden";
}

/**
 * Base design tokens + reset shared by every scenario.
 * The scenario-specific layouts append their own rules on top.
 */
export function baseCss(theme: ThemeTokens): string {
  const mode = layoutMode(theme.symmetry);
  const voidPct = Math.round(theme.negativeSpaceRatio * 100);

  return `
/* === Compiler-approved design tokens (from DC validated scene graph) === */
:root{
  --bg: ${theme.bg};
  --ink: ${theme.ink};
  --accent: ${theme.accent};
  --shadow: ${theme.shadow};
  --void: ${voidPct}%;           /* negative-space ratio, post-G2 grammar */
  --layout: ${mode};             /* strict | offset | hidden              */
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{
  background:var(--bg);
  color:var(--ink);
  font-family:"Songti SC","SimSun","STSong",serif;
  line-height:1.8;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}
button{font-family:inherit;cursor:pointer}
::selection{background:var(--accent);color:var(--bg)}
`.trim();
}
