/**
 * Phase 4-A: Scene Compilation Contract — Types
 *
 * 场景编译契约类型定义。
 *
 * 核心原则：
 * - 契约先行，代码未动：本阶段只定义契约与验证器，不包含具体编译生成逻辑
 * - 每个场景参数字段必须携带溯源链（appliedFromInstructionSeq）
 * - 不支持的场景能力显式 BLOCKED，禁止静默回退
 * - 字节级确定性
 */

// ---------------------------------------------------------------------------
// 场景参数域类型
// ---------------------------------------------------------------------------

/** 带溯源的场景参数值 */
export interface TracedSceneParameter<T = number> {
  /** 参数值 */
  value: T;
  /** 应用此参数的 AestheticRuntimePlan 指令序号（可多个叠加） */
  appliedFromInstructionSeq: number[];
  /** 溯源指纹（来自 instruction 的 provenanceHash） */
  provenanceHashes: string[];
  /** 参数单位 */
  unit?: string;
  /** 参数描述 */
  description?: string;
}

// ---------------------------------------------------------------------------
// 六大场景域
// ---------------------------------------------------------------------------

/** 构图域 */
export interface SceneComposition {
  negativeSpaceRatio: TracedSceneParameter;
  focalOffset: TracedSceneParameter;
  clusterDensity: TracedSceneParameter;
  axialSymmetry: TracedSceneParameter;
}

/** 空间域 */
export interface SceneSpatial {
  depthLayers: TracedSceneParameter;
  atmosphericDensity: TracedSceneParameter;
  horizonPosition: TracedSceneParameter;
  occlusionRatio: TracedSceneParameter;
}

/** 材质域 */
export interface SceneMaterial {
  patinaLevel: TracedSceneParameter;
  specularSharpness: TracedSceneParameter;
  contrastRatio: TracedSceneParameter;
  surfaceEntropy: TracedSceneParameter;
}

/** 光照域 */
export interface SceneLighting {
  skyLuminance: TracedSceneParameter;
  shadowTemperature: TracedSceneParameter;
  mistDensity: TracedSceneParameter;
  accentLuminance: TracedSceneParameter;
}

/** 相机域 */
export interface SceneCamera {
  /** 视场角（度） */
  fov: TracedSceneParameter;
  /** 相机俯仰角（度） */
  pitch: TracedSceneParameter;
  /** 相机偏航角（度） */
  yaw: TracedSceneParameter;
  /** 视差层数 */
  parallaxLayers: TracedSceneParameter;
}

/** 运动域 */
export interface SceneMotion {
  /** 相机运动平滑度 [0,1] */
  cameraMotionSmoothness: TracedSceneParameter;
  /** 光流方向一致性 [0,1] */
  opticalFlowCoherence: TracedSceneParameter;
  /** 运动连续性 [0,1] */
  motionContinuity: TracedSceneParameter;
  /** 是否为动态场景 */
  isDynamic: TracedSceneParameter<boolean>;
}

// ---------------------------------------------------------------------------
// 场景资产清单
// ---------------------------------------------------------------------------

/** 资产类别 */
export type SceneAssetCategory =
  | "PRIMARY_VISUAL"      // 主视觉
  | "SPATIAL_GEOMETRY"    // 空间几何
  | "MATERIAL_MASK"       // 材质遮罩
  | "PHYSICAL_NORMAL"     // 物理法线
  | "OCCLUSION_SPRITE"    // 遮挡精灵
  | "ATMOSPHERIC_SPRITE"  // 大气精灵
  | "MASTER_MANIFEST";    // 主清单

/** 资产生命周期类型 */
export type AssetLifecycleType = "PHYSICAL" | "DERIVED";

/** 单个场景资产条目 */
export interface SceneAssetEntry {
  /** 资产标识 */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** 资产类别 */
  category: SceneAssetCategory;
  /** 生命周期类型（物理原始 vs 派生） */
  lifecycle: AssetLifecycleType;
  /** MIME 类型 */
  mimeType: string;
  /** 像素尺寸（如适用） */
  dimensions?: { width: number; height: number };
  /** 位深（如适用） */
  bitDepth?: number;
  /** 色彩空间 */
  colorSpace?: string;
  /** SHA-256 哈希 */
  sha256: string;
  /** 文件大小（字节） */
  byteSize: number;
  /** 视差层（如适用） */
  parallaxLayer?: number;
  /** 资产描述 */
  description?: string;
}

/** 场景资产清单 */
export interface SceneAssetManifest {
  /** 清单版本 */
  manifestVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 资产生成时间 */
  generatedAt: string;
  /** 资产列表 */
  assets: SceneAssetEntry[];
  /** 资产总数 */
  totalAssets: number;
  /** 物理原始资产数 */
  physicalAssetCount: number;
  /** 派生资产数 */
  derivedAssetCount: number;
}

// ---------------------------------------------------------------------------
// 来源溯源
// ---------------------------------------------------------------------------

/** 来源溯源链 */
export interface SceneSourceProvenance {
  /** ValidatedDesignIR 的哈希 */
  validatedDesignIRHash: string;
  /** AestheticExecutionPlan 的哈希 */
  aestheticExecutionPlanHash: string;
  /** AestheticRuntimePlan 的哈希 */
  aestheticRuntimePlanHash: string;
  /** 物理资产清单哈希（如适用） */
  physicalAssetManifestHash?: string;
  /** 编译时间 */
  compiledAt: string;
  /** 编译器版本 */
  compilerVersion: string;
}

// ---------------------------------------------------------------------------
// SceneCompilationIR
// ---------------------------------------------------------------------------

/**
 * SceneCompilationIR — 场景编译中间表示。
 *
 * 聚合六大场景域（composition, spatial, material, lighting, camera, motion），
 * 每个参数均携带溯源链。
 *
 * 这是 Phase 4-B Professional Scene Pack Compiler 的输入契约。
 */
export interface SceneCompilationIR {
  /** Schema 版本（常量） */
  schemaVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 来源溯源链 */
  sourceProvenance: SceneSourceProvenance;
  /** 构图域 */
  composition: SceneComposition;
  /** 空间域 */
  spatial: SceneSpatial;
  /** 材质域 */
  material: SceneMaterial;
  /** 光照域 */
  lighting: SceneLighting;
  /** 相机域 */
  camera: SceneCamera;
  /** 运动域 */
  motion: SceneMotion;
  /** 资产绑定 */
  assetBindings: {
    /** 资产清单 */
    manifest: SceneAssetManifest;
    /** 各资产的 SHA-256 哈希账本 */
    hashes: Record<string, string>;
  };
  /** 能力阻断记录（如有） */
  capabilityBlocks?: SceneCapabilityBlocked[];
  /** 确定性摘要（对除 deterministicDigest 外的全部字段哈希） */
  deterministicDigest: string;
}

// ---------------------------------------------------------------------------
// 能力阻断
// ---------------------------------------------------------------------------

/** 能力阻断代码 */
export type SceneCapabilityBlockCode =
  | "UNSUPPORTED_ASSET_TYPE"       // 不支持的资产类型
  | "UNSUPPORTED_CAMERA_MODEL"      // 不支持的相机模型
  | "UNSUPPORTED_LIGHTING_MODEL"    // 不支持的光照模型
  | "INSUFFICIENT_PHYSICAL_EVIDENCE" // 物理证据不足
  | "NON_PHYSICAL_PARAMETER"        // 非物理参数
  | "UNKNOWN_MATERIAL_TYPE"         // 未知材质类型
  | "DEPTH_BUFFER_UNAVAILABLE"      // 深度缓冲不可用
  | "MOTION_DATA_UNAVAILABLE";      // 运动数据不可用

/** 场景能力阻断记录 */
export interface SceneCapabilityBlocked {
  /** 阻断代码 */
  code: SceneCapabilityBlockCode;
  /** 阻断原因（人类可读） */
  reason: string;
  /** 受影响的场景域 */
  affectedDomain: "composition" | "spatial" | "material" | "lighting" | "camera" | "motion" | "assetBindings";
  /** 受影响的参数字段（如适用） */
  affectedParameter?: string;
  /** 溯源信息 */
  provenance: {
    /** 来源指令序号（如适用） */
    instructionSeq?: number;
    /** 来源溯源哈希 */
    provenanceHash?: string;
    /** 来源原则引用 */
    principleRef?: string;
  };
  /** 阻断时间 */
  blockedAt: string;
}

// ---------------------------------------------------------------------------
// 验证结果
// ---------------------------------------------------------------------------

/** 契约验证结果 */
export interface ContractValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 违规列表 */
  violations: ContractViolation[];
  /** 警告列表 */
  warnings: ContractWarning[];
  /** 验证耗时（ms） */
  durationMs: number;
}

/** 契约违规 */
export interface ContractViolation {
  /** 违规代码 */
  code: string;
  /** 违规消息 */
  message: string;
  /** 违规路径（JSON Pointer 风格） */
  path: string;
  /** 违规严重程度 */
  severity: "ERROR" | "CRITICAL";
}

/** 契约警告 */
export interface ContractWarning {
  /** 警告代码 */
  code: string;
  /** 警告消息 */
  message: string;
  /** 警告路径 */
  path: string;
}
