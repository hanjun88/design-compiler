/**
 * Phase 4-B: Professional Scene Pack Compiler — Types
 *
 * 场景包编译器类型定义。
 *
 * 核心原则：
 * - Asset Truth Boundary: SOURCE / DERIVED / GENERATED 严格区分
 * - 物理资产完整性使用 SHA-256（不使用 FNV-1a）
 * - 每个资产必须携带完整溯源链
 * - 不支持的能力显式 BLOCKED，禁止静默回退
 * - 不偷渡 HeartMirror 业务语义
 */

import type { SceneCompilationIR, SceneCapabilityBlocked } from "../scene-contract/types";

// ---------------------------------------------------------------------------
// 资产真实性分类（Asset Truth Boundary）
// ---------------------------------------------------------------------------

/**
 * 资产真实性分类。
 *
 * - SOURCE: 来自真实输入的物理原始资产（如真实视频帧、真实图片）
 * - DERIVED: 由编译阶段从 SOURCE 计算/派生的资产（如深度图、光流、法线图）
 * - GENERATED: 由编译器生成的合成资产（如程序化纹理、占位图）
 *
 * 严禁将 GENERATED 标记为 SOURCE 或 DERIVED。
 */
export type AssetTruthClass = "SOURCE" | "DERIVED" | "GENERATED";

/**
 * 资产生命周期类型（与 SceneCompilationIR 中的 AssetLifecycleType 对齐）。
 *
 * - PHYSICAL: 物理原始资产（对应 SOURCE）
 * - DERIVED: 派生资产（对应 DERIVED 或 GENERATED）
 */
export type AssetLifecycle = "PHYSICAL" | "DERIVED";

// ---------------------------------------------------------------------------
// 资产规划
// ---------------------------------------------------------------------------

/** 单个资产的规划条目 */
export interface AssetPlanEntry {
  /** 资产标识 */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** 资产类别 */
  category: string;
  /** 真实性分类 */
  truthClass: AssetTruthClass;
  /** 生命周期类型 */
  lifecycle: AssetLifecycle;
  /** MIME 类型 */
  mimeType: string;
  /** 期望像素尺寸 */
  expectedDimensions?: { width: number; height: number };
  /** 期望位深 */
  expectedBitDepth?: number;
  /** 色彩空间 */
  colorSpace?: string;
  /** 视差层（如适用） */
  parallaxLayer?: number;
  /** 是否必需 */
  required: boolean;
  /** 编译策略 */
  compilationStrategy: "COPY_SOURCE" | "COMPUTE_DERIVED" | "GENERATE_SYNTHETIC" | "BLOCKED";
  /** 阻断原因（如 compilationStrategy = BLOCKED） */
  blockedReason?: string;
  /** 阻断代码（如 compilationStrategy = BLOCKED） */
  blockedCode?: SceneCapabilityBlocked["code"];
  /** 来源 SceneCompilationIR 字段路径 */
  sourceIRField?: string;
  /** 来源 RuntimeInstruction 序号 */
  sourceInstructionSeq?: number;
  /** 资产描述 */
  description?: string;
}

/** 资产规划结果 */
export interface AssetPlan {
  /** 规划版本 */
  planVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 来源 SceneCompilationIR 的 deterministicDigest */
  sourceIRDigest: string;
  /** 规划时间 */
  plannedAt: string;
  /** 资产规划条目列表 */
  entries: AssetPlanEntry[];
  /** 总资产数 */
  totalAssets: number;
  /** SOURCE 资产数 */
  sourceAssetCount: number;
  /** DERIVED 资产数 */
  derivedAssetCount: number;
  /** GENERATED 资产数 */
  generatedAssetCount: number;
  /** BLOCKED 资产数 */
  blockedAssetCount: number;
  /** 必需资产数 */
  requiredAssetCount: number;
  /** 规划确定性摘要 */
  planDigest: string;
}

// ---------------------------------------------------------------------------
// 资产编译结果
// ---------------------------------------------------------------------------

/** 单个资产的编译结果 */
export interface CompiledAsset {
  /** 资产标识 */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** 资产类别 */
  category: string;
  /** 真实性分类 */
  truthClass: AssetTruthClass;
  /** 生命周期类型 */
  lifecycle: AssetLifecycle;
  /** MIME 类型 */
  mimeType: string;
  /** 实际像素尺寸 */
  dimensions?: { width: number; height: number };
  /** 实际位深 */
  bitDepth?: number;
  /** 色彩空间 */
  colorSpace?: string;
  /** 视差层 */
  parallaxLayer?: number;
  /** SHA-256 哈希（资产字节的哈希） */
  sha256: string;
  /** 文件大小（字节） */
  byteSize: number;
  /** 编译状态 */
  status: "COMPILED" | "BLOCKED" | "FAILED";
  /** 阻断/失败原因 */
  failureReason?: string;
  /** 阻断代码 */
  blockedCode?: SceneCapabilityBlocked["code"];
  /** 编译耗时（ms） */
  compilationDurationMs?: number;
  /** 来源资产规划条目 */
  sourcePlanEntry: AssetPlanEntry;
  /** 资产描述 */
  description?: string;
}

/** 资产编译结果集合 */
export interface AssetCompilationResult {
  /** 编译版本 */
  compilationVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 来源资产规划的 planDigest */
  sourcePlanDigest: string;
  /** 编译时间 */
  compiledAt: string;
  /** 已编译资产列表 */
  assets: CompiledAsset[];
  /** 编译成功数 */
  compiledCount: number;
  /** 阻断数 */
  blockedCount: number;
  /** 失败数 */
  failedCount: number;
  /** 编译确定性摘要 */
  compilationDigest: string;
}

// ---------------------------------------------------------------------------
// 资产验证结果
// ---------------------------------------------------------------------------

/** 单个资产的验证结果 */
export interface AssetValidationResult {
  /** 资产标识 */
  assetId: string;
  /** 是否通过 */
  valid: boolean;
  /** 违规列表 */
  violations: Array<{
    code: string;
    message: string;
    path: string;
    severity: "ERROR" | "CRITICAL";
  }>;
  /** 警告列表 */
  warnings: Array<{
    code: string;
    message: string;
    path: string;
  }>;
}

/** 资产验证结果集合 */
export interface AssetValidationReport {
  /** 验证版本 */
  validationVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 验证时间 */
  validatedAt: string;
  /** 各资产验证结果 */
  results: AssetValidationResult[];
  /** 总验证数 */
  totalValidated: number;
  /** 通过数 */
  passedCount: number;
  /** 失败数 */
  failedCount: number;
  /** 是否全部通过 */
  allValid: boolean;
}

// ---------------------------------------------------------------------------
// SHA-256 资产哈希账本
// ---------------------------------------------------------------------------

/** 单个资产的哈希账本条目 */
export interface AssetHashLedgerEntry {
  /** 资产标识 */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** SHA-256 哈希 */
  sha256: string;
  /** 文件大小（字节） */
  byteSize: number;
  /** 真实性分类 */
  truthClass: AssetTruthClass;
  /** 哈希计算时间 */
  hashedAt: string;
}

/** SHA-256 资产哈希账本 */
export interface AssetHashLedger {
  /** 账本版本 */
  ledgerVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 账本生成时间 */
  generatedAt: string;
  /** 资产哈希条目列表 */
  entries: AssetHashLedgerEntry[];
  /** 总资产数 */
  totalAssets: number;
  /** 账本根哈希（所有条目按 assetId 排序后的 SHA-256） */
  ledgerRootHash: string;
}

// ---------------------------------------------------------------------------
// Professional Scene Pack
// ---------------------------------------------------------------------------

/**
 * Professional Scene Pack — 专业场景包。
 *
 * 这是 Phase 4-B 的最终输出产物，包含：
 * - 来源 SceneCompilationIR 引用
 * - 资产规划
 * - 已编译资产
 * - 资产验证报告
 * - SHA-256 资产哈希账本
 * - scene.json 主清单
 * - 确定性场景包摘要
 */
export interface ProfessionalScenePack {
  /** 场景包版本 */
  packVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 来源溯源 */
  sourceProvenance: {
    /** 来源 SceneCompilationIR 的 deterministicDigest */
    sceneIRDigest: string;
    /** 来源 ValidatedDesignIR 哈希 */
    validatedDesignIRHash: string;
    /** 来源 AestheticExecutionPlan 哈希 */
    aestheticExecutionPlanHash: string;
    /** 来源 AestheticRuntimePlan 哈希 */
    aestheticRuntimePlanHash: string;
  };
  /** 资产规划 */
  assetPlan: AssetPlan;
  /** 已编译资产 */
  compiledAssets: AssetCompilationResult;
  /** 资产验证报告 */
  validationReport: AssetValidationReport;
  /** SHA-256 资产哈希账本 */
  hashLedger: AssetHashLedger;
  /** 能力阻断记录 */
  capabilityBlocks: SceneCapabilityBlocked[];
  /** 场景包生成时间 */
  generatedAt: string;
  /** 编译器版本 */
  compilerVersion: string;
  /** 确定性场景包摘要（对除 packDigest 外的全部字段做 SHA-256） */
  packDigest: string;
}

// ---------------------------------------------------------------------------
// 编译选项
// ---------------------------------------------------------------------------

/** 场景包编译器选项 */
export interface ScenePackCompilerOptions {
  /** 输出目录 */
  outputDir?: string;
  /** 源资产目录（SOURCE 类资产的来源） */
  sourceAssetsDir?: string;
  /** 是否允许 GENERATED 类资产（默认 false，需要显式启用） */
  allowGeneratedAssets?: boolean;
  /** 编译器版本 */
  compilerVersion?: string;
  /** 当前时间（用于确定性，默认使用当前时间） */
  currentTime?: string;
  /** 目标像素宽度 */
  targetWidth?: number;
  /** 目标像素高度 */
  targetHeight?: number;
}

// ---------------------------------------------------------------------------
// 编译结果
// ---------------------------------------------------------------------------

/** 场景包编译结果 */
export interface ScenePackCompilationResult {
  /** 是否成功 */
  success: boolean;
  /** 场景包（成功时） */
  pack?: ProfessionalScenePack;
  /** 错误列表 */
  errors: Array<{
    code: string;
    message: string;
    assetId?: string;
  }>;
  /** 警告列表 */
  warnings: Array<{
    code: string;
    message: string;
  }>;
  /** 编译耗时（ms） */
  durationMs: number;
}
