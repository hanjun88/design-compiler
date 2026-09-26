/**
 * zen-portfolio.ts — Scenario 2: 禅意作品集
 *
 * User brief: "一个禅意风格的个人作品集，黑白灰为主，水墨元素，不对称布局"
 * Monochrome rice-paper palette, offset axis (asymmetric), off-axis focal point.
 */

import type { ScenarioDefinition } from "../types";

export const zenPortfolioScenario: ScenarioDefinition = {
  id: "zen-portfolio",
  title: "禅意作品集 · Chan-Zen Portfolio",
  brief: "一个禅意风格的个人作品集，黑白灰为主，水墨元素，不对称布局",
  sheet: {
    sheetId: "demo-zen-portfolio",
    designBrief: "禅意个人作品集，黑白灰，水墨元素，不对称布局",
    mood: "chan-zen",
    attributionStatement:
      "Chan ink-wash: rice-paper field, monochrome ink, off-axis composition, breathing void.",
    structuralDimensions: [
      { id: "void-solid", weight: "primary" },
      { id: "spatial-order", weight: "secondary" },
      { id: "material", weight: "secondary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "宣紙白 Rice-Paper", hex: "#F1EFE9", areaPct: 0.6, usage: "background" },
        { role: "secondary", name: "墨 Ink", hex: "#2A2A28", areaPct: 0.28, usage: "text" },
        { role: "accent", name: "淡墨灰 Pale-Ink", hex: "#8C8880", areaPct: 0.07, usage: "line" },
        { role: "shadow", name: "焦墨 Burnt-Ink", hex: "#161614", areaPct: 0.05, usage: "wash" },
      ],
      saturationMax: 0.2,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#FF6B9D"],
    },
    proportion: {
      baseModulePx: 8, spacingScale: [1, 2, 3, 4, 6],
      voidSolidRatio: "6:4", focalPointsMax: 2,
    },
    spatial: { axis: "offset", bays: 2, hierarchyLevelsMin: 2 },
    lighting: { primarySource: "bounced", timeSetting: "cloudy", lightDarkRatio: "6:4" },
    motion: {
      prototypes: ["mist", "water"], durationMs: [1800, 7000],
      entryMode: "dissolve", hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true, hardFailHits: [],
      forbidden: ["guochao-sticker", "purple-gradient", "glassmorphism", "emoji-icon"],
    },
    violations: [],
    typographyFamilies: ["Songti SC"],
    score: 87,
  },
  content: {
    kind: "zen-portfolio",
    data: {
      author: "白 墨 齋",
      nav: ["作品", "關於", "題辭", "聯絡"],
      blurb: "以墨代聲，以留白代言。十載寫生，存此數帧。",
      filters: ["全部", "書法", "山水", "器物"],
      works: [
        { title: "枯木禪", category: "書法", year: "甲辰" },
        { title: "空山新雨", category: "山水", year: "癸卯" },
        { title: "一葉菩提", category: "器物", year: "癸卯" },
        { title: "平常心是道", category: "書法", year: "壬寅" },
        { title: "寒江獨釣", category: "山水", year: "壬寅" },
        { title: "素盞", category: "器物", year: "辛丑" },
      ],
    },
  },
};
