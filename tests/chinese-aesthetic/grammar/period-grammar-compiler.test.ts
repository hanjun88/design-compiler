/**
 * Period Grammar Compiler Tests — Phase 3 Step 3.3
 *
 * 验证：
 * - 完整流水线：Graph + Gate + IR → Operations → Intent
 * - 反模式 REJECT 熔断
 * - 范式 → 母语法映射
 * - 纯函数 / 确定性
 * - 不修改输入
 * - Intent 包含完整溯源
 */

import type { RawDesignIR } from "../../../compiler-core/contracts";
import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AntiPatternReport } from "../../../chinese-aesthetic/anti-pattern/types";
import { PeriodGrammarCompiler, selectOperations } from "../../../chinese-aesthetic/grammar";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

function p<T>(value: T, unit = "scalar"): RawDesignIR["composition"]["symmetry"] & { value: T } {
  return { value, unit, confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" } as never;
}

function makeIR(): RawDesignIR {
  return {
    $schema: "test",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-16T00:00:00Z" },
    composition: {
      focalPoint: p([0.5, 0.5], "vector2"),
      negativeSpaceRatio: p(0.3, "ratio"),
      depthLayerCount: p(2, "scalar"),
      symmetry: p(0.6, "ratio"),
    },
    camera: {
      fov: p(50, "degrees"),
      shotSize: p("medium", "scalar"),
      angle: p(2, "degrees"),
      height: p(1.6, "ratio"),
    },
    lighting: {
      keyLight: {
        azimuth: p(45, "degrees"), elevation: p(30, "degrees"), colorTemp: p(5500, "scalar"),
        intensity: p(1.0, "ratio"), softness: p(0.4, "ratio"),
      },
      ambientRatio: p(0.25, "ratio"),
      rimLightPresent: p(true, "scalar"),
    },
    materials: [
      { role: "dominant", baseType: p("WOOD::t", "scalar"), roughness: p(0.4, "ratio"), metalness: p(0.1, "ratio"), wear: p(0.2, "ratio") },
      { role: "secondary", baseType: p("STONE::t", "scalar"), roughness: p(0.45, "ratio"), metalness: p(0.05, "ratio"), wear: p(0.15, "ratio") },
    ],
    color: {
      dominant: p("#8B7355", "hex"), secondary: p("#6B5344", "hex"), accent: p("#C4A35A", "hex"),
      contrastRatio: p(3.5, "ratio"), temperatureBias: p(0.1, "ratio"),
    },
    provenance: {
      extractorVersion: "test", inferenceExecutionMs: 100, rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "in", rawIRHash: "ir",
    },
  };
}

function makeGraph(): AestheticRelationshipGraph {
  return {
    graphId: "g:test", evidenceId: "e:test", generatedAt: "2026-09-16T00:00:00Z",
    nodes: [
      { id: "n:subj", type: "SUBJECT", boundingRegion: [0.35, 0.35, 0.3, 0.3], energy: 0.8, evidenceRefs: ["e1"], confidence: 0.9 },
      { id: "n:void", type: "VOID", boundingRegion: null, energy: 0.5, evidenceRefs: ["e2"], confidence: 0.9 },
      { id: "n:space", type: "SPACE", boundingRegion: [0, 0, 1, 1], energy: 0.7, evidenceRefs: ["e3"], confidence: 1 },
      { id: "n:light", type: "LIGHT", boundingRegion: null, energy: 0.65, evidenceRefs: ["e4"], confidence: 1 },
      { id: "n:mat", type: "MATERIAL", boundingRegion: null, energy: 0.25, evidenceRefs: ["e5"], confidence: 0.8 },
      { id: "n:bound", type: "BOUNDARY", boundingRegion: null, energy: 0.15, evidenceRefs: ["e6"], confidence: 0.95 },
      { id: "n:time", type: "TIME", boundingRegion: null, energy: 0.15, evidenceRefs: ["e7"], confidence: 0.6 },
    ],
    relations: [
      { sourceId: "n:subj", targetId: "n:space", relationType: "HOST_GUEST", magnitude: 0.4, polarity: "FORWARD", derivedFrom: ["d1"], confidence: 0.85 },
      { sourceId: "n:subj", targetId: "n:void", relationType: "SOLID_VOID", magnitude: 0.25, polarity: "MUTUAL", derivedFrom: ["d2"], confidence: 0.8 },
      { sourceId: "n:bound", targetId: "n:void", relationType: "DENSE_SPARSE", magnitude: 0.15, polarity: "MUTUAL", derivedFrom: ["d3"], confidence: 0.85 },
      { sourceId: "n:mat", targetId: "n:light", relationType: "HEAVY_LIGHT", magnitude: 0.15, polarity: "MUTUAL", derivedFrom: ["d4"], confidence: 0.8 },
      { sourceId: "n:light", targetId: "n:void", relationType: "HIGH_LOW", magnitude: 0.15, polarity: "MUTUAL", derivedFrom: ["d5"], confidence: 0.85 },
      { sourceId: "n:space", targetId: "n:bound", relationType: "OPEN_CLOSE", magnitude: 0.25, polarity: "MUTUAL", derivedFrom: ["d6"], confidence: 0.85 },
    ],
    unmeasuredRelations: [
      { relationType: "MOVE_STILL", reason: "Single-frame", semanticInterpretationRef: "s:m" },
      { relationType: "NEAR_FAR", reason: "No depth", semanticInterpretationRef: "s:d" },
    ],
    topologyAudit: { noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [], status: "PASS" },
    graphHash: "fnv1a:gtest",
    derivationPipeline: [],
  };
}

function makeGateReport(verdict: "ALLOW" | "FLAG" | "REJECT" = "ALLOW"): AntiPatternReport {
  return {
    reportId: "r:test",
    evidenceId: "e:test",
    graphHash: "fnv1a:gtest",
    overallVerdict: verdict,
    gateResults: [],
    rejectedGates: verdict === "REJECT" ? ["ANTI-01"] : [],
    flaggedGates: verdict === "FLAG" ? ["ANTI-03"] : [],
    generatedAt: "2026-09-16T00:00:00Z",
    reportHash: "fnv1a:rtest",
    constitutionCompliance: {
      allRejectsHaveEvidence: true,
      allFlagsHaveReason: true,
      noUnsupportedConfidenceOne: true,
      unmeasuredNotTreatedAsFail: true,
      noSemanticScoreInput: true,
      compliant: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("Period Grammar Compiler — Full Pipeline", () => {
  test("compiles SONG period: graph + gate + IR → transformed IR + intent", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));

    expect(result.antiPatternHalted).toBe(false);
    expect(result.appliedCount).toBeGreaterThan(0);
    expect(result.traces).toHaveLength(16);
    expect(result.intent.system).toBe("chinese-aesthetic@1.0.0");
    expect(result.intent.period).toBe("SONG");
    expect(result.intent.provenance.intentHash.length).toBeGreaterThan(0);
  });

  test("compiles TANG period: applies axial calibration", () => {
    const ir = makeIR();
    ir.composition.symmetry.value = 0.6; // < 0.85 TANG target
    const compiler = new PeriodGrammarCompiler("TANG");
    const result = compiler.compile(ir, makeGraph(), makeGateReport("ALLOW"));

    const axialTrace = result.traces.find((t) => t.opId === "OP_CALIBRATE_AXIAL_ORDER");
    expect(axialTrace?.applied).toBe(true);
    expect(result.ir.composition.symmetry.value).toBe(0.85);
  });

  test("compiles MING period: depth layers target = 3", () => {
    const ir = makeIR();
    ir.composition.depthLayerCount.value = 1;
    const compiler = new PeriodGrammarCompiler("MING");
    const result = compiler.compile(ir, makeGraph(), makeGateReport("ALLOW"));

    expect(result.ir.composition.depthLayerCount.value).toBe(3);
  });

  test("anti-pattern REJECT halts compilation", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("REJECT"));

    expect(result.antiPatternHalted).toBe(true);
    expect(result.appliedCount).toBe(0);
    expect(result.traces).toHaveLength(0);
    expect(result.haltReason).toContain("ANTI-01");
    // IR unchanged
    expect(result.ir).toEqual(makeIR());
  });

  test("anti-pattern FLAG does not halt (operations still apply)", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("FLAG"));

    expect(result.antiPatternHalted).toBe(false);
    expect(result.appliedCount).toBeGreaterThan(0);
    expect(result.intent.antiPatternConformance.allAllowed).toBe(false);
  });

  test("compiler is pure: input IR not modified", () => {
    const ir = makeIR();
    const irSnapshot = JSON.stringify(ir);
    const compiler = new PeriodGrammarCompiler("SONG");
    compiler.compile(ir, makeGraph(), makeGateReport("ALLOW"));
    expect(JSON.stringify(ir)).toBe(irSnapshot);
  });

  test("compiler is deterministic: same input → same output", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const r1 = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    const r2 = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    expect(JSON.stringify(r1.ir)).toBe(JSON.stringify(r2.ir));
    expect(r1.intent.provenance.intentHash).toBe(r2.intent.provenance.intentHash);
  });

  test("intent contains active relationships from graph", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    expect(result.intent.activeRelationships.length).toBe(6);
    expect(result.intent.activeRelationships[0].relationType).toBe("HOST_GUEST");
  });

  test("intent appliedOperations matches applied traces", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    const appliedTraceIds = result.traces.filter((t) => t.applied).map((t) => t.opId);
    const intentOpIds = result.intent.appliedOperations.map((o) => o.opId);
    expect(intentOpIds).toEqual(appliedTraceIds);
  });
});

describe("Operation Selection", () => {
  test("selectOperations returns 16 selections", () => {
    const selections = selectOperations(makeGraph(), "SONG");
    expect(selections).toHaveLength(16);
  });

  test("each selection has opId, selected, reason", () => {
    const selections = selectOperations(makeGraph(), "SONG");
    for (const s of selections) {
      expect(s.opId).toBeDefined();
      expect(typeof s.selected).toBe("boolean");
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("Period → Principle Mapping", () => {
  test("TANG maps to 4 principles including GUEST_HOST_COMITY and SCALE_PROPORTION", () => {
    const compiler = new PeriodGrammarCompiler("TANG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    expect(result.intent.principles).toContain("GUEST_HOST_COMITY");
    expect(result.intent.principles).toContain("SCALE_PROPORTION");
    expect(result.intent.principles).toHaveLength(4);
  });

  test("SONG maps to VOID_SOLID_INTERPLAY and LIGHT_TEMPORALITY", () => {
    const compiler = new PeriodGrammarCompiler("SONG");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    expect(result.intent.principles).toContain("VOID_SOLID_INTERPLAY");
    expect(result.intent.principles).toContain("LIGHT_TEMPORALITY");
  });

  test("MING maps to POSITION_MANAGEMENT and MATERIAL_PATINA", () => {
    const compiler = new PeriodGrammarCompiler("MING");
    const result = compiler.compile(makeIR(), makeGraph(), makeGateReport("ALLOW"));
    expect(result.intent.principles).toContain("POSITION_MANAGEMENT");
    expect(result.intent.principles).toContain("MATERIAL_PATINA");
  });
});
