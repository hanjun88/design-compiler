/**
 * Relationship Graph Builder Tests — 关系图构建器测试
 *
 * Phase 2 Step 2.3: 验证从 ObservableEvidenceSet 到 AestheticRelationshipGraph 的确定性映射。
 *
 * 核心验证：
 * - 节点类型与关系类型受控词表
 * - 所有节点/边可回溯至 EvidenceField
 * - 无语义评分泄漏（无 qiyun/aesthetic score 等）
 * - 无伪造关系（无深度缓冲时 NEAR_FAR 显式未测量）
 * - 拓扑不变量
 * - 字节级确定性
 * - 真实 SoftwareRenderer 帧集成
 */

import { buildRelationshipGraph } from "../../../chinese-aesthetic/graph/relationship-graph-builder";
import { auditTopology } from "../../../chinese-aesthetic/graph/topology-guard";
import type {
  AestheticNode,
  AestheticRelation,
  AestheticRelationshipGraph,
  AestheticNodeType,
  AestheticRelationType,
} from "../../../chinese-aesthetic/graph/types";
import { extractPhysicalEvidence } from "../../../chinese-aesthetic/extraction/physical-evidence-extractor";
import type { ExtractorInput, ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";
import { runCell } from "../../golden-case-matrix/lib/cell-runner";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

const TEST_WIDTH = 480;
const TEST_HEIGHT = 270;

function makeSolidFrame(gray: number): Uint8Array {
  const buffer = new Uint8Array(TEST_WIDTH * TEST_HEIGHT * 4);
  for (let i = 0; i < TEST_WIDTH * TEST_HEIGHT; i++) {
    const offset = i * 4;
    buffer[offset] = gray;
    buffer[offset + 1] = gray;
    buffer[offset + 2] = gray;
    buffer[offset + 3] = 255;
  }
  return buffer;
}

function makeGradientFrame(): Uint8Array {
  const buffer = new Uint8Array(TEST_WIDTH * TEST_HEIGHT * 4);
  for (let y = 0; y < TEST_HEIGHT; y++) {
    for (let x = 0; x < TEST_WIDTH; x++) {
      const v = Math.round(((x * 251 + y * 197 + (x * y) % 7) % 256));
      const offset = (y * TEST_WIDTH + x) * 4;
      buffer[offset] = v;
      buffer[offset + 1] = v;
      buffer[offset + 2] = v;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}

function makeTestInput(frames: Uint8Array[]): ExtractorInput {
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
  };
}

function buildFromFrames(frames: Uint8Array[]): AestheticRelationshipGraph {
  const evidence = extractPhysicalEvidence(makeTestInput(frames));
  return buildRelationshipGraph(evidence);
}

// 受控词表
const VALID_NODE_TYPES: AestheticNodeType[] = [
  "SUBJECT", "OBJECT", "SPACE", "VOID", "LIGHT", "MATERIAL",
  "TIME", "VIEW", "AXIS", "BOUNDARY", "SCALE", "MOTION",
];
const VALID_RELATION_TYPES: AestheticRelationType[] = [
  "HOST_GUEST", "SOLID_VOID", "VISIBLE_HIDDEN", "DENSE_SPARSE",
  "MOVE_STILL", "NEAR_FAR", "HIGH_LOW", "CENTER_EDGE",
  "OPEN_CLOSE", "HEAVY_LIGHT", "OLD_NEW",
];

// 禁用语义词（不应出现在节点/关系 ID 或 derivedFrom 中）
const FORBIDDEN_SEMANTIC_TERMS = [
  "qiyun", "气韵", "aesthetic-score", "美学评分", "chinese-harmony",
  "song-elegance", "tang-magnificence", "cultural-pass", "审美通过",
];

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("Relationship Graph Builder — Phase 2 Step 2.3", () => {

  // ── Schema 验证 ──────────────────────────────────────────────────────

  describe("Schema Validity", () => {
    test("all node types are in controlled vocabulary", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const node of graph.nodes) {
        expect(VALID_NODE_TYPES).toContain(node.type);
      }
    });

    test("all relation types are in controlled vocabulary", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const rel of graph.relations) {
        expect(VALID_RELATION_TYPES).toContain(rel.relationType);
      }
    });

    test("node IDs are unique", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("every relation source and target exists in nodes", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const rel of graph.relations) {
        expect(nodeIds.has(rel.sourceId)).toBe(true);
        expect(nodeIds.has(rel.targetId)).toBe(true);
      }
    });
  });

  // ── 节点实例化 ───────────────────────────────────────────────────────

  describe("Node Instantiation", () => {
    test("gradient frame produces expected node types", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const types = new Set(graph.nodes.map((n) => n.type));
      expect(types.has("SUBJECT")).toBe(true);
      expect(types.has("VOID")).toBe(true);
      expect(types.has("SPACE")).toBe(true);
      expect(types.has("LIGHT")).toBe(true);
      expect(types.has("MATERIAL")).toBe(true);
      expect(types.has("AXIS")).toBe(true);
      expect(types.has("BOUNDARY")).toBe(true);
      expect(types.has("SCALE")).toBe(true);
      expect(types.has("TIME")).toBe(true);
      expect(types.has("VIEW")).toBe(true);
    });

    test("single frame does NOT produce MOTION node", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const motionNodes = graph.nodes.filter((n) => n.type === "MOTION");
      expect(motionNodes.length).toBe(0);
    });

    test("two frames produces MOTION node", () => {
      const frame = makeGradientFrame();
      const graph = buildFromFrames([frame, frame]);
      const motionNodes = graph.nodes.filter((n) => n.type === "MOTION");
      expect(motionNodes.length).toBe(1);
    });

    test("all nodes have energy in [0, 1]", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const node of graph.nodes) {
        expect(node.energy).toBeGreaterThanOrEqual(0);
        expect(node.energy).toBeLessThanOrEqual(1);
      }
    });

    test("all nodes have confidence in [0, 1]", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const node of graph.nodes) {
        expect(node.confidence).toBeGreaterThanOrEqual(0);
        expect(node.confidence).toBeLessThanOrEqual(1);
      }
    });

    test("all nodes have non-empty evidenceRefs", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const node of graph.nodes) {
        expect(node.evidenceRefs.length).toBeGreaterThan(0);
        for (const ref of node.evidenceRefs) {
          expect(ref.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── 关系推导 ─────────────────────────────────────────────────────────

  describe("Relation Derivation", () => {
    test("gradient frame produces expected relation types", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const types = new Set(graph.relations.map((r) => r.relationType));
      expect(types.has("HOST_GUEST")).toBe(true);
      expect(types.has("SOLID_VOID")).toBe(true);
      expect(types.has("DENSE_SPARSE")).toBe(true);
      expect(types.has("CENTER_EDGE")).toBe(true);
      expect(types.has("HIGH_LOW")).toBe(true);
      expect(types.has("HEAVY_LIGHT")).toBe(true);
      expect(types.has("OLD_NEW")).toBe(true);
      expect(types.has("OPEN_CLOSE")).toBe(true);
    });

    test("all relations have magnitude in [0, 1]", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const rel of graph.relations) {
        expect(rel.magnitude).toBeGreaterThanOrEqual(0);
        expect(rel.magnitude).toBeLessThanOrEqual(1);
      }
    });

    test("all relations have confidence in [0, 1]", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const rel of graph.relations) {
        expect(rel.confidence).toBeGreaterThanOrEqual(0);
        expect(rel.confidence).toBeLessThanOrEqual(1);
      }
    });

    test("all relations have non-empty derivedFrom", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const rel of graph.relations) {
        expect(rel.derivedFrom.length).toBeGreaterThan(0);
        expect(rel.derivedFrom[0]).toContain("deriver:");
      }
    });

    test("SOLID_VOID polarity is MUTUAL", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const solidVoid = graph.relations.find((r) => r.relationType === "SOLID_VOID");
      expect(solidVoid).toBeDefined();
      expect(solidVoid!.polarity).toBe("MUTUAL");
    });

    test("HOST_GUEST polarity is FORWARD", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const hostGuest = graph.relations.find((r) => r.relationType === "HOST_GUEST");
      expect(hostGuest).toBeDefined();
      expect(hostGuest!.polarity).toBe("FORWARD");
    });
  });

  // ── 未测量关系（降级策略）────────────────────────────────────────────

  describe("Unmeasured Relations (Degradation)", () => {
    test("single frame: MOVE_STILL is in unmeasuredRelations", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const unmeasuredTypes = graph.unmeasuredRelations.map((r) => r.relationType);
      expect(unmeasuredTypes).toContain("MOVE_STILL");
    });

    test("single frame: MOVE_STILL NOT in relations", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const relationTypes = graph.relations.map((r) => r.relationType);
      expect(relationTypes).not.toContain("MOVE_STILL");
    });

    test("no depth buffer: NEAR_FAR is in unmeasuredRelations", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const unmeasuredTypes = graph.unmeasuredRelations.map((r) => r.relationType);
      expect(unmeasuredTypes).toContain("NEAR_FAR");
    });

    test("no depth buffer: NEAR_FAR NOT in relations", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const relationTypes = graph.relations.map((r) => r.relationType);
      expect(relationTypes).not.toContain("NEAR_FAR");
    });

    test("unmeasured relations have reason and semantic ref", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const ur of graph.unmeasuredRelations) {
        expect(ur.reason.length).toBeGreaterThan(0);
        expect(ur.semanticInterpretationRef.length).toBeGreaterThan(0);
      }
    });

    test("two frames: MOVE_STILL is derived (not unmeasured)", () => {
      const frame = makeGradientFrame();
      const graph = buildFromFrames([frame, frame]);
      const relationTypes = graph.relations.map((r) => r.relationType);
      expect(relationTypes).toContain("MOVE_STILL");
      const unmeasuredTypes = graph.unmeasuredRelations.map((r) => r.relationType);
      expect(unmeasuredTypes).not.toContain("MOVE_STILL");
    });
  });

  // ── 拓扑不变量 ───────────────────────────────────────────────────────

  describe("Topology Invariants", () => {
    test("topology audit passes for gradient frame", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.topologyAudit.status).toBe("PASS");
    });

    test("no isolated nodes", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.topologyAudit.noIsolatedNodes).toBe(true);
    });

    test("polar alignment holds", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.topologyAudit.polarAlignment).toBe(true);
    });

    test("bounded energy holds", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.topologyAudit.boundedEnergy).toBe(true);
    });

    test("purity penetration holds (all edges have derivedFrom)", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.topologyAudit.purityPenetration).toBe(true);
    });

    test("solid frame also passes topology audit", () => {
      const graph = buildFromFrames([makeSolidFrame(128)]);
      expect(graph.topologyAudit.status).toBe("PASS");
    });
  });

  // ── 无语义泄漏 ────────────────────────────────────────────────────────

  describe("No Semantic Leakage (P0 defense)", () => {
    test("node IDs do not contain forbidden semantic terms", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const node of graph.nodes) {
        for (const term of FORBIDDEN_SEMANTIC_TERMS) {
          expect(node.id.toLowerCase()).not.toContain(term.toLowerCase());
        }
      }
    });

    test("derivedFrom do not contain forbidden semantic terms", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      for (const rel of graph.relations) {
        for (const ref of rel.derivedFrom) {
          for (const term of FORBIDDEN_SEMANTIC_TERMS) {
            expect(ref.toLowerCase()).not.toContain(term.toLowerCase());
          }
        }
      }
    });

    test("graph does not contain any aesthetic score field", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      const graphStr = JSON.stringify(graph);
      expect(graphStr).not.toContain("aestheticScore");
      expect(graphStr).not.toContain("chineseAestheticPass");
      expect(graphStr).not.toContain("qiyunScore");
    });
  });

  // ── 确定性 ───────────────────────────────────────────────────────────

  describe("Determinism (Byte-Identical Output)", () => {
    test("same evidence → same graph (JSON equality)", () => {
      const evidence = extractPhysicalEvidence(makeTestInput([makeGradientFrame()]));
      const graph1 = buildRelationshipGraph(evidence);
      const graph2 = buildRelationshipGraph(evidence);
      expect(JSON.stringify(graph1)).toBe(JSON.stringify(graph2));
    });

    test("same evidence → same graphHash", () => {
      const evidence = extractPhysicalEvidence(makeTestInput([makeGradientFrame()]));
      const graph1 = buildRelationshipGraph(evidence);
      const graph2 = buildRelationshipGraph(evidence);
      expect(graph1.graphHash).toBe(graph2.graphHash);
    });

    test("graphHash is deterministic and non-empty", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.graphHash.length).toBeGreaterThan(0);
      expect(graph.graphHash).toMatch(/^fnv1a:/);
    });

    test("different frames → different graphHash", () => {
      const graph1 = buildFromFrames([makeGradientFrame()]);
      const graph2 = buildFromFrames([makeSolidFrame(128)]);
      expect(graph1.graphHash).not.toBe(graph2.graphHash);
    });
  });

  // ── 真实 SoftwareRenderer 帧集成 ─────────────────────────────────────

  describe("Integration: Real SoftwareRenderer Frame", () => {
    let realEvidence: ObservableEvidenceSet;

    beforeAll(() => {
      const cellResult = runCell("MC-T01");
      expect(cellResult.success).toBe(true);
      expect(cellResult.renderResult).not.toBeNull();

      const input: ExtractorInput = {
        evidenceId: "real-mc-t01-graph",
        capturedAt: "2026-09-16T00:00:00Z",
        frames: [cellResult.renderResult!.pixelBuffer],
        width: 480,
        height: 270,
        depthBuffers: null,
        ir: {
          irHash: cellResult.renderResult!.renderHash,
          irType: "ValidatedDesignIR",
          paradigm: "TANG",
          compositionType: "central-axis",
          symmetry: cellResult.params?.symmetry ?? 0.7,
          negativeSpaceRatio: cellResult.params?.negativeSpaceRatio ?? 0.3,
          horizonPosition: 0.35,
          cameraPitch: cellResult.params?.cameraAngle ?? -15,
          lightingIntent: "DAYLIGHT",
          colorTemp: cellResult.params?.keyLightColorTemp ?? 5500,
          lightIntensity: cellResult.params?.keyLightIntensity ?? 1.0,
          lightSoftness: cellResult.params?.keyLightSoftness ?? 0.6,
          ambientRatio: cellResult.params?.ambientRatio ?? 0.35,
          materials: [
            {
              baseType: cellResult.params?.dominantBaseType ?? "BRONZE::tang-gilt-bronze",
              materialCategory: "BRONZE",
              roughness: cellResult.params?.dominantRoughness ?? 0.4,
              metalness: cellResult.params?.dominantMetalness ?? 0.9,
              wear: cellResult.params?.dominantWear ?? 0.3,
            },
          ],
          transformationTrace: cellResult.transformationTrace ?? [],
        },
        renderHash: cellResult.renderResult!.renderHash,
        rendererInfo: { type: "software-reference", version: "1.0.0" },
      };
      realEvidence = extractPhysicalEvidence(input);
    });

    test("real frame produces valid graph with PASS topology", () => {
      const graph = buildRelationshipGraph(realEvidence);
      expect(graph.topologyAudit.status).toBe("PASS");
      expect(graph.nodes.length).toBeGreaterThanOrEqual(10);
      expect(graph.relations.length).toBeGreaterThanOrEqual(8);
    });

    test("real frame graph has all core relation types", () => {
      const graph = buildRelationshipGraph(realEvidence);
      const types = new Set(graph.relations.map((r) => r.relationType));
      expect(types.has("HOST_GUEST")).toBe(true);
      expect(types.has("SOLID_VOID")).toBe(true);
      expect(types.has("DENSE_SPARSE")).toBe(true);
      expect(types.has("CENTER_EDGE")).toBe(true);
      expect(types.has("HIGH_LOW")).toBe(true);
      expect(types.has("HEAVY_LIGHT")).toBe(true);
    });

    test("real frame graph is deterministic", () => {
      const graph1 = buildRelationshipGraph(realEvidence);
      const graph2 = buildRelationshipGraph(realEvidence);
      expect(JSON.stringify(graph1)).toBe(JSON.stringify(graph2));
    });

    test("real frame graph preserves evidenceRefs", () => {
      const graph = buildRelationshipGraph(realEvidence);
      for (const node of graph.nodes) {
        expect(node.evidenceRefs.length).toBeGreaterThan(0);
      }
      for (const rel of graph.relations) {
        expect(rel.derivedFrom.length).toBeGreaterThan(0);
      }
    });
  });

  // ── 图结构绑定 ────────────────────────────────────────────────────────

  describe("Graph Structure Binding", () => {
    test("graphId is derived from evidenceId", () => {
      const evidence = extractPhysicalEvidence(makeTestInput([makeGradientFrame()]));
      const graph = buildRelationshipGraph(evidence);
      expect(graph.graphId).toContain(evidence.evidenceId);
    });

    test("generatedAt matches evidence capturedAt", () => {
      const evidence = extractPhysicalEvidence(makeTestInput([makeGradientFrame()]));
      const graph = buildRelationshipGraph(evidence);
      expect(graph.generatedAt).toBe(evidence.capturedAt);
    });

    test("derivationPipeline is non-empty and ordered", () => {
      const graph = buildFromFrames([makeGradientFrame()]);
      expect(graph.derivationPipeline.length).toBeGreaterThan(0);
      expect(graph.derivationPipeline[0]).toContain("instantiate");
      expect(graph.derivationPipeline[graph.derivationPipeline.length - 1]).toContain("hash");
    });
  });
});
