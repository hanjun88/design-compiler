/**
 * 4.A-3: Scene Capability Guard
 *
 * 场景能力阻断看门狗。
 *
 * 当场景请求超出当前 Runtime 承载上限时，强制抛出带溯源的 SCENE_CAPABILITY_BLOCKED，
 * 严禁静默回退为默认参数。
 *
 * 支持的阻断代码：
 * - UNSUPPORTED_ASSET_TYPE: 不支持的资产类型
 * - UNSUPPORTED_CAMERA_MODEL: 不支持的相机模型
 * - UNSUPPORTED_LIGHTING_MODEL: 不支持的光照模型
 * - INSUFFICIENT_PHYSICAL_EVIDENCE: 物理证据不足
 * - NON_PHYSICAL_PARAMETER: 非物理参数
 * - UNKNOWN_MATERIAL_TYPE: 未知材质类型
 * - DEPTH_BUFFER_UNAVAILABLE: 深度缓冲不可用
 * - MOTION_DATA_UNAVAILABLE: 运动数据不可用
 */

import type {
  SceneCapabilityBlocked,
  SceneCapabilityBlockCode,
} from "./types";
import type { TracedSceneParameter } from "./types";

// ---------------------------------------------------------------------------
// 当前 Runtime 支持的能力声明
// ---------------------------------------------------------------------------

export interface RuntimeCapabilities {
  /** 支持的资产 MIME 类型 */
  supportedAssetMimeTypes: string[];
  /** 支持的相机模型 */
  supportedCameraModels: string[];
  /** 支持的光照模型 */
  supportedLightingModels: string[];
  /** 支持的材质类型 */
  supportedMaterialTypes: string[];
  /** 是否支持深度缓冲 */
  supportsDepthBuffer: boolean;
  /** 是否支持运动数据 */
  supportsMotionData: boolean;
  /** 最大视差层数 */
  maxParallaxLayers: number;
  /** 最大资产数 */
  maxAssets: number;
}

/** 默认 Runtime 能力声明（保守声明） */
export const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  supportedAssetMimeTypes: [
    "image/webp",
    "image/png",
    "image/jpeg",
    "application/json",
  ],
  supportedCameraModels: [
    "perspective",
    "orthographic",
  ],
  supportedLightingModels: [
    "directional",
    "hemisphere",
    "point",
  ],
  supportedMaterialTypes: [
    "standard",
    "physical",
    "toon",
  ],
  supportsDepthBuffer: true,
  supportsMotionData: true,
  maxParallaxLayers: 5,
  maxAssets: 32,
};

// ---------------------------------------------------------------------------
// 能力检查结果
// ---------------------------------------------------------------------------

export interface CapabilityCheckResult {
  /** 是否通过（无阻断） */
  passed: boolean;
  /** 阻断记录列表 */
  blocks: SceneCapabilityBlocked[];
  /** 检查耗时（ms） */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// 能力看门狗
// ---------------------------------------------------------------------------

export interface CapabilityGuardOptions {
  /** Runtime 能力声明（默认使用 DEFAULT_RUNTIME_CAPABILITIES） */
  capabilities?: RuntimeCapabilities;
  /** 当前时间（用于 blockedAt 字段，默认使用当前时间） */
  currentTime?: string;
}

/**
 * 场景能力看门狗。
 *
 * 检查场景请求是否在当前 Runtime 能力范围内。
 * 任何超出能力范围的请求都会生成显式的 SCENE_CAPABILITY_BLOCKED 记录，
 * 严禁静默回退。
 */
export class SceneCapabilityGuard {
  private capabilities: RuntimeCapabilities;
  private currentTime: string;

  constructor(options: CapabilityGuardOptions = {}) {
    this.capabilities = options.capabilities ?? DEFAULT_RUNTIME_CAPABILITIES;
    this.currentTime = options.currentTime ?? new Date().toISOString();
  }

  /**
   * 检查资产类型是否受支持。
   */
  checkAssetType(
    mimeType: string,
    context: { assetId?: string; instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportedAssetMimeTypes.includes(mimeType)) {
      return this.createBlock(
        "UNSUPPORTED_ASSET_TYPE",
        `Asset MIME type "${mimeType}" is not supported by current Runtime (supported: [${this.capabilities.supportedAssetMimeTypes.join(", ")}])`,
        "assetBindings",
        context.assetId,
        context,
      );
    }
    return null;
  }

  /**
   * 检查相机模型是否受支持。
   */
  checkCameraModel(
    cameraModel: string,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportedCameraModels.includes(cameraModel)) {
      return this.createBlock(
        "UNSUPPORTED_CAMERA_MODEL",
        `Camera model "${cameraModel}" is not supported by current Runtime (supported: [${this.capabilities.supportedCameraModels.join(", ")}])`,
        "camera",
        undefined,
        context,
      );
    }
    return null;
  }

  /**
   * 检查光照模型是否受支持。
   */
  checkLightingModel(
    lightingModel: string,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportedLightingModels.includes(lightingModel)) {
      return this.createBlock(
        "UNSUPPORTED_LIGHTING_MODEL",
        `Lighting model "${lightingModel}" is not supported by current Runtime (supported: [${this.capabilities.supportedLightingModels.join(", ")}])`,
        "lighting",
        undefined,
        context,
      );
    }
    return null;
  }

  /**
   * 检查材质类型是否受支持。
   */
  checkMaterialType(
    materialType: string,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportedMaterialTypes.includes(materialType)) {
      return this.createBlock(
        "UNKNOWN_MATERIAL_TYPE",
        `Material type "${materialType}" is not recognized by current Runtime (supported: [${this.capabilities.supportedMaterialTypes.join(", ")}])`,
        "material",
        undefined,
        context,
      );
    }
    return null;
  }

  /**
   * 检查深度缓冲是否可用。
   */
  checkDepthBuffer(
    depthAvailable: boolean,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportsDepthBuffer || !depthAvailable) {
      return this.createBlock(
        "DEPTH_BUFFER_UNAVAILABLE",
        `Depth buffer is not available (runtime supports: ${this.capabilities.supportsDepthBuffer}, input available: ${depthAvailable})`,
        "spatial",
        "depthLayers",
        context,
      );
    }
    return null;
  }

  /**
   * 检查运动数据是否可用。
   */
  checkMotionData(
    motionAvailable: boolean,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!this.capabilities.supportsMotionData || !motionAvailable) {
      return this.createBlock(
        "MOTION_DATA_UNAVAILABLE",
        `Motion data is not available (runtime supports: ${this.capabilities.supportsMotionData}, input available: ${motionAvailable})`,
        "motion",
        "motionContinuity",
        context,
      );
    }
    return null;
  }

  /**
   * 检查视差层数是否在限制内。
   */
  checkParallaxLayers(
    layers: number,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (layers > this.capabilities.maxParallaxLayers) {
      return this.createBlock(
        "NON_PHYSICAL_PARAMETER",
        `Parallax layers (${layers}) exceeds runtime maximum (${this.capabilities.maxParallaxLayers})`,
        "camera",
        "parallaxLayers",
        context,
      );
    }
    return null;
  }

  /**
   * 检查物理证据是否充足。
   *
   * @param evidenceAvailable 是否有物理证据
   * @param domain 受影响的域
   * @param parameter 受影响的参数
   * @param context 溯源上下文
   */
  checkPhysicalEvidence(
    evidenceAvailable: boolean,
    domain: "composition" | "spatial" | "material" | "lighting" | "camera" | "motion",
    parameter: string,
    context: { instructionSeq?: number; provenanceHash?: string } = {},
  ): SceneCapabilityBlocked | null {
    if (!evidenceAvailable) {
      return this.createBlock(
        "INSUFFICIENT_PHYSICAL_EVIDENCE",
        `Insufficient physical evidence for ${domain}.${parameter} — cannot derive parameter without observable evidence`,
        domain,
        parameter,
        context,
      );
    }
    return null;
  }

  /**
   * 批量检查一组能力。
   *
   * @param checks 检查项列表
   * @returns 检查结果（包含所有阻断记录）
   */
  checkAll(checks: Array<() => SceneCapabilityBlocked | null>): CapabilityCheckResult {
    const startTime = Date.now();
    const blocks: SceneCapabilityBlocked[] = [];

    for (const check of checks) {
      const block = check();
      if (block) {
        blocks.push(block);
      }
    }

    return {
      passed: blocks.length === 0,
      blocks,
      durationMs: Date.now() - startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // 内部方法
  // ---------------------------------------------------------------------------

  private createBlock(
    code: SceneCapabilityBlockCode,
    reason: string,
    affectedDomain: SceneCapabilityBlocked["affectedDomain"],
    affectedParameter: string | undefined,
    context: { instructionSeq?: number; provenanceHash?: string; principleRef?: string },
  ): SceneCapabilityBlocked {
    return {
      code,
      reason,
      affectedDomain,
      affectedParameter,
      provenance: {
        instructionSeq: context.instructionSeq,
        provenanceHash: context.provenanceHash,
        principleRef: context.principleRef,
      },
      blockedAt: this.currentTime,
    };
  }
}

// ---------------------------------------------------------------------------
// 便捷函数：创建阻断记录
// ---------------------------------------------------------------------------

/**
 * 便捷函数：创建一个场景能力阻断记录。
 */
export function createCapabilityBlock(
  code: SceneCapabilityBlockCode,
  reason: string,
  affectedDomain: SceneCapabilityBlocked["affectedDomain"],
  options: {
    affectedParameter?: string;
    instructionSeq?: number;
    provenanceHash?: string;
    principleRef?: string;
    blockedAt?: string;
  } = {},
): SceneCapabilityBlocked {
  return {
    code,
    reason,
    affectedDomain,
    affectedParameter: options.affectedParameter,
    provenance: {
      instructionSeq: options.instructionSeq,
      provenanceHash: options.provenanceHash,
      principleRef: options.principleRef,
    },
    blockedAt: options.blockedAt ?? new Date().toISOString(),
  };
}
