import type { ExecutionTier } from "./contracts";

export interface TierDefinition {
  rendererType: "WebGL2Renderer" | "WebGL1Renderer" | "CSS3D" | "DOMCanvas" | "HeadlessNull";
  requiredPreferredCapabilities: string[];
  toneMapping: "AgXToneMapping" | "ACESFilmicToneMapping" | "LinearToneMapping";
  colorSpace: "srgb-linear" | "srgb";
  postprocessing: string[];
}

export interface TierMappingConfig {
  $schema?: string;
  version: string;
  requiredCapabilities: string[];
  preferredCapabilities: string[];
  tiers: Record<ExecutionTier, TierDefinition>;
}
