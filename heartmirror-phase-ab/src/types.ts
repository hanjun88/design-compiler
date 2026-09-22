// G1 Data Gate 类型定义文件

export interface ImageInput {
  data: Buffer | string;
  width: number;
  height: number;
  format: 'jpg' | 'png' | 'webp' | 'gif';
}

export interface ImageFeatures {
  colorHistogram: { r: number; g: number; b: number };
  aspectRatio: number;
  spatialOrientation: number;
  complexity: number;
  metadata: Record<string, any>;
}

export interface SceneCompilationSchema {
  allowedAspectRatios: { min: number; max: number; };
  allowedOrientations: { min: number; max: number; };
  allowedComplexity: { min: number; max: number; };
  colorHistogramRange: {
    r: { min: number; max: number; };
    g: { min: number; max: number; };
    b: { min: number; max: number; };
  };
}