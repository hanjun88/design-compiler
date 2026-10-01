/**
 * wow-sheet.ts — the real Chinese-aesthetic constraint sheet for the wow demo.
 *
 * This is a genuine CAS-shape AestheticConstraintSheet (the same contract the
 * repo's demo scenarios use), NOT hand-authored render values. It is built on
 * the verified 唐韵 (Tang) aesthetic — dark lacquered cinnabar, matte gilt,
 * symmetric dusk frame — and adds the 0b-1 SSOT rim-light descriptor so the
 * runtime RimLight projects byte-for-byte instead of falling back to the
 * derived key+180/accent rim.
 *
 * rimLight{ azimuth:240, elevation:38, color:"#7fb0d8", intensity:1.25 } is the
 * exact SSOT tuple the 0b-1 e2e probe verified 4/4 byte-equal.
 */
import type { AestheticConstraintSheet } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-sheet-adapter";

export const wowTangSheet: AestheticConstraintSheet = {
  sheetId: "wow-tang-moonlit",
  designBrief: "唐代美学器物夜景：朱砂漆地、鎏金饰边、对称框景，黄昏主光配月色冷轮廓光",
  mood: "tang-moonlit-vessel",
  attributionStatement:
    "Tang court: lacquered cinnabar body, matte gilt ornament, symmetric frame, warm dusk key + cool moon rim.",
  structuralDimensions: [
    { id: "spatial-order", weight: "primary" },
    { id: "color", weight: "primary" },
    { id: "lighting", weight: "primary" },
    { id: "material", weight: "secondary" },
  ],
  colorSystem: {
    palette: [
      { role: "dominant", name: "朱砂 Cinnabar", hex: "#8E2F22", areaPct: 0.55, usage: "vessel body / background deep" },
      { role: "secondary", name: "絹白 Silk-Cream", hex: "#F0E2C0", areaPct: 0.3, usage: "lit material" },
      { role: "accent", name: "鎏金 Gilt", hex: "#C9A24B", areaPct: 0.1, usage: "ornament / specular" },
      { role: "shadow", name: "墨褐 Ink-Brown", hex: "#331610", areaPct: 0.05, usage: "deep tone" },
    ],
    saturationMax: 0.85,
    hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
  },
  proportion: {
    baseModulePx: 8, spacingScale: [1, 2, 3, 4, 6, 8, 12],
    voidSolidRatio: "4:6", focalPointsMax: 1,
  },
  spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 4 },
  composition: { negativeSpaceRatio: 0.4, symmetry: 1, focalPoint: [0.5, 0.42] },
  typography: { families: ["Songti SC", "Hei SC"] },
  lighting: {
    primarySource: "leaked",
    timeSetting: "dusk",
    lightDarkRatio: "4:6",
    // ── 0b-1 SSOT rim-light descriptor (verbatim through the whole chain) ──
    rimLight: { azimuth: 240, elevation: 38, color: "#7fb0d8", intensity: 1.25 },
  },
  motion: {
    prototypes: ["lantern"], durationMs: [600, 2400],
    entryMode: "unfold", hardFail: ["bounce", "particle"],
  },
  antiCliche: {
    scanned: true, hardFailHits: [],
    forbidden: ["guochao-sticker", "purple-gradient", "glassmorphism", "emoji-icon"],
  },
  violations: [],
  score: 92,
} as AestheticConstraintSheet;
