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
  /** 输入域快照（从模板扁平 parameters[] 提取，未经管线变换）
   *  CA-08 / XA-05 等输入域断言严格锚定此对象 */
  rawInputSnapshot: RawInputSnapshot | null;
  /** 变换追踪物证（记录语法规则对输入的重写，如 CA-RULE-03-CANGRUN） */
  transformationTrace: TransformationTrace;
  /** 材质类别 ID（从 rawInputSnapshot.pbrParams.baseType 解析） */
  materialCategory: string | null;
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
// 输入域快照（Raw Input Snapshot）
// 从模板扁平 parameters[] 直接提取，未经管线变换。
// CA-08 / XA-05 等输入域断言严格锚定此对象，而非管线输出。
// ============================================================================

export interface PBRInputParams {
  baseType: string;
  roughness: number;
  metalness: number;
  wear: number;
}

export interface RawInputSnapshot {
  /** 模板 irId */
  irId: string;
  /** 范式标签（从 concept.name 或 metadata.tags 提取） */
  paradigm: string | null;
  /** PBR 输入参数（模板声明值，未经语法规则变换） */
  pbrParams: PBRInputParams;
  /** 光照输入参数 */
  lighting: {
    colorTemp: number;
    intensity: number;
    softness: number;
    ambientRatio: number;
  };
  /** 光照意图标签（从 intent.heuristicIds 提取） */
  lightingIntent: string | null;
  /** 完整扁平参数列表（原始引用） */
  rawParameters: Array<{ paramId: string; path: string; value: unknown; confidence: number }>;
}

// ============================================================================
// 变换追踪（Transformation Trace）
// 记录 Core Compiler 语法规则对输入参数的重写，作为独立法医物证。
// 不反向污染输入域断言。
// ============================================================================

export interface TransformationEntry {
  /** 触发的语法规则 ID，如 "CA-RULE-03-CANGRUN" */
  ruleId: string;
  /** 被修改的字段路径，如 "materials[0].roughness" */
  field: string;
  /** 输入声明值 */
  inputValue: unknown;
  /** 管线输出值 */
  outputValue: unknown;
  /** 变换动作描述 */
  action: string;
}

export type TransformationTrace = TransformationEntry[];

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
// 输入域快照提取（从模板扁平 parameters[]，未经管线变换）
// ============================================================================

function getParamValue(
  params: CangjieRawDesignIR["parameters"],
  path: string,
): unknown {
  const p = params.find((x) => x.path === path);
  return p ? p.value : undefined;
}

/**
 * 从模板扁平 parameters[] 提取输入域快照。
 * 此对象是 CA-08 / XA-05 等输入域断言的唯一锚定对象，
 * 不包含管线语法规则的变换结果。
 */
export function extractRawInputSnapshot(cangjieIR: CangjieRawDesignIR): RawInputSnapshot {
  const params = cangjieIR.parameters;

  // 范式标签：从 concept.name 前缀或 metadata.tags 提取
  let paradigm: string | null = null;
  const conceptName = cangjieIR.concept?.name ?? "";
  const paradigmMatch = conceptName.match(/^(TANG|MING|SONG)[:：·]/);
  if (paradigmMatch) {
    paradigm = paradigmMatch[1];
  } else {
    const tags = (cangjieIR.metadata?.tags as string[] | undefined) ?? [];
    const tagMatch = tags.find((t) => t.startsWith("paradigm:"));
    if (tagMatch) paradigm = tagMatch.split(":")[1];
  }

  // 光照意图：从 intent.heuristicIds 提取
  let lightingIntent: string | null = null;
  const heuristicIds = (cangjieIR.intent?.heuristicIds as string[] | undefined) ?? [];
  const intentMatch = heuristicIds.find((h) => h.startsWith("lighting-intent:"));
  if (intentMatch) lightingIntent = intentMatch.split(":")[1];

  const rawParameters = params.map((p) => ({
    paramId: p.paramId,
    path: p.path,
    value: p.value,
    confidence: p.confidence,
  }));

  return {
    irId: cangjieIR.irId,
    paradigm,
    pbrParams: {
      baseType: String(getParamValue(params, "/materials/0/baseType") ?? ""),
      roughness: Number(getParamValue(params, "/materials/0/roughness") ?? 0),
      metalness: Number(getParamValue(params, "/materials/0/metalness") ?? 0),
      wear: Number(getParamValue(params, "/materials/0/wear") ?? 0),
    },
    lighting: {
      colorTemp: Number(getParamValue(params, "/lighting/keyLight/colorTemp") ?? 0),
      intensity: Number(getParamValue(params, "/lighting/keyLight/intensity") ?? 0),
      softness: Number(getParamValue(params, "/lighting/keyLight/softness") ?? 0),
      ambientRatio: Number(getParamValue(params, "/lighting/ambientRatio") ?? 0),
    },
    lightingIntent,
    rawParameters,
  };
}

/**
 * 从 baseType 解析材质类别 ID。
 * 格式: "{CATEGORY}::{name}" → 返回 CATEGORY
 */
export function parseMaterialCategoryId(baseType: string): string | null {
  const match = baseType.match(/^(WOOD|GLAZE|BRONZE|STONE)::/);
  return match ? match[1] : null;
}

// ============================================================================
// 变换检测（Transformation Detection）
// 比较输入域快照与管线输出参数，识别语法规则重写。
// ============================================================================

/**
 * 检测管线对输入参数的变换，生成变换追踪物证。
 * 当前已知变换规则：
 * - CA-RULE-03-CANGRUN: roughness < 0.5 → 替换为 0.7
 * - ANTI-AI-01: roughness < 0.18 → 替换为 0.28
 */
export function detectTransformations(
  rawInput: RawInputSnapshot,
  outputParams: CellParameterSnapshot | null,
): TransformationTrace {
  const trace: TransformationTrace = [];
  if (!outputParams) return trace;

  // roughness 变换检测
  const inputRoughness = rawInput.pbrParams.roughness;
  const outputRoughness = outputParams.dominantRoughness;
  if (inputRoughness !== outputRoughness && typeof outputRoughness === "number") {
    let ruleId = "UNKNOWN_ROUGHNESS_TRANSFORM";
    let action = "ROUGHNESS_MODIFIED";
    if (inputRoughness < 0.5 && outputRoughness === 0.7) {
      ruleId = "CA-RULE-03-CANGRUN";
      action = "ELEVATE_TO_CANGRUN_THRESHOLD";
    } else if (inputRoughness < 0.18 && outputRoughness === 0.28) {
      ruleId = "ANTI-AI-01";
      action = "MICRO_SURFACE_PERTURBATION";
    }
    trace.push({
      ruleId,
      field: "materials[0].roughness",
      inputValue: inputRoughness,
      outputValue: outputRoughness,
      action,
    });
  }

  // metalness 变换检测
  const inputMetalness = rawInput.pbrParams.metalness;
  const outputMetalness = outputParams.dominantMetalness;
  if (inputMetalness !== outputMetalness && typeof outputMetalness === "number") {
    trace.push({
      ruleId: "UNKNOWN_METALNESS_TRANSFORM",
      field: "materials[0].metalness",
      inputValue: inputMetalness,
      outputValue: outputMetalness,
      action: "METALNESS_MODIFIED",
    });
  }

  // wear 变换检测
  const inputWear = rawInput.pbrParams.wear;
  const outputWear = outputParams.dominantWear;
  if (inputWear !== outputWear && typeof outputWear === "number") {
    trace.push({
      ruleId: "UNKNOWN_WEAR_TRANSFORM",
      field: "materials[0].wear",
      inputValue: inputWear,
      outputValue: outputWear,
      action: "WEAR_MODIFIED",
    });
  }

  return trace;
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

  // 输入域快照（模板加载后设置，所有后续返回路径可用）
  let rawInputSnapshot: RawInputSnapshot | null = null;
  let materialCategory: string | null = null;
  // 变换追踪物证（管线执行后设置）
  let transformationTrace: TransformationTrace = [];

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
      rawInputSnapshot: null,
      transformationTrace: [],
      materialCategory: null,
      errors: [`TEMPLATE_LOAD_FAIL: ${msg}`],
    };
  }
  const templateLoadMs = Date.now() - templateStart;

  // 提取输入域快照（未经管线变换，CA-08/XA-05 锚定此对象）
  rawInputSnapshot = extractRawInputSnapshot(cangjieIR);
  materialCategory = parseMaterialCategoryId(rawInputSnapshot.pbrParams.baseType);

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
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
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
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
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
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
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
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
      errors: [`PIPELINE_HALT: halted at ${pipelineOutput.haltStage}`],
    };
  }

  // 管线成功：提取输出参数快照并检测语法规则变换
  const outputParams = extractParameterSnapshot(pipelineOutput.validatedIR);
  if (rawInputSnapshot) {
    transformationTrace = detectTransformations(rawInputSnapshot, outputParams);
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
      params: outputParams,
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
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
      params: outputParams,
      rawInputSnapshot,
      transformationTrace,
      materialCategory,
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
    params: outputParams,
    rawInputSnapshot,
    transformationTrace,
    materialCategory,
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
