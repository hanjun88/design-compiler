/**
 * Human-audit ledger — the "ideal range" it records is the period band of the active DecisionPack.
 *
 * The ledger used to carry its own copy of the SONG prior (plus three more ranges nothing ever read).
 * Under ADR-0001 the ideal void range is the period band of the context: this suite derives every
 * expectation from the pack, for every period.
 */
import { generateHumanAuditLedger, verifyHumanAuditLedger } from "../../../chinese-aesthetic/scene-pack/evidence/human-audit-ledger";
import type { ProfessionalScenePack } from "../../../chinese-aesthetic/scene-pack/types";
import { NEGATIVE_SPACE_PARAMETER } from "../../../chinese-aesthetic/evaluator/decisions";
import { NoDecisionPackError, setDefaultDecisionPackProvider, withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, MissingDecisionError } from "../../../skill-bridge/decision-pack";
import { defaultPackFor } from "../../support/skill-packs";
import { PERIOD_CONTEXTS, packLacking } from "../evaluator/support/decision-fixtures";

const STEP = 1e-3;
const PERIODS = ["TANG", "SONG", "MING"] as const;
const scene = { sceneId: "scene:human-audit-test", generatedAt: "2026-09-16T00:00:00.000Z" } as unknown as ProfessionalScenePack;

describe.each(PERIODS)("human-audit ledger ideal range follows the %s period band", (period) => {
  const pack = defaultPackFor(period);
  const band = pack.periodBand(NEGATIVE_SPACE_PARAMETER)!;
  const generate = (options: Parameters<typeof generateHumanAuditLedger>[1] = {}) => withDecisionPack(pack, () => generateHumanAuditLedger(scene, options));

  test("idealRange is exactly the period band", () => {
    expect(generate().negativeSpaceRatio.idealRange).toEqual({ min: band.min, max: band.max });
  });

  test("withinIdealRange is a closed-interval test against that band", () => {
    const within = (ratio: number) => generate({ measuredNegativeSpaceRatio: ratio }).negativeSpaceRatio.withinIdealRange;
    expect(within(band.min)).toBe(true);
    expect(within(band.max)).toBe(true);
    expect(within((band.min + band.max) / 2)).toBe(true);
    expect(within(band.min - STEP)).toBe(false);
    expect(within(band.max + STEP)).toBe(false);
  });

  test("the ledger stays self-consistent and deterministic", () => {
    const a = generate({ measuredNegativeSpaceRatio: band.min });
    const b = generate({ measuredNegativeSpaceRatio: band.min });
    expect(a).toEqual(b);
    expect(verifyHumanAuditLedger(a)).toEqual({ valid: true, violations: [] });
  });

  test("a paradigm naming a sheet period must be the pack's period; other paradigms leave the choice to the pack", () => {
    expect(generate({ aestheticParadigm: period }).aestheticParadigm).toBe(period);
    expect(generate({ aestheticParadigm: "CONTEMPORARY_CYBER_CHINESE" }).negativeSpaceRatio.idealRange).toEqual({ min: band.min, max: band.max });
    for (const other of PERIODS.filter((p) => p !== period)) {
      expect(() => generate({ aestheticParadigm: other })).toThrow(DecisionContextMismatchError);
    }
  });

  test("audit entry notes carry no copy of any range (the numbers live only in the pack and in idealRange)", () => {
    for (const entry of generate().auditEntries) expect(entry.note).not.toMatch(/\d\.\d/);
  });

  test("the entries that carry an ideal range are judged against the period bands of the pack", () => {
    const ledger = generate();
    const axial = pack.periodBand("scene.composition.axialSymmetry")!;
    const inRange = (value: number, b: { min: number; max: number }) => value >= b.min && value <= b.max;
    const entry = (dimension: string) => ledger.auditEntries.find((e) => e.dimension === dimension)!;

    const negativeSpace = entry("negative-space");
    expect(negativeSpace.verdict).toBe(inRange(negativeSpace.measuredValue, band) ? "PASS" : "FLAG");
    // the entry and the structured record use the same band: they cannot contradict each other
    expect(ledger.negativeSpaceRatio.withinIdealRange).toBe(negativeSpace.verdict === "PASS");

    const composition = entry("composition-order");
    expect(composition.verdict).toBe(inRange(composition.measuredValue, axial) ? "PASS" : "FLAG");
  });
});

describe("human-audit ledger is bound to the sheet: nothing is defaulted", () => {
  test("no decision pack in scope: generation is refused (fail closed)", () => {
    setDefaultDecisionPackProvider(null);
    try {
      expect(() => generateHumanAuditLedger(scene)).toThrow(NoDecisionPackError);
    } finally {
      // restore the process-wide default exactly as tests/setup/pack-setup.ts installs it
      setDefaultDecisionPackProvider((p) => {
        if (p === undefined) return defaultPackFor("SONG");
        return p === "TANG" || p === "SONG" || p === "MING" ? defaultPackFor(p) : undefined;
      });
    }
  });

  test("a sheet without the void-ratio period band is refused, not defaulted", () => {
    const pack = packLacking(PERIOD_CONTEXTS.SONG, (s) => {
      s.constraints = s.constraints.filter((c) => !(c.kind === "PARAMETER_BAND" && c.payload.semantics === "PERIOD_BAND" && c.payload.parameter === NEGATIVE_SPACE_PARAMETER));
    });
    expect(() => withDecisionPack(pack, () => generateHumanAuditLedger(scene))).toThrow(MissingDecisionError);
  });
});
