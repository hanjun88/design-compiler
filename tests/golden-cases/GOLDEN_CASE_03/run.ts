/**
 * GOLDEN_CASE_03 — 真实抖音视频资产端到端贯通测试运行器
 *
 * 测试目标：从真实MP4视频物理提取 → Cangjie蒸馏 → Step 6-B降维 →
 *           Core Compiler全链路 → 真实Software Render → 5维评测 → ABI 1.0.0合规
 *
 * 场景：万重宫阙藏云海 — 巨构宫阙悬浮云海，白玉廊桥，朱雀翔空，莲池映天，
 *       白衣微人仰望神性建筑，暖金粉调东方仙境
 * 资产：fixtures/GOLDEN_CASE_03/source-video.mp4 (1920x1080, 30fps, 112.57s, H.264, 无平台水印)
 * 来源：抖音博主 风铃Muse 中式巨构教程第20集，CloakBrowser网络拦截下载
 *
 * 十一环因果链：
 * 1. sourceVideo  2. frames  3. motion  4. CangjieParams  5. Intent
 * 6. RawDesignIR(rawIRHash)  7. ValidatedDesignIR(validatedIRHash)
 * 8. ExecutionPlan(executionPlanHash)  9. REAL Render(renderHash, pixel buffer)
 * 10. AestheticEvaluation  11. RegressionResult
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { PipelineRunner, type PipelineOutput } from "../../../compiler-core/pipeline-runner";
import { evaluate } from "../../../evaluation/index";
import type {
  RawDesignIR,
  ValidatedDesignIR,
  FidelityEvaluationResult,
  RuntimeExecutionPlan,
} from "../../../compiler-core/contracts";
import type { HostCapabilities } from "../../../compiler-core/capability-negotiator";
import type { GoldenCase, RegressionResult } from "../../../governance/regression-runner";

// Step 6-B LOCKED normalizer
import { normalizeIntent } from "../../../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR } from "../../../compiler-intent/types";

// STEP 8-B: Physical Asset Gate — 穿透式三向对账
import {
  verifyPhysicalAssetsStrict,
  type StrictAssetGateResult,
} from "../../../step6-a/verifier/physical-asset-gate";

// GATE B: Real software renderer (deterministic procedural rasterization)
import { SoftwareRenderer, type RenderResult } from "../../../render-engine";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const CASE_DIR = __dirname;
const EVIDENCE_DIR = path.join(PROJECT_ROOT, "step6-a", "evidence-03");

// Deterministic capturedAt for Step 6-B (禁止 new Date())
const STEP6B_CAPTURED_AT = "2026-09-15T00:00:00Z";

// ========== 资产与案例加载 ==========

export function loadCase(): GoldenCase {
  const casePath = path.join(CASE_DIR, "case.json");
  return JSON.parse(fs.readFileSync(casePath, "utf8")) as GoldenCase;
}

export function loadCangjieIR(): CangjieRawDesignIR {
  const irPath = path.join(CASE_DIR, "cangjie-ir.json");
  return JSON.parse(fs.readFileSync(irPath, "utf8")) as CangjieRawDesignIR;
}

// ========== 物理资产门禁 ==========

export interface AssetGateResult {
  passed: boolean;
  sourceVideo: string;
  container: string;
  codec: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  keyframeCount: number;
  opticalFlowPairs: number;
  blockers: string[];
}

/**
 * 验证真实物理资产存在且元数据合法。
 *
 * STEP 8-B 升级：穿透式三向对账
 *   1. ffprobe 实时探测（物理流实测）
 *   2. media-metadata.json（声明元数据）
 *   3. asset-spec.json（门禁阈值）
 *
 * 终结"读取声明文件即判定 PASS"的自循环伪验证。
 */
export function verifyPhysicalAssets(): AssetGateResult {
  const blockers: string[] = [];

  // 1. 源视频存在
  const sourceVideo = path.join(PROJECT_ROOT, "fixtures", "GOLDEN_CASE_03", "source-video.mp4");
  if (!fs.existsSync(sourceVideo)) {
    blockers.push("source-video.mp4 not found");
  }

  // 2. 读取门禁阈值声明 (asset-spec.json)
  const assetSpecPath = path.join(CASE_DIR, "asset-spec.json");
  let assetSpec: Record<string, unknown> = {};
  if (fs.existsSync(assetSpecPath)) {
    assetSpec = JSON.parse(fs.readFileSync(assetSpecPath, "utf8"));
  } else {
    blockers.push("asset-spec.json not found");
  }

  const expected = (assetSpec.expected as Record<string, unknown>) ?? {};
  const tolerances = (assetSpec.tolerances as Record<string, unknown>) ?? {};
  const evidencePaths = (assetSpec.evidencePaths as Record<string, unknown>) ?? {};

  // 3. 执行穿透式三向对账 (ffprobe 实时探测 ↔ 声明元数据 ↔ 门禁阈值)
  let strictResult: StrictAssetGateResult | undefined;
  if (blockers.length === 0) {
    try {
      strictResult = verifyPhysicalAssetsStrict({
        sourceVideoPath: sourceVideo,
        metadataPath: path.join(PROJECT_ROOT, String(evidencePaths.metadata ?? "step6-a/evidence-03/media-metadata.json")),
        watermarkReportPath: path.join(PROJECT_ROOT, String(evidencePaths.watermarkReport ?? "step6-a/evidence-03/watermark-report.json")),
        keyframesPath: path.join(PROJECT_ROOT, String(evidencePaths.keyframes ?? "step6-a/evidence-03/keyframes.json")),
        motionSummaryPath: path.join(PROJECT_ROOT, String(evidencePaths.motionSummary ?? "step6-a/evidence-03/motion/motion-summary.json")),
        expected: {
          codec: String(expected.codec ?? "h264"),
          fps: Number(expected.fps ?? 30),
          duration: Number(expected.duration ?? 112.57),
          frameCount: Number(expected.frameCount ?? 3377),
          watermarkDetected: Boolean(expected.watermarkDetected ?? false),
          minOpticalFlowPairs: Number(expected.minOpticalFlowPairs ?? 10),
          minKeyframes: Number(expected.minKeyframes ?? 3),
        },
        tolerances: {
          fps: Number(tolerances.fps ?? 0.05),
          duration: Number(tolerances.duration ?? 0.1),
        },
      });

      if (!strictResult.passed) {
        blockers.push(...strictResult.blockers);
      }
    } catch (err) {
      blockers.push(`STRICT_GATE_EXCEPTION: ${(err as Error).message}`);
    }
  }

  // 4. 从 strict result 或降级路径提取元数据
  const duration = strictResult?.ffprobe.duration ?? 0;
  const width = strictResult?.ffprobe.width ?? 0;
  const height = strictResult?.ffprobe.height ?? 0;
  const fps = strictResult?.ffprobe.fps ?? 0;
  const frameCount = strictResult?.ffprobe.frameCount ?? 0;
  const codec = strictResult?.ffprobe.codec_name ?? "unknown";
  const container = strictResult?.ffprobe.format_name ?? "unknown";

  // 5. 关键帧与光流数量 (从 strict result 的 assertions 中提取)
  let keyframeCount = 0;
  let opticalFlowPairs = 0;
  if (strictResult) {
    const kfAssertion = strictResult.assertions.find((a) => a.name === "keyframeCount");
    const ofAssertion = strictResult.assertions.find((a) => a.name === "opticalFlowPairs");
    if (kfAssertion) keyframeCount = Number(kfAssertion.actual);
    if (ofAssertion) opticalFlowPairs = Number(ofAssertion.actual);
  }

  return {
    passed: blockers.length === 0,
    sourceVideo: "fixtures/GOLDEN_CASE_03/source-video.mp4",
    container,
    codec,
    duration,
    width,
    height,
    fps,
    frameCount,
    keyframeCount,
    opticalFlowPairs,
    blockers,
  };
}

// ========== Host Capabilities ==========

export function buildFullHostCapabilities(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
    maxFragmentUniformVectors: 1024,
  };
}

// ========== 配置加载 ==========

function loadPipelineDependencies() {
  const g1Policy = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/g1-policy.json"), "utf8"),
  );
  const grammar = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/grammar-rules.json"), "utf8"),
  );
  const tierConfig = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/tier-mapping.json"), "utf8"),
  );
  return { g1Policy, grammar, tierConfig };
}

// ========== 主执行函数 ==========

export interface GoldenCase03ExecutionResult {
  assetGate: AssetGateResult;
  normalizationResult?: {
    status: string;
    mappedParameters: number;
    unmappedParameters: string[];
    diagnostics: string[];
  };
  pipelineOutput?: PipelineOutput;
  renderResult?: RenderResult;
  evaluation?: FidelityEvaluationResult;
  validatedIR?: ValidatedDesignIR;
  coreIR?: RawDesignIR;
  durationMs: number;
}

/**
 * 执行 GOLDEN_CASE_03 完整贯通测试。
 *
 * 流程：物理资产门禁 → Cangjie IR加载 → Step 6-B降维 →
 *       Core Pipeline(G1→Patch→G3) → 5维评测 → 回归结果
 */
export async function run(): Promise<RegressionResult> {
  const startTime = Date.now();
  const caseData = loadCase();

  // 1. 物理资产门禁
  const assetGate = verifyPhysicalAssets();
  if (!assetGate.passed) {
    return {
      caseId: caseData.caseId,
      caseName: caseData.name,
      baselineScore: 0,
      proposalScore: 0,
      scoreDelta: 0,
      passed: false,
      regressed: false,
      newViolations: [`ASSET_GATE_FAIL: ${assetGate.blockers.join("; ")}`],
      resolvedViolations: [],
      durationMs: Date.now() - startTime,
    };
  }

  // 2. 加载 Cangjie IR
  const cangjieIR = loadCangjieIR();

  // 3. Step 6-B 降维编译 (LOCKED normalizer)
  const normalization = normalizeIntent(cangjieIR, {
    capturedAt: STEP6B_CAPTURED_AT,
    intentResolutionConfidence: 0.90,
    mappingConfidence: 0.95,
    inferenceExecutionMs: 0,
  });

  if (normalization.status !== "PASS") {
    return {
      caseId: caseData.caseId,
      caseName: caseData.name,
      baselineScore: 0,
      proposalScore: 0,
      scoreDelta: 0,
      passed: false,
      regressed: false,
      newViolations: [
        `STEP6B_FAIL: status=${normalization.status}, diagnostics=${normalization.diagnostics.join("; ")}`,
      ],
      resolvedViolations: [],
      durationMs: Date.now() - startTime,
    };
  }

  // 4. 设置视频源类型与时长 (meta字段，不影响参数哈希)
  const coreIR: RawDesignIR = {
    ...normalization.coreIR,
    meta: {
      ...normalization.coreIR.meta,
      sourceType: "video",
      aspectRatio: "16:9",
      duration: 112.57,
    },
  };

  // 5. Core Pipeline 执行
  const hostCaps = buildFullHostCapabilities();
  const deps = loadPipelineDependencies();
  const runner = new PipelineRunner(deps);
  const pipelineOutput = runner.execute(coreIR, hostCaps, "GOLDEN_CASE_03");

  if (pipelineOutput.status === "TERMINAL_HALT") {
    return {
      caseId: caseData.caseId,
      caseName: caseData.name,
      baselineScore: 0,
      proposalScore: 0,
      scoreDelta: 0,
      passed: false,
      regressed: false,
      newViolations: [`Pipeline halted at ${pipelineOutput.haltStage}`],
      resolvedViolations: [],
      durationMs: Date.now() - startTime,
    };
  }

  // 6. GATE B: 真实 Software Render — 从 ValidatedIR + ExecutionPlan 程序化光栅化
  const renderer = new SoftwareRenderer(480, 270);
  renderer.mount();
  const renderResult = renderer.render(
    pipelineOutput.validatedIR,
    pipelineOutput.executionPlan as RuntimeExecutionPlan,
  );
  renderer.dispose();

  // 7. 5维评测（含 renderHash 完整五元哈希链）
  const evaluation = evaluate(
    pipelineOutput.validatedIR,
    {
      inputHash: pipelineOutput.hashChain.inputHash,
      rawIRHash: pipelineOutput.hashChain.rawIRHash,
      validatedIRHash: pipelineOutput.hashChain.validatedIRHash,
      executionPlanHash: pipelineOutput.hashChain.executionPlanHash,
      renderHash: renderResult.renderHash,
    },
    {
      distillationExecutionMs: pipelineOutput.timing.distillationExecutionMs,
      grammarExecutionMs: pipelineOutput.timing.grammarExecutionMs,
      adapterExecutionMs: pipelineOutput.timing.adapterExecutionMs,
    },
    "GOLDEN_CASE_03",
    "TIER_A",
  );

  // 8. 收集违规项
  const newViolations: string[] = [];
  const resolvedViolations: string[] = [];
  for (const [gateName, gate] of Object.entries(evaluation.gates ?? {}) as Array<
    [string, { metricRef: string; passed: boolean }]
  >) {
    if (!gate.passed) {
      newViolations.push(`${gateName}: ${gate.metricRef} failed`);
    } else {
      resolvedViolations.push(`${gateName}: ${gate.metricRef} passed`);
    }
  }

  // 9. 计算总分
  const metrics = evaluation.metrics!;
  const overallScore =
    (metrics.composition.score * 0.25 +
      metrics.color.composite.score * 0.25 +
      metrics.depth.score * 0.20 +
      metrics.material.score * 0.15 +
      metrics.focalPointDisplacement.score * 0.15) *
    100;

  const durationMs = Date.now() - startTime;
  const passed = evaluation.status === "PASS";

  return {
    caseId: caseData.caseId,
    caseName: caseData.name,
    baselineScore: caseData.expectedOutput.minScore,
    proposalScore: Number(overallScore.toFixed(2)),
    scoreDelta: Number((overallScore - caseData.expectedOutput.minScore).toFixed(2)),
    passed,
    regressed: false,
    newViolations,
    resolvedViolations,
    durationMs,
  };
}

/**
 * 执行完整测试并返回详细结果（用于 Jest 测试）。
 */
export async function runDetailed(): Promise<GoldenCase03ExecutionResult & { regression: RegressionResult }> {
  const startTime = Date.now();

  const assetGate = verifyPhysicalAssets();
  let normalizationResult: GoldenCase03ExecutionResult["normalizationResult"];
  let pipelineOutput: PipelineOutput | undefined;
  let renderResult: RenderResult | undefined;
  let evaluation: FidelityEvaluationResult | undefined;
  let validatedIR: ValidatedDesignIR | undefined;
  let coreIR: RawDesignIR | undefined;

  if (assetGate.passed) {
    const cangjieIR = loadCangjieIR();
    const normalization = normalizeIntent(cangjieIR, {
      capturedAt: STEP6B_CAPTURED_AT,
      intentResolutionConfidence: 0.90,
      mappingConfidence: 0.95,
      inferenceExecutionMs: 0,
    });

    normalizationResult = {
      status: normalization.status,
      mappedParameters: normalization.metadata.mappedParameters,
      unmappedParameters: normalization.metadata.unmappedParameters,
      diagnostics: normalization.diagnostics,
    };

    if (normalization.status === "PASS") {
      coreIR = {
        ...normalization.coreIR,
        meta: {
          ...normalization.coreIR.meta,
          sourceType: "video",
          aspectRatio: "16:9",
          duration: 112.57,
        },
      };

      const hostCaps = buildFullHostCapabilities();
      const deps = loadPipelineDependencies();
      const runner = new PipelineRunner(deps);
      pipelineOutput = runner.execute(coreIR, hostCaps, "GOLDEN_CASE_03");

      if (pipelineOutput.status === "SUCCESS") {
        validatedIR = pipelineOutput.validatedIR;

        // GATE B: Real Software Render
        const renderer = new SoftwareRenderer(480, 270);
        renderer.mount();
        renderResult = renderer.render(
          pipelineOutput.validatedIR,
          pipelineOutput.executionPlan as RuntimeExecutionPlan,
        );
        renderer.dispose();

        evaluation = evaluate(
          pipelineOutput.validatedIR,
          {
            inputHash: pipelineOutput.hashChain.inputHash,
            rawIRHash: pipelineOutput.hashChain.rawIRHash,
            validatedIRHash: pipelineOutput.hashChain.validatedIRHash,
            executionPlanHash: pipelineOutput.hashChain.executionPlanHash,
            renderHash: renderResult.renderHash,
          },
          {
            distillationExecutionMs: pipelineOutput.timing.distillationExecutionMs,
            grammarExecutionMs: pipelineOutput.timing.grammarExecutionMs,
            adapterExecutionMs: pipelineOutput.timing.adapterExecutionMs,
          },
          "GOLDEN_CASE_03",
          "TIER_A",
        );
      }
    }
  }

  const regression = await run();

  return {
    assetGate,
    normalizationResult,
    pipelineOutput,
    renderResult,
    evaluation,
    validatedIR,
    coreIR,
    durationMs: Date.now() - startTime,
    regression,
  };
}
