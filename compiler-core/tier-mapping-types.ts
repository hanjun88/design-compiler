import type { ExecutionTier } from "./contracts";

export interface TierRendererConfig {
  antialias?: string;
  shadowMap?: string;
  toneMapping?: string;
  exposure?: number;
}

export interface TierFilmGrainConfig {
  enabled: boolean;
  distribution: string;
  intensity: number;
  temporalJitter: boolean;
}

export interface TierChromaticAberrationConfig {
  enabled: boolean;
  radialOffset: number;
}

export interface TierLensVignetteConfig {
  enabled: boolean;
  falloff: number;
  darkness: number;
}

export interface TierPhysicalBokehConfig {
  enabled: boolean;
  apertureBlades: number;
  fStop: number;
}

export interface TierPostProcessingConfig {
  filmGrain?: TierFilmGrainConfig;
  chromaticAberration?: TierChromaticAberrationConfig;
  lensVignette?: TierLensVignetteConfig;
  physicalBokeh?: TierPhysicalBokehConfig;
}

export interface TierCameraRigConfig {
  damping?: {
    linear: number;
    rotational: number;
  };
  easing?: string;
}

export interface TierDefinition {
  rendererType: "WebGL2Renderer" | "WebGL1Renderer" | "CSS3D" | "DOMCanvas" | "HeadlessNull";
  requiredPreferredCapabilities: string[];
  toneMapping: "AgXToneMapping" | "ACESFilmicToneMapping" | "LinearToneMapping";
  colorSpace: "srgb-linear" | "srgb";
  postprocessing: string[];
  /** 可选：渲染器物理装配配置（反AI走样） */
  rendererConfig?: TierRendererConfig;
  /** 可选：后处理物理装配配置（胶片颗粒/色差/暗角/物理散景） */
  postProcessingConfig?: TierPostProcessingConfig;
  /** 可选：相机机械阻尼配置 */
  cameraRigConfig?: TierCameraRigConfig;
}

export interface TierMappingConfig {
  $schema?: string;
  version: string;
  requiredCapabilities: string[];
  preferredCapabilities: string[];
  tiers: Record<ExecutionTier, TierDefinition>;
}
