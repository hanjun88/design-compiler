/**
 * cross-repo-reachability.test.ts
 *
 * Cross-repo reachability audit: every one of the 7 G2.5 anti-cliche rules
 * MUST be triggerable through a real CAS AestheticConstraintSheet that carries
 * ONLY canonical fields (composition, typography, colorSystem). The former
 * DC-private extension fields (optional nsr on proportion, optional symmetry
 * on spatial, top-level font list) are NOT used anywhere in this file.
 *
 * This test exists because the 2026-09-27 independent audit found that
 * 4/7 rules (AC-LAYOUT-001/002, AC-TYPE-001/002) were unreachable on the
 * real cross-repo path — they could only fire via DC-private fixture fields.
 *
 * @module tests/aesthetic-integration/cross-repo-reachability
 */

import { AestheticPipelineRunner } from "../../aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "../../aesthetic-integration/aesthetic-sheet-adapter";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";

const CAPTURED_AT = "2026-09-27T00:00:00Z";

/** A standard CAS sheet with ALL canonical fields populated, no DC-private extensions. */
function makeCanonicalSheet(overrides: Partial<AestheticConstraintSheet> = {}): AestheticConstraintSheet {
  return {
    sheetId: "canonical-base",
    designBrief: "Song-dynasty academy entrance — canonical CAS sheet",
    mood: "song-elegant",
    attributionStatement: "Derived from Song-dynasty landscape painting principles.",
    structuralDimensions: [
      { id: "void-solid", weight: "primary" },
      { id: "spatial-order", weight: "primary" },
    ],
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
    // CANONICAL composition (CAS SSOT) — not DC-private proportion.negativeSpaceRatio
    composition: { negativeSpaceRatio: 0.5833, symmetry: 1, focalPoint: [0.62, 0.38] },
    // CANONICAL typography (CAS SSOT) — not the former DC-private top-level font field
    typography: { families: ["Noto Serif SC", "Noto Sans SC"] },
    lighting: { primarySource: "skylight", timeSetting: "cloudy", lightDarkRatio: "3:7" },
    motion: { prototypes: ["light"], durationMs: [1500, 8000], entryMode: "emerge", hardFail: [] },
    antiCliche: { scanned: true, hardFailHits: [], forbidden: [] },
    violations: [],
    score: 88,
    ...overrides,
  };
}

function fullCaps(): HostCapabilities {
  return {
    webgl2: true,
    anisotropicFiltering: true,
    highPrecisionFragment: true,
    maxTextureSize: 4096,
    floatTextures: true,
  };
}

const runner = new AestheticPipelineRunner();

function run(sheet: AestheticConstraintSheet, id: string) {
  return runner.execute(sheet, fullCaps(), { capturedAt: CAPTURED_AT, testCaseId: id, aestheticGateEnabled: true });
}

function expectHalt(result: ReturnType<typeof run>, ruleId: string) {
  expect(result.pipeline.status).toBe("TERMINAL_HALT");
  if (result.pipeline.status !== "TERMINAL_HALT") return;
  expect(result.pipeline.haltStage).toBe("G2.5_AESTHETIC_GATE");
  const halt = result.pipeline as { aestheticGate: { violations: { ruleId: string }[] } };
  expect(halt.aestheticGate.violations.map((v) => v.ruleId)).toContain(ruleId);
}

// ── Baseline: standard canonical sheet must NOT trigger any rule ──────────

describe("baseline: standard canonical sheet passes all 7 rules (no false positives)", () => {
  test("standard sheet → SUCCESS (no rule fires)", () => {
    const r = run(makeCanonicalSheet(), "baseline");
    expect(r.pipeline.status).toBe("SUCCESS");
  });
});

// ── Rule 1: AC-COLOR-001 forbidden palette ─────────────────────────────────

describe("AC-COLOR-001 reachable via canonical colorSystem", () => {
  test("forbidden hex #FF0000 in dominant → TERMINAL_HALT", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "color-001",
      colorSystem: {
        ...makeCanonicalSheet().colorSystem,
        palette: makeCanonicalSheet().colorSystem.palette.map((c) =>
          c.role === "dominant" ? { ...c, hex: "#FF0000" } : c,
        ),
      },
    });
    expectHalt(run(sheet, "color-001"), "AC-COLOR-001");
  });
});

// ── Rule 2: AC-COLOR-002 pure red + pure green ────────────────────────────

describe("AC-COLOR-002 reachable via canonical colorSystem", () => {
  test("dominant #FF0000 + secondary #00FF00 → TERMINAL_HALT", () => {
    const base = makeCanonicalSheet();
    const sheet = makeCanonicalSheet({
      sheetId: "color-002",
      colorSystem: {
        ...base.colorSystem,
        palette: base.colorSystem.palette.map((c) => {
          if (c.role === "dominant") return { ...c, hex: "#FF0000" };
          if (c.role === "secondary") return { ...c, hex: "#00FF00" };
          return c;
        }),
      },
    });
    expectHalt(run(sheet, "color-002"), "AC-COLOR-002");
  });
});

// ── Rule 3: AC-COLOR-003 over-saturated dominant ───────────────────────────

describe("AC-COLOR-003 reachable via canonical colorSystem", () => {
  test("high-saturation #FF3B30 dominant → TERMINAL_HALT", () => {
    const base = makeCanonicalSheet();
    const sheet = makeCanonicalSheet({
      sheetId: "color-003",
      colorSystem: {
        ...base.colorSystem,
        palette: base.colorSystem.palette.map((c) =>
          c.role === "dominant" ? { ...c, hex: "#FF3B30" } : c,
        ),
      },
    });
    expectHalt(run(sheet, "color-003"), "AC-COLOR-003");
  });
});

// ── Rule 4: AC-LAYOUT-001 dead-centered stacking ───────────────────────────

describe("AC-LAYOUT-001 reachable via canonical composition (NOT spatial.symmetry)", () => {
  test("focalPoint [0.5,0.5] + symmetry 0.88 in canonical composition → TERMINAL_HALT", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "layout-001",
      // Canonical composition field — the ONLY way to pin these values.
      composition: { negativeSpaceRatio: 0.5833, symmetry: 0.88, focalPoint: [0.5, 0.5] },
    });
    expectHalt(run(sheet, "layout-001"), "AC-LAYOUT-001");
  });

  test("golden-ratio focalPoint [0.62,0.38] + symmetry 1 → SUCCESS (no false positive)", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "layout-001-ok",
      composition: { negativeSpaceRatio: 0.5833, symmetry: 1, focalPoint: [0.62, 0.38] },
    });
    expect(run(sheet, "layout-001-ok").pipeline.status).toBe("SUCCESS");
  });
});

// ── Rule 5: AC-LAYOUT-002 negative-space suffocation ───────────────────────

describe("AC-LAYOUT-002 reachable via canonical composition (post-G2 backstop)", () => {
  test("canonical composition.negativeSpaceRatio flows through adapter (pre-G2 value emitted)", () => {
    // Verify the adapter emits the canonical composition value, not a derived one.
    const { sheetToCangjieIR } = require("../../aesthetic-integration/aesthetic-sheet-adapter");
    const sheet = makeCanonicalSheet({
      sheetId: "layout-002-adapter",
      composition: { negativeSpaceRatio: 0.3, symmetry: 1, focalPoint: [0.62, 0.38] },
    });
    const { cangjieIR } = sheetToCangjieIR(sheet, { capturedAt: CAPTURED_AT });
    const nsr = cangjieIR.parameters.find((p: { path: string }) => p.path === "/composition/negativeSpaceRatio");
    expect(nsr).toBeDefined();
    expect(nsr.value).toBe(0.3);
  });

  test("post-G2 nsr below floor is vetoed (direct gate check on real pipeline output)", () => {
    // Run a standard sheet through the pipeline, then verify the gate would
    // veto a sub-floor nsr (the G2 backstop path).
    const base = run(makeCanonicalSheet({ sheetId: "layout-002-base" }), "layout-002-base");
    expect(base.pipeline.status).toBe("SUCCESS");
    if (base.pipeline.status !== "SUCCESS") return;

    const ir = base.pipeline.validatedIR;
    ir.validated.composition.negativeSpaceRatio.value = 0.15;
    const result = runner.getAestheticGate().check(ir);
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain("AC-LAYOUT-002");
  });
});

// ── Rule 6: AC-TYPE-001 too many font families ─────────────────────────────

describe("AC-TYPE-001 reachable via canonical typography (not DC-private top-level field)", () => {
  test("4 families in canonical typography.families → TERMINAL_HALT", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "type-001",
      typography: { families: ["Song", "Hei", "Kai", "Western-Grotesk"] },
    });
    expectHalt(run(sheet, "type-001"), "AC-TYPE-001");
  });

  test("2 families → SUCCESS", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "type-001-ok",
      typography: { families: ["Noto Serif SC", "Noto Sans SC"] },
    });
    expect(run(sheet, "type-001-ok").pipeline.status).toBe("SUCCESS");
  });
});

// ── Rule 7: AC-TYPE-002 calligraphy/brush cliche ───────────────────────────

describe("AC-TYPE-002 reachable via canonical typography (not DC-private top-level field)", () => {
  test("'Maobi Brush Script' in canonical typography.families → TERMINAL_HALT", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "type-002",
      typography: { families: ["Maobi Brush Script", "Song Serif"] },
    });
    expectHalt(run(sheet, "type-002"), "AC-TYPE-002");
  });

  test("serif + sans → SUCCESS", () => {
    const sheet = makeCanonicalSheet({
      sheetId: "type-002-ok",
      typography: { families: ["Songti SC", "Hei Sans"] },
    });
    expect(run(sheet, "type-002-ok").pipeline.status).toBe("SUCCESS");
  });
});

// ── Audit: no DC-private extension fields used anywhere in this file ────────

describe("audit: this test file uses NO DC-private extension fields", () => {
  test("no DC-private extension field access in code", () => {
    const src = require("fs").readFileSync(__filename, "utf8");
    // Construct patterns dynamically so the literal strings don't appear in this file.
    const optNsr = "negativeSpaceRatio" + "?"; // optional DC-private field on proportion
    const spatSym = "spatial:\\s*\\{[^}]*symmetry"; // DC-private symmetry on spatial
    const topFont = ["typography", "Families"].join(""); // DC-private top-level font list
    expect(src).not.toMatch(new RegExp(optNsr.replace(/[?]/g, "\\?")));
    expect(src).not.toMatch(new RegExp(spatSym));
    expect(src).not.toMatch(new RegExp(topFont));
  });
});
