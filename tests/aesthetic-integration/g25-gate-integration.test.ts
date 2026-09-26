/**
 * g25-gate-integration.test.ts
 *
 * End-to-end integration coverage for the G2.5 AestheticGate as wired into the
 * REAL `AestheticPipelineRunner`. Every P0 anti-cliche rule gets two cases:
 *
 *   - a compliant sheet that flows through G1→G2→G2.5→G3 and ends in SUCCESS, and
 *   - a violating sheet that reaches a G2.5 TERMINAL_HALT carrying the ruleId.
 *
 * The violating sheets are fed to `AestheticPipelineRunner.execute()` — i.e.
 * the IR under test is the real post-G2 `ValidatedDesignIR` produced by the
 * compiler-core PatchEngine, not a hand-built fixture.
 *
 * Trigger surface (how each rule is driven from the sheet):
 *   - AC-COLOR-001/002/003: palette hex swatches (G2 never rewrites /color/*).
 *   - AC-LAYOUT-001: spatial.symmetry override pinned into the G2-safe band
 *     [0.85, 0.9] so G2 leaves it untouched (focalPoint is always [0.5,0.5]).
 *   - AC-LAYOUT-002: see note below — verified directly on a post-G2 IR.
 *   - AC-TYPE-001/002: sheet.typographyFamilies forwarded as gate context.
 *
 * NOTE on AC-LAYOUT-002 (defense-in-depth backstop):
 *   G2 grammar ALWAYS rescues a stuffed composition — every negative-space
 *   ratio below ~0.42 is lifted to ~0.45–0.50 by the CA-RULE-01/12/33 and
 *   ANTI-AI-02 patches. There is therefore NO sheet input whose post-G2
 *   negative-space ratio survives below the 0.22 hard floor through the real
 *   pipeline. The rule exists as a backstop for pathological IR G2 cannot fix;
 *   we verify it fires by mutating a REAL post-G2 validatedIR (produced by the
 *   pipeline) down to 0.15 and running the gate directly.
 */

import { AestheticPipelineRunner } from "../../aesthetic-integration/aesthetic-pipeline-runner";
import type {
  AestheticConstraintSheet,
  SheetColorEntry,
} from "../../aesthetic-integration/aesthetic-sheet-adapter";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";

const CAPTURED_AT = "2026-09-27T00:00:00.000Z";

function fullCaps(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
  };
}

/** Build a compliant baseline sheet; override palette roles / spatial / typography as needed. */
function makeSheet(overrides: Partial<AestheticConstraintSheet> = {}): AestheticConstraintSheet {
  return {
    sheetId: "g25-base",
    designBrief: "G2.5 integration baseline",
    mood: "song-elegant",
    attributionStatement: "x",
    structuralDimensions: [{ id: "void-solid", weight: "primary" }],
    colorSystem: {
      palette: [
        { role: "dominant", name: "Moon-White", hex: "#EDEAE4", areaPct: 0.65, usage: "bg" },
        { role: "secondary", name: "Dai-Qing", hex: "#2C3E50", areaPct: 0.25, usage: "text" },
        { role: "accent", name: "Dull-Gold", hex: "#B8860B", areaPct: 0.05, usage: "accent" },
        { role: "shadow", name: "Mo-Dai", hex: "#1A1A2E", areaPct: 0.05, usage: "shadow" },
      ],
      saturationMax: 0.5,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
    },
    proportion: { baseModulePx: 8, spacingScale: [1, 2, 3], voidSolidRatio: "7:5", focalPointsMax: 1 },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3 },
    lighting: { primarySource: "skylight", timeSetting: "cloudy", lightDarkRatio: "3:7" },
    motion: { prototypes: ["light"], durationMs: [1500, 8000], entryMode: "emerge", hardFail: [] },
    antiCliche: { scanned: true, hardFailHits: [], forbidden: [] },
    violations: [],
    score: 88,
    ...overrides,
  };
}

/** Map a single palette role's hex. */
function withPalette(
  base: AestheticConstraintSheet,
  changes: Partial<Record<SheetColorEntry["role"], string>>,
): AestheticConstraintSheet {
  const palette = base.colorSystem.palette.map((c) =>
    changes[c.role] ? { ...c, hex: changes[c.role]! } : c,
  );
  return { ...base, colorSystem: { ...base.colorSystem, palette } };
}

const runner = new AestheticPipelineRunner();

function run(sheet: AestheticConstraintSheet, testCaseId: string = "g25") {
  return runner.execute(sheet, fullCaps(), {
    capturedAt: CAPTURED_AT,
    testCaseId,
    aestheticGateEnabled: true,
  });
}

/** Assert a G2.5 halt carrying the expected ruleId. */
function expectG25Halt(result: ReturnType<typeof run>, ruleId: string): void {
  expect(result.pipeline.status).toBe("TERMINAL_HALT");
  if (result.pipeline.status !== "TERMINAL_HALT") return;
  expect(result.pipeline.haltStage).toBe("G2.5_AESTHETIC_GATE");
  if (result.pipeline.haltStage !== "G2.5_AESTHETIC_GATE") return;
  expect(result.pipeline.evaluation.status).toBe("FAIL");
  expect(result.pipeline.evaluation.tierExecuted).toBe("NONE");
  expect(result.pipeline.evaluation.executedAt).toBe(CAPTURED_AT);
  // The vetoed rule id appears in the structured gate result AND in diagnostics.
  expect(result.pipeline.aestheticGate.violations.map((v) => v.ruleId)).toContain(ruleId);
  expect(result.pipeline.evaluation.diagnostics?.join("\n")).toContain(ruleId);
  // Provenance preserves the chain up to the post-G2 scene; no execution plan.
  expect(result.pipeline.evaluation.provenance.hashChain.inputHash).toBeTruthy();
  expect(result.pipeline.evaluation.provenance.hashChain.rawIRHash).toBeTruthy();
  expect(result.pipeline.evaluation.provenance.hashChain.validatedIRHash).toBeTruthy();
  expect("executionPlan" in result.pipeline).toBe(false);
}

// ── Category 1: Color cliches ───────────────────────────────────────────────

describe("AC-COLOR-001 forbidden palette", () => {
  test("compliance: muted moon-white dominant passes", () => {
    const r = run(makeSheet(), "c001-ok");
    expect(r.pipeline.status).toBe("SUCCESS");
  });

  test("violation: dominant #FF0000 → G2.5 TERMINAL_HALT", () => {
    const sheet = withPalette(makeSheet({ sheetId: "c001-bad" }), { dominant: "#FF0000" });
    expectG25Halt(run(sheet, "c001-bad"), "AC-COLOR-001");
  });
});

describe("AC-COLOR-002 pure red + pure green", () => {
  test("compliance: muted analogous palette passes", () => {
    const r = run(makeSheet(), "c002-ok");
    expect(r.pipeline.status).toBe("SUCCESS");
  });

  test("violation: dominant #FF0000 + secondary #00FF00 → G2.5 TERMINAL_HALT", () => {
    const sheet = withPalette(makeSheet({ sheetId: "c002-bad" }), {
      dominant: "#FF0000",
      secondary: "#00FF00",
    });
    expectG25Halt(run(sheet, "c002-bad"), "AC-COLOR-002");
  });
});

describe("AC-COLOR-003 over-saturated dominant", () => {
  test("compliance: low-saturation dominant passes", () => {
    const r = run(makeSheet(), "c003-ok");
    expect(r.pipeline.status).toBe("SUCCESS");
  });

  test("violation: saturated #FF3B30 dominant → G2.5 TERMINAL_HALT", () => {
    const sheet = withPalette(makeSheet({ sheetId: "c003-bad" }), { dominant: "#FF3B30" });
    const r = run(sheet, "c003-bad");
    expectG25Halt(r, "AC-COLOR-003");
    // #FF3B30 is NOT on the forbidden list, so only the saturation rule fires.
    expect(r.pipeline.status).toBe("TERMINAL_HALT");
    if (r.pipeline.status !== "TERMINAL_HALT" || r.pipeline.haltStage !== "G2.5_AESTHETIC_GATE") return;
    expect(r.pipeline.aestheticGate.violations.map((v) => v.ruleId)).toEqual(["AC-COLOR-003"]);
  });
});

// ── Category 2: Layout cliches ─────────────────────────────────────────────

describe("AC-LAYOUT-001 dead-centered stacking", () => {
  test("compliance: post-G2 symmetry 0.82 (strict axis, G2-clamped) passes", () => {
    // strict axis → raw symmetry 1.0 → G2 clamps to 0.82, below the 0.85 floor.
    const r = run(makeSheet({ sheetId: "l001-ok" }), "l001-ok");
    expect(r.pipeline.status).toBe("SUCCESS");
  });

  test("violation: focalPoint [0.5,0.5] + symmetry 0.88 → G2.5 TERMINAL_HALT", () => {
    // Pin symmetry into the G2-untouched band [0.85, 0.9] so it survives G2.
    const sheet = makeSheet({
      sheetId: "l001-bad",
      spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3, symmetry: 0.88 },
    });
    expectG25Halt(run(sheet, "l001-bad"), "AC-LAYOUT-001");
  });
});

describe("AC-LAYOUT-002 negative-space suffocation (defense-in-depth)", () => {
  test("compliance: G2-rescued stuffed composition still passes (grammar is the first line of defense)", () => {
    // voidSolidRatio 1:9 → nsr 0.11, but G2 lifts it to ~0.50 → gate passes.
    const sheet = makeSheet({
      sheetId: "l002-ok",
      proportion: { baseModulePx: 8, spacingScale: [1], voidSolidRatio: "1:9", focalPointsMax: 1 },
    });
    const r = run(sheet, "l002-ok");
    expect(r.pipeline.status).toBe("SUCCESS");
  });

  test("violation: a post-G2 nsr of 0.15 (< 0.22 floor) IS vetoed when G2 cannot rescue it", () => {
    // Produce a REAL post-G2 validatedIR through the pipeline, then push its
    // negative-space ratio below the hard floor (the backstop case G2 misses).
    const base = run(makeSheet({ sheetId: "l002-bad" }), "l002-bad");
    expect(base.pipeline.status).toBe("SUCCESS");
    if (base.pipeline.status !== "SUCCESS") return;

    const ir = base.pipeline.validatedIR;
    ir.validated.composition.negativeSpaceRatio.value = 0.15;

    const result = runner.getAestheticGate().check(ir);
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain("AC-LAYOUT-002");
  });
});

// ── Category 3: Typography cliches ──────────────────────────────────────────

describe("AC-TYPE-001 too many font families", () => {
  test("compliance: 2 families pass", () => {
    const sheet = makeSheet({ sheetId: "t001-ok", typographyFamilies: ["Songti SC", "Hei SC"] });
    expect(run(sheet, "t001-ok").pipeline.status).toBe("SUCCESS");
  });

  test("violation: 4 families → G2.5 TERMINAL_HALT", () => {
    const sheet = makeSheet({
      sheetId: "t001-bad",
      typographyFamilies: ["Song", "Hei", "Kai", "Western-Grotesk"],
    });
    expectG25Halt(run(sheet, "t001-bad"), "AC-TYPE-001");
  });
});

describe("AC-TYPE-002 calligraphy/brush cliche", () => {
  test("compliance: serif + sans passes", () => {
    const sheet = makeSheet({ sheetId: "t002-ok", typographyFamilies: ["Songti SC", "Hei Sans"] });
    expect(run(sheet, "t002-ok").pipeline.status).toBe("SUCCESS");
  });

  test("violation: 'Maobi Brush Script' family → G2.5 TERMINAL_HALT", () => {
    const sheet = makeSheet({
      sheetId: "t002-bad",
      typographyFamilies: ["Maobi Brush Script", "Song Serif"],
    });
    expectG25Halt(run(sheet, "t002-bad"), "AC-TYPE-002");
  });
});

// ── Toggle: gate can be disabled ───────────────────────────────────────────

describe("aestheticGateEnabled toggle", () => {
  test("aestheticGateEnabled=false lets an otherwise-vetoed design through as SUCCESS", () => {
    const bad = withPalette(makeSheet({ sheetId: "tgl" }), { dominant: "#FF0000" });
    const r = runner.execute(bad, fullCaps(), {
      capturedAt: CAPTURED_AT,
      testCaseId: "tgl",
      aestheticGateEnabled: false,
    });
    expect(r.pipeline.status).toBe("SUCCESS");
  });
});
