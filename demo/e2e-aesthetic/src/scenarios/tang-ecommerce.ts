/**
 * tang-ecommerce.ts — Scenario 3: 唐韵电商首页
 *
 * User brief: "一个唐代美学风格的电商首页，华丽、丰满色彩、对称布局"
 * Dark cinnabar dominant (S≈0.62, under the 0.75 hard limit), matte gilt accent,
 * strict symmetric axis with an off-center anchor so the G2.5 dead-center veto
 * does not fire on the balanced layout.
 */

import type { ScenarioDefinition } from "../types";

export const tangEcommerceScenario: ScenarioDefinition = {
  id: "tang-ecommerce",
  title: "唐韵电商首页 · Tang-Tang Marketplace",
  brief: "一个唐代美学风格的电商首页，华丽、丰满色彩、对称布局",
  sheet: {
    sheetId: "demo-tang-ecommerce",
    designBrief: "唐代美学电商首页，华丽丰满色彩，对称布局，装饰边框",
    mood: "tang-tang",
    attributionStatement:
      "Tang court: lacquered cinnabar, matte gilt ornament, symmetric frame, full composition.",
    structuralDimensions: [
      { id: "spatial-order", weight: "primary" },
      { id: "color", weight: "primary" },
      { id: "material", weight: "secondary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "朱砂 Cinnabar", hex: "#8E2F22", areaPct: 0.55, usage: "hero background" },
        { role: "secondary", name: "絹白 Silk-Cream", hex: "#F0E2C0", areaPct: 0.3, usage: "text" },
        { role: "accent", name: "鎏金 Gilt", hex: "#C9A24B", areaPct: 0.1, usage: "border / price" },
        { role: "shadow", name: "墨褐 Ink-Brown", hex: "#331610", areaPct: 0.05, usage: "deep tone" },
      ],
      saturationMax: 0.85,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
    },
    proportion: {
      baseModulePx: 8, spacingScale: [1, 2, 3, 4, 6, 8, 12],
      voidSolidRatio: "4:6", focalPointsMax: 2,
    },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 4 },
    lighting: { primarySource: "leaked", timeSetting: "dusk", lightDarkRatio: "4:6" },
    motion: {
      prototypes: ["lantern", "chariot"], durationMs: [600, 2400],
      entryMode: "unfold", hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true, hardFailHits: [],
      forbidden: ["guochao-sticker", "purple-gradient", "glassmorphism", "emoji-icon"],
    },
    violations: [],
    typographyFamilies: ["Songti SC", "Hei SC"],
    score: 85,
  },
  content: {
    kind: "tang-shop",
    data: {
      brand: "長安 · 金縷鋪",
      nav: ["首頁", "瓷", "茶", "香", "絹"],
      heroTitle: "大唐好物 · 錦繡華章",
      heroSub: "朱雀門外 · 東市三號 · 黃昏開市",
      cta: "入 市 場",
      products: [
        { name: "邢窯白瓷缽", price: "¥ 2,860", tag: "瓷" },
        { name: "銀絲鑲寶香爐", price: "¥ 5,600", tag: "香" },
        { name: "團扇 · 簪花仕女", price: "¥ 1,280", tag: "絹" },
        { name: "紫筍貢茶餅", price: "¥ 980", tag: "茶" },
      ],
    },
  },
};
