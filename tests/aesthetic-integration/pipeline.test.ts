/**
 * aesthetic-integration pipeline tests
 *
 * Covers 5 end-to-end scenarios:
 *   1. Normal flow: valid sheet → SUCCESS through G1→G2→G3
 *   2. G1 interception: low-confidence required param → TERMINAL_HALT at G1
 *   3. G2 rule trigger: negative space ratio < 0.35 → grammar patches applied
 *   4. G3 degradation: missing preferred capability → DEGRADED tier
 *   5. Complete hashChain: SUCCESS output has all 4 hashes, chain is consistent
 */

import { AestheticPipelineRunner } from "../../aesthetic-integration/aesthetic-pipeline-runner";
import { sheetToCangjieIR } from "../../aesthetic-integration/aesthetic-sheet-adapter";
import type { AestheticConstraintSheet } from "../../aesthetic-integration/aesthetic-sheet-adapter";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import { HashPolicy } from "../../compiler-core/hash-policy";

// ── Test fixtures ──────────────────────────────────────────────────────────

const DETERMINISTIC_CAPTURED_AT = "2026-09-26T00:00:00.000Z";

/**
 * Build a valid AestheticConstraintSheet for testing.
 * Mirrors the CAS fixture shape; independently defined in DC.
 */
function makeSheet(overrides: Partial<AestheticConstraintSheet> = {}): AestheticConstraintSheet {
  return {
    sheetId: "test-sheet-01",
    designBrief: "Test: Song-dynasty academy entrance",
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
    proportion: {
      baseModulePx: 8,
      spacingScale: [1, 2, 3, 4, 6, 8],
      voidSolidRatio: "7:5",
      focalPointsMax: 1,
    },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3 },
    lighting: {
      primarySource: "skylight",
      timeSetting: "cloudy",
      lightDarkRatio: "3:7",
    },
    motion: {
      prototypes: ["light", "cloud"],
      durationMs: [1500, 8000],
      entryMode: "emerge",
      hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true,
      hardFailHits: [],
      forbidden: ["guochao-sticker"],
    },
    violations: [],
    score: 88,
    ...overrides,
  };
}

/** Full host capabilities for TIER_A acceptance. */
function fullCaps(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
  };
}

const runner = new AestheticPipelineRunner();

// ── Test 1: Normal flow ────────────────────────────────────────────────────

describe("Aesthetic Pipeline — Integration", () => {
  test("TC-AES-01: valid sheet flows through G1→G2→G3 with SUCCESS", () => {
    const sheet = makeSheet();
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-01",
    });

    // Pipeline succeeded
    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    // Normalization passed
    expect(result.normalization.status).toBe("PASS");
    expect(result.normalization.metadata.mappedParameters).toBeGreaterThan(0);

    // Execution plan is produced
    expect(result.pipeline.executionPlan).toBeDefined();
    expect(result.pipeline.executionPlan.negotiation.resolutionStatus).toBe("ACCEPTED");
    expect(result.pipeline.executionPlan.negotiation.selectedTier).toBe("TIER_A");

    // Scene bindings reflect the sheet's aesthetic values
    const cameraRig = result.pipeline.executionPlan.runtimePlan.sceneBindings.cameraRig;
    expect(cameraRig.params.fov).toBe(35);

    // Aesthetic score preserved as metadata
    expect(result.aestheticScore).toBe(88);
  });

  // ── Test 2: G1 interception ──────────────────────────────────────────────

  test("TC-AES-02: low-confidence required parameter triggers G1 BLOCKED_DATA", () => {
    const sheet = makeSheet({ sheetId: "test-g1-block" });
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-02",
      // Force /color/dominant (a required path) below the G1 confidence floor (0.6)
      confidenceOverrides: { "/color/dominant": 0.4 },
    });

    expect(result.pipeline.status).toBe("TERMINAL_HALT");
    if (result.pipeline.status !== "TERMINAL_HALT") return;
    expect(result.pipeline.haltStage).toBe("G1_DATA_GATE");
    expect(result.pipeline.evaluation.status).toBe("BLOCKED_DATA");
    expect(result.pipeline.evaluation.tierExecuted).toBe("NONE");
    // No metrics/gates — G1 halted before G2/G3
    expect(result.pipeline.evaluation.metrics).toBeUndefined();
    expect(result.pipeline.evaluation.gates).toBeUndefined();
  });

  // ── Test 3: G2 grammar rule trigger ──────────────────────────────────────

  test("TC-AES-03: low negative-space ratio triggers G2 grammar patches", () => {
    // voidSolidRatio "3:7" → negativeSpaceRatio = 3/10 = 0.30
    // This triggers CA-RULE-01-XUSHI (value < 0.35 → replace 0.45)
    // and ANTI-AI-02 (value < 0.40 → replace 0.48)
    const sheet = makeSheet({
      sheetId: "test-g2-trigger",
      proportion: {
        baseModulePx: 8,
        spacingScale: [1, 2, 3],
        voidSolidRatio: "3:7",
        focalPointsMax: 1,
      },
    });

    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-03",
    });

    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    // G2 must have applied at least one patch
    expect(result.pipeline.validatedIR.auditReport.mutationsApplied).toBeGreaterThan(0);
    expect(result.pipeline.validatedIR.patches.length).toBeGreaterThan(0);

    // The negative space ratio should have been mutated by grammar rules
    // Original value was 0.30 (from "3:7"); G2 patched it to a compliant value.
    const nsr = result.pipeline.validatedIR.validated.composition.negativeSpaceRatio;
    expect(nsr.status).toBe("grammar-derived");
    expect(nsr.source).toBe("grammar-rule");
    // The grammar engine overrode the sub-threshold 0.30 to a compliant value
    expect(nsr.value).not.toBe(0.30);
    expect(typeof nsr.value).toBe("number");
  });

  // ── Test 4: G3 degradation ───────────────────────────────────────────────

  test("TC-AES-04: missing highPrecisionFragment degrades to TIER_C", () => {
    const sheet = makeSheet({ sheetId: "test-g3-degrade" });
    const degradedCaps: HostCapabilities = {
      webgl2: true,
      floatTextures: true,
      // highPrecisionFragment omitted → missing
      anisotropyExtension: true,
    };

    const result = runner.execute(sheet, degradedCaps, {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-04",
    });

    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    // Should be DEGRADED to TIER_C
    expect(result.pipeline.executionPlan.negotiation.resolutionStatus).toBe("DEGRADED");
    expect(result.pipeline.executionPlan.negotiation.selectedTier).toBe("TIER_C");
    expect(result.pipeline.executionPlan.runtimePlan.pipeline.rendererType).toBe("CSS3D");

    // A downgrade record should exist
    expect(result.pipeline.executionPlan.negotiation.downgrades.length).toBeGreaterThan(0);
    const hpDowngrade = result.pipeline.executionPlan.negotiation.downgrades.find(
      (d) => d.feature === "highPrecisionFragment",
    );
    expect(hpDowngrade).toBeDefined();
  });

  // ── Test 5: Complete hashChain verification ──────────────────────────────

  test("TC-AES-05: SUCCESS output has complete, consistent 4-stage hash chain", () => {
    const sheet = makeSheet({ sheetId: "test-hashchain" });
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-05",
    });

    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    const { hashChain, rawIR, validatedIR, executionPlan } = result.pipeline;

    // All four hashes present and non-empty
    expect(hashChain.inputHash).toBeTruthy();
    expect(hashChain.rawIRHash).toBeTruthy();
    expect(hashChain.validatedIRHash).toBeTruthy();
    expect(hashChain.executionPlanHash).toBeTruthy();

    // inputHash matches the Cangjie semantic hash that propagated through normalization
    expect(hashChain.inputHash).toBe(rawIR.provenance.inputHash);

    // rawIRHash matches what G1 computed on the sanitized IR
    expect(hashChain.rawIRHash).toBe(rawIR.provenance.rawIRHash);

    // validatedIRHash is independently recomputable
    expect(hashChain.validatedIRHash).toBe(
      HashPolicy.computeValidatedIRHash(validatedIR as unknown as Record<string, unknown>),
    );

    // executionPlanHash is independently recomputable
    expect(hashChain.executionPlanHash).toBe(
      HashPolicy.computeExecutionPlanHash(executionPlan as unknown as Record<string, unknown>),
    );

    // sourceRef.rawIRHash in validatedIR must point back to the G1-sanitized rawIR
    expect(validatedIR.sourceRef.rawIRHash).toBe(hashChain.rawIRHash);

    // ValidatedDesignIR must not contain its own hash field (Hash Flow Contract)
    expect("hash" in validatedIR).toBe(false);
    expect("provenance" in validatedIR).toBe(false);

    // ExecutionPlan must not contain its own hash field
    expect("hash" in executionPlan).toBe(false);

    // Timing fields present and non-negative
    expect(result.pipeline.timing.distillationExecutionMs).toBeGreaterThanOrEqual(0);
    expect(result.pipeline.timing.grammarExecutionMs).toBeGreaterThanOrEqual(0);
    expect(result.pipeline.timing.adapterExecutionMs).toBeGreaterThanOrEqual(0);
  });

  // ── Test 6: Contract A — 24 parameter paths, node-level ─────────────────

  test("TC-AES-06: adapter emits all 24 Contract A paths with node-level (no /value) paths", () => {
    const sheet = makeSheet({ sheetId: "test-contract-a" });
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-AES-06",
    });

    const paths = result.cangjieIR.parameters.map((p) => p.path);
    expect(paths.length).toBe(24);

    // Every path must be node-level — no trailing /value
    for (const p of result.cangjieIR.parameters) {
      expect(p.path.endsWith("/value")).toBe(false);
    }

    // Required Contract A paths (see docs/contract-a-schema.md §3)
    const expectedPaths = [
      // color (5)
      "/color/dominant",
      "/color/secondary",
      "/color/accent",
      "/color/contrastRatio",
      "/color/temperatureBias",
      // composition (4)
      "/composition/negativeSpaceRatio",
      "/composition/symmetry",
      "/composition/depthLayerCount",
      "/composition/focalPoint",
      // lighting (7)
      "/lighting/keyLight/azimuth",
      "/lighting/keyLight/elevation",
      "/lighting/keyLight/colorTemp",
      "/lighting/keyLight/intensity",
      "/lighting/keyLight/softness",
      "/lighting/ambientRatio",
      "/lighting/rimLightPresent",
      // materials (4)
      "/materials/0/baseType",
      "/materials/0/roughness",
      "/materials/0/metalness",
      "/materials/0/wear",
      // camera (4)
      "/camera/fov",
      "/camera/shotSize",
      "/camera/angle",
      "/camera/height",
    ];
    for (const ep of expectedPaths) {
      expect(paths).toContain(ep);
    }

    // DC-only grammar-derived fields
    const softness = result.cangjieIR.parameters.find((p) => p.path === "/lighting/keyLight/softness");
    expect(softness).toBeDefined();
    expect(softness?.value).toBe(0.7); // skylight
    expect(softness?.confidence).toBeCloseTo(0.75);

    const tempBias = result.cangjieIR.parameters.find((p) => p.path === "/color/temperatureBias");
    expect(tempBias).toBeDefined();
    expect(tempBias?.value).toBe(0.05); // cloudy
    expect(tempBias?.confidence).toBeCloseTo(0.70);

    const rim = result.cangjieIR.parameters.find((p) => p.path === "/lighting/rimLightPresent");
    expect(rim).toBeDefined();
    expect(rim?.value).toBe(false);
    expect(rim?.unit).toBe("boolean");

    // contrastRatio and intensity — shared with CAS
    expect(result.cangjieIR.parameters.find((p) => p.path === "/color/contrastRatio")?.value).toBe(4.5);
    expect(result.cangjieIR.parameters.find((p) => p.path === "/lighting/keyLight/intensity")?.value).toBe(1.0);
  });

  // ── Test 7: Contract A — constraints.targetPath has no /value suffix ────

  test("TC-AES-07: P0 violation constraints use node-level targetPath (no /value suffix)", () => {
    // Call the adapter directly so we can inspect raw constraints before G2 rewrites
    const sheet = makeSheet({
      sheetId: "test-constraint-paths",
      violations: [
        { ruleId: "pure-red", severity: "P0", message: "used pure red" },
        { ruleId: "bright-gold", severity: "P0", message: "used bright gold" },
      ],
    });
    const { cangjieIR } = sheetToCangjieIR(sheet, {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
    });

    const constraints = cangjieIR.constraints ?? [];
    expect(constraints.length).toBe(2);
    for (const c of constraints) {
      expect(c.type).toBe("threshold");
      // The critical assertion: no /value suffix
      expect(c.targetPath.endsWith("/value")).toBe(false);
      // And targetPath must match an actual parameter path
      const matchedParam = cangjieIR.parameters.find((p) => p.path === c.targetPath);
      expect(matchedParam).toBeDefined();
    }

    // pure-red → /color/dominant; bright-gold → /color/accent
    const red = constraints.find((c) => c.assertionId === "pure-red");
    expect(red?.targetPath).toBe("/color/dominant");
    const gold = constraints.find((c) => c.assertionId === "bright-gold");
    expect(gold?.targetPath).toBe("/color/accent");

    // P0 range patches land on the same node-level path
    const dominant = cangjieIR.parameters.find((p) => p.path === "/color/dominant");
    expect(dominant?.range?.fatalBelow).toBe(0.0);
  });

  // ── Test 8: Adapter negative-path — missing required palette role ────────

  test("TC-AES-08: adapter throws when dominant palette role is missing (pickColor guard)", () => {
    // Build a sheet whose palette has NO "dominant" entry. The adapter must
    // throw a pickColor error (NOT BLOCKED_DATA) before producing any IR.
    const sheet = makeSheet({
      sheetId: "test-no-dominant",
      colorSystem: {
        palette: [
          { role: "secondary", name: "Dai-Qing", hex: "#2C3E50", areaPct: 0.5, usage: "text" },
          { role: "accent", name: "Dull-Gold", hex: "#B8860B", areaPct: 0.2, usage: "accent" },
          { role: "shadow", name: "Mo-Dai", hex: "#1A1A2E", areaPct: 0.3, usage: "shadow" },
        ],
        saturationMax: 0.5,
        hardFailHex: ["#FF0000"],
      },
    });

    // pickColor guard: adapter refuses to invent a dominant color.
    expect(() =>
      sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT }),
    ).toThrow(/Palette missing role: dominant/);
  });

  // ── Test 9: Adapter negative-path — malformed ratio string ───────────────

  test("TC-AES-09: adapter throws on malformed voidSolidRatio (e.g. '7-5' instead of '7:5')", () => {
    // "7-5" uses a dash, not a colon — parseRatioPair must reject it rather
    // than silently mis-derive negativeSpaceRatio.
    const sheet = makeSheet({
      sheetId: "test-bad-ratio",
      proportion: {
        baseModulePx: 8,
        spacingScale: [1, 2, 3],
        voidSolidRatio: "7-5",
        focalPointsMax: 1,
      },
    });

    expect(() =>
      sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT }),
    ).toThrow(/Cannot parse ratio string/);
  });
});
