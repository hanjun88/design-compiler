/**
 * The evaluators' decision plumbing: which pack answers, how the void-ratio band is chosen, and the
 * interface manifest (skill-bridge/requirements/evaluator.ts) matching exactly what the code reads.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  evaluateColorRelationshipEvidence,
  evaluateFocalHierarchyEvidence,
  evaluateMachineAssertions,
  evaluateMachineAssertionsFromEvidence,
  evaluateQiyunContinuityEvidence,
  evaluateSpatialDepthEvidence,
  evaluateVoidSolidEvidence,
} from "../../../chinese-aesthetic/evaluator/machine-evaluator";
import { evaluateSemanticDimensions } from "../../../chinese-aesthetic/evaluator/semantic-evaluator";
import { generateHumanAuditLedger } from "../../../chinese-aesthetic/scene-pack/evidence/human-audit-ledger";
import type { ProfessionalScenePack } from "../../../chinese-aesthetic/scene-pack/types";
import { EVAL_SUBJECT, NEGATIVE_SPACE_PARAMETER, decisionPackFor, negativeSpaceBand, periodOfParadigm } from "../../../chinese-aesthetic/evaluator/decisions";
import { withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, DecisionPack } from "../../../skill-bridge/decision-pack";
import { EVALUATOR_REQUIREMENTS } from "../../../skill-bridge/requirements/evaluator";
import { REQUIRED_DECISIONS } from "../../../skill-bridge/requirements";
import { loadSheetJson } from "../../support/skill-packs";
import { validateSheet } from "../../../skill-bridge/sheet-validator";
import { ONE, MID, ZERO, PERIOD_CONTEXTS, decided, midpoint, neutralEvidence, packWithVoidFloor, reportOf, satisfyingMetrics } from "./support/decision-fixtures";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const STEP = 1e-3;
const FLOOR_SHARE = 0.1; // where the test floor sits inside the period band (structural, not a decision)

describe("which pack answers: the declared paradigm pins the period only when it names one", () => {
  test("periodOfParadigm", () => {
    expect(periodOfParadigm("TANG")).toBe("TANG");
    expect(periodOfParadigm("SONG")).toBe("SONG");
    expect(periodOfParadigm("MING")).toBe("MING");
    for (const other of [undefined, "", "tang", "CONTEMPORARY_CYBER_CHINESE", "FIXTURE"]) expect(periodOfParadigm(other)).toBeUndefined();
  });

  test("decisionPackFor: a period must match the scoped pack, anything else leaves the choice to it", () => {
    const song = validateSheet(loadSheetJson(PERIOD_CONTEXTS.SONG), { allowDirty: true });
    const pack = DecisionPack.from(song, REQUIRED_DECISIONS);
    withDecisionPack(pack, () => {
      expect(decisionPackFor("SONG")).toBe(pack);
      expect(decisionPackFor("CONTEMPORARY_CYBER_CHINESE")).toBe(pack);
      expect(decisionPackFor()).toBe(pack);
      expect(() => decisionPackFor("TANG")).toThrow(DecisionContextMismatchError);
      expect(() => decisionPackFor("MING")).toThrow(DecisionContextMismatchError);
    });
  });
});

describe("the void-ratio band: effective band for the evaluators, period band for the audit ledger (ADR-0001)", () => {
  const ctx = PERIOD_CONTEXTS.SONG;
  const floorOf = (b: { min: number; max: number }) => b.min + (b.max - b.min) * FLOOR_SHARE;
  const pack = packWithVoidFloor(ctx, floorOf);
  const period = pack.periodBand(NEGATIVE_SPACE_PARAMETER)!;
  const effective = negativeSpaceBand(pack);
  const belowFloor = midpoint(period.min, effective.min); // inside the period band, below the hard floor
  const scene = { sceneId: "scene:test", generatedAt: "2026-09-16T00:00:00.000Z" } as unknown as ProfessionalScenePack;

  test("a hard floor raises the effective band, not the period band", () => {
    expect(effective.min).toBe(floorOf({ min: period.min, max: period.max }));
    expect(effective.min).toBeGreaterThan(period.min);
    expect(effective.max).toBe(period.max);
    expect(belowFloor).toBeGreaterThanOrEqual(period.min);
    expect(belowFloor).toBeLessThan(effective.min);
  });

  test("machine void-solid assertion judges against the effective band", () => {
    const status = (ratio: number) => withDecisionPack(pack, () => evaluateVoidSolidEvidence(neutralEvidence(pack, (e) => { e.pixel.negativeSpaceRatio.value = ratio; })).status);
    expect(status(effective.min)).toBe("PASS");
    expect(status(belowFloor)).toBe("INCONCLUSIVE");
  });

  test("semantic 计白当黑 judges against the effective band", () => {
    const judgment = (ratio: number) =>
      withDecisionPack(pack, () => evaluateSemanticDimensions({ machineReport: reportOf({ ...satisfyingMetrics(pack), negativeSpaceRatio: ratio }), evaluatedAt: "t" }).dimensions.jibaiDanghei.judgment);
    expect(judgment(effective.min)).toBe("PASS");
    expect(judgment(belowFloor)).toBe("INCONCLUSIVE");
  });

  test("the human-audit ledger records the PERIOD band as its ideal range (it duplicated that band before)", () => {
    const ledger = withDecisionPack(pack, () => generateHumanAuditLedger(scene, { measuredNegativeSpaceRatio: belowFloor }));
    expect(ledger.negativeSpaceRatio.idealRange).toEqual({ min: period.min, max: period.max });
    expect(ledger.negativeSpaceRatio.withinIdealRange).toBe(true);
  });
});

describe("migrated threshold file stays gone", () => {
  test("chinese-aesthetic/profiles/default.json is deleted (its numbers live in the skill's CAS-EV rules)", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "chinese-aesthetic/profiles/default.json"))).toBe(false);
  });
});

describe("requirement manifest <-> runtime reads (skill-bridge/requirements/evaluator.ts)", () => {
  const ctx = PERIOD_CONTEXTS.SONG;

  /** Runs every evaluator entry point, on inputs that reach every branch that reads a decision. */
  function exercise(pack: DecisionPack): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evaluator-manifest-"));
    try {
      withDecisionPack(pack, () => {
        const band = negativeSpaceBand(pack);
        const focal = EVAL_SUBJECT.focalHierarchy;
        const depth = EVAL_SUBJECT.spatialDepth;

        // machine, evidence path: a passing evidence set and degraded ones that reach the later branches
        const evidences = [
          neutralEvidence(pack),
          neutralEvidence(pack, (e) => { e.pixel.dominantColorRatio.value = decided(pack, focal, "min_dominant_area_ratio"); }),
          neutralEvidence(pack, (e) => { e.depth.depthLayerCount = { value: decided(pack, depth, "min_depth_layer_count") - ONE, evidenceRef: "fixture:ref", confidence: 1, method: "fixture" }; }),
          neutralEvidence(pack, (e) => { e.motion = null; e.pixel.negativeSpaceRatio.value = band.max + STEP; }),
        ];
        for (const e of evidences) {
          evaluateFocalHierarchyEvidence(e);
          evaluateVoidSolidEvidence(e);
          evaluateQiyunContinuityEvidence(e);
          evaluateSpatialDepthEvidence(e);
          evaluateColorRelationshipEvidence(e);
          evaluateMachineAssertionsFromEvidence(e, "t");
        }

        // machine, legacy path
        const visual = { aggregate: { composition: { focalPoint: [MID, MID], negativeSpaceRatio: midpoint(band.min, band.max), depthLayerCount: ZERO }, palette: { dominantRatio: ONE, dominant: "#101010", secondary: "#202020", accent: "#303030" }, colorMetrics: { contrastRatio: ONE, temperatureBias: ZERO, accentIsolation: ZERO }, materialProxies: { roughness: MID, metalness: MID, wear: MID } }, perFrame: [] };
        fs.writeFileSync(path.join(dir, "v.json"), JSON.stringify(visual));
        fs.writeFileSync(path.join(dir, "m.json"), JSON.stringify({ aggregate: {}, perFramePair: [] }));
        evaluateMachineAssertions({ visualFeaturesPath: path.relative(REPO_ROOT, path.join(dir, "v.json")), motionSummaryPath: path.relative(REPO_ROOT, path.join(dir, "m.json")), evaluatedAt: "t" });

        // semantic: a satisfying report and a fully violating one (reaches every lower tier read)
        const good = satisfyingMetrics(pack);
        const bad = { ...good, focalCenterOffset: ONE, dominanceSeparation: ZERO, negativeSpaceRatio: ZERO, emptyRegionContinuity: ZERO, motionContinuity: ZERO, opticalFlowCoherence: ZERO, cameraMotionSmoothness: ZERO, luminanceContinuity: ZERO, depthLayerCount: ZERO, layerSeparation: ZERO, atmosphericDepth: ZERO, contrastRatio: ZERO, accentIsolation: ONE, microDetailDistribution: ZERO };
        for (const m of [good, bad]) evaluateSemanticDimensions({ machineReport: reportOf(m), evaluatedAt: "t" });

        // human-audit ledger
        generateHumanAuditLedger({ sceneId: "scene:test", generatedAt: "2026-09-16T00:00:00.000Z" } as unknown as ProfessionalScenePack, {});
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const declared = (): Set<string> => {
    const out = new Set<string>();
    for (const r of EVALUATOR_REQUIREMENTS) {
      if (r.kind === "PARAMETER_BAND") out.add(`PARAMETER_BAND|${r.subject}|`);
      else for (const k of [...(r.params ?? []), ...(r.flags ?? []), ...(r.enums ?? []), ...(r.vectors ?? [])]) out.add(`${r.kind}|${r.subject}|${k}`);
    }
    return out;
  };

  const read = (pack: DecisionPack): Set<string> => {
    const out = new Set<string>();
    for (const u of pack.usage()) out.add(`${u.kind}|${u.subject}|${u.kind === "PARAMETER_BAND" ? "" : u.key ?? ""}`);
    return out;
  };

  test("every decision the evaluators read at runtime is declared (an undeclared read is a bug)", () => {
    const pack = DecisionPack.from(validateSheet(loadSheetJson(ctx), { allowDirty: true }), REQUIRED_DECISIONS);
    exercise(pack);
    const missing = [...read(pack)].filter((k) => !declared().has(k));
    expect(missing).toEqual([]);
  });

  test("every declared decision is read by the evaluators (a declared key nobody reads is noise)", () => {
    const pack = DecisionPack.from(validateSheet(loadSheetJson(ctx), { allowDirty: true }), REQUIRED_DECISIONS);
    exercise(pack);
    const unread = [...declared()].filter((k) => !read(pack).has(k));
    expect(unread).toEqual([]);
  });

  test("the manifest is satisfied by the sheets the skill emits for every period", () => {
    for (const c of Object.values(PERIOD_CONTEXTS)) {
      expect(() => DecisionPack.from(validateSheet(loadSheetJson(c), { allowDirty: true }), EVALUATOR_REQUIREMENTS)).not.toThrow();
    }
  });
});
