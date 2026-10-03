/**
 * DecisionPacks built from sheets emitted by the real skill generator (see tests/setup/global-setup.js).
 * Tests obtain packs here instead of declaring aesthetic numbers of their own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DecisionPack } from "../../skill-bridge/decision-pack";
import { validateSheet } from "../../skill-bridge/sheet-validator";
import type { AestheticConstraintSheet } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { REQUIRED_DECISIONS } from "../../skill-bridge/requirements";

export interface TestContext { period: "TANG" | "SONG" | "MING"; material: string; lighting: string; scene_type: string }

export const contextKey = (c: TestContext): string => `${c.period}.${c.material}.${c.lighting}.${c.scene_type}`;

const cache = new Map<string, DecisionPack>();

/** Strict binding is enforced by the CI jobs (SKILL_BINDING_STRICT=1); local runs accept a dirty skill worktree. */
export const strictBinding = (): boolean => process.env.SKILL_BINDING_STRICT === "1";

export function loadSheetJson(ctx: TestContext): AestheticConstraintSheet {
  const dir = process.env.ACS_SHEET_DIR;
  if (!dir) throw new Error("ACS_SHEET_DIR is not set: run the suite through jest so tests/setup/global-setup.js emits the skill sheets");
  const file = join(dir, `${contextKey(ctx)}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`no emitted sheet for ${contextKey(ctx)}: add the context to tests/support/contexts.<owner>.json`);
  }
}

export function packFor(ctx: TestContext): DecisionPack {
  const key = contextKey(ctx);
  let pack = cache.get(key);
  if (!pack) {
    const validated = validateSheet(loadSheetJson(ctx), { allowDirty: !strictBinding() });
    pack = DecisionPack.from(validated, REQUIRED_DECISIONS);
    cache.set(key, pack);
  }
  return pack;
}

/** The canonical context of each golden-matrix cell (period / material / lighting of the sealed cell). */
export const GOLDEN_CONTEXTS: Record<string, TestContext> = {
  "MC-T01": { period: "TANG", material: "BRONZE", lighting: "DAYLIGHT", scene_type: "OBJECT_STUDY" },
  "MC-T02": { period: "TANG", material: "GLAZE", lighting: "CANDLELIGHT", scene_type: "OBJECT_STUDY" },
  "MC-M01": { period: "MING", material: "WOOD", lighting: "DAYLIGHT", scene_type: "OBJECT_STUDY" },
  "MC-S01": { period: "SONG", material: "STONE", lighting: "DIM", scene_type: "OBJECT_STUDY" },
  "MC-X01": { period: "TANG", material: "WOOD", lighting: "CANDLELIGHT", scene_type: "OBJECT_STUDY" },
  "MC-X02": { period: "MING", material: "BRONZE", lighting: "DIM", scene_type: "OBJECT_STUDY" },
};

/** One default pack per period (the golden cell of that period that first appears in the matrix). */
export const DEFAULT_CONTEXT_BY_PERIOD: Record<"TANG" | "SONG" | "MING", TestContext> = {
  TANG: GOLDEN_CONTEXTS["MC-T01"],
  SONG: GOLDEN_CONTEXTS["MC-S01"],
  MING: GOLDEN_CONTEXTS["MC-M01"],
};

export const defaultPackFor = (period: "TANG" | "SONG" | "MING"): DecisionPack => packFor(DEFAULT_CONTEXT_BY_PERIOD[period]);

/**
 * Contexts under which the three pre-matrix golden cases run the Core pipeline. They are test
 * parameters chosen from each case's description, NOT an aesthetic classification of the asset:
 * these cases verify the end-to-end mechanics on real assets and assert no repaired aesthetic value.
 */
export const LEGACY_CASE_CONTEXTS: Record<"GOLDEN_CASE_01" | "GOLDEN_CASE_02" | "GOLDEN_CASE_03", TestContext> = {
  GOLDEN_CASE_01: { period: "SONG", material: "WOOD", lighting: "DAYLIGHT", scene_type: "GATE_ACT0" },
  GOLDEN_CASE_02: { period: "SONG", material: "WOOD", lighting: "DIM", scene_type: "PALACE" },
  GOLDEN_CASE_03: { period: "TANG", material: "STONE", lighting: "DAYLIGHT", scene_type: "PALACE" },
};
