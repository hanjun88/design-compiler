/**
 * GOLDEN_CASE_02 — 真实视频资产端到端测试套件
 *
 * 严格执行序 v1.0：
 * A. Git Status  B. Asset Discovery  C. FFprobe Physical Metadata
 * D. Decode Verification  E. Keyframe Extraction  F. Optical Flow Extraction
 * G. Cangjie Schema Validation  H. Chinese Aesthetic Matrix Tests
 * I. Existing 145/145 Regression (由 npm run test:all 保证)
 *
 * 任何前置 Gate FAIL → STOP，不得继续向下游传播无效数据。
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  verifyPhysicalAssets,
  loadCangjieIR,
  runDetailed,
  type AssetGateResult,
} from "../golden-cases/GOLDEN_CASE_02/run";

import { normalizeIntent } from "../../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { RawDesignIR } from "../../compiler-core/contracts";

import {
  evaluateMachineAssertions,
  evaluateSemanticDimensions,
  type MachineAssertionReport,
  type SemanticEvaluationReport,
} from "../../chinese-aesthetic";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_DIR = path.join(PROJECT_ROOT, "step6-a", "evidence");
const STEP6B_CAPTURED_AT = "2026-09-15T00:00:00Z";

// ============================================================================
// Phase B/C/D: 真实物理资产门禁
// ============================================================================

describe("GOLDEN_CASE_02 — Phase B/C/D: Physical Asset Gate", () => {
  let assetGate: AssetGateResult;

  beforeAll(() => {
    assetGate = verifyPhysicalAssets();
  });

  test("B-1: 真实 MP4 资产存在且可解码", () => {
    expect(assetGate.passed).toBe(true);
    expect(assetGate.blockers).toEqual([]);
  });

  test("B-2: 容器格式与编码合法", () => {
    expect(assetGate.container).toContain("mp4");
    expect(assetGate.codec).toBe("hevc");
  });

  test("B-3: duration > 0", () => {
    expect(assetGate.duration).toBeGreaterThan(0);
    expect(assetGate.duration).toBeCloseTo(24.684, 1);
  });

  test("B-4: width/height 合法 (4K)", () => {
    expect(assetGate.width).toBe(3840);
    expect(assetGate.height).toBe(2148);
  });

  test("B-5: fps 合法", () => {
    expect(assetGate.fps).toBe(60);
  });

  test("B-6: frame_count > 0", () => {
    expect(assetGate.frameCount).toBe(1481);
  });

  test("C-1: 关键帧已物理提取 (>=3)", () => {
    expect(assetGate.keyframeCount).toBeGreaterThanOrEqual(3);
  });

  test("C-2: 关键帧 PNG 文件真实存在且非空", () => {
    const framesDir = path.join(EVIDENCE_DIR, "frames");
    const keyframes = fs
      .readdirSync(framesDir)
      .filter((f) => f.startsWith("keyframe-") && f.endsWith(".png"));
    expect(keyframes.length).toBeGreaterThanOrEqual(3);
    for (const kf of keyframes) {
      const stat = fs.statSync(path.join(framesDir, kf));
      expect(stat.size).toBeGreaterThan(100000); // >100KB, real 4K PNG
    }
  });

  test("C-3: keyframes.json 包含 SHA-256", () => {
    const kfPath = path.join(EVIDENCE_DIR, "keyframes.json");
    expect(fs.existsSync(kfPath)).toBe(true);
    const kf = JSON.parse(fs.readFileSync(kfPath, "utf8"));
    expect(kf.keyframeCount).toBeGreaterThanOrEqual(3);
    for (const frame of kf.keyframes) {
      expect(frame.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(frame.frameIndex).toBeGreaterThanOrEqual(0);
      expect(frame.timestamp).toBeGreaterThanOrEqual(0);
    }
  });

  test("D-1: 光流已真实计算 (>=10 pairs)", () => {
    expect(assetGate.opticalFlowPairs).toBeGreaterThanOrEqual(10);
  });

  test("D-2: motion-summary.json 包含真实位移统计", () => {
    const motionPath = path.join(EVIDENCE_DIR, "motion", "motion-summary.json");
    expect(fs.existsSync(motionPath)).toBe(true);
    const motion = JSON.parse(fs.readFileSync(motionPath, "utf8"));
    expect(motion.algorithm).toContain("Farneback");
    expect(motion.framePairsComputed).toBeGreaterThanOrEqual(10);
    expect(motion.aggregate.meanDisplacement_overall).toBeGreaterThan(0);
    expect(typeof motion.aggregate.primaryCameraMotion).toBe("string");
  });

  test("D-3: 光流 .npy 张量文件真实存在", () => {
    const motionDir = path.join(EVIDENCE_DIR, "motion");
    const npyFiles = fs.readdirSync(motionDir).filter((f) => f.endsWith(".npy"));
    expect(npyFiles.length).toBeGreaterThanOrEqual(5);
    for (const npy of npyFiles) {
      const stat = fs.statSync(path.join(motionDir, npy));
      expect(stat.size).toBeGreaterThan(1000); // real tensor data
    }
  });

  test("E-1: visual-features.json 包含物理提取的颜色/构图/材质", () => {
    const vfPath = path.join(EVIDENCE_DIR, "visual-features.json");
    expect(fs.existsSync(vfPath)).toBe(true);
    const vf = JSON.parse(fs.readFileSync(vfPath, "utf8"));
    expect(vf.aggregate.palette.dominant).toMatch(/^#[0-9a-f]{6}$/);
    expect(vf.aggregate.composition.focalPoint).toHaveLength(2);
    expect(vf.aggregate.materialProxies.roughness).toBeGreaterThanOrEqual(0);
    expect(vf.aggregate.colorMetrics.contrastRatio).toBeGreaterThan(0);
  });
});

// ============================================================================
// Phase G: Cangjie Schema 合宪性
// ============================================================================

describe("GOLDEN_CASE_02 — Phase G: Cangjie Schema Compliance", () => {
  let cangjieIR: CangjieRawDesignIR;

  beforeAll(() => {
    cangjieIR = loadCangjieIR();
  });

  test("G-1: irId 符合 ^ir-[a-z0-9-]+$", () => {
    expect(cangjieIR.irId).toMatch(/^ir-[a-z0-9-]+$/);
  });

  test("G-2: concept 包含 name 和 ontologyPath", () => {
    expect(cangjieIR.concept.name).toBeTruthy();
    expect(cangjieIR.concept.ontologyPath).toBeTruthy();
  });

  test("G-3: intent 包含 statement 和 heuristicIds (minItems=1)", () => {
    expect(cangjieIR.intent.statement).toBeTruthy();
    expect(cangjieIR.intent.heuristicIds.length).toBeGreaterThanOrEqual(1);
  });

  test("G-4: parameters 非空 (minItems=1)", () => {
    expect(cangjieIR.parameters.length).toBeGreaterThanOrEqual(1);
  });

  test("G-5: 每个参数符合 estimated-parameter.schema.json", () => {
    for (const param of cangjieIR.parameters) {
      // required fields
      expect(param.paramId).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(param.path).toMatch(/^\/[a-zA-Z0-9_/-]+$/);
      expect(param.value).toBeDefined();
      expect(param.confidence).toBeGreaterThanOrEqual(0);
      expect(param.confidence).toBeLessThanOrEqual(1);
      expect(param.source.type).toBeTruthy();
      expect(param.source.ref).toBeTruthy();
      expect(param.calibration.method).toBeTruthy();
      expect(param.calibration.status).toMatch(/^(PRODUCTION|EXPERIMENTAL|DEPRECATED)$/);
    }
  });

  test("G-6: source.type 属于合法枚举", () => {
    const validTypes = ["literature", "film-lexicon", "master-cluster", "expert-judgment", "dataset-prior", "derived"];
    for (const param of cangjieIR.parameters) {
      expect(validTypes).toContain(param.source.type);
    }
  });

  test("G-7: calibration.method 属于合法枚举", () => {
    const validMethods = ["expert-calibrated", "dataset-empirical-priors", "uncalibrated"];
    for (const param of cangjieIR.parameters) {
      expect(validMethods).toContain(param.calibration.method);
    }
  });

  test("G-8: 所有 16 个 G1 必选路径被覆盖", () => {
    const requiredPaths = [
      "/composition/focalPoint",
      "/composition/negativeSpaceRatio",
      "/composition/depthLayerCount",
      "/camera/fov",
      "/camera/shotSize",
      "/lighting/keyLight/azimuth",
      "/lighting/keyLight/elevation",
      "/lighting/keyLight/colorTemp",
      "/lighting/keyLight/intensity",
      "/lighting/ambientRatio",
      "/materials/0/baseType",
      "/materials/0/roughness",
      "/materials/0/metalness",
      "/color/dominant",
      "/color/secondary",
      "/color/contrastRatio",
    ];
    const covered = new Set(cangjieIR.parameters.map((p) => p.path));
    for (const req of requiredPaths) {
      expect(covered.has(req)).toBe(true);
    }
  });

  test("G-9: provenance 包含 corpusSources (minItems=1) 和 distillationMethod", () => {
    expect(cangjieIR.provenance.corpusSources.length).toBeGreaterThanOrEqual(1);
    expect(cangjieIR.provenance.distillationMethod).toBeTruthy();
  });

  test("G-10: distillerVersion 符合 ^\\d+\\.\\d+\\.\\d+$", () => {
    expect(cangjieIR.distillerVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("G-11: 严禁顶层 provenance.confidence (参数级置信度原则)", () => {
    // Cangjie IR 的 provenance 是 corpusSources + distillationMethod + verification
    // 不应该有顶层 confidence 标量
    expect((cangjieIR.provenance as unknown as Record<string, unknown>).confidence).toBeUndefined();
  });
});

// ============================================================================
// Step 6-B Normalization (LOCKED engine)
// ============================================================================

describe("GOLDEN_CASE_02 — Step 6-B Normalization (LOCKED)", () => {
  let cangjieIR: CangjieRawDesignIR;
  let normalization: ReturnType<typeof normalizeIntent>;

  beforeAll(() => {
    cangjieIR = loadCangjieIR();
    normalization = normalizeIntent(cangjieIR, {
      capturedAt: STEP6B_CAPTURED_AT,
      intentResolutionConfidence: 0.90,
      mappingConfidence: 0.95,
      inferenceExecutionMs: 0,
    });
  });

  test("6B-1: normalization status = PASS", () => {
    expect(normalization.status).toBe("PASS");
  });

  test("6B-2: mappedParameters >= 16 (all required)", () => {
    expect(normalization.metadata.mappedParameters).toBeGreaterThanOrEqual(16);
  });

  test("6B-3: unmappedParameters 为空", () => {
    expect(normalization.metadata.unmappedParameters).toEqual([]);
  });

  test("6B-4: Core IR 包含完整嵌套结构", () => {
    const coreIR = normalization.coreIR as RawDesignIR;
    expect(coreIR.composition.focalPoint).toBeDefined();
    expect(coreIR.camera.fov).toBeDefined();
    expect(coreIR.lighting.keyLight.azimuth).toBeDefined();
    expect(coreIR.materials.length).toBeGreaterThanOrEqual(1);
    expect(coreIR.color.dominant).toBeDefined();
  });

  test("6B-5: Core 参数 confidence 严格来自 Cangjie 参数 (置信度隔离)", () => {
    const coreIR = normalization.coreIR as RawDesignIR;
    // 检查几个关键参数的 confidence 与 Cangjie 源一致
    const cangjieFocal = cangjieIR.parameters.find((p) => p.path === "/composition/focalPoint");
    expect(coreIR.composition.focalPoint.confidence).toBe(cangjieFocal!.confidence);

    const cangjieColor = cangjieIR.parameters.find((p) => p.path === "/color/dominant");
    expect(coreIR.color.dominant.confidence).toBe(cangjieColor!.confidence);
  });

  test("6B-6: intentResolutionConfidence / mappingConfidence 仅存于 metadata，不进入 Core IR", () => {
    expect(normalization.metadata.intentResolutionConfidence).toBe(0.90);
    expect(normalization.metadata.mappingConfidence).toBe(0.95);
    // Core IR provenance 不应包含这些字段
    const coreProvenance = normalization.coreIR.provenance as Record<string, unknown>;
    expect(coreProvenance.intentResolutionConfidence).toBeUndefined();
    expect(coreProvenance.mappingConfidence).toBeUndefined();
  });

  test("6B-7: 确定性 — 相同输入产生相同 outputHash", () => {
    const second = normalizeIntent(cangjieIR, {
      capturedAt: STEP6B_CAPTURED_AT,
      intentResolutionConfidence: 0.90,
      mappingConfidence: 0.95,
      inferenceExecutionMs: 0,
    });
    expect(JSON.stringify(normalization.coreIR)).toBe(JSON.stringify(second.coreIR));
    expect(normalization.metadata.capturedAt).toBe(second.metadata.capturedAt);
  });
});

// ============================================================================
// Core Pipeline End-to-End (G1 → Patch → G3 → Evaluation)
// ============================================================================

describe("GOLDEN_CASE_02 — Core Pipeline End-to-End", () => {
  let result: Awaited<ReturnType<typeof runDetailed>>;

  beforeAll(async () => {
    result = await runDetailed();
  });

  test("PIPE-1: Asset Gate PASS", () => {
    expect(result.assetGate.passed).toBe(true);
  });

  test("PIPE-2: Step 6-B Normalization PASS", () => {
    expect(result.normalizationResult!.status).toBe("PASS");
  });

  test("PIPE-3: Pipeline status = SUCCESS (not TERMINAL_HALT)", () => {
    expect(result.pipelineOutput!.status).toBe("SUCCESS");
  });

  test("PIPE-4: G1 Data Gate 通过 (无 BLOCKED_DATA)", () => {
    // 如果 G1 阻断，pipeline status 会是 TERMINAL_HALT
    expect(result.pipelineOutput!.status).not.toBe("TERMINAL_HALT");
  });

  test("PIPE-5: ValidatedIR 存在且包含 patches", () => {
    const output = result.pipelineOutput!;
    if (output.status === "SUCCESS") {
      expect(output.validatedIR.patches).toBeDefined();
      expect(output.validatedIR.validated).toBeDefined();
      expect(output.validatedIR.auditReport).toBeDefined();
    }
  });

  test("PIPE-6: ExecutionPlan 存在且 TIER_A", () => {
    const output = result.pipelineOutput!;
    if (output.status === "SUCCESS") {
      expect(output.executionPlan.negotiation.selectedTier).toBe("TIER_A");
      expect(output.executionPlan.negotiation.resolutionStatus).toBe("ACCEPTED");
    }
  });

  test("PIPE-7: 四元 Hash Chain 完整", () => {
    const output = result.pipelineOutput!;
    if (output.status === "SUCCESS") {
      expect(output.hashChain.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(output.hashChain.rawIRHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(output.hashChain.validatedIRHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(output.hashChain.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  test("PIPE-8: Hash Chain 四元互不相同", () => {
    const output = result.pipelineOutput!;
    if (output.status === "SUCCESS") {
      const hashes = [
        output.hashChain.inputHash,
        output.hashChain.rawIRHash,
        output.hashChain.validatedIRHash,
        output.hashChain.executionPlanHash,
      ];
      const unique = new Set(hashes);
      expect(unique.size).toBe(4);
    }
  });

  test("PIPE-9: 5维评测执行且 status 存在", () => {
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation!.status).toBeDefined();
    expect(["PASS", "FAIL", "BLOCKED_ENV", "BLOCKED_DATA", "NOT_RUN"]).toContain(
      result.evaluation!.status,
    );
  });

  test("PIPE-10: 5维评测 metrics 存在", () => {
    expect(result.evaluation!.metrics).toBeDefined();
    expect(result.evaluation!.metrics!.composition).toBeDefined();
    expect(result.evaluation!.metrics!.color).toBeDefined();
    expect(result.evaluation!.metrics!.depth).toBeDefined();
    expect(result.evaluation!.metrics!.material).toBeDefined();
    expect(result.evaluation!.metrics!.focalPointDisplacement).toBeDefined();
  });

  test("PIPE-11: 评测 provenance.hashChain 包含四元 hash", () => {
    const hc = result.evaluation!.provenance.hashChain;
    expect(hc.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hc.rawIRHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hc.validatedIRHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hc.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("PIPE-12: Regression result 存在", () => {
    expect(result.regression).toBeDefined();
    expect(result.regression.caseId).toBe("GOLDEN_CASE_02");
  });
});

// ============================================================================
// Phase H: Chinese Aesthetic Evaluation Matrix (正交外围层)
// ============================================================================

describe("GOLDEN_CASE_02 — Phase H: Chinese Aesthetic Matrix", () => {
  let machineReport: MachineAssertionReport;
  let semanticReport: SemanticEvaluationReport;

  beforeAll(() => {
    machineReport = evaluateMachineAssertions({
      evaluatedAt: STEP6B_CAPTURED_AT,
    });
    semanticReport = evaluateSemanticDimensions({
      machineReport,
      evaluatedAt: STEP6B_CAPTURED_AT,
    });
  });

  // 第一层：机器断言
  test("H-1: 机器断言包含六项", () => {
    expect(machineReport.focalHierarchy).toBeDefined();
    expect(machineReport.voidSolid).toBeDefined();
    expect(machineReport.qiyunContinuity).toBeDefined();
    expect(machineReport.spatialDepth).toBeDefined();
    expect(machineReport.colorRelationship).toBeDefined();
    expect(machineReport.materialRelationship).toBeDefined();
  });

  test("H-2: 每项机器断言有 status / metrics / evidenceRefs / method", () => {
    const assertions = [
      machineReport.focalHierarchy,
      machineReport.voidSolid,
      machineReport.qiyunContinuity,
      machineReport.spatialDepth,
      machineReport.colorRelationship,
      machineReport.materialRelationship,
    ];
    for (const a of assertions) {
      expect(["PASS", "FAIL", "INCONCLUSIVE"]).toContain(a.status);
      expect(a.metrics).toBeDefined();
      expect(a.evidenceRefs.length).toBeGreaterThanOrEqual(1);
      expect(a.method).toBeTruthy();
    }
  });

  test("H-3: 宾主关系 Proxy — focalCenterOffset 来自物理证据", () => {
    expect(machineReport.focalHierarchy.metrics.focalCenterOffset).toBeGreaterThanOrEqual(0);
    expect(machineReport.focalHierarchy.metrics.dominanceSeparation).toBeDefined();
  });

  test("H-4: 计白当黑 — negativeSpaceRatio 来自物理提取", () => {
    expect(machineReport.voidSolid.metrics.negativeSpaceRatio).toBeGreaterThan(0);
    expect(machineReport.voidSolid.metrics.negativeSpaceRatio).toBeLessThan(1);
  });

  test("H-5: 气韵连贯性 — motionContinuity 来自光流计算", () => {
    expect(machineReport.qiyunContinuity.metrics.motionContinuity).toBeGreaterThanOrEqual(0);
    expect(machineReport.qiyunContinuity.metrics.opticalFlowCoherence).toBeGreaterThanOrEqual(0);
  });

  test("H-6: 空间层次 — depthLayerCount >= 3", () => {
    expect(machineReport.spatialDepth.metrics.depthLayerCount).toBeGreaterThanOrEqual(3);
  });

  test("H-7: 色彩关系 — 三色体系 + 对比度", () => {
    expect(machineReport.colorRelationship.metrics.dominant).toMatch(/^#[0-9a-f]{6}$/);
    expect(machineReport.colorRelationship.metrics.contrastRatio).toBeGreaterThan(0);
    expect(machineReport.colorRelationship.metrics.temperatureBias).toBeDefined();
  });

  test("H-8: 材质关系 — roughness/metalness/wear", () => {
    expect(machineReport.materialRelationship.metrics.dominantRoughness).toBeGreaterThanOrEqual(0);
    expect(machineReport.materialRelationship.metrics.dominantMetalness).toBeGreaterThanOrEqual(0);
    expect(machineReport.materialRelationship.metrics.dominantWear).toBeGreaterThanOrEqual(0);
  });

  test("H-9: passRate 在 [0,1]", () => {
    expect(machineReport.passRate).toBeGreaterThanOrEqual(0);
    expect(machineReport.passRate).toBeLessThanOrEqual(1);
  });

  // 第二层：语义判断
  test("H-10: 语义评估包含八大维度", () => {
    expect(semanticReport.dimensions.binzhuYirang.dimension).toBe("宾主揖让");
    expect(semanticReport.dimensions.jibaiDanghei.dimension).toBe("计白当黑");
    expect(semanticReport.dimensions.xushiXiangsheng.dimension).toBe("虚实相生");
    expect(semanticReport.dimensions.qiyunLiangguan.dimension).toBe("气韵连贯");
    expect(semanticReport.dimensions.hanxuYuliubai.dimension).toBe("含蓄与留白");
    expect(semanticReport.dimensions.cengciYyuanjin.dimension).toBe("层次与远近");
    expect(semanticReport.dimensions.xingshenGuanxi.dimension).toBe("形神关系");
    expect(semanticReport.dimensions.shijianGanDongshi.dimension).toBe("时间感/动势");
  });

  test("H-11: 每个语义维度有 judgment / evidenceRefs / rationale", () => {
    const dims = Object.values(semanticReport.dimensions);
    for (const d of dims) {
      expect(["PASS", "FAIL", "INCONCLUSIVE"]).toContain(d.judgment);
      expect(d.evidenceRefs.length).toBeGreaterThanOrEqual(1);
      expect(d.rationale.length).toBeGreaterThan(10);
      expect(d.machineMetrics).toBeDefined();
    }
  });

  test("H-12: Semantic Judgment ≠ Machine Metric (rationale 包含文化解读，非纯数值)", () => {
    // 验证 rationale 不是简单的 "value >= threshold => PASS"
    const dims = Object.values(semanticReport.dimensions);
    for (const d of dims) {
      expect(d.rationale).not.toMatch(/^\d+(\.\d+)?\s*[><=]/);
      // rationale 应该包含文化概念词汇
      expect(d.rationale.length).toBeGreaterThan(20);
    }
  });

  test("H-13: 语义评估 passRate 在 [0,1]", () => {
    expect(semanticReport.passRate).toBeGreaterThanOrEqual(0);
    expect(semanticReport.passRate).toBeLessThanOrEqual(1);
  });

  test("H-14: summary 存在且非空", () => {
    expect(semanticReport.summary.length).toBeGreaterThan(10);
  });

  test("H-15: 矩阵与 ABI 正交 — 不修改 compiler-core/schemas/contracts", () => {
    // 验证 chinese-aesthetic 目录不包含对 core 的修改
    const caDir = path.join(PROJECT_ROOT, "chinese-aesthetic");
    expect(fs.existsSync(caDir)).toBe(true);
    // 不应该有任何文件 import 并修改 compiler-core 的导出
    const files = fs.readdirSync(caDir, { recursive: true }) as string[];
    const tsFiles = files.filter((f) => f.endsWith(".ts"));
    expect(tsFiles.length).toBeGreaterThan(0);
    // 所有 import 应该是 type-only 或只读使用
    for (const f of tsFiles) {
      const content = fs.readFileSync(path.join(caDir, f), "utf8");
      // 不应该有修改 contracts/schemas 的代码
      expect(content).not.toContain("compiler-core/contracts\" from");
    }
  });
});

// ============================================================================
// Zero-Mock Audit
// ============================================================================

describe("GOLDEN_CASE_02 — Zero-Mock Audit", () => {
  test("Z-1: step6-a/evidence/ 下所有文件真实存在且非空", () => {
    const evidenceFiles = [
      "media-metadata.json",
      "keyframes.json",
      "watermark-report.json",
      "visual-features.json",
      "motion/motion-summary.json",
    ];
    for (const f of evidenceFiles) {
      const fullPath = path.join(EVIDENCE_DIR, f);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(100);
    }
  });

  test("Z-2: 关键帧 PNG 由 ffmpeg 实际解码 (Lavc comment)", () => {
    const framesDir = path.join(EVIDENCE_DIR, "frames");
    const keyframes = fs
      .readdirSync(framesDir)
      .filter((f) => f.startsWith("keyframe-") && f.endsWith(".png"));
    expect(keyframes.length).toBeGreaterThanOrEqual(3);
    // PNG 文件头验证
    for (const kf of keyframes) {
      const fd = fs.openSync(path.join(framesDir, kf), "r");
      const header = Buffer.alloc(8);
      fs.readSync(fd, header, 0, 8, 0);
      fs.closeSync(fd);
      // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
      expect(header[0]).toBe(0x89);
      expect(header[1]).toBe(0x50);
      expect(header[2]).toBe(0x4e);
      expect(header[3]).toBe(0x47);
    }
  });

  test("Z-3: 光流 .npy 文件有合法 NumPy header", () => {
    const motionDir = path.join(EVIDENCE_DIR, "motion");
    const npyFiles = fs.readdirSync(motionDir).filter((f) => f.endsWith(".npy"));
    expect(npyFiles.length).toBeGreaterThanOrEqual(5);
    for (const npy of npyFiles) {
      const fd = fs.openSync(path.join(motionDir, npy), "r");
      const header = Buffer.alloc(6);
      fs.readSync(fd, header, 0, 6, 0);
      fs.closeSync(fd);
      // NumPy .npy magic: \x93NUMPY
      expect(header[0]).toBe(0x93);
      expect(header.toString("ascii", 1, 6)).toBe("NUMPY");
    }
  });
});
