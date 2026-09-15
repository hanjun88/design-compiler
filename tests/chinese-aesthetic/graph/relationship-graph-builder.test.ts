/**
 * Relationship Graph Builder Tests — 美学关系图构建器测试
 *
 * Phase 2 Step 2.3: ObservableEvidenceSet → AestheticRelationshipGraph
 * 验证：节点实例化、关系推导、未测量标记、拓扑审计、确定性、证据溯源。
 */

import { extractPhysicalEvidence } from "../../../chinese-aesthetic/extraction/physical-evidence-extractor";
import { buildRelationshipGraph } from "../../../chinese-aesthetic/graph/relationship-graph-builder";
import type {
  AestheticRelationshipGraph,
  AestheticNodeType,
  AestheticRelationType,
} from "../../../chinese-aesthetic/graph/types";
import type { ExtractorInput, ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";

// ---------------------------------------------------------------------------
// 测试辅助：合成已知属性的像素缓冲
// ---------------------------------------------------------------------------

const TEST_WIDTH = 480;
const TEST_HEIGHT = 270;
const TEST_PIXEL_COUNT = TEST_WIDTH * TEST_HEIGHT;
const TEST_BUFFER_SIZE = TEST_PIXEL_COUNT * 4;

/** 生成垂直渐变帧（从黑到白）。 */
function makeVerticalGradientFrame(): Uint8Array {
  const buffer = new Uint8Array(TEST_BUFFER_SIZE);
  for (let y = 0; y < TEST_HEIGHT; y++) {
    const v = Math.round((y / (TEST_HEIGHT - 1)) * 255);
    for (let x = 0; x < TEST_WIDTH; x++) {
      const offset = (y * TEST_WIDTH + x) * 4;
      buffer[offset] = v;
      buffer[offset + 1] = v;
      buffer[offset + 2] = v;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}

/** 生成纯色帧（指定灰度）。 */
function makeSolidFrame(gray: number): Uint8Array {
  const buffer = new Uint8Array(TEST_BUFFER_SIZE);
  for (let i = 0; i < TEST_PIXEL_COUNT; i++) {
    const offset = i * 4;
    buffer[offset] = gray;
    buffer[offset + 1] = gray;
    buffer[offset + 2] = gray;
    buffer[offset + 3] = 255;
  }
  return buffer;
}

/** 构造标准测试输入。 */
function makeTestInput(frames: Uint8Array[], overrides?: Partial<ExtractorInput>): ExtractorInput {
  return {
    evidenceId: "test-graph-evidence-001",
    capturedAt: "2026-09-16T00:00:00Z",
    frames,
    width: TEST_WIDTH,
    height: TEST_HEIGHT,
    depthBuffers: null,
    ir: {
      irHash: "sha256:test-ir-hash",
      irType: "ValidatedDesignIR",
      paradigm: "TANG",
      compositionType: "central-axis",
      symmetry: 0.8,
      negativeSpaceRatio: 0.3,
      horizonPosition: 0.35,
      cameraPitch: -15,
      lightingIntent: "DAYLIGHT",
      colorTemp: 5500,
      lightIntensity: 1.0,
      lightSoftness: 0.6,
      ambientRatio: 0.35,
      materials: [
        { baseType: "BRONZE::tang-gilt-bronze", materialCategory: "BRONZE", roughness: 0.4, metalness: 0.9, wear: 0.3 },
      ],
      transformationTrace: [],
    },
    renderHash: "sha256:test-render-hash",
    rendererInfo: { type: "software-reference", version: "1.0.0" },
    ...overrides,
  };
}

/** 从输入构建证据集 + 关系图的辅助函数。 */
function buildGraphFromInput(input: ExtractorInput): AestheticRelationshipGraph {
  const evidence: ObservableEvidenceSet = extractPhysicalEvidence(input);
  return buildRelationshipGraph(evidence);
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("Phase 2.3 Relationship Graph Builder", () => {
  // -----------------------------------------------------------------------
  // 基本图构建
  // -----------------------------------------------------------------------

  describe("Graph Construction", () => {
    it("builds graph from single-frame evidence without error", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph).toBeDefined();
      expect(graph.graphId).toBe("graph:test-graph-evidence-001");
      expect(graph.evidenceId).toBe("test-graph-evidence-001");
    });

    it("instantiates 10 node types for single-frame input (no MOTION)", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const expectedTypes: AestheticNodeType[] = [
        "SUBJECT", "VOID", "SPACE", "LIGHT", "MATERIAL",
        "AXIS", "BOUNDARY", "SCALE", "TIME", "VIEW",
      ];
      const actualTypes = graph.nodes.map((n) => n.type);
      for (const t of expectedTypes) {
        expect(actualTypes).toContain(t);
      }
      expect(graph.nodes).toHaveLength(10);
    });

    it("instantiates 11 node types for multi-frame input (with MOTION)", () => {
      const frame1 = makeVerticalGradientFrame();
      const frame2 = makeSolidFrame(128);
      const input = makeTestInput([frame1, frame2]);
      const graph = buildGraphFromInput(input);
      const actualTypes = graph.nodes.map((n) => n.type);
      expect(actualTypes).toContain("MOTION");
      expect(graph.nodes).toHaveLength(11);
    });

    it("all node energies are bounded in [0, 1]", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const node of graph.nodes) {
        expect(node.energy).toBeGreaterThanOrEqual(0);
        expect(node.energy).toBeLessThanOrEqual(1);
      }
    });

    it("all node confidences are bounded in [0, 1]", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const node of graph.nodes) {
        expect(node.confidence).toBeGreaterThanOrEqual(0);
        expect(node.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("every node has at least one evidenceRef", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const node of graph.nodes) {
        expect(node.evidenceRefs.length).toBeGreaterThan(0);
        for (const ref of node.evidenceRefs) {
          expect(typeof ref).toBe("string");
          expect(ref.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // 关系推导
  // -----------------------------------------------------------------------

  describe("Relation Derivation", () => {
    it("derives HOST_GUEST relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const hostGuest = graph.relations.find((r) => r.relationType === "HOST_GUEST");
      expect(hostGuest).toBeDefined();
      expect(hostGuest!.sourceId).toContain("subject");
      expect(hostGuest!.targetId).toContain("space");
    });

    it("derives SOLID_VOID relation with MUTUAL polarity", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const solidVoid = graph.relations.find((r) => r.relationType === "SOLID_VOID");
      expect(solidVoid).toBeDefined();
      expect(solidVoid!.polarity).toBe("MUTUAL");
    });

    it("derives DENSE_SPARSE relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const denseSparse = graph.relations.find((r) => r.relationType === "DENSE_SPARSE");
      expect(denseSparse).toBeDefined();
    });

    it("derives CENTER_EDGE relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const centerEdge = graph.relations.find((r) => r.relationType === "CENTER_EDGE");
      expect(centerEdge).toBeDefined();
    });

    it("derives HIGH_LOW relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const highLow = graph.relations.find((r) => r.relationType === "HIGH_LOW");
      expect(highLow).toBeDefined();
    });

    it("derives HEAVY_LIGHT relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const heavyLight = graph.relations.find((r) => r.relationType === "HEAVY_LIGHT");
      expect(heavyLight).toBeDefined();
    });

    it("derives OLD_NEW relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const oldNew = graph.relations.find((r) => r.relationType === "OLD_NEW");
      expect(oldNew).toBeDefined();
    });

    it("derives OPEN_CLOSE relation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const openClose = graph.relations.find((r) => r.relationType === "OPEN_CLOSE");
      expect(openClose).toBeDefined();
    });

    it("all relation magnitudes are bounded in [0, 1]", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const rel of graph.relations) {
        expect(rel.magnitude).toBeGreaterThanOrEqual(0);
        expect(rel.magnitude).toBeLessThanOrEqual(1);
      }
    });

    it("every relation has derivedFrom evidence references", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const rel of graph.relations) {
        expect(rel.derivedFrom.length).toBeGreaterThan(0);
      }
    });

    it("every relation references existing node IDs", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const rel of graph.relations) {
        expect(nodeIds.has(rel.sourceId)).toBe(true);
        expect(nodeIds.has(rel.targetId)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 未测量关系
  // -----------------------------------------------------------------------

  describe("Unmeasured Relations", () => {
    it("marks MOVE_STILL as unmeasured for single-frame input", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const moveStill = graph.unmeasuredRelations.find((r) => r.relationType === "MOVE_STILL");
      expect(moveStill).toBeDefined();
      expect(moveStill!.reason.toLowerCase()).toContain("single");
    });

    it("derives MOVE_STILL relation for multi-frame input", () => {
      const frame1 = makeVerticalGradientFrame();
      const frame2 = makeSolidFrame(128);
      const input = makeTestInput([frame1, frame2]);
      const graph = buildGraphFromInput(input);
      const moveStill = graph.relations.find((r) => r.relationType === "MOVE_STILL");
      expect(moveStill).toBeDefined();
      const unmeasuredMoveStill = graph.unmeasuredRelations.find((r) => r.relationType === "MOVE_STILL");
      expect(unmeasuredMoveStill).toBeUndefined();
    });

    it("marks NEAR_FAR as unmeasured when no depth buffer", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      const nearFar = graph.unmeasuredRelations.find((r) => r.relationType === "NEAR_FAR");
      expect(nearFar).toBeDefined();
      expect(nearFar!.reason).toContain("depth");
    });

    it("unmeasured relations have semantic interpretation references", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      for (const unmeasured of graph.unmeasuredRelations) {
        expect(unmeasured.semanticInterpretationRef).toBeDefined();
        expect(unmeasured.semanticInterpretationRef.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 拓扑审计
  // -----------------------------------------------------------------------

  describe("Topology Audit", () => {
    it("topology audit passes for valid single-frame graph", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.status).toBe("PASS");
      expect(graph.topologyAudit.violations).toHaveLength(0);
    });

    it("topology audit passes for valid multi-frame graph", () => {
      const frame1 = makeVerticalGradientFrame();
      const frame2 = makeSolidFrame(128);
      const input = makeTestInput([frame1, frame2]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.status).toBe("PASS");
    });

    it("reports no isolated nodes", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.noIsolatedNodes).toBe(true);
    });

    it("reports polar alignment", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.polarAlignment).toBe(true);
    });

    it("reports bounded energy", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.boundedEnergy).toBe(true);
    });

    it("reports purity penetration (every edge traceable to evidence)", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.topologyAudit.purityPenetration).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 确定性
  // -----------------------------------------------------------------------

  describe("Determinism", () => {
    it("identical input produces identical graph hash", () => {
      const input1 = makeTestInput([makeVerticalGradientFrame()]);
      const input2 = makeTestInput([makeVerticalGradientFrame()]);
      const graph1 = buildGraphFromInput(input1);
      const graph2 = buildGraphFromInput(input2);
      expect(graph1.graphHash).toBe(graph2.graphHash);
    });

    it("identical input produces identical node count and relation count", () => {
      const input1 = makeTestInput([makeVerticalGradientFrame()]);
      const input2 = makeTestInput([makeVerticalGradientFrame()]);
      const graph1 = buildGraphFromInput(input1);
      const graph2 = buildGraphFromInput(input2);
      expect(graph1.nodes.length).toBe(graph2.nodes.length);
      expect(graph1.relations.length).toBe(graph2.relations.length);
    });

    it("different input produces different graph hash", () => {
      const input1 = makeTestInput([makeVerticalGradientFrame()]);
      const input2 = makeTestInput([makeSolidFrame(128)]);
      const graph1 = buildGraphFromInput(input1);
      const graph2 = buildGraphFromInput(input2);
      expect(graph1.graphHash).not.toBe(graph2.graphHash);
    });

    it("graph hash follows fnv1a: prefix format", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.graphHash).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    });
  });

  // -----------------------------------------------------------------------
  // 推导管线记录
  // -----------------------------------------------------------------------

  describe("Derivation Pipeline", () => {
    it("records complete derivation pipeline", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      expect(graph.derivationPipeline.length).toBeGreaterThan(10);
      expect(graph.derivationPipeline).toContain("instantiate:nodes:11-types");
      expect(graph.derivationPipeline).toContain("derive:host-guest");
      expect(graph.derivationPipeline).toContain("derive:solid-void");
      expect(graph.derivationPipeline).toContain("audit:topology-invariants");
      expect(graph.derivationPipeline).toContain("hash:fnv1a-deterministic");
    });
  });

  // -----------------------------------------------------------------------
  // 图与证据的绑定
  // -----------------------------------------------------------------------

  describe("Graph-Evidence Binding", () => {
    it("graphId is derived from evidenceId", () => {
      const input = makeTestInput([makeVerticalGradientFrame()], { evidenceId: "custom-evidence-xyz" });
      const graph = buildGraphFromInput(input);
      expect(graph.graphId).toBe("graph:custom-evidence-xyz");
      expect(graph.evidenceId).toBe("custom-evidence-xyz");
    });

    it("generatedAt matches evidence capturedAt", () => {
      const input = makeTestInput([makeVerticalGradientFrame()], { capturedAt: "2026-01-01T00:00:00Z" });
      const graph = buildGraphFromInput(input);
      expect(graph.generatedAt).toBe("2026-01-01T00:00:00Z");
    });

    it("graph does not contain semantic scores or cultural classifications", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const graph = buildGraphFromInput(input);
      // 图中不应有语义评分字段
      const graphJson = JSON.stringify(graph);
      expect(graphJson).not.toContain("aestheticScore");
      expect(graphJson).not.toContain("culturalClassification");
      expect(graphJson).not.toContain("qiyun");
    });
  });
});
