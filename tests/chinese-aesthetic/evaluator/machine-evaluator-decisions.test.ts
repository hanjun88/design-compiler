/**
 * Machine evaluator — every verdict threshold is a decision of the skill's sheet.
 *
 * The suite derives every expectation from the DecisionPack under test (thresholds, band edges) and runs
 * against the real TANG / SONG / MING packs and against packs whose decisions were perturbed: a threshold
 * that were still a literal inside the evaluator could not follow the perturbation.
 *
 * ADR-0001 (negative space): the void-solid assertion judges the void ratio against the context's
 * effective band; the evaluator no longer carries a private lower / upper bound.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  evaluateColorRelationshipEvidence,
  evaluateFocalHierarchyEvidence,
  evaluateMachineAssertions,
  evaluateMachineAssertionsFromEvidence,
  evaluateMaterialRelationshipEvidence,
  evaluateQiyunContinuityEvidence,
  evaluateSpatialDepthEvidence,
  evaluateVoidSolidEvidence,
} from "../../../chinese-aesthetic/evaluator/machine-evaluator";
import { EVAL_SUBJECT, negativeSpaceBand } from "../../../chinese-aesthetic/evaluator/decisions";
import { NoDecisionPackError, setDefaultDecisionPackProvider, withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, MissingDecisionError } from "../../../skill-bridge/decision-pack";
import { defaultPackFor } from "../../support/skill-packs";
import { ONE, MID, ZERO, PERIOD_CONTEXTS, decided, midpoint, neutralEvidence, packLacking, variantPacks, type EvidenceEdit } from "./support/decision-fixtures";

/** Step across a threshold. The evidence path quantises metrics to 4 decimals, so the step must exceed that. */
const STEP = 1e-3;
const REPO_ROOT = path.resolve(__dirname, "../../..");

describe.each(variantPacks())("machine evaluator, evidence path, follows the decision pack — $name", ({ pack }) => {
  const under = <T>(fn: () => T): T => withDecisionPack(pack, fn);
  const policy = (subject: string, key: string): number => decided(pack, subject, key);

  test("neutral evidence passes every assertion (fixture sanity)", () => {
    const report = under(() => evaluateMachineAssertionsFromEvidence(neutralEvidence(pack), "t"));
    for (const a of [report.focalHierarchy, report.voidSolid, report.qiyunContinuity, report.spatialDepth, report.colorRelationship, report.materialRelationship]) {
      expect(a.status).toBe("PASS");
    }
    expect(report.passRate).toBe(ONE);
  });

  describe("focal-hierarchy: focal offset and dominant-area range", () => {
    const S = EVAL_SUBJECT.focalHierarchy;
    const status = (edit: EvidenceEdit) => under(() => evaluateFocalHierarchyEvidence(neutralEvidence(pack, edit)).status);
    const maxOffset = policy(S, "max_focal_center_offset");
    const minDominant = policy(S, "min_dominant_area_ratio");
    const maxDominant = policy(S, "max_dominant_area_ratio");

    test("a focal offset strictly below the pack's maximum has a clear focal point; at or above it does not", () => {
      expect(status((e) => { e.pixel.focalCenterOffset.value = maxOffset - STEP; })).toBe("PASS");
      expect(status((e) => { e.pixel.focalCenterOffset.value = maxOffset; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.pixel.focalCenterOffset.value = maxOffset + STEP; })).toBe("INCONCLUSIVE");
    });

    test("the dominant colour share must lie strictly inside the pack's range", () => {
      expect(status((e) => { e.pixel.dominantColorRatio.value = minDominant + STEP; })).toBe("PASS");
      expect(status((e) => { e.pixel.dominantColorRatio.value = maxDominant - STEP; })).toBe("PASS");
      expect(status((e) => { e.pixel.dominantColorRatio.value = minDominant; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.pixel.dominantColorRatio.value = maxDominant; })).toBe("INCONCLUSIVE");
    });

    test("both conditions violated is FAIL", () => {
      expect(status((e) => { e.pixel.focalCenterOffset.value = maxOffset; e.pixel.dominantColorRatio.value = minDominant; })).toBe("FAIL");
    });

    test("secondary / accent areas are inferred only from the pack's minimum number of luminance peaks", () => {
      const minPeaks = policy(S, "min_luminance_peaks_for_tiers");
      const tiers = (peaks: number) => under(() => evaluateFocalHierarchyEvidence(neutralEvidence(pack, (e) => { e.pixel.luminanceHistogramPeakCount.value = peaks; })).metrics);
      expect(Number.isFinite(tiers(minPeaks).secondaryAreaRatio)).toBe(true);
      expect(Number.isNaN(tiers(minPeaks - 1).secondaryAreaRatio)).toBe(true);
      expect(Number.isNaN(tiers(minPeaks - 1).dominanceSeparation)).toBe(true);
    });
  });

  describe("void-solid-ratio: the void ratio is judged against the context's effective band (ADR-0001)", () => {
    const band = negativeSpaceBand(pack);
    const status = (ratio: number, edit?: EvidenceEdit) =>
      under(() => evaluateVoidSolidEvidence(neutralEvidence(pack, (e) => { e.pixel.negativeSpaceRatio.value = ratio; edit?.(e); })).status);

    test("the band edges themselves are balanced (closed interval)", () => {
      expect(status(band.min)).toBe("PASS");
      expect(status(band.max)).toBe("PASS");
      expect(status(midpoint(band.min, band.max))).toBe("PASS");
    });

    test("below the band minimum or above its maximum is INCONCLUSIVE (the pixel estimate is a lower bound of void_ratio), never FAIL", () => {
      expect(status(band.min - STEP)).toBe("INCONCLUSIVE");
      expect(status(band.max + STEP)).toBe("INCONCLUSIVE");
      for (const ratio of [ZERO, ONE]) expect(status(ratio)).not.toBe("FAIL");
    });

    test("the band is the pack's effective band: its own edges, not a constant", () => {
      expect(band).toEqual({ min: pack.effectiveBand("scene.composition.negativeSpaceRatio")!.min, max: pack.effectiveBand("scene.composition.negativeSpaceRatio")!.max });
      expect(band.min).toBeLessThan(band.max);
    });

    test("a paradigm naming a sheet period must be the pack's period (no silent fallback to another period)", () => {
      const other = (["TANG", "SONG", "MING"] as const).find((p) => p !== pack.period)!;
      expect(status(band.min, (e) => { e.ir.paradigm.value = pack.period; })).toBe("PASS");
      expect(() => status(band.min, (e) => { e.ir.paradigm.value = other; })).toThrow(DecisionContextMismatchError);
      expect(status(band.min, (e) => { e.ir.paradigm.value = "CONTEMPORARY_CYBER_CHINESE"; })).toBe("PASS");
    });
  });

  describe("qiyun-continuity: motion continuity and optical-flow coherence", () => {
    const S = EVAL_SUBJECT.qiyunContinuity;
    const minMotion = policy(S, "min_motion_continuity");
    const minFlow = policy(S, "min_optical_flow_coherence");
    const status = (motion: number, flow: number) =>
      under(() => evaluateQiyunContinuityEvidence(neutralEvidence(pack, (e) => {
        e.motion!.motionContinuity.value = motion;
        e.motion!.opticalFlowDirectionCoherence.value = flow;
      })).status);

    test("both strictly above the pack's minimums passes; one alone is INCONCLUSIVE; neither is FAIL", () => {
      expect(status(minMotion + STEP, minFlow + STEP)).toBe("PASS");
      expect(status(minMotion - STEP, minFlow + STEP)).toBe("INCONCLUSIVE");
      expect(status(minMotion + STEP, minFlow - STEP)).toBe("INCONCLUSIVE");
      expect(status(minMotion - STEP, minFlow - STEP)).toBe("FAIL");
    });

    test("single-frame evidence (no motion) is INCONCLUSIVE, never FAIL", () => {
      expect(under(() => evaluateQiyunContinuityEvidence(neutralEvidence(pack, (e) => { e.motion = null; })).status)).toBe("INCONCLUSIVE");
    });
  });

  describe("spatial-depth-layers: measured depth layers", () => {
    const S = EVAL_SUBJECT.spatialDepth;
    const pass = policy(S, "min_depth_layer_count");
    const partial = policy(S, "min_depth_layer_count_inconclusive");
    const status = (layers: number, available = true) =>
      under(() => evaluateSpatialDepthEvidence(neutralEvidence(pack, (e) => { e.depth.depthBufferAvailable = available; e.depth.depthLayerCount = { value: layers, evidenceRef: "fixture:ref", confidence: 1, method: "fixture" }; })).status);

    test("the pack's minimum layer count passes (closed), the partial minimum is INCONCLUSIVE, fewer FAIL", () => {
      expect(partial).toBeLessThan(pass);
      expect(status(pass)).toBe("PASS");
      expect(status(pass - STEP)).toBe("INCONCLUSIVE");
      expect(status(partial)).toBe("INCONCLUSIVE");
      expect(status(partial - STEP)).toBe("FAIL");
    });

    test("no depth buffer is INCONCLUSIVE whatever the layer count (UNMEASURED is not FAIL)", () => {
      expect(status(ZERO, false)).toBe("INCONCLUSIVE");
      expect(status(pass, false)).toBe("INCONCLUSIVE");
    });
  });

  describe("color-relationship: palette distinctness and contrast", () => {
    const S = EVAL_SUBJECT.colorRelationship;
    const minContrast = policy(S, "min_contrast_ratio");
    const status = (edit: EvidenceEdit) => under(() => evaluateColorRelationshipEvidence(neutralEvidence(pack, edit)).status);

    test("contrast at or above the pack's minimum passes; below it is INCONCLUSIVE", () => {
      expect(status((e) => { e.pixel.contrastRatio.value = minContrast + STEP; })).toBe("PASS");
      expect(status((e) => { e.pixel.contrastRatio.value = minContrast - STEP; })).toBe("INCONCLUSIVE");
    });

    test("a distinct dominant / secondary / accent palette is required when the pack says so", () => {
      expect(pack.policy("EVALUATION_ASSERTION", S).flag("require_distinct_palette")).toBe(true);
      expect(status((e) => { e.pixel.secondaryColor.value = e.pixel.dominantColor.value; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.pixel.accentColor.value = e.pixel.secondaryColor.value; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.pixel.secondaryColor.value = e.pixel.dominantColor.value; e.pixel.contrastRatio.value = minContrast - STEP; })).toBe("FAIL");
    });
  });

  describe("material-relationship: physical validity only (roughness / metalness definition range)", () => {
    const status = (edit: EvidenceEdit) => under(() => evaluateMaterialRelationshipEvidence(neutralEvidence(pack, edit)).status);

    test("measured values inside the physical range pass", () => {
      expect(status(() => undefined)).toBe("PASS");
      expect(status((e) => { e.material.dominantMetalness.value = ZERO; })).toBe("PASS");
      expect(status((e) => { e.material.dominantMetalness.value = ONE; })).toBe("PASS");
    });

    test("roughness at its degenerate endpoints and metalness outside [0, 1] are INCONCLUSIVE", () => {
      expect(status((e) => { e.material.dominantRoughness.value = ZERO; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.material.dominantRoughness.value = ONE; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.material.dominantMetalness.value = ZERO - STEP; })).toBe("INCONCLUSIVE");
      expect(status((e) => { e.material.dominantMetalness.value = ONE + STEP; })).toBe("INCONCLUSIVE");
    });
  });
});

describe.each(variantPacks())("machine evaluator, legacy file-based path, follows the decision pack — $name", ({ pack }) => {
  const under = <T>(fn: () => T): T => withDecisionPack(pack, fn);
  const policy = (subject: string, key: string): number => decided(pack, subject, key);
  const band = negativeSpaceBand(pack);
  let dir: string;

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-machine-eval-")); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  interface Visual { focal?: [number, number]; dominantRatio?: number; negativeSpace?: number; layers?: number; contrast?: number; secondary?: string; roughness?: number; metalness?: number }

  /** Writes the legacy evidence files with the given probe values and evaluates them under the pack. */
  function legacy(v: Visual, motion: Array<{ globalDx: number; meanDisplacement: number }> = [{ globalDx: ONE, meanDisplacement: ONE }, { globalDx: ONE, meanDisplacement: ONE }]) {
    const visual = {
      aggregate: {
        composition: { focalPoint: v.focal ?? [MID, MID], negativeSpaceRatio: v.negativeSpace ?? midpoint(band.min, band.max), depthLayerCount: v.layers ?? policy(EVAL_SUBJECT.spatialDepth, "min_depth_layer_count") },
        palette: { dominantRatio: v.dominantRatio ?? ONE, dominant: "#101010", secondary: v.secondary ?? "#202020", accent: "#303030" },
        colorMetrics: { contrastRatio: v.contrast ?? policy(EVAL_SUBJECT.colorRelationship, "min_contrast_ratio") * 2, temperatureBias: ZERO, accentIsolation: ZERO },
        materialProxies: { roughness: v.roughness ?? MID, metalness: v.metalness ?? MID, wear: MID },
      },
      perFrame: [{ composition: { brightnessMean: MID } }, { composition: { brightnessMean: MID } }],
    };
    const vf = path.join(dir, "visual.json");
    const mf = path.join(dir, "motion.json");
    fs.writeFileSync(vf, JSON.stringify(visual));
    fs.writeFileSync(mf, JSON.stringify({ aggregate: {}, perFramePair: motion }));
    return under(() => evaluateMachineAssertions({
      visualFeaturesPath: path.relative(REPO_ROOT, vf),
      motionSummaryPath: path.relative(REPO_ROOT, mf),
      evaluatedAt: "2026-09-16T00:00:00Z",
    }));
  }

  test("focal-hierarchy: offset below the pack's maximum and separation above its minimum", () => {
    const S = EVAL_SUBJECT.focalHierarchy;
    const maxOffset = policy(S, "max_focal_center_offset");
    const minSeparation = policy(S, "min_dominance_separation");
    // the legacy path reports its own secondary-area stand-in as a metric; read it instead of repeating it
    const secondary = legacy({}).focalHierarchy.metrics.secondaryAreaRatio;
    const status = (offset: number, ratio: number) => legacy({ focal: [MID + offset, MID], dominantRatio: ratio }).focalHierarchy.status;
    const wellSeparated = secondary + minSeparation + STEP;
    const poorlySeparated = secondary + minSeparation - STEP;
    expect(status(maxOffset - STEP, wellSeparated)).toBe("PASS");
    expect(status(maxOffset, wellSeparated)).toBe("INCONCLUSIVE");
    expect(status(maxOffset - STEP, poorlySeparated)).toBe("INCONCLUSIVE");
    expect(status(maxOffset, poorlySeparated)).toBe("FAIL");
  });

  test("void-solid-ratio: the context's effective band, for the verdict and for the continuity estimate (ADR-0001)", () => {
    const at = (ratio: number) => legacy({ negativeSpace: ratio }).voidSolid;
    expect(at(band.min).status).toBe("PASS");
    expect(at(band.max).status).toBe("PASS");
    expect(at(band.min - STEP).status).toBe("INCONCLUSIVE");
    expect(at(band.max + STEP).status).toBe("INCONCLUSIVE");
    // the continuity estimate is high exactly inside the band and low outside it
    expect(at(band.min).metrics.emptyRegionContinuity).toBeGreaterThan(at(band.min - STEP).metrics.emptyRegionContinuity);
    expect(at(band.max).metrics.emptyRegionContinuity).toBeGreaterThan(at(band.max + STEP).metrics.emptyRegionContinuity);
  });

  test("qiyun-continuity: motion continuity and optical-flow coherence above the pack's minimums", () => {
    const steady = legacy({}, [{ globalDx: ONE, meanDisplacement: ONE }, { globalDx: ONE, meanDisplacement: ONE }, { globalDx: ONE, meanDisplacement: ONE }]).qiyunContinuity;
    expect(steady.metrics.opticalFlowCoherence).toBeGreaterThan(policy(EVAL_SUBJECT.qiyunContinuity, "min_optical_flow_coherence"));
    expect(steady.metrics.motionContinuity).toBeGreaterThan(policy(EVAL_SUBJECT.qiyunContinuity, "min_motion_continuity"));
    expect(steady.status).toBe("PASS");
    // no frame pairs: there is no flow to be coherent, so the assertion cannot pass
    expect(legacy({}, []).qiyunContinuity.status).not.toBe("PASS");
  });

  test("spatial-depth-layers: the pack's layer-count minimums", () => {
    const S = EVAL_SUBJECT.spatialDepth;
    const pass = policy(S, "min_depth_layer_count");
    const partial = policy(S, "min_depth_layer_count_inconclusive");
    expect(legacy({ layers: pass }).spatialDepth.status).toBe("PASS");
    expect(legacy({ layers: pass - STEP }).spatialDepth.status).toBe("INCONCLUSIVE");
    expect(legacy({ layers: partial }).spatialDepth.status).toBe("INCONCLUSIVE");
    expect(legacy({ layers: partial - STEP }).spatialDepth.status).toBe("FAIL");
  });

  test("color-relationship: contrast at or above the pack's minimum, distinct palette", () => {
    const S = EVAL_SUBJECT.colorRelationship;
    const minContrast = policy(S, "min_contrast_ratio");
    expect(legacy({ contrast: minContrast }).colorRelationship.status).toBe("PASS");
    expect(legacy({ contrast: minContrast - STEP }).colorRelationship.status).toBe("INCONCLUSIVE");
    expect(legacy({ secondary: "#101010" }).colorRelationship.status).toBe("INCONCLUSIVE");
  });

  test("material-relationship: physical validity range only", () => {
    expect(legacy({ roughness: MID, metalness: ZERO }).materialRelationship.status).toBe("PASS");
    expect(legacy({ roughness: ZERO }).materialRelationship.status).toBe("INCONCLUSIVE");
    expect(legacy({ roughness: ONE }).materialRelationship.status).toBe("INCONCLUSIVE");
    expect(legacy({ metalness: ONE + STEP }).materialRelationship.status).toBe("INCONCLUSIVE");
  });
});

describe("machine evaluator is bound to the sheet: decisions are never defaulted", () => {
  const ctx = PERIOD_CONTEXTS.SONG;

  test("no decision pack in scope: every entry point refuses (fail closed)", () => {
    const e = neutralEvidence(defaultPackFor("SONG"));
    setDefaultDecisionPackProvider(null);
    try {
      expect(() => evaluateFocalHierarchyEvidence(e)).toThrow(NoDecisionPackError);
      expect(() => evaluateVoidSolidEvidence(e)).toThrow(NoDecisionPackError);
      expect(() => evaluateQiyunContinuityEvidence(e)).toThrow(NoDecisionPackError);
      expect(() => evaluateSpatialDepthEvidence(e)).toThrow(NoDecisionPackError);
      expect(() => evaluateColorRelationshipEvidence(e)).toThrow(NoDecisionPackError);
      expect(() => evaluateMachineAssertionsFromEvidence(e, "t")).toThrow(NoDecisionPackError);
      expect(() => evaluateMachineAssertions({ evaluatedAt: "t" })).toThrow(NoDecisionPackError);
    } finally {
      // restore the process-wide default exactly as tests/setup/pack-setup.ts installs it
      setDefaultDecisionPackProvider((period) => {
        if (period === undefined) return defaultPackFor("SONG");
        return period === "TANG" || period === "SONG" || period === "MING" ? defaultPackFor(period) : undefined;
      });
    }
  });

  test("a sheet without the assertion's decision is refused at read time, not defaulted", () => {
    const pack = packLacking(ctx, (s) => {
      s.constraints = s.constraints.filter((c) => !(c.kind === "EVALUATION_ASSERTION" && c.payload.subject === EVAL_SUBJECT.focalHierarchy));
    });
    const e = neutralEvidence(defaultPackFor("SONG"));
    expect(() => withDecisionPack(pack, () => evaluateFocalHierarchyEvidence(e))).toThrow(MissingDecisionError);
    // the other assertions are unaffected
    expect(withDecisionPack(pack, () => evaluateSpatialDepthEvidence(e).status)).toBe("PASS");
  });

  test("a decision that lacks one key is refused, not defaulted", () => {
    const pack = packLacking(ctx, (s) => {
      for (const c of s.constraints) {
        if (c.kind === "EVALUATION_ASSERTION" && c.payload.subject === EVAL_SUBJECT.colorRelationship) delete c.payload.params.min_contrast_ratio;
      }
    });
    const e = neutralEvidence(defaultPackFor("SONG"));
    expect(() => withDecisionPack(pack, () => evaluateColorRelationshipEvidence(e))).toThrow(MissingDecisionError);
  });

  test("a sheet without any void-ratio hard band is refused (no private band to fall back on)", () => {
    const pack = packLacking(ctx, (s) => {
      s.constraints = s.constraints.filter((c) => !(c.kind === "PARAMETER_BAND" && c.payload.parameter === "scene.composition.negativeSpaceRatio"));
    });
    const e = neutralEvidence(defaultPackFor("SONG"));
    expect(() => withDecisionPack(pack, () => evaluateVoidSolidEvidence(e))).toThrow(MissingDecisionError);
  });
});
