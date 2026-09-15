/**
 * compiler-intent/intent-normalizer.ts
 *
 * Intent Normalization Engine — 九层降维链第 8→9 层转译器。
 *
 * 将 Cangjie 层 RawDesignIR（扁平 parameters[] + concept/intent/provenance）
 * 确定性降维编译为 Core Compiler 层 RawDesignIR（嵌套 composition/camera/lighting/materials/color）。
 *
 * 核心约束：
 * - 所有映射为确定性纯函数，相同输入产生相同输出
 * - capturedAt 必须显式传入，禁止使用 new Date()
 * - confidence 严格来自 Cangjie 参数的 confidence（sourceObservationConfidence）
 * - intentResolutionConfidence / mappingConfidence 严格隔离在 NormalizationMetadata 中
 * - 不得修改 compiler-core/ 下的任何文件（硬只读边界）
 * - 101/101 回归基线不可破坏
 */

import { createHash } from "crypto";
import type {
  RawDesignIR,
  RawEstimatedParameter,
  ParameterUnit,
  RawParameterStatus,
} from "../compiler-core/contracts";
import {
  lookupPointer,
  isValidPointer,
  validateValueType,
  getRequiredPaths,
  type PointerMapEntry,
} from "./pointer-map";
import type {
  CangjieRawDesignIR,
  CangjieEstimatedParameter,
  NormalizationResult,
  NormalizationMetadata,
  IntentNormalizerOptions,
  NormalizationStatus,
} from "./types";

// ============================================================================
// 常量
// ============================================================================

const NORMALIZER_VERSION = "1.0.0";
const HASH_ALGORITHM = "sha256";
const HASH_PREFIX = "sha256:";

// 默认推理执行耗时（ms），当调用方未显式传入时使用
// 注意：这是确定性默认值，不是 new Date() 或随机值
const DEFAULT_INFERENCE_EXECUTION_MS = 0;

// ============================================================================
// 语义哈希 — 排除非语义时间字段，保证 1000× 恒等
// ============================================================================

/**
 * 从对象中递归移除时间戳字段，用于语义哈希计算。
 *
 * 排除的字段：createdAt / capturedAt / calibratedAt / verifiedAt / compiledAt / executedAt / timestamp
 * 这些字段不影响设计语义，但会破坏哈希恒等性。
 */
function stripTimestamps(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(stripTimestamps);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (
      key === "createdAt" ||
      key === "capturedAt" ||
      key === "calibratedAt" ||
      key === "verifiedAt" ||
      key === "compiledAt" ||
      key === "executedAt" ||
      key === "timestamp"
    ) {
      continue; // 排除非语义时间字段
    }
    result[key] = stripTimestamps(value);
  }
  return result;
}

/**
 * 递归规范化 JSON 字符串：对所有对象键排序，保证确定性。
 *
 * 不使用 JSON.stringify 的数组白名单参数（会递归过滤嵌套键），
 * 而是手动递归序列化，确保所有嵌套字段都被包含。
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalStringify(item)).join(",") + "]";
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    "{" +
    keys
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",") +
    "}"
  );
}

/**
 * 计算 Cangjie IR 的语义输入哈希。
 *
 * 基于 irId + concept + intent + parameters（排除时间戳字段）的规范化 JSON 计算 SHA-256。
 * 保证 1000 次相同输入调用产生相同哈希。
 *
 * @param cangjieIR Cangjie 层 RawDesignIR
 * @returns sha256:<64hex> 格式的哈希
 */
export function computeSemanticInputHash(cangjieIR: CangjieRawDesignIR): string {
  // 对 parameters 按 path 排序，保证语义哈希对参数顺序不敏感
  const sortedParameters = [...cangjieIR.parameters].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  const semanticPayload = {
    irId: cangjieIR.irId,
    concept: stripTimestamps(cangjieIR.concept),
    intent: stripTimestamps(cangjieIR.intent),
    parameters: sortedParameters.map((p) => ({
      paramId: p.paramId,
      path: p.path,
      value: p.value,
      unit: p.unit,
      confidence: p.confidence,
      source: stripTimestamps(p.source),
      calibration: stripTimestamps(p.calibration),
      range: p.range,
      focalProtection: p.focalProtection,
      provenance: stripTimestamps(p.provenance),
    })),
    distillerVersion: cangjieIR.distillerVersion,
    grammarVersion: cangjieIR.grammarVersion,
  };

  // 规范化 JSON：递归排序键，保证确定性
  const canonical = canonicalStringify(semanticPayload);
  const hash = createHash(HASH_ALGORITHM).update(canonical, "utf8").digest("hex");
  return `${HASH_PREFIX}${hash}`;
}

// ============================================================================
// Core IR 默认值构造
// ============================================================================

/**
 * 构造默认的 RawEstimatedParameter。
 *
 * @param entry 路径映射条目（提供默认 unit/source/status）
 * @param value 参数值
 * @param confidence 置信度（严格来自 Cangjie 参数）
 * @param evidence 证据列表
 * @returns RawEstimatedParameter
 */
function buildRawParameter<T>(
  entry: PointerMapEntry,
  value: T,
  confidence: number,
  evidence: string[],
): RawEstimatedParameter<T> {
  return {
    value,
    unit: entry.defaultUnit,
    confidence,
    status: entry.defaultStatus,
    evidence,
    source: entry.defaultSource,
  };
}

/**
 * 构造初始 Core IR 骨架（所有参数为默认占位，后续由 Cangjie 参数填充）。
 *
 * @param inputHash 语义输入哈希
 * @param distillerVersion 蒸馏器版本
 * @param inferenceExecutionMs 推理执行耗时（显式输入）
 * @returns 初始 RawDesignIR
 */
function buildInitialCoreIR(
  inputHash: string,
  distillerVersion: string,
  inferenceExecutionMs: number,
): RawDesignIR {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: {
      sourceType: "image",
      aspectRatio: "16:9",
      timestamp: "1970-01-01T00:00:00Z", // 确定性占位，不使用 new Date()
    },
    composition: {
      focalPoint: buildRawParameter<[number, number]>(
        lookupPointer("/composition/focalPoint")!,
        [0.5, 0.5],
        0.0,
        ["default-placeholder"],
      ),
      negativeSpaceRatio: buildRawParameter<number>(
        lookupPointer("/composition/negativeSpaceRatio")!,
        0.5,
        0.0,
        ["default-placeholder"],
      ),
      depthLayerCount: buildRawParameter<number>(
        lookupPointer("/composition/depthLayerCount")!,
        3,
        0.0,
        ["default-placeholder"],
      ),
      symmetry: buildRawParameter<number>(
        lookupPointer("/composition/symmetry")!,
        0.5,
        0.0,
        ["default-placeholder"],
      ),
    },
    camera: {
      fov: buildRawParameter<number>(lookupPointer("/camera/fov")!, 35, 0.0, ["default-placeholder"]),
      shotSize: buildRawParameter<string>(
        lookupPointer("/camera/shotSize")!,
        "medium-shot",
        0.0,
        ["default-placeholder"],
      ),
      angle: buildRawParameter<number>(lookupPointer("/camera/angle")!, 0, 0.0, ["default-placeholder"]),
      height: buildRawParameter<number>(lookupPointer("/camera/height")!, 1.5, 0.0, ["default-placeholder"]),
    },
    lighting: {
      keyLight: {
        azimuth: buildRawParameter<number>(
          lookupPointer("/lighting/keyLight/azimuth")!,
          45,
          0.0,
          ["default-placeholder"],
        ),
        elevation: buildRawParameter<number>(
          lookupPointer("/lighting/keyLight/elevation")!,
          30,
          0.0,
          ["default-placeholder"],
        ),
        colorTemp: buildRawParameter<number>(
          lookupPointer("/lighting/keyLight/colorTemp")!,
          5500,
          0.0,
          ["default-placeholder"],
        ),
        intensity: buildRawParameter<number>(
          lookupPointer("/lighting/keyLight/intensity")!,
          1.0,
          0.0,
          ["default-placeholder"],
        ),
        softness: buildRawParameter<number>(
          lookupPointer("/lighting/keyLight/softness")!,
          0.5,
          0.0,
          ["default-placeholder"],
        ),
      },
      ambientRatio: buildRawParameter<number>(
        lookupPointer("/lighting/ambientRatio")!,
        0.3,
        0.0,
        ["default-placeholder"],
      ),
      rimLightPresent: buildRawParameter<boolean>(
        lookupPointer("/lighting/rimLightPresent")!,
        false,
        0.0,
        ["default-placeholder"],
      ),
    },
    materials: [
      {
        role: "dominant",
        baseType: buildRawParameter<string>(
          lookupPointer("/materials/0/baseType")!,
          "stone",
          0.0,
          ["default-placeholder"],
        ),
        roughness: buildRawParameter<number>(
          lookupPointer("/materials/0/roughness")!,
          0.5,
          0.0,
          ["default-placeholder"],
        ),
        metalness: buildRawParameter<number>(
          lookupPointer("/materials/0/metalness")!,
          0.1,
          0.0,
          ["default-placeholder"],
        ),
        wear: buildRawParameter<number>(lookupPointer("/materials/0/wear")!, 0.3, 0.0, ["default-placeholder"]),
      },
    ],
    color: {
      dominant: buildRawParameter<string>(
        lookupPointer("/color/dominant")!,
        "#808080",
        0.0,
        ["default-placeholder"],
      ),
      secondary: buildRawParameter<string>(
        lookupPointer("/color/secondary")!,
        "#a0a0a0",
        0.0,
        ["default-placeholder"],
      ),
      accent: buildRawParameter<string>(
        lookupPointer("/color/accent")!,
        "#c0c0c0",
        0.0,
        ["default-placeholder"],
      ),
      contrastRatio: buildRawParameter<number>(
        lookupPointer("/color/contrastRatio")!,
        1.0,
        0.0,
        ["default-placeholder"],
      ),
      temperatureBias: buildRawParameter<number>(
        lookupPointer("/color/temperatureBias")!,
        0.0,
        0.0,
        ["default-placeholder"],
      ),
    },
    provenance: {
      extractorVersion: distillerVersion,
      inferenceExecutionMs,
      rawIntegrityStatus: "READY",
      hashManifest: {
        algorithm: "SHA-256",
        canonicalization: "RFC8785",
      },
      inputHash,
      rawIRHash: `${HASH_PREFIX}${"0".repeat(64)}`, // 占位，G1 Data Gate 会重新计算
    },
  };
}

// ============================================================================
// JSON Pointer 嵌套写入
// ============================================================================

/**
 * 将 RawEstimatedParameter 写入 Core IR 的指定 JSON Pointer 路径。
 *
 * 支持 materials 数组的任意索引。
 *
 * @param coreIR Core IR 对象（会被修改）
 * @param path JSON Pointer 路径
 * @param param 要写入的 RawEstimatedParameter
 * @returns true 表示写入成功，false 表示路径无法定位
 */
function setParameterAtPath(
  coreIR: RawDesignIR,
  path: string,
  param: RawEstimatedParameter<unknown>,
): boolean {
  const tokens = path.startsWith("/") ? path.slice(1).split("/") : path.split("/");
  if (tokens.length === 0) return false;

  let current: Record<string, unknown> = coreIR as unknown as Record<string, unknown>;

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];

    // materials 数组处理
    if (token === "materials" && Array.isArray(current.materials)) {
      const indexToken = tokens[i + 1];
      const index = Number.parseInt(indexToken, 10);
      if (Number.isNaN(index) || index < 0) return false;

      // 确保数组长度足够
      while ((current.materials as unknown[]).length <= index) {
        (current.materials as unknown[]).push({
          role: "secondary",
          baseType: { value: "unknown", unit: "scalar", confidence: 0, status: "unknown", evidence: [], source: "fallback-default" },
          roughness: { value: 0.5, unit: "normalized", confidence: 0, status: "unknown", evidence: [], source: "fallback-default" },
          metalness: { value: 0.0, unit: "normalized", confidence: 0, status: "unknown", evidence: [], source: "fallback-default" },
          wear: { value: 0.0, unit: "normalized", confidence: 0, status: "unknown", evidence: [], source: "fallback-default" },
        });
      }

      current = (current.materials as unknown[])[index] as Record<string, unknown>;
      i++; // 跳过索引 token
      continue;
    }

    if (!(token in current)) {
      return false;
    }
    current = current[token] as Record<string, unknown>;
  }

  const lastToken = tokens[tokens.length - 1];
  current[lastToken] = param;
  return true;
}

// ============================================================================
// Cangjie 参数 → Core RawEstimatedParameter 转换
// ============================================================================

/**
 * 将 Cangjie 层估计参数转换为 Core 层 RawEstimatedParameter。
 *
 * 置信度隔离：Core 参数的 confidence 严格来自 Cangjie 参数的 confidence（sourceObservationConfidence）。
 * intentResolutionConfidence 和 mappingConfidence 不进入此函数。
 *
 * @param cangjieParam Cangjie 层估计参数
 * @param entry 路径映射条目
 * @returns Core 层 RawEstimatedParameter
 */
function convertCangjieParameter(
  cangjieParam: CangjieEstimatedParameter,
  entry: PointerMapEntry,
): RawEstimatedParameter<unknown> {
  // 构造证据列表：来自 Cangjie source.ref + calibration.method
  const evidence: string[] = [];
  if (cangjieParam.source.ref) {
    evidence.push(`source:${cangjieParam.source.ref}`);
  }
  if (cangjieParam.calibration.method) {
    evidence.push(`calibration:${cangjieParam.calibration.method}`);
  }
  if (cangjieParam.provenance?.ontologyNode) {
    evidence.push(`ontology:${cangjieParam.provenance.ontologyNode}`);
  }
  if (evidence.length === 0) {
    evidence.push("cangjie-distillation");
  }

  // 确定参数状态：基于 calibration.status
  let status: RawParameterStatus = entry.defaultStatus;
  if (cangjieParam.calibration.status === "PRODUCTION") {
    status = "observed";
  } else if (cangjieParam.calibration.status === "EXPERIMENTAL") {
    status = "estimated";
  }

  // 确定单位：优先使用 Cangjie 参数的 unit，否则使用默认
  const unit: ParameterUnit = (cangjieParam.unit as ParameterUnit) || entry.defaultUnit;

  return {
    value: cangjieParam.value,
    unit,
    confidence: cangjieParam.confidence, // 严格来自 sourceObservationConfidence
    status,
    evidence,
    source: entry.defaultSource,
    derivedFrom: cangjieParam.provenance?.heuristicId,
  };
}

// ============================================================================
// 主引擎：Intent Normalizer
// ============================================================================

/**
 * Intent Normalization Engine — 将 Cangjie 层 IR 降维编译为 Core 层 IR。
 *
 * 确定性纯函数：相同输入 + 相同 options 产生相同输出。
 *
 * @param cangjieIR Cangjie 层 RawDesignIR（基于 raw-design-ir.schema.json）
 * @param options 正常化配置（含显式 capturedAt，禁止 new Date()）
 * @returns NormalizationResult（coreIR + metadata + status + diagnostics）
 */
export function normalizeIntent(
  cangjieIR: CangjieRawDesignIR,
  options: IntentNormalizerOptions,
): NormalizationResult {
  const diagnostics: string[] = [];
  const unmappedParameters: string[] = [];
  const overwrittenParameters: string[] = [];
  let mappedParameters = 0;

  // 1. 计算语义输入哈希（排除时间戳，保证 1000× 恒等）
  const inputHash = computeSemanticInputHash(cangjieIR);

  // 2. 构造初始 Core IR 骨架
  const inferenceExecutionMs = options.inferenceExecutionMs ?? DEFAULT_INFERENCE_EXECUTION_MS;
  const coreIR = buildInitialCoreIR(inputHash, cangjieIR.distillerVersion, inferenceExecutionMs);

  // 3. 遍历 Cangjie 参数，按 path 写入 Core IR
  // 用 Set 跟踪已写入的路径，检测覆盖
  const writtenPaths = new Set<string>();

  for (const param of cangjieIR.parameters) {
    // 3a. 指针物理校验：path 是否指向 Core IR 中真实存在的字段
    const entry = lookupPointer(param.path);
    if (!entry) {
      unmappedParameters.push(param.paramId);
      diagnostics.push(`UNMAPPED_PARAM: paramId=${param.paramId} path=${param.path} not found in pointer-map`);
      continue;
    }

    // 3b. 值类型校验
    if (!validateValueType(param.value, entry.valueType)) {
      unmappedParameters.push(param.paramId);
      diagnostics.push(
        `TYPE_MISMATCH: paramId=${param.paramId} path=${param.path} expected=${entry.valueType} got=${typeof param.value}`,
      );
      continue;
    }

    // 3c. 检测覆盖（同一 path 多个参数）
    if (writtenPaths.has(param.path)) {
      overwrittenParameters.push(param.path);
      diagnostics.push(`OVERWRITE: path=${param.path} overwritten by paramId=${param.paramId}`);
    }
    writtenPaths.add(param.path);

    // 3d. 转换为 Core RawEstimatedParameter
    // 置信度严格来自 Cangjie 参数的 confidence（sourceObservationConfidence）
    const coreParam = convertCangjieParameter(param, entry);

    // 3e. 写入 Core IR 嵌套结构
    const written = setParameterAtPath(coreIR, param.path, coreParam);
    if (!written) {
      unmappedParameters.push(param.paramId);
      diagnostics.push(`WRITE_FAILED: paramId=${param.paramId} path=${param.path} could not be written`);
      continue;
    }

    mappedParameters++;
  }

  // 4. 必选路径校验：G1 Data Gate 的 requiredPaths 必须全部被填充
  const requiredPaths = getRequiredPaths();
  const missingRequired: string[] = [];
  for (const reqPath of requiredPaths) {
    if (!writtenPaths.has(reqPath)) {
      missingRequired.push(reqPath);
    }
  }

  // 5. 确定状态
  let status: NormalizationStatus = "PASS";
  if (missingRequired.length > 0) {
    status = "BLOCKED_DATA";
    diagnostics.push(`BLOCKED_DATA: missing required paths: ${missingRequired.join(", ")}`);
    coreIR.provenance.rawIntegrityStatus = "BLOCKED_DATA";
  } else if (unmappedParameters.length > 0 && mappedParameters === 0) {
    status = "FAIL";
    diagnostics.push("FAIL: no parameters were successfully mapped");
  }

  // 6. 组装元数据（内部使用，严格隔离，不进入 Core IR）
  const metadata: NormalizationMetadata = {
    intentResolutionConfidence: options.intentResolutionConfidence ?? 0.9,
    mappingConfidence: options.mappingConfidence ?? 0.95,
    mappedParameters,
    unmappedParameters,
    overwrittenParameters,
    normalizationVersion: NORMALIZER_VERSION,
    capturedAt: options.capturedAt, // 显式确定性输入，不使用 new Date()
  };

  return {
    coreIR,
    metadata,
    status,
    diagnostics,
  };
}

// ============================================================================
// 便捷导出
// ============================================================================

export { isValidPointer, lookupPointer, getRequiredPaths, getAllPaths } from "./pointer-map";
export type { PointerMapEntry, CoreIRValueType } from "./pointer-map";
