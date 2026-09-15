/**
 * Capability Negotiator — WebGL2 能力判定与降级协商
 *
 * 职责：
 * 1. 探测目标运行时的 WebGL2 能力（纹理尺寸、Uniform 数量、扩展支持等）
 * 2. 将编译参数与运行时能力进行匹配协商
 * 3. 能力不满足时生成降级策略（fallback），标注质量损失
 * 4. 输出能力协商结果，供 Execution Planner 使用
 *
 * 注意：本文件为框架占位，具体逻辑待实现。
 */

import type {
  RuntimeCapability,
  WebGL2Capabilities,
  CompileContext,
} from './types.js';

// ========== 框架接口 ==========

export interface CapabilityNegotiationResult {
  negotiated: boolean;
  runtime: RuntimeCapability;
  acceptedFeatures: string[];
  downgradedFeatures: Array<{
    feature: string;
    reason: string;
    fallbackStrategy: string;
    qualityLoss: 'none' | 'minor' | 'moderate' | 'severe';
  }>;
  blockedFeatures: string[];
  renderParams: Record<string, unknown>;
}

/**
 * 执行运行时能力协商。
 * 框架占位 — 具体逻辑待实现。
 */
export function negotiateCapabilities(
  context: CompileContext,
  targetRuntime?: string
): CapabilityNegotiationResult {
  // 框架占位：返回默认结果
  return {
    negotiated: false,
    runtime: {
      runtime: targetRuntime || 'heartmirror-webgl',
      runtimeVersion: '0.0.0',
      webgl2: {
        supported: false,
        maxTextureSize: 0,
        maxRenderBufferSize: 0,
        maxVertexAttribs: 0,
        maxVertexUniformVectors: 0,
        maxFragmentUniformVectors: 0,
        maxVaryingVectors: 0,
        maxTextureImageUnits: 0,
        extensions: [],
      },
      capabilities: {},
      fallbacks: [],
    },
    acceptedFeatures: [],
    downgradedFeatures: [],
    blockedFeatures: [],
    renderParams: {},
  };
}

/**
 * 探测 WebGL2 能力。
 * 框架占位 — 具体逻辑待实现。
 * 在浏览器环境中创建离屏 canvas 并获取 WebGL2 context。
 */
export function probeWebGL2(): WebGL2Capabilities {
  // 框架占位：返回默认能力
  return {
    supported: false,
    maxTextureSize: 0,
    maxRenderBufferSize: 0,
    maxVertexAttribs: 0,
    maxVertexUniformVectors: 0,
    maxFragmentUniformVectors: 0,
    maxVaryingVectors: 0,
    maxTextureImageUnits: 0,
    extensions: [],
  };
}

/**
 * 检查特定扩展是否可用。
 * 框架占位 — 具体逻辑待实现。
 */
export function checkExtension(
  capabilities: WebGL2Capabilities,
  extensionName: string
): boolean {
  return capabilities.extensions.includes(extensionName); // 框架占位
}

/**
 * 根据运行时能力调整渲染参数。
 * 框架占位 — 具体逻辑待实现。
 */
export function adjustRenderParams(
  params: Record<string, unknown>,
  capabilities: WebGL2Capabilities
): { params: Record<string, unknown>; downgrades: string[] } {
  return { params: { ...params }, downgrades: [] }; // 框架占位
}

/**
 * 生成降级策略描述。
 * 框架占位 — 具体逻辑待实现。
 */
export function generateFallback(
  feature: string,
  reason: string
): { strategy: string; qualityLoss: 'none' | 'minor' | 'moderate' | 'severe' } {
  return { strategy: '', qualityLoss: 'none' }; // 框架占位
}
