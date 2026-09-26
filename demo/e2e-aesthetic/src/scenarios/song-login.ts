/**
 * song-login.ts — Scenario 1: 宋韵登录页
 *
 * User brief: "一个宋代美学风格的登录页面，淡雅、留白、瘦金体标题"
 * Palette chosen to pass the REAL G2.5 gate: no forbidden hex, muted dominant
 * (S ≈ 0.14), off-center focal point (strict axis, y lifted to 0.35).
 */

import type { ScenarioDefinition } from "../types";

export const songLoginScenario: ScenarioDefinition = {
  id: "song-login",
  title: "宋韵登录页 · Song-Elegant Login",
  brief: "一个宋代美学风格的登录页面，淡雅、留白、瘦金体标题",
  sheet: {
    sheetId: "demo-song-login",
    designBrief: "宋代美学风格登录页，淡雅留白，瘦金体标题",
    mood: "song-elegant",
    attributionStatement:
      "Song academy restraint: moon-white field, ink text, hairline gold accents, generous void.",
    structuralDimensions: [
      { id: "void-solid", weight: "primary" },
      { id: "spatial-order", weight: "primary" },
      { id: "color", weight: "secondary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "月白 Moon-White", hex: "#ECE8DE", areaPct: 0.7, usage: "background" },
        { role: "secondary", name: "黛墨 Dai-Ink", hex: "#2E3A35", areaPct: 0.22, usage: "text" },
        { role: "accent", name: "淡金 Pale-Gold", hex: "#B08D57", areaPct: 0.05, usage: "hairline" },
        { role: "shadow", name: "青墨 Cyan-Ink", hex: "#1F2A26", areaPct: 0.03, usage: "shadow" },
      ],
      saturationMax: 0.45,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
    },
    proportion: {
      baseModulePx: 8, spacingScale: [1, 2, 3, 4, 6, 8],
      voidSolidRatio: "7:3", focalPointsMax: 1,
    },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3 },
    lighting: { primarySource: "skylight", timeSetting: "cloudy", lightDarkRatio: "8:2" },
    motion: {
      prototypes: ["light", "cloud"], durationMs: [1200, 6000],
      entryMode: "emerge", hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true, hardFailHits: [],
      forbidden: ["guochao-sticker", "purple-gradient", "glassmorphism", "emoji-icon"],
    },
    violations: [],
    typographyFamilies: ["Ma Shan Zheng", "Songti SC"],
    score: 90,
  },
  content: {
    kind: "song-login",
    data: {
      heading: "潤 宋 書 院",
      subheading: "清雅 · 留白 · 瘦金",
      accountLabel: "字號",
      passwordLabel: "暗 碼",
      submitText: "入 院",
      footerNote: "—— 癸卯年 · 梅影窗下 ——",
    },
  },
};
