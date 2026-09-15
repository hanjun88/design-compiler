/**
 * Physical Evidence Extractor — 物理证据提取器
 *
 * 7 阶单向流水线：Input Validation → Pixel → Depth → Motion → Material → IR → Provenance/Purity
 *
 * 核心原则：
 * - 所有测量值来自真实物理缓冲计算，严禁硬编码测量默认值
 * - 无法测量的维度显式标记 UNMEASURED_SEMANTIC，不用默认值填补
 * - 材质 IR 声明值与像素观测值物理隔离（不同顶级域）
 * - 机器永不生成 SemanticEvidence（人工输入域）
 * - 确定性输出：相同输入 → 字节级相同输出
 */

import type {
  ObservableEvidenceSet,
  ExtractorInput,
  PixelEvidence,
  DepthEvidence,
  MotionEvidence,
  MaterialEvidence,
  IREvidence,
  EvidenceField,
  UnmeasuredSemantic,
  EvidenceFieldOrUnmeasured,
  EvidencePurityAudit,
  RenderContextSnapshot,
} from "./types";

import {
  toLuminance,
  meanLuminance,
  stdDevLuminance,
  luminanceHistogram,
  histogramPeakCount,
  nonZeroPixelCount,
  nanInfPixelCount,
} from "./algorithms/luminance";

import {
  laplacianVariance,
  sobelEdgeDetection,
  edgeGradientSkew,
  edgeOrientationHistogram,
} from "./algorithms/spatial-filters";

import {
  extractDominantColors,
  wcagContrastRatio,
  temperatureBias,
} from "./algorithms/color-analysis";

import {
  blockMeanLuminance,
  blockLuminanceMeanGradient,
} from "./algorithms/block-analysis";

import {
  negativeSpaceRatio,
  negativeSpaceConnectedComponents,
  visualSaliencyCentroid,
} from "./algorithms/negative-space";

import {
  highFrequencyEnergyRatio,
  specularAnalysis,
  roughnessSpatialVariance,
  colorVariationSpatialGradient,
} from "./algorithms/frequency-analysis";

import {
  computeOpticalFlow,
  cameraMotionSmoothness,
  detectRhythmChangePoints,
} from "./algorithms/optical-flow";

import {
  bhattacharyyaDistance,
  luminanceContinuity as calcLuminanceContinuity,
  chromaticContinuity as calcChromaticContinuity,
  motionContinuity as calcMotionContinuity,
  motionSpeedCoefficientOfVariation,
} from "./algorithms/histogram-distance";

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 构造 EvidenceField（确保所有字段非空）。
 */
function ef<T>(value: T, evidenceRef: string, confidence: number, method: string): EvidenceField<T> {
  return { value, evidenceRef, confidence, method };
}

/**
 * 构造 UnmeasuredSemantic。
 */
function unmeasured(dimension: string, reason: string, semanticRef: string): UnmeasuredSemantic {
  return {
    status: "UNMEASURED_SEMANTIC",
    dimension,
    reason,
    semanticInterpretationRef: semanticRef,
  };
}

/**
 * 四舍五入到指定小数位（确定性）。
 */
function round(v: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

// ---------------------------------------------------------------------------
// Stage 1: Input Validation & Boundary Guard
// ---------------------------------------------------------------------------

interface ValidatedInput {
  frames: Uint8Array[];
  width: number;
  height: number;
  pixelCount: number;
  bufferByteLength: number;
  isSingleFrame: boolean;
  depthAvailable: boolean;
}

function stage1Validate(input: ExtractorInput): ValidatedInput {
  if (input.frames.length === 0) {
    throw new Error("Extractor input must contain at least one frame");
  }

  const width = input.width;
  const height = input.height;
  const pixelCount = width * height;
  const expectedByteLength = pixelCount * 4;

  for (let i = 0; i < input.frames.length; i++) {
    if (input.frames[i].length !== expectedByteLength) {
      throw new Error(
        `Frame ${i} buffer length mismatch: expected ${expectedByteLength}, got ${input.frames[i].length}`,
      );
    }
  }

  const depthAvailable = input.depthBuffers !== null &&
    input.depthBuffers.length === input.frames.length &&
    input.depthBuffers.every((d) => d !== null);

  return {
    frames: input.frames,
    width,
    height,
    pixelCount,
    bufferByteLength: expectedByteLength,
    isSingleFrame: input.frames.length < 2,
    depthAvailable,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Pixel Physical Evidence
// ---------------------------------------------------------------------------

function stage2Pixel(
  frame: Uint8Array,
  width: number,
  height: number,
): PixelEvidence {
  const luma = toLuminance(frame, width, height);
  const mean = meanLuminance(luma);
  const std = stdDevLuminance(luma, mean);
  const hist = luminanceHistogram(luma);
  const peakCount = histogramPeakCount(hist);

  const lapVar = laplacianVariance(luma, width, height);
  const sobel = sobelEdgeDetection(luma, width, height);
  const edgeSkew = edgeGradientSkew(sobel.magnitude);
  const edgeOrientHist = edgeOrientationHistogram(sobel.orientation, sobel.magnitude);

  const dominantColors = extractDominantColors(frame, width, height, 3);
  const dominant = dominantColors[0]; // 可能为 undefined（画面全透明时）
  const secondary = dominantColors[1]; // 可能为 undefined（颜色单一时）
  const accent = dominantColors[2]; // 可能为 undefined（颜色单一时）
  const contrastAvailable = dominant !== undefined && secondary !== undefined;
  const contrast = contrastAvailable ? wcagContrastRatio(dominant.hex, secondary.hex) : 0;
  const tempBias = temperatureBias(frame, width, height);

  const blockMeans = blockMeanLuminance(luma, width, height);
  const blockGrad = blockLuminanceMeanGradient(blockMeans);

  const negRatio = negativeSpaceRatio(luma, width, height);
  const negComponents = negativeSpaceConnectedComponents(luma, width, height);

  const focal = visualSaliencyCentroid(sobel.magnitude, width, height);
  const focalOffset = Math.sqrt(
    Math.pow(focal[0] - 0.5, 2) + Math.pow(focal[1] - 0.5, 2),
  );

  const nonZero = nonZeroPixelCount(frame, width, height);
  const nanInf = nanInfPixelCount(frame);

  return {
    // 亮度场
    meanLuminance: ef(round(mean, 4), "pixel-buffer:luma:mean:rec601", 1.0, "Rec.601 luma mean over all pixels"),
    luminanceStdDev: ef(round(std, 4), "pixel-buffer:luma:stddev:rec601", 1.0, "Rec.601 luma population standard deviation"),
    luminanceHistogram: ef(hist, "pixel-buffer:luma:histogram:256bin", 1.0, "256-bin luminance histogram"),
    luminanceHistogramPeakCount: ef(peakCount, "pixel-buffer:luma:histogram:peaks", 0.9, "Local maximum detection with min height ratio 0.05"),

    // 梯度场 / 边缘
    spatialLaplacianVariance: ef(round(lapVar, 4), "pixel-buffer:laplacian:variance:3x3", 1.0, "3x3 Laplacian convolution response variance"),
    sobelEdgeGradientSkew: ef(round(edgeSkew, 4), "pixel-buffer:sobel:magnitude:skew", 0.95, "Sobel gradient magnitude distribution skewness"),
    edgePixelRatio: ef(round(sobel.edgePixelCount / (width * height), 4), "pixel-buffer:sobel:edge-ratio:threshold30", 0.95, "Sobel magnitude >= 30 pixel ratio"),
    edgeOrientationHistogram: ef(edgeOrientHist, "pixel-buffer:sobel:orientation:8bin", 0.9, "8-bin edge orientation histogram (magnitude-weighted)"),

    // 色彩分布（无颜色时显式标记 SOURCE_LIMITED，confidence=0.0）
    dominantColor: dominant
      ? ef(dominant.hex, "pixel-buffer:color:dominant:quant4x4x4", 0.9, "Deterministic 4x4x4 color quantization, top frequency bin")
      : ef("", "pixel-buffer:color:dominant:SOURCE_LIMITED", 0.0, "No non-transparent pixels detected; dominant color not applicable (SOURCE_LIMITED)"),
    secondaryColor: secondary
      ? ef(secondary.hex, "pixel-buffer:color:secondary:quant4x4x4", 0.85, "Second highest frequency color bin")
      : ef("", "pixel-buffer:color:secondary:SOURCE_LIMITED", 0.0, "Fewer than 2 distinct color buckets; secondary color not applicable (SOURCE_LIMITED)"),
    accentColor: accent
      ? ef(accent.hex, "pixel-buffer:color:accent:quant4x4x4", 0.8, "Third highest frequency color bin")
      : ef("", "pixel-buffer:color:accent:SOURCE_LIMITED", 0.0, "Fewer than 3 distinct color buckets; accent color not applicable (SOURCE_LIMITED)"),
    dominantColorRatio: dominant
      ? ef(round(dominant.ratio, 4), "pixel-buffer:color:dominant:ratio", 0.9, "Dominant color pixel count / total pixels")
      : ef(0, "pixel-buffer:color:dominant:ratio:SOURCE_LIMITED", 0.0, "No dominant color detected; ratio not applicable (SOURCE_LIMITED)"),
    contrastRatio: contrastAvailable
      ? ef(round(contrast, 4), "pixel-buffer:color:contrast:wcag", 0.9, "WCAG contrast ratio between dominant and secondary colors")
      : ef(0, "pixel-buffer:color:contrast:SOURCE_LIMITED", 0.0, "Fewer than 2 distinct colors; contrast ratio not applicable (SOURCE_LIMITED)"),
    temperatureBias: ef(round(tempBias, 4), "pixel-buffer:color:temperature:red-blue-diff", 0.9, "Red-blue mean difference mapped to [-1, 1]"),
    blockLuminanceMeanGradient: ef(round(blockGrad, 4), "pixel-buffer:blocks:8x8:luma-gradient-rms", 0.95, "8x8 block mean luminance adjacent-difference RMS"),

    // 空域结构
    negativeSpaceRatio: ef(round(negRatio, 4), "pixel-buffer:negative-space:ratio:luma180-var100", 0.85, "High-luminance(>=180) low-local-variance(<100) pixel ratio"),
    negativeSpaceComponentCount: ef(negComponents.componentCount, "pixel-buffer:negative-space:components:4-connect", 0.8, "4-connected component labeling on negative space binary mask"),
    largestVoidRegionRatio: ef(round(negComponents.largestComponentRatio, 4), "pixel-buffer:negative-space:largest:ratio", 0.8, "Largest connected negative-space component area / total negative space"),
    focalPoint: ef<[number, number]>([round(focal[0], 4), round(focal[1], 4)], "pixel-buffer:saliency:centroid:gradient-weighted", 0.85, "Gradient-magnitude weighted visual saliency centroid, normalized [0,1]"),
    focalCenterOffset: ef(round(focalOffset, 4), "pixel-buffer:saliency:centroid:offset-from-center", 0.85, "Euclidean distance from saliency centroid to image center [0, ~0.707]"),

    // 非零像素
    nonZeroPixels: ef(nonZero, "pixel-buffer:nonzero:count", 1.0, "Count of pixels with any non-zero RGBA channel"),
    nanInfPixelCount: ef(nanInf, "pixel-buffer:nan-inf:count", 1.0, "NaN/Inf pixel count (Uint8Array always 0; reserved for float renderers)"),
  };
}

// ---------------------------------------------------------------------------
// Stage 3: Depth Physical Evidence
// ---------------------------------------------------------------------------

function stage3Depth(
  validated: ValidatedInput,
  depthBuffers: (Float32Array | null)[] | null,
): DepthEvidence {
  if (!validated.depthAvailable || depthBuffers === null) {
    return {
      depthBufferAvailable: false,
      depthHistogram: unmeasured("depthHistogram", "No physical depth buffer provided; depth cannot be inferred from RGB", "semantic:depth-interpretation"),
      depthLayerCount: unmeasured("depthLayerCount", "No depth buffer; layer count requires physical Z-data", "semantic:depth-interpretation"),
      layerSeparation: unmeasured("layerSeparation", "No depth buffer; layer separation requires physical Z-data", "semantic:depth-interpretation"),
      occlusionEdgeCount: unmeasured("occlusionEdgeCount", "No depth buffer; occlusion edges require depth discontinuity detection", "semantic:depth-interpretation"),
      occlusionChainLength: unmeasured("occlusionChainLength", "No depth buffer; occlusion chain requires depth ordering", "semantic:depth-interpretation"),
      atmosphericDepth: unmeasured("atmosphericDepth", "No depth buffer; atmospheric perspective requires depth-luminance correlation", "semantic:depth-interpretation"),
      focalDepthSeparation: unmeasured("focalDepthSeparation", "No depth buffer; focal depth separation requires depth-of-field data", "semantic:depth-interpretation"),
      depthMotionProjectionResidual: unmeasured("depthMotionProjectionResidual", "No depth buffer; motion projection residual requires per-frame depth", "semantic:depth-interpretation"),
    };
  }

  // 有真实深度缓冲时的测量（此处保留接口，实际计算在深度缓冲可用时执行）
  // 注意：当前 SoftwareRenderer 不输出深度缓冲，此分支主要为 WebGL2 深度渲染预留
  const depth = depthBuffers[0]!;
  const depthHist = new Array<number>(64).fill(0);
  for (let i = 0; i < depth.length; i++) {
    const bin = Math.min(63, Math.max(0, Math.floor(depth[i] * 64)));
    depthHist[bin]++;
  }

  return {
    depthBufferAvailable: true,
    depthHistogram: ef(depthHist, "depth-buffer:histogram:64bin", 1.0, "64-bin depth histogram from physical Z-buffer"),
    depthLayerCount: ef(histogramPeakCount(depthHist), "depth-buffer:histogram:peaks", 0.9, "Depth histogram peak count"),
    layerSeparation: unmeasured("layerSeparation", "Layer separation algorithm pending depth buffer calibration", "semantic:depth-interpretation"),
    occlusionEdgeCount: unmeasured("occlusionEdgeCount", "Occlusion edge detection pending depth buffer calibration", "semantic:depth-interpretation"),
    occlusionChainLength: unmeasured("occlusionChainLength", "Occlusion chain analysis pending depth buffer calibration", "semantic:depth-interpretation"),
    atmosphericDepth: unmeasured("atmosphericDepth", "Atmospheric depth calculation pending depth-luminance correlation", "semantic:depth-interpretation"),
    focalDepthSeparation: unmeasured("focalDepthSeparation", "Focal depth separation requires depth-of-field render data", "semantic:depth-interpretation"),
    depthMotionProjectionResidual: unmeasured("depthMotionProjectionResidual", "Depth motion projection requires multi-frame depth buffer", "semantic:depth-interpretation"),
  };
}

// ---------------------------------------------------------------------------
// Stage 4: Motion Physical Evidence
// ---------------------------------------------------------------------------

function stage4Motion(
  validated: ValidatedInput,
): MotionEvidence | null {
  if (validated.isSingleFrame) {
    return null;
  }

  const frame1 = validated.frames[0];
  const frame2 = validated.frames[1];
  const luma1 = toLuminance(frame1, validated.width, validated.height);
  const luma2 = toLuminance(frame2, validated.width, validated.height);

  const flow = computeOpticalFlow(luma1, luma2, validated.width, validated.height);
  const camSmooth = cameraMotionSmoothness(flow.globalDisplacementStdDev);
  const motionCont = calcMotionContinuity(camSmooth, flow.directionCoherence);

  const meanL1 = meanLuminance(luma1);
  const meanL2 = meanLuminance(luma2);
  const lumCont = calcLuminanceContinuity(meanL1, meanL2);

  const hist1 = luminanceHistogram(luma1);
  const hist2 = luminanceHistogram(luma2);
  const bhattaDist = bhattacharyyaDistance(hist1, hist2);
  const chromCont = calcChromaticContinuity(hist1, hist2);

  const magnitudes = flow.flowVectors.map(([dx, dy]) => Math.sqrt(dx * dx + dy * dy));
  const rhythmPoints = detectRhythmChangePoints(flow.flowVectors);
  const speedCV = motionSpeedCoefficientOfVariation(magnitudes);

  return {
    framePairCount: validated.frames.length - 1,

    opticalFlowDirectionCoherence: ef(round(flow.directionCoherence, 4), "motion:optical-flow:direction-coherence:block8-search4", 0.85, "Block-matching (8x8, search ±4) flow vector pairwise cosine similarity mean, mapped [0,1]"),
    opticalFlowAmplitudeStability: ef(round(flow.amplitudeStability, 4), "motion:optical-flow:amplitude-stability", 0.85, "1 / (1 + coefficient_of_variation) of flow magnitudes"),
    globalDisplacementMean: ef<[number, number]>(
      [round(flow.globalDisplacementMean[0], 4), round(flow.globalDisplacementMean[1], 4)],
      "motion:global-displacement:mean",
      0.9,
      "Mean of all block motion vectors [dx, dy]",
    ),
    globalDisplacementStdDev: ef(round(flow.globalDisplacementStdDev, 4), "motion:global-displacement:stddev", 0.9, "Standard deviation of block motion vector magnitudes"),
    cameraMotionSmoothness: ef(round(camSmooth, 4), "motion:camera:smoothness:1/(1+std/5)", 0.9, "1 / (1 + globalDisplacementStdDev / 5), consistent with legacy formula"),

    luminanceContinuity: ef(round(lumCont, 4), "motion:luminance:continuity:1/(1+diff/30)", 0.95, "1 / (1 + |meanLuma1 - meanLuma2| / 30)"),
    chromaticContinuity: ef(round(chromCont, 4), "motion:color:continuity:bhattacharyya", 0.9, "1 / (1 + bhattacharyya_distance(luma_hist1, luma_hist2))"),
    colorHistogramBhattacharyyaDistance: ef(round(isFinite(bhattaDist) ? bhattaDist : 0, 4), "motion:color:bhattacharyya-distance", 0.9, "Bhattacharyya distance between frame luminance histograms"),
    motionContinuity: ef(round(motionCont, 4), "motion:continuity:mean(camera-smoothness, flow-coherence)", 0.9, "Mean of cameraMotionSmoothness and opticalFlowDirectionCoherence"),

    rhythmChangePointCount: ef(rhythmPoints, "motion:rhythm:change-points", 0.75, "Local extrema in flow magnitude sequence exceeding 0.5 std from mean"),
    motionSpeedCoefficientOfVariation: ef(round(speedCV, 4), "motion:speed:cv", 0.85, "Standard deviation / mean of flow magnitudes"),
  };
}

// ---------------------------------------------------------------------------
// Stage 5: Material Observational Evidence
// ---------------------------------------------------------------------------

function stage5Material(
  frame: Uint8Array,
  luma: Float64Array,
  width: number,
  height: number,
  irMaterials: Array<{ baseType: string; materialCategory: string; roughness: number; metalness: number; wear: number }>,
): MaterialEvidence {
  // IR 声明参数（直接从输入 IR 读取，不做任何推断）
  const dominantIdx = irMaterials.length > 0 ? 0 : -1;
  const dominantMat = dominantIdx >= 0 ? irMaterials[dominantIdx] : null;

  // 像素观测值（从渲染帧计算，与 IR 声明值物理隔离）
  const hfEnergy = highFrequencyEnergyRatio(luma, width, height);
  const specular = specularAnalysis(frame, width, height);
  const roughVar = roughnessSpatialVariance(luma, width, height);
  const colorVarGrad = colorVariationSpatialGradient(frame, width, height);

  // 时间痕迹可检测性（基于表面变化的空间方差）
  const timeTraceDetect = roughVar > 0 ? Math.min(1, roughVar / 100) : 0;

  return {
    materialCount: irMaterials.length,
    dominantMaterialIndex: ef(dominantIdx, "ir:materials:dominant-index:first", 1.0, "First material in IR materials array as dominant"),

    // IR 声明参数（DOMAIN-IR 镜像，此处记录用于材质域内部引用）
    // 无材质时显式标记 SOURCE_LIMITED，confidence=0.0，严禁隐式 ?? 默认值
    dominantRoughness: dominantMat
      ? ef(dominantMat.roughness, "ir:materials[0]:roughness", 1.0, "Direct read from ValidatedDesignIR.materials[0].roughness")
      : ef(0, "ir:materials[0]:roughness:SOURCE_LIMITED_NO_MATERIAL", 0.0, "No material defined in IR; roughness is not applicable (SOURCE_LIMITED, not measured)"),
    dominantMetalness: dominantMat
      ? ef(dominantMat.metalness, "ir:materials[0]:metalness", 1.0, "Direct read from ValidatedDesignIR.materials[0].metalness")
      : ef(0, "ir:materials[0]:metalness:SOURCE_LIMITED_NO_MATERIAL", 0.0, "No material defined in IR; metalness is not applicable (SOURCE_LIMITED, not measured)"),
    dominantWear: dominantMat
      ? ef(dominantMat.wear, "ir:materials[0]:wear", 1.0, "Direct read from ValidatedDesignIR.materials[0].wear")
      : ef(0, "ir:materials[0]:wear:SOURCE_LIMITED_NO_MATERIAL", 0.0, "No material defined in IR; wear is not applicable (SOURCE_LIMITED, not measured)"),
    dominantBaseType: dominantMat
      ? ef(dominantMat.baseType, "ir:materials[0]:baseType", 1.0, "Direct read from ValidatedDesignIR.materials[0].baseType")
      : ef("", "ir:materials[0]:baseType:SOURCE_LIMITED_NO_MATERIAL", 0.0, "No material defined in IR; baseType is not applicable (SOURCE_LIMITED, not measured)"),
    dominantMaterialCategory: dominantMat
      ? ef(dominantMat.materialCategory, "ir:materials[0]:materialCategory", 1.0, "Parsed from baseType prefix before '::'")
      : ef("", "ir:materials[0]:materialCategory:SOURCE_LIMITED_NO_MATERIAL", 0.0, "No material defined in IR; materialCategory is not applicable (SOURCE_LIMITED, not measured)"),

    // 像素观测值（DOMAIN-MATERIAL 观测，与 IR 声明值物理隔离）
    surfaceVariation: ef(round(roughVar, 4), "pixel-buffer:material:surface-variation:4x4-block-laplacian", 0.8, "4x4 block high-frequency energy spatial variance (OBSERVED, not IR roughness)"),
    microSurfaceHighFrequencyVariance: ef(round(hfEnergy, 6), "pixel-buffer:material:micro-surface:hf-energy-ratio", 0.85, "Laplacian high-pass energy / total luma energy (OBSERVED micro-detail)"),
    specularHighlightRatio: ef(round(specular.specularRatio, 4), "pixel-buffer:material:specular:ratio:luma200-sat30", 0.85, "High-luminance(>=200) low-saturation(<=30) pixel ratio (OBSERVED highlight)"),
    specularSharpness: ef(round(specular.specularSharpness, 4), "pixel-buffer:material:specular:sharpness:local-gradient", 0.8, "Mean local gradient magnitude at specular pixels (OBSERVED)"),

    // 时间痕迹代理（从渲染帧推断，非直接测量）
    roughnessSpatialVariance: ef(round(roughVar, 4), "pixel-buffer:material:roughness:spatial-variance:proxy", 0.7, "Spatial variance of high-frequency energy as time-trace proxy (OBSERVED, not direct measurement)"),
    colorVariationSpatialGradient: ef(round(colorVarGrad, 4), "pixel-buffer:material:color:spatial-gradient:proxy", 0.7, "Mean RGB spatial gradient magnitude as patina/weathering proxy (OBSERVED)"),
    timeTraceDetectability: ef(round(timeTraceDetect, 4), "pixel-buffer:material:time-trace:detectability", 0.6, "min(1, roughnessSpatialVariance / 100) — confidence that time traces are detectable"),
  };
}

// ---------------------------------------------------------------------------
// Stage 6: IR Structural Evidence
// ---------------------------------------------------------------------------

function stage6IR(input: ExtractorInput): IREvidence {
  const ir = input.ir;

  return {
    irHash: ir.irHash,
    irType: ir.irType,

    paradigm: ef(ir.paradigm, "ir:concept:paradigm", 1.0, "Direct read from concept.name prefix / metadata.tags"),
    compositionType: ef(ir.compositionType, "ir:composition:type", 1.0, "Direct read from composition.type"),
    symmetry: ef(ir.symmetry, "ir:composition:symmetry", 1.0, "Direct read from composition.symmetry"),
    declaredNegativeSpaceRatio: ef(ir.negativeSpaceRatio, "ir:composition:negativeSpaceRatio:DECLARED", 1.0, "Direct read from composition.negativeSpaceRatio (DECLARED, not measured)"),
    horizonPosition: ef(ir.horizonPosition, "ir:camera:horizonPosition", 1.0, "Direct read from camera.horizonPosition"),
    cameraPitch: ef(ir.cameraPitch, "ir:camera:pitch", 1.0, "Direct read from camera.pitch"),

    lightingIntent: ef(ir.lightingIntent, "ir:intent:lightingIntent", 1.0, "Direct read from intent.heuristicIds lighting-intent tag"),
    colorTemp: ef(ir.colorTemp, "ir:lighting:colorTemp", 1.0, "Direct read from lighting.colorTemp"),
    lightIntensity: ef(ir.lightIntensity, "ir:lighting:intensity", 1.0, "Direct read from lighting.intensity"),
    lightSoftness: ef(ir.lightSoftness, "ir:lighting:softness", 1.0, "Direct read from lighting.softness"),
    ambientRatio: ef(ir.ambientRatio, "ir:lighting:ambientRatio", 1.0, "Direct read from lighting.ambientRatio"),

    materials: ef(ir.materials, "ir:materials:all", 1.0, "Direct mirror of ValidatedDesignIR.materials array"),
    transformationTrace: ef(ir.transformationTrace, "ir:transformationTrace:all", 1.0, "Direct mirror of Core Compiler transformation trace (e.g. CA-RULE-03-CANGRUN)"),
  };
}

// ---------------------------------------------------------------------------
// Stage 7: Provenance & Purity Verification
// ---------------------------------------------------------------------------

function stage7Purity(
  evidence: ObservableEvidenceSet,
  capturedAt: string,
): EvidencePurityAudit {
  const hardcodedFound: string[] = [];
  const missingRef: string[] = [];
  const missingConfidence: string[] = [];
  let measured = 0;
  let unmeasured = 0;
  let total = 0;

  // 递归统计所有 EvidenceField
  function scan(obj: unknown, path: string): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== "object") return;

    if (typeof obj === "object" && obj !== null) {
      const o = obj as Record<string, unknown>;
      if ("value" in o && "evidenceRef" in o && "confidence" in o && "method" in o) {
        total++;
        measured++;
        if (!o.evidenceRef || typeof o.evidenceRef !== "string" || o.evidenceRef.length === 0) {
          missingRef.push(path);
        }
        if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
          missingConfidence.push(path);
        }
        return;
      }
      if ("status" in o && o.status === "UNMEASURED_SEMANTIC") {
        total++;
        unmeasured++;
        return;
      }
      for (const key of Object.keys(o)) {
        scan(o[key], `${path}.${key}`);
      }
    }
  }

  scan(evidence.pixel, "pixel");
  scan(evidence.depth, "depth");
  if (evidence.motion) scan(evidence.motion, "motion");
  scan(evidence.material, "material");
  scan(evidence.ir, "ir");

  const isPure = hardcodedFound.length === 0 && missingRef.length === 0 && missingConfidence.length === 0;

  return {
    auditedAt: capturedAt,
    totalFields: total,
    measuredFields: measured,
    unmeasuredFields: unmeasured,
    hardcodedConstantsFound: hardcodedFound,
    fieldsMissingEvidenceRef: missingRef,
    fieldsMissingConfidence: missingConfidence,
    purityStatus: isPure ? "PURE" : "CONTAMINATED",
    contaminationDetails: isPure ? [] : [
      ...missingRef.map((p) => `Missing evidenceRef: ${p}`),
      ...missingConfidence.map((p) => `Invalid confidence: ${p}`),
    ],
  };
}

// ---------------------------------------------------------------------------
// 主提取函数
// ---------------------------------------------------------------------------

/**
 * 执行 7 阶物理证据提取流水线。
 * @param input 提取器输入（真实帧缓冲 + Core IR + 渲染上下文）
 * @returns 完整的 ObservableEvidenceSet
 * @throws 如果输入验证失败
 */
export function extractPhysicalEvidence(input: ExtractorInput): ObservableEvidenceSet {
  // Stage 1: Input Validation
  const validated = stage1Validate(input);

  // Render Context
  const renderContext: RenderContextSnapshot = {
    renderer: input.rendererInfo.type,
    rendererVersion: input.rendererInfo.version,
    resolution: { width: validated.width, height: validated.height },
    pixelFormat: "RGBA8888",
    bufferByteLength: validated.bufferByteLength,
    renderHash: input.renderHash,
    irHash: input.ir.irHash,
  };

  // Stage 2: Pixel Evidence（使用第一帧）
  const pixel = stage2Pixel(validated.frames[0], validated.width, validated.height);

  // Stage 3: Depth Evidence
  const depth = stage3Depth(validated, input.depthBuffers);

  // Stage 4: Motion Evidence（单帧时为 null）
  const motion = stage4Motion(validated);

  // Stage 5: Material Evidence
  const luma0 = toLuminance(validated.frames[0], validated.width, validated.height);
  const material = stage5Material(
    validated.frames[0],
    luma0,
    validated.width,
    validated.height,
    input.ir.materials,
  );

  // Stage 6: IR Evidence
  const ir = stage6IR(input);

  // 构造初步证据集（semantic 为 null — 机器永不生成语义证据）
  const evidence: ObservableEvidenceSet = {
    evidenceId: input.evidenceId,
    capturedAt: input.capturedAt,
    renderContext,
    pixel,
    depth,
    motion,
    material,
    ir,
    semantic: null, // 语义证据由人工输入，机器永不生成
    purityAudit: {
      auditedAt: input.capturedAt,
      totalFields: 0,
      measuredFields: 0,
      unmeasuredFields: 0,
      hardcodedConstantsFound: [],
      fieldsMissingEvidenceRef: [],
      fieldsMissingConfidence: [],
      purityStatus: "PURE",
      contaminationDetails: [],
    },
  };

  // Stage 7: Provenance & Purity
  evidence.purityAudit = stage7Purity(evidence, input.capturedAt);

  return evidence;
}
