/**
 * Anti-Pattern Gate Tests — 反模式门禁测试
 *
 * Phase 2 Step 2.4: 验证 6 大反模式门禁的判定逻辑、宪法约束和确定性。
 *
 * 测试覆盖：
 * - 正常构图（全部 ALLOW）
 * - ANTI-01 Symbolic Stacking
 * - ANTI-02 Unphysical Glow
 * - ANTI-03 Dead Void
 * - ANTI-04 Conflicted Hierarchy
 * - ANTI-05 Toxic Saturation
 * - ANTI-06 Fake Evidence
 * - 宪法约束：UNMEASURED ≠ FAIL
 * - 确定性：相同输入 → 相同 reportHash
 * - 宪法合规性自检
 *
 * 阈值不在测试里定义：每个门禁的阈值来自 skill 发出的 AestheticConstraintSheet（经 DecisionPack 读取），
 * 夹具里所有落在阈值两侧的取值都由该 pack 派生（见 helpers/fixtures.ts）。
 * 逐门禁的判定表、边界、"阈值确实来自 sheet"、fail-closed 见 anti-pattern-thresholds.test.ts。
 */

import { runAntiPatternGate } from "../../../chinese-aesthetic/anti-pattern/anti-pattern-gate";
import { connectedComposition, field, gatePolicy, makeEvidence, makeGraph, NEUTRAL_ENERGY, node, ratioAbove, relation } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("Anti-Pattern Gate — Phase 2 Step 2.4", () => {
  describe("Normal Composition", () => {
    test("normal composition passes all gates", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.overallVerdict).toBe("ALLOW");
      expect(report.rejectedGates.length).toBe(0);
    });

    test("all gate results have evidenceRefs", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      for (const result of report.gateResults) {
        expect(result.evidenceRefs.length).toBeGreaterThan(0);
      }
    });

    test("constitution compliance passes", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.constitutionCompliance.compliant).toBe(true);
    });
  });

  describe("ANTI-06: Fake Evidence (Highest Priority)", () => {
    test("contaminated purity audit triggers REJECT", () => {
      const evidence = {
        ...makeEvidence(),
        purityAudit: {
          auditedAt: "2026-09-16T00:00:00Z",
          totalFields: 50,
          measuredFields: 45,
          unmeasuredFields: 5,
          hardcodedConstantsFound: ["roughness ?? 0.7", "metalness ?? 0.0"],
          fieldsMissingEvidenceRef: ["field1", "field2"],
          fieldsMissingConfidence: ["field3"],
          purityStatus: "CONTAMINATED" as const,
          contaminationDetails: ["hardcoded default injection detected"],
        },
      };
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      const anti06 = report.gateResults.find((r) => r.gateId === "ANTI-06");
      expect(anti06?.verdict).toBe("REJECT");
      expect(report.overallVerdict).toBe("REJECT");
      expect(report.rejectedGates).toContain("ANTI-06");
    });

    test("pure evidence passes ANTI-06", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      const anti06 = report.gateResults.find((r) => r.gateId === "ANTI-06");
      expect(anti06?.verdict).toBe("ALLOW");
    });
  });

  describe("ANTI-03: Dead Void (Constitution: UNMEASURED ≠ FAIL)", () => {
    test("large void with zero gradient but no depth evidence only FLAG (not REJECT)", () => {
      // every dead-void signal satisfied: the void is large, dominated by one region, and has no
      // texture, no atmospheric gradient and no tonal variation — but no depth evidence exists
      const t = gatePolicy("dead-void");
      const evidence = makeEvidence({
        pixel: {
          negativeSpaceRatio: field(ratioAbove(t.num("candidate_void_ratio_above")), "pixel:void-ratio"),
          largestVoidRegionRatio: field(ratioAbove(t.num("dominant_void_region_ratio_above")), "pixel:largest-void"),
          spatialLaplacianVariance: field(t.num("laplacian_variance_below") / 2, "pixel:laplacian"),
          blockLuminanceMeanGradient: field(t.num("block_luminance_gradient_below") / 2, "pixel:block-gradient"),
          luminanceStdDev: field(t.num("luminance_std_below") / 2, "pixel:luminance-std"),
        },
      });
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      const anti03 = report.gateResults.find((r) => r.gateId === "ANTI-03");
      // 无深度证据时，即使有信号也只 FLAG 不 REJECT
      expect(anti03?.verdict).not.toBe("REJECT");
      expect(anti03?.unmeasuredReason).toBeDefined();
    });
  });

  describe("ANTI-04: Conflicted Hierarchy", () => {
    test("multiple subjects with close energy and no hierarchy triggers REJECT", () => {
      // two SUBJECT nodes whose energies differ by well under the "close" cut-off; both host the space, neither hosts the other
      const close = gatePolicy("conflicted-hierarchy").num("close_energy_diff_ratio_below");
      const stronger = NEUTRAL_ENERGY;
      const weaker = stronger * (1 - close / 2);
      const graph = makeGraph(
        [node("n0", "SUBJECT", stronger), node("n1", "SUBJECT", weaker), node("n2", "SPACE")],
        [
          // 注意：两个 SUBJECT 之间没有 HOST_GUEST 边
          relation("n0", "n2", "HOST_GUEST"),
          relation("n1", "n2", "HOST_GUEST"),
        ],
      );
      const evidence = makeEvidence();
      const report = runAntiPatternGate(evidence, graph);
      const anti04 = report.gateResults.find((r) => r.gateId === "ANTI-04");
      expect(anti04?.verdict).toBe("REJECT");
    });

    test("single subject passes ANTI-04", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      const anti04 = report.gateResults.find((r) => r.gateId === "ANTI-04");
      expect(anti04?.verdict).toBe("ALLOW");
    });
  });

  describe("Determinism", () => {
    test("same input produces same reportHash", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report1 = runAntiPatternGate(evidence, graph);
      const report2 = runAntiPatternGate(evidence, graph);
      expect(report1.reportHash).toBe(report2.reportHash);
    });

    test("different evidence produces different reportHash", () => {
      const graph = connectedComposition();
      const report1 = runAntiPatternGate(makeEvidence(), graph);
      const report2 = runAntiPatternGate(
        { ...makeEvidence(), evidenceId: "different-evidence" },
        graph,
      );
      expect(report1.reportHash).not.toBe(report2.reportHash);
    });
  });

  describe("Report Structure", () => {
    test("report contains all 6 gate results", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.gateResults.length).toBe(6);
      const gateIds = report.gateResults.map((r) => r.gateId);
      expect(gateIds).toContain("ANTI-01");
      expect(gateIds).toContain("ANTI-02");
      expect(gateIds).toContain("ANTI-03");
      expect(gateIds).toContain("ANTI-04");
      expect(gateIds).toContain("ANTI-05");
      expect(gateIds).toContain("ANTI-06");
    });

    test("report has valid overall verdict", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      expect(["ALLOW", "FLAG", "REJECT"]).toContain(report.overallVerdict);
    });

    test("report hash follows fnv1a: prefix format", () => {
      const evidence = makeEvidence();
      const graph = connectedComposition();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.reportHash).toMatch(/^fnv1a:/);
    });
  });
});
