/**
 * Semantic evaluator — every dimension's evidence thresholds are decisions of the skill's sheet.
 *
 * Table-driven: for each of the eight dimensions the suite enumerates every truth assignment of the
 * dimension's conditions, builds a machine report that satisfies / violates each condition exactly at
 * the pack's threshold, and compares the evaluator's judgment with the documented combination logic.
 * All thresholds are read from the pack under test, and the suite runs against real and perturbed packs,
 * so a threshold that survived as a literal inside the evaluator cannot go unnoticed.
 *
 * ADR-0001 (negative space): the 计白当黑 ideal range is the context's effective void-ratio band.
 */
import { evaluateSemanticDimensions } from "../../../chinese-aesthetic/evaluator/semantic-evaluator";
import { EVAL_SUBJECT, negativeSpaceBand } from "../../../chinese-aesthetic/evaluator/decisions";
import { NoDecisionPackError, setDefaultDecisionPackProvider, withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionPack, MissingDecisionError } from "../../../skill-bridge/decision-pack";
import { defaultPackFor } from "../../support/skill-packs";
import type { SemanticEvaluationReport, SemanticJudgment } from "../../../chinese-aesthetic/matrix/semantic-dimensions";
import { PERIOD_CONTEXTS, ONE, decided, packLacking, reportOf, satisfyingMetrics, variantPacks, type ReportMetrics } from "./support/decision-fixtures";

/** Step across a threshold (semantic metrics are read unrounded; one step is enough). */
const STEP = 1e-3;
const ONE_LAYER = 1;

type Dimension = keyof SemanticEvaluationReport["dimensions"];
type Patch = Partial<ReportMetrics>;
interface Condition { satisfy: Patch; violate: Patch }
interface Spec {
  dimension: Dimension;
  subject: string;
  conditions: (pack: DecisionPack, t: (key: string) => number) => Condition[];
  /** the dimension's documented combination logic over the truth of its conditions */
  judge: (truth: boolean[], t: (key: string) => number) => SemanticJudgment;
}

const bothPass = (truth: boolean[]): SemanticJudgment => (truth.every(Boolean) ? "PASS" : truth.some(Boolean) ? "INCONCLUSIVE" : "FAIL");

const SPECS: Spec[] = [
  {
    dimension: "binzhuYirang", subject: EVAL_SUBJECT.binzhuYirang,
    conditions: (_p, t) => [
      { satisfy: { focalCenterOffset: t("max_focal_center_offset") - STEP }, violate: { focalCenterOffset: t("max_focal_center_offset") } },
      { satisfy: { dominanceSeparation: t("min_dominance_separation") + STEP }, violate: { dominanceSeparation: t("min_dominance_separation") } },
    ],
    judge: ([focal, separation], t) => {
      const strength = (focal ? t("focal_clear_weight") : 0) + (separation ? t("separation_clear_weight") : 0);
      return strength >= t("pass_evidence_strength") ? "PASS" : strength >= t("inconclusive_evidence_strength") ? "INCONCLUSIVE" : "FAIL";
    },
  },
  {
    dimension: "jibaiDanghei", subject: EVAL_SUBJECT.jibaiDanghei,
    conditions: (pack, t) => {
      const band = negativeSpaceBand(pack);
      return [
        { satisfy: { negativeSpaceRatio: band.min }, violate: { negativeSpaceRatio: band.min - STEP } },
        { satisfy: { emptyRegionContinuity: t("min_empty_region_continuity") }, violate: { emptyRegionContinuity: t("min_empty_region_continuity") - STEP } },
      ];
    },
    judge: bothPass,
  },
  {
    dimension: "xushiXiangsheng", subject: EVAL_SUBJECT.xushiXiangsheng,
    conditions: (_p, t) => [
      { satisfy: { negativeSpaceRatio: t("min_void_presence") + STEP }, violate: { negativeSpaceRatio: t("min_void_presence") } },
      { satisfy: { depthLayerCount: t("min_depth_layer_count") }, violate: { depthLayerCount: t("min_depth_layer_count") - ONE_LAYER } },
      { satisfy: { atmosphericDepth: t("min_atmospheric_depth") }, violate: { atmosphericDepth: t("min_atmospheric_depth") - STEP } },
    ],
    judge: ([voidPresent, depth, atmosphere]) => (voidPresent && depth && atmosphere ? "PASS" : voidPresent || depth ? "INCONCLUSIVE" : "FAIL"),
  },
  {
    dimension: "qiyunLiangguan", subject: EVAL_SUBJECT.qiyunLiangguan,
    conditions: (_p, t) => [
      { satisfy: { motionContinuity: t("min_motion_continuity") }, violate: { motionContinuity: t("min_motion_continuity") - STEP } },
      { satisfy: { opticalFlowCoherence: t("min_optical_flow_coherence") }, violate: { opticalFlowCoherence: t("min_optical_flow_coherence") - STEP } },
      { satisfy: { luminanceContinuity: t("min_luminance_continuity") }, violate: { luminanceContinuity: t("min_luminance_continuity") - STEP } },
    ],
    judge: (truth, t) => {
      const held = truth.filter(Boolean).length;
      return held >= t("pass_evidence_count") ? "PASS" : held >= t("inconclusive_evidence_count") ? "INCONCLUSIVE" : "FAIL";
    },
  },
  {
    dimension: "hanxuYuliubai", subject: EVAL_SUBJECT.hanxuYuliubai,
    conditions: (_p, t) => [
      { satisfy: { negativeSpaceRatio: t("min_void_presence") + STEP }, violate: { negativeSpaceRatio: t("min_void_presence") } },
      { satisfy: { accentIsolation: t("max_accent_isolation") - STEP }, violate: { accentIsolation: t("max_accent_isolation") } },
      { satisfy: { contrastRatio: t("min_contrast_ratio") }, violate: { contrastRatio: t("min_contrast_ratio") - STEP } },
    ],
    judge: ([voidPresent, accent, contrast]) => (voidPresent && accent && contrast ? "PASS" : voidPresent || accent ? "INCONCLUSIVE" : "FAIL"),
  },
  {
    dimension: "cengciYyuanjin", subject: EVAL_SUBJECT.cengciYuanjin,
    conditions: (_p, t) => [
      { satisfy: { depthLayerCount: t("min_depth_layer_count") }, violate: { depthLayerCount: t("min_depth_layer_count") - ONE_LAYER } },
      { satisfy: { layerSeparation: t("min_layer_separation") }, violate: { layerSeparation: t("min_layer_separation") - STEP } },
      { satisfy: { atmosphericDepth: t("min_atmospheric_depth") }, violate: { atmosphericDepth: t("min_atmospheric_depth") - STEP } },
    ],
    judge: ([layers, separation, atmosphere]) => (layers && separation && atmosphere ? "PASS" : layers || separation ? "INCONCLUSIVE" : "FAIL"),
  },
  {
    dimension: "xingshenGuanxi", subject: EVAL_SUBJECT.xingshenGuanxi,
    conditions: (_p, t) => [
      { satisfy: { focalCenterOffset: t("max_focal_center_offset") - STEP }, violate: { focalCenterOffset: t("max_focal_center_offset") } },
      { satisfy: { microDetailDistribution: t("min_micro_detail_distribution") }, violate: { microDetailDistribution: t("min_micro_detail_distribution") - STEP } },
    ],
    judge: bothPass,
  },
  {
    dimension: "shijianGanDongshi", subject: EVAL_SUBJECT.shijianDongshi,
    conditions: (_p, t) => [
      { satisfy: { motionContinuity: t("min_motion_continuity") }, violate: { motionContinuity: t("min_motion_continuity") - STEP } },
      { satisfy: { cameraMotionSmoothness: t("min_camera_motion_smoothness") }, violate: { cameraMotionSmoothness: t("min_camera_motion_smoothness") - STEP } },
      { satisfy: { opticalFlowCoherence: t("min_optical_flow_coherence") }, violate: { opticalFlowCoherence: t("min_optical_flow_coherence") - STEP } },
    ],
    judge: ([motion, camera, flow]) => (motion && (camera || flow) ? "PASS" : motion || camera ? "INCONCLUSIVE" : "FAIL"),
  },
];

const truthTable = (n: number): boolean[][] =>
  Array.from({ length: 2 ** n }, (_, bits) => Array.from({ length: n }, (_, i) => Boolean(bits & (1 << i))));

describe.each(variantPacks())("semantic evaluator follows the decision pack — $name", ({ pack }) => {
  const evaluate = (metrics: ReportMetrics) => withDecisionPack(pack, () => evaluateSemanticDimensions({ machineReport: reportOf(metrics), evaluatedAt: "t" }));

  test("a report that satisfies every condition passes all eight dimensions (fixture sanity)", () => {
    const report = evaluate(satisfyingMetrics(pack));
    for (const d of Object.values(report.dimensions)) expect(d.judgment).toBe("PASS");
    expect(report.passRate).toBe(ONE);
  });

  describe.each(SPECS)("$dimension", (spec) => {
    const t = (key: string) => decided(pack, spec.subject, key);
    const conditions = spec.conditions(pack, t);

    test.each(truthTable(conditions.length).map((truth) => ({ truth, label: truth.map((b) => (b ? "T" : "F")).join("") })))(
      "conditions $label: judgment follows the pack's thresholds",
      ({ truth }) => {
        const metrics = { ...satisfyingMetrics(pack) };
        for (const c of conditions) Object.assign(metrics, c.satisfy);
        truth.forEach((holds, i) => { if (!holds) Object.assign(metrics, conditions[i].violate); });
        expect(evaluate(metrics).dimensions[spec.dimension].judgment).toBe(spec.judge(truth, t));
      },
    );
  });

  describe("计白当黑 ideal range: the context's effective void-ratio band, closed at both ends (ADR-0001)", () => {
    const band = negativeSpaceBand(pack);
    const judgment = (ratio: number) => evaluate({ ...satisfyingMetrics(pack), negativeSpaceRatio: ratio }).dimensions.jibaiDanghei.judgment;

    test("inside the band (continuity satisfied) passes, outside either edge does not", () => {
      expect(judgment(band.min)).toBe("PASS");
      expect(judgment(band.max)).toBe("PASS");
      expect(judgment(band.min - STEP)).toBe("INCONCLUSIVE");
      expect(judgment(band.max + STEP)).toBe("INCONCLUSIVE");
    });
  });

  test("the semantic layer reads its thresholds only from EVALUATION_ASSERTION decisions and the void-ratio band", () => {
    const fresh = DecisionPack.from(pack.sheet); // same sheet, empty usage ledger
    withDecisionPack(fresh, () => evaluateSemanticDimensions({ machineReport: reportOf(satisfyingMetrics(fresh)), evaluatedAt: "t" }));
    const subjects = new Set(fresh.usage().map((u) => `${u.kind}:${u.subject}`));
    expect(subjects.size).toBeGreaterThan(0);
    for (const s of subjects) expect(s).toMatch(/^(EVALUATION_ASSERTION:EVAL_SEMANTIC_|PARAMETER_BAND:scene\.composition\.negativeSpaceRatio)/);
  });
});

describe("semantic evaluator is bound to the sheet: decisions are never defaulted", () => {
  const ctx = PERIOD_CONTEXTS.SONG;
  const report = () => reportOf(satisfyingMetrics(defaultPackFor("SONG")));

  test("no decision pack in scope: the evaluator refuses (fail closed)", () => {
    const r = report();
    setDefaultDecisionPackProvider(null);
    try {
      expect(() => evaluateSemanticDimensions({ machineReport: r, evaluatedAt: "t" })).toThrow(NoDecisionPackError);
    } finally {
      // restore the process-wide default exactly as tests/setup/pack-setup.ts installs it
      setDefaultDecisionPackProvider((period) => {
        if (period === undefined) return defaultPackFor("SONG");
        return period === "TANG" || period === "SONG" || period === "MING" ? defaultPackFor(period) : undefined;
      });
    }
  });

  test("a sheet without one dimension's decision is refused, not defaulted", () => {
    const pack = packLacking(ctx, (s) => {
      s.constraints = s.constraints.filter((c) => !(c.kind === "EVALUATION_ASSERTION" && c.payload.subject === EVAL_SUBJECT.hanxuYuliubai));
    });
    expect(() => withDecisionPack(pack, () => evaluateSemanticDimensions({ machineReport: report(), evaluatedAt: "t" }))).toThrow(MissingDecisionError);
  });

  test("a decision that lacks one key is refused, not defaulted", () => {
    const pack = packLacking(ctx, (s) => {
      for (const c of s.constraints) {
        if (c.kind === "EVALUATION_ASSERTION" && c.payload.subject === EVAL_SUBJECT.qiyunLiangguan) delete c.payload.params.pass_evidence_count;
      }
    });
    expect(() => withDecisionPack(pack, () => evaluateSemanticDimensions({ machineReport: report(), evaluatedAt: "t" }))).toThrow(MissingDecisionError);
  });
});
