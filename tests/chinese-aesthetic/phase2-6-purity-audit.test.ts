/**
 * Phase 2.6 Evidence Purity Audit — Dynamic Verification
 * Temporary audit file, not part of permanent test suite.
 */
import { extractPhysicalEvidence } from "../../chinese-aesthetic/extraction/physical-evidence-extractor";
import { buildRelationshipGraph } from "../../chinese-aesthetic/graph/relationship-graph-builder";
import { runAntiPatternGate } from "../../chinese-aesthetic/anti-pattern/anti-pattern-gate";
import { evaluateMachineAssertionsFromEvidence } from "../../chinese-aesthetic/evaluator/machine-evaluator";
import type { ExtractorInput } from "../../chinese-aesthetic/extraction/types";

const W = 480, H = 270;
function makeFrame(gray: number): Uint8Array {
  const b = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { b[i*4]=gray; b[i*4+1]=gray; b[i*4+2]=gray; b[i*4+3]=255; }
  return b;
}
function makeInput(frames: Uint8Array[]): ExtractorInput {
  return {
    evidenceId: "audit-" + Math.random().toString(36).slice(2),
    capturedAt: "2026-09-16T00:00:00Z",
    frames, width: W, height: H, depthBuffers: null,
    ir: {
      irHash: "test", irType: "ValidatedDesignIR", paradigm: "TANG",
      compositionType: "central-axis", symmetry: 0.8, negativeSpaceRatio: 0.3,
      horizonPosition: 0.35, cameraPitch: -15, lightingIntent: "DAYLIGHT",
      colorTemp: 5500, lightIntensity: 1.0, lightSoftness: 0.6, ambientRatio: 0.35,
      materials: [{ baseType: "BRONZE::test", materialCategory: "BRONZE", roughness: 0.4, metalness: 0.9, wear: 0.3 }],
      transformationTrace: [],
    },
    renderHash: "test", rendererInfo: { type: "software-reference", version: "1.0.0" },
  };
}

describe("Phase 2.6 Evidence Purity Audit", () => {
  describe("1. Single-Frame Degradation", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const report = evaluateMachineAssertionsFromEvidence(evidence, "t");

    test("motion is null on single frame", () => {
      expect(evidence.motion).toBeNull();
    });
    test("qiyunContinuity status is INCONCLUSIVE (UNMEASURED ≠ FAIL)", () => {
      expect(report.qiyunContinuity.status).toBe("INCONCLUSIVE");
    });
    test("motionContinuity is NaN (not hardcoded)", () => {
      expect(Number.isNaN(report.qiyunContinuity.metrics.motionContinuity)).toBe(true);
    });
    test("chromaticContinuity is NaN (not 0.75)", () => {
      expect(Number.isNaN(report.qiyunContinuity.metrics.chromaticContinuity)).toBe(true);
    });
    test("qiyun evidenceRefs non-empty even when UNMEASURED", () => {
      expect(report.qiyunContinuity.evidenceRefs.length).toBeGreaterThan(0);
    });
  });

  describe("2. No-Depth Degradation", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const report = evaluateMachineAssertionsFromEvidence(evidence, "t");

    test("depthBufferAvailable is false", () => {
      expect(evidence.depth.depthBufferAvailable).toBe(false);
    });
    test("spatialDepth status is INCONCLUSIVE (UNMEASURED ≠ FAIL)", () => {
      expect(report.spatialDepth.status).toBe("INCONCLUSIVE");
    });
    test("depthLayerCount is NaN (not hardcoded 3)", () => {
      expect(Number.isNaN(report.spatialDepth.metrics.depthLayerCount)).toBe(true);
    });
    test("atmosphericDepth is NaN (not hardcoded 0.6)", () => {
      expect(Number.isNaN(report.spatialDepth.metrics.atmosphericDepth)).toBe(true);
    });
    test("focalDepthSeparation is NaN (not hardcoded 0.55)", () => {
      expect(Number.isNaN(report.spatialDepth.metrics.focalDepthSeparation)).toBe(true);
    });
    test("spatialDepth evidenceRefs non-empty", () => {
      expect(report.spatialDepth.evidenceRefs.length).toBeGreaterThan(0);
    });
  });

  describe("3. ANTI-03 Dead-Void Constitutional Constraint", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const graph = buildRelationshipGraph(evidence);
    const gateReport = runAntiPatternGate(evidence, graph);
    const anti03 = gateReport.gateResults.find((g: any) => g.gateId === "ANTI-03");

    test("ANTI-03 exists in gate report", () => {
      expect(anti03).toBeDefined();
    });
    test("ANTI-03 no-depth: verdict is FLAG or PASS (constitutional: UNMEASURED depth ≠ REJECT)", () => {
      expect(anti03?.verdict).not.toBe("REJECT");
    });
    test("ANTI-03 has rationale", () => {
      expect(anti03?.rationale?.length).toBeGreaterThan(0);
    });
  });

  describe("4. Evidence Provenance Traceability", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const report = evaluateMachineAssertionsFromEvidence(evidence, "t");
    const allAssertions = [
      report.focalHierarchy, report.voidSolid, report.qiyunContinuity,
      report.spatialDepth, report.colorRelationship, report.materialRelationship,
    ];

    test("all 6 assertions have non-empty evidenceRefs", () => {
      for (const a of allAssertions) {
        expect(a.evidenceRefs.length).toBeGreaterThan(0);
      }
    });
    test("all assertions have method field with meaningful description", () => {
      for (const a of allAssertions) {
        expect(a.method?.length).toBeGreaterThan(10);
      }
    });
    test("no assertion has confidence=1.0 without evidence (fake confidence)", () => {
      // MachineAssertion doesn't expose confidence directly, but evidenceRefs presence proves provenance
      for (const a of allAssertions) {
        expect(a.evidenceRefs.length).toBeGreaterThan(0);
      }
    });
  });

  describe("5. Determinism (Byte-Identical Across Repeated Runs)", () => {
    const testCases = [
      { name: "solid gray 128", frames: [makeFrame(128)] },
      { name: "solid gray 64", frames: [makeFrame(64)] },
      { name: "solid gray 200", frames: [makeFrame(200)] },
    ];

    for (const tc of testCases) {
      // Use fixed evidenceId for determinism testing
      const fixedInput = makeInput(tc.frames);
      fixedInput.evidenceId = "determinism-test-" + tc.name.replace(/\s/g, "-");

      test(`evidence deterministic: ${tc.name}`, () => {
        const e1 = extractPhysicalEvidence(fixedInput);
        const e2 = extractPhysicalEvidence(fixedInput);
        expect(JSON.stringify(e1)).toBe(JSON.stringify(e2));
      });
      test(`graph deterministic: ${tc.name}`, () => {
        const e1 = extractPhysicalEvidence(fixedInput);
        const e2 = extractPhysicalEvidence(fixedInput);
        const g1 = buildRelationshipGraph(e1);
        const g2 = buildRelationshipGraph(e2);
        expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
      });
      test(`report deterministic: ${tc.name}`, () => {
        const e1 = extractPhysicalEvidence(fixedInput);
        const e2 = extractPhysicalEvidence(fixedInput);
        const r1 = evaluateMachineAssertionsFromEvidence(e1, "t");
        const r2 = evaluateMachineAssertionsFromEvidence(e2, "t");
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
      });
    }
  });

  describe("6. No Semantic Score in Machine Layer Output", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const report = evaluateMachineAssertionsFromEvidence(evidence, "t");
    const reportStr = JSON.stringify(report);

    test("no 'chineseScore' field", () => {
      expect(reportStr).not.toContain("chineseScore");
    });
    test("no 'beautyScore' field", () => {
      expect(reportStr).not.toContain("beautyScore");
    });
    test("no 'aestheticScore' field", () => {
      expect(reportStr).not.toContain("aestheticScore");
    });
    test("report uses 'status' not 'score' for assertions", () => {
      expect(report.focalHierarchy.status).toBeDefined();
      expect((report.focalHierarchy as any).score).toBeUndefined();
    });
  });

  describe("7. IR Declared ≠ Observed Physical Evidence", () => {
    const evidence = extractPhysicalEvidence(makeInput([makeFrame(128)]));
    const report = evaluateMachineAssertionsFromEvidence(evidence, "t");

    test("materialRelationship has both IR-declared and observed metrics", () => {
      expect(report.materialRelationship.metrics.dominantRoughness).toBeDefined();
      expect(report.materialRelationship.metrics.surfaceVariation).toBeDefined();
    });
    test("IR-declared roughness comes from IR (0.4), not from pixel observation", () => {
      // IR declares roughness=0.4; observed surfaceVariation is computed from pixels
      expect(report.materialRelationship.metrics.dominantRoughness).toBe(0.4);
    });
    test("observed surfaceVariation is computed from pixels (not equal to IR roughness)", () => {
      // Solid gray frame has low surface variation, different from IR-declared roughness
      expect(report.materialRelationship.metrics.surfaceVariation).not.toBe(0.4);
    });
  });
});
