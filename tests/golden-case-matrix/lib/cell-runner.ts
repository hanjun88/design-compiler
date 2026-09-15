/**
 * Golden Case Matrix — Cell Runner
 *
 * 执行单个 Matrix Cell 的完整管线：
 *   模板加载 → Step 6-B normalizeIntent → Core Pipeline (G1→Patch→G3)
 *   → Software Render → 5-Dim Evaluation → 标准化结果
 *
 * 与 GOLDEN_CASE_02/run.ts 的区别：
 * - 输入是合成 IR（synthetic-ir），不做物理资产门禁
 * - 不依赖真实视频文件
 * - 输出标准化 CellExecutionResult，供 CA/XA/EA 断言使用
 *
 * 硬边界：
 * - 不修改 Core Compiler / Step 6-B / Evaluator
 * - capturedAt 必须确定性，禁止 new Date()
 * - SoftwareRenderer 必须 mount/dispose 对称
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

// Step 6-B LOCKED normalizer
import { normalizeIntent } from "../../../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR, NormalizationResult } from "../../../compiler-intent/types";

// Software Renderer (deterministic procedural rasterization)
import { SoftwareRenderer, type RenderResult } from "../../../render-engine";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const TEMPLATE_DIR = path.join(__dirname, "..", "fixtures", "matrix-ir-templates");

// 确定性 capturedAt（禁止 new Date()）
const MATRIX_CAPTURED_AT = "2026-09-16T00:00:00Z";

// Cell ID 列表（与 fixtures 目录一一对应）
export const MATRIX_CELL_IDS = [
  "MC-T01",
  "MC-T02",
  "MC-M01",
  "MC-S01",
  "MC-X01",
  "MC-X02",
] as const;

export type MatrixCellId = (typeof MATRIX_CELL_IDS)[number];

// ============================================================================
// 标准化执行结果
// ============================================================================

export type CellExecutionStage =
  | "TEMPLATE_LOAD"
  | "STEP6B_NORMALIZE"
  | "G1_DATA_GATE"
  | "PATCH_ENGINE"
  | "G3_CAPABILITY"
  | "SOFTWARE_RENDER"
  | "EVALUATION"
  | "COMPLETE";

export interface CellExecutionResult {
  cellId: MatrixCellId;
  /** 最终到达的阶段 */
  finalStage: CellExecutionStage;
  /** 整体是否成功（管线全链路贯通 + 评测完成） */
  success: boolean;
  /** 各阶段耗时（ms） */
  timing: {
    templateLoadMs: number;
    normalizeMs: number;
    pipelineMs: number;
    renderMs: number;
    evaluationMs: number;
    totalMs: number;
  };
  /** Step 6-B 正常化结果（可能为 null 如果提前失败） */
  normalization: NormalizationResult | null;
  /** Core Pipeline 输出（可能为 null 如果提前失败） */
  pipelineOutput: PipelineOutput | null;
  /** Software Render 结果（可能为 null 如果提前失败） */
  renderResult: RenderResult | null;
  /** 5-Dim 评测结果（可能为 null 如果提前失败） */
  evaluation: FidelityEvaluationResult | null;
  /** 标准化后的参数快照（从 validatedIR 提取，供跨轴断言使用） */
  params: CellParameterSnapshot | null;
  /** 错误/阻断信息（空表示无错误） */
  errors: string[];
}

/**
 * 从 ValidatedDesignIR 提取的标准化参数快照。
 * 供 XA 跨轴断言直接比较使用，避免每次都深入 nested IR。
 */
export interface CellParameterSnapshot {
  // Composition
  focalPoint: [number, number];
  negativeSpaceRatio: number;
  depthLayerCount: number;
  symmetry: number;
  // Camera
  fov: number;
  shotSize: string;
  cameraAngle: number;
  cameraHeight: number;
  // Lighting
  keyLightAzimuth: number;
  keyLightElevation: number;
  keyLightColorTemp: number;
  keyLightIntensity: number;
  keyLightSoftness: number;
  ambientRatio: number;
  rimLightPresent: boolean;
  // Material (dominant)
  dominantBaseType: string;
  dominantRoughness: number;
  dominantMetalness: number;
  dominantWear: number;
  // Color
  colorDominant: string;
  colorSecondary: string;
  colorAccent: string;
  contrastRatio: number;
  temperatureBias: number;
}

// ============================================================================
// 模板加载
// ============================================================================

/**
 * 加载 Matrix Cell 模板 JSON。
 */
export function loadCellTemplate(cellId: MatrixCellId): CangjieRawDesignIR {
  const templatePath = path.join(TEMPLATE_DIR, `${cellId}.json`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  return raw as CangjieRawDesignIR;
}

// ============================================================================
// 配置加载
// ============================================================================

function loadPipelineDependencies() {
  const g1Policy = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/g1-policy.json"), "utf-8"),
  );
  const grammar = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/grammar-rules.json"), "utf-8"),
  );
  const tierConfig = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "config/tier-mapping.json"), "utf-8"),
  );
  return { g1Policy, grammar, tierConfig };
}

function buildHostCapabilities(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
    maxFragmentUniformVectors: 1024,
  };
}

// ============================================================================
// 参数快照提取
// ============================================================================

function extractParameterSnapshot(validatedIR: ValidatedDesignIR): CellParameterSnapshot {
  const v = validatedIR.validated;
  const dominant = v.materials.find((m) => m.role === "dominant") ?? v.materials[0];

  return {
    focalPoint: v.composition.focalPoint.value as [number, number],
    negativeSpaceRatio: v.composition.negativeSpaceRatio.value as number,
    depthLayerCount: v.composition.depthLayerCount.value as number,
    symmetry: v.composition.symmetry.value as number,
    fov: v.camera.fov.value as number,
    shotSize: v.camera.shotSize.value as string,
    cameraAngle: v.camera.angle.value as number,
    cameraHeight: v.camera.height.value as number,
    keyLightAzimuth: v.lighting.keyLight.azimuth.value as number,
    keyLightElevation: v.lighting.keyLight.elevation.value as number,
    keyLightColorTemp: v.lighting.keyLight.colorTemp.value as number,
    keyLightIntensity: v.lighting.keyLight.intensity.value as number,
    keyLightSoftness: v.lighting.keyLight.softness.value as number,
    ambientRatio: v.lighting.ambientRatio.value as number,
    rimLightPresent: v.lighting.rimLightPresent.value as boolean,
    dominantBaseType: dominant.baseType.value as string,
    dominantRoughness: dominant.roughness.value as number,
    dominantMetalness: dominant.metalness.value as number,
    dominantWear: dominant.wear.value as number,
    colorDominant: v.color.dominant.value as string,
    colorSecondary: v.color.secondary.value as string,
    colorAccent: v.color.accent.value as string,
    contrastRatio: v.color.contrastRatio.value as number,
    temperatureBias: v.color.temperatureBias.value as number,
  };
}

// ============================================================================
// 主执行函数
// ============================================================================

/**
 * 执行单个 Matrix Cell 的完整管线。
 *
 * @param cellId Matrix Cell ID（如 "MC-T01"）
 * @returns 标准化执行结果，包含各阶段输出与参数快照
 */
export function runCell(cellId: MatrixCellId): CellExecutionResult {
  const totalStart = Date.now();
  const errors: string[] = [];

  // --- Stage 1: Template Load ---
  const templateStart = Date.now();
  let cangjieIR: CangjieRawDesignIR;
  try {
    cangjieIR = loadCellTemplate(cellId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      cellId,
      finalStage: "TEMPLATE_LOAD",
      success: false,
      timing: emptyTiming(),
      normalization: null,
      pipelineOutput: null,
      renderResult: null,
      evaluation: null,
      params: null,
      errors: [`TEMPLATE_LOAD_FAIL: ${msg}`],
    };
  }
  const templateLoadMs = Date.now() - templateStart;

  // --- Stage 2: Step 6-B Normalize ---
  const normalizeStart = Date.now();
  let normalization: NormalizationResult;
  try {
    normalization = normalizeIntent(cangjieIR, {
      capturedAt: MATRIX_CAPTURED_AT,
      intentResolutionConfidence: 0.90,
      mappingConfidence: 0.95,
      inferenceExecutionMs: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      cellId,
      finalStage: "STEP6B_NORMALIZE",
      success: false,
      timing: { ...emptyTiming(), templateLoadMs, totalMs: Date.now() - totalStart },
      normalization: null,
      pipelineOutput: null,
      renderResult: null,
      evaluation: null,
      params: null,
      errors: [`STEP6B_EXCEPTION: ${msg}`],
    };
  }
  const normalizeMs = Date.now() - normalizeStart;

  if (normalization.status !== "PASS") {
    return {
      cellId,
      finalStage: "STEP6B_NORMALIZE",
      success: false,
      timing: { ...emptyTiming(), templateLoadMs, normalizeMs, totalMs: Date.now() - totalStart },
      normalization,
      pipelineOutput: null,
      renderResult: null,
      evaluation: null,
      params: null,
      errors: [
        `STEP6B_FAIL: status=${normalization.status}`,
        ...normalization.diagnostics.map((d) => `  ${d}`),
      ],
    };
  }

  // 设置 meta（不影响参数哈希）
  const coreIR: RawDesignIR = {
    ...normalization.coreIR,
    meta: {
      ...normalization.coreIR.meta,
      sourceType: "image",
      aspectRatio: "16:9",
    },
  };

  // --- Stage 3: Core Pipeline (G1 → Patch → G3) ---
  const pipelineStart = Date.now();
  let pipelineOutput: PipelineOutput;
  try {
    const deps = loadPipelineDependencies();
    const runner = new PipelineRunner(deps);
    const hostCaps = buildHostCapabilities();
    pipelineOutput = runner.execute(coreIR, hostCaps, cellId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      cellId,
      finalStage: "G1_DATA_GATE",
      success: false,
      timing: { ...emptyTiming(), templateLoadMs, normalizeMs, totalMs: Date.now() - totalStart },
      normalization,
      pipelineOutput: null,
      renderResult: null,
      evaluation: null,
      params: null,
      errors: [`PIPELINE_EXCEPTION: ${msg}`],
    };
  }
  const pipelineMs = Date.now() - pipelineStart;

  if (pipelineOutput.status === "TERMINAL_HALT") {
    return {
      cellId,
      finalStage: pipelineOutput.haltStage === "G1_DATA_GATE" ? "G1_DATA_GATE" : "G3_CAPABILITY",
      success: false,
      timing: { ...emptyTiming(), templateLoadMs, normalizeMs, pipelineMs, totalMs: Date.now() - totalStart },
      normalization,
      pipelineOutput,
      renderResult: null,
      evaluation: null,
      params: null,
      errors: [`PIPELINE_HALT: halted at ${pipelineOutput.haltStage}`],
    };
  }

  // --- Stage 4: Software Render ---
  const renderStart = Date.now();
  let renderResult: RenderResult;
  try {
    const renderer = new SoftwareRenderer(480, 270);
    renderer.mount();
    renderResult = renderer.render(
      pipelineOutput.validatedIR,
      pipelineOutput.executionPlan as RuntimeExecutionPlan,
    );
    renderer.dispose();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      cellId,
      finalStage: "SOFTWARE_RENDER",
      success: false,
      timing: { ...emptyTiming(), templateLoadMs, normalizeMs, pipelineMs, totalMs: Date.now() - totalStart },
      normalization,
      pipelineOutput,
      renderResult: null,
      evaluation: null,
      params: extractParameterSnapshot(pipelineOutput.validatedIR),
      errors: [`RENDER_EXCEPTION: ${msg}`],
    };
  }
  const renderMs = Date.now() - renderStart;

  // --- Stage 5: 5-Dim Evaluation ---
  const evalStart = Date.now();
  let evaluation: FidelityEvaluationResult;
  try {
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
      cellId,
      "TIER_A",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      cellId,
      finalStage: "EVALUATION",
      success: false,
      timing: {
        ...emptyTiming(),
        templateLoadMs,
        normalizeMs,
        pipelineMs,
        renderMs,
        totalMs: Date.now() - totalStart,
      },
      normalization,
      pipelineOutput,
      renderResult,
      evaluation: null,
      params: extractParameterSnapshot(pipelineOutput.validatedIR),
      errors: [`EVALUATION_EXCEPTION: ${msg}`],
    };
  }
  const evaluationMs = Date.now() - evalStart;

  // --- Complete ---
  return {
    cellId,
    finalStage: "COMPLETE",
    success: true,
    timing: {
      templateLoadMs,
      normalizeMs,
      pipelineMs,
      renderMs,
      evaluationMs,
      totalMs: Date.now() - totalStart,
    },
    normalization,
    pipelineOutput,
    renderResult,
    evaluation,
    params: extractParameterSnapshot(pipelineOutput.validatedIR),
    errors,
  };
}

// ============================================================================
// 批量执行
// ============================================================================

/**
 * 批量执行所有 Matrix Cells。
 */
export function runAllCells(): CellExecutionResult[] {
  return MATRIX_CELL_IDS.map((cellId) => runCell(cellId));
}

/**
 * 按 ID 查找执行结果。
 */
export function findCellResult(results: CellExecutionResult[], cellId: MatrixCellId): CellExecutionResult | undefined {
  return results.find((r) => r.cellId === cellId);
}

// ============================================================================
// 辅助
// ============================================================================

function emptyTiming(): CellExecutionResult["timing"] {
  return {
    templateLoadMs: 0,
    normalizeMs: 0,
    pipelineMs: 0,
    renderMs: 0,
    evaluationMs: 0,
    totalMs: 0,
  };
}
