// G1 Data Gate - Phase A: deterministic image feature extraction & schema validation
import type { SceneCompilationSchema } from './types';

interface SharpMetadata {
  format?: string;
  width?: number;
  height?: number;
  orientation?: number;
}

interface SharpRawBuffer {
  data: Buffer;
  info: { width: number; height: number };
}

interface SharpPipeline {
  metadata(): Promise<SharpMetadata>;
  rotate(): SharpPipeline;
  flatten(options: unknown): SharpPipeline;
  ensureAlpha(): SharpPipeline;
  raw(): { toBuffer(options: { resolveWithObject: true }): Promise<SharpRawBuffer> };
}

type SharpFactory = (
  input: Buffer,
  options: { failOn: 'error'; limitInputPixels: number }
) => SharpPipeline;

const sharp = require('sharp') as unknown as SharpFactory;

const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const EXPECTED_SHARP_FORMAT: Record<'jpg' | 'png' | 'webp' | 'gif', string> = {
  jpg: 'jpeg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

export interface ImageInput {
  data: Buffer | string; // Image binary or base64 string
  width: number;
  height: number;
  format: 'jpg' | 'png' | 'webp' | 'gif';
}

export interface ImageFeatures {
  colorHistogram: { r: number; g: number; b: number }; // Normalized RGB channel means (0-1)
  aspectRatio: number; // width / height
  spatialOrientation: number; // Principal axis angle in degrees [0,180)
  complexity: number; // Edge/texture complexity score (0-1)
  metadata: Record<string, any>;
}

interface DecodedImage {
  pixels: Buffer;
  width: number;
  height: number;
}

export class G1DataGate {
  static async extractFeatures(input: ImageInput): Promise<ImageFeatures> {
    try {
      const image = await this.decodeImage(input);
      const features: ImageFeatures = {
        colorHistogram: this.calculateColorHistogram(image),
        aspectRatio: input.width / input.height,
        spatialOrientation: this.calculateOrientation(image),
        complexity: this.calculateComplexity(image),
        metadata: {
          width: input.width,
          height: input.height,
          decodedWidth: image.width,
          decodedHeight: image.height,
          format: input.format,
          pixelCount: image.width * image.height,
          size: image.pixels.byteLength,
          extractionAlgorithm: 'sharp-raw-rgb-moments-sobel-v1',
        },
      };

      this.validateFeatures(features);
      return features;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`G1 Data Gate feature extraction failed: ${message}`);
    }
  }

  static async validateWithSchema(
    features: ImageFeatures,
    schema: SceneCompilationSchema
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const histogram = features.colorHistogram;

    if (!histogram || !this.isFiniteNumber(histogram.r) || histogram.r < 0 || histogram.r > 1) {
      errors.push('红色直方图值超出范围 (0-1)');
    }
    if (!histogram || !this.isFiniteNumber(histogram.g) || histogram.g < 0 || histogram.g > 1) {
      errors.push('绿色直方图值超出范围 (0-1)');
    }
    if (!histogram || !this.isFiniteNumber(histogram.b) || histogram.b < 0 || histogram.b > 1) {
      errors.push('蓝色直方图值超出范围 (0-1)');
    }

    if (
      !this.isFiniteNumber(features.aspectRatio) ||
      features.aspectRatio < schema.allowedAspectRatios.min ||
      features.aspectRatio > schema.allowedAspectRatios.max
    ) {
      errors.push(`宽高比 ${features.aspectRatio.toFixed(2)} 不在允许范围内`);
    }

    if (
      !this.isFiniteNumber(features.spatialOrientation) ||
      features.spatialOrientation < schema.allowedOrientations.min ||
      features.spatialOrientation > schema.allowedOrientations.max
    ) {
      errors.push('空间方向值超出范围 (0-360)');
    }

    if (
      !this.isFiniteNumber(features.complexity) ||
      features.complexity < schema.allowedComplexity.min ||
      features.complexity > schema.allowedComplexity.max
    ) {
      errors.push('复杂度值超出范围 (0-1)');
    }

    return { isValid: errors.length === 0, errors };
  }

  private static async decodeImage(input: ImageInput): Promise<DecodedImage> {
    this.validateInputMetadata(input);

    const source = this.toImageBuffer(input.data);
    if (source.byteLength === 0) {
      throw new Error('图像数据为空');
    }
    if (source.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`图像数据超过 ${MAX_IMAGE_BYTES} 字节限制`);
    }

    const options = {
      failOn: 'error' as const,
      limitInputPixels: MAX_IMAGE_PIXELS,
    };
    const metadata = await sharp(source, options).metadata();
    if (metadata.format !== EXPECTED_SHARP_FORMAT[input.format]) {
      throw new Error(`图像实际格式 ${metadata.format ?? 'unknown'} 与声明格式 ${input.format} 不一致`);
    }
    if (
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width !== input.width ||
      metadata.height !== input.height
    ) {
      throw new Error(
        `图像声明尺寸 ${input.width}x${input.height} 与实际编码尺寸 ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'} 不一致`
      );
    }

    // 使用 input 声明的宽高作为预期解码尺寸（sharp 的 rotate() 会根据 EXIF 自动应用方向，但像素缓冲区尺寸在未经 EXIF 变换时与声明一致）
    const expectedDecodedWidth = input.width;
    const expectedDecodedHeight = input.height;

    const { data, info } = await sharp(source, options)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    if (
      width !== expectedDecodedWidth ||
      height !== expectedDecodedHeight ||
      data.byteLength !== width * height * 4
    ) {
      throw new Error('图像解码结果尺寸异常');
    }

    return { pixels: data, width, height };
  }

  private static validateInputMetadata(input: ImageInput): void {
    const supportedFormats = Object.keys(EXPECTED_SHARP_FORMAT);
    if (
      !Number.isInteger(input.width) ||
      !Number.isInteger(input.height) ||
      input.width <= 0 ||
      input.height <= 0 ||
      input.width * input.height > MAX_IMAGE_PIXELS
    ) {
      throw new Error(`无效的图像尺寸：${input.width}x${input.height}`);
    }
    if (!supportedFormats.includes(input.format)) {
      throw new Error(`不支持的图像格式：${String(input.format)}`);
    }
  }

  private static toImageBuffer(data: Buffer | string): Buffer {
    if (typeof data === 'string') {
      // Try to decode base64
      try {
        return Buffer.from(data, 'base64');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Base64 解码失败：${message}`);
      }
    }
    return data;
  }

  private static isFiniteNumber(value: number): boolean {
    return typeof value === 'number' && isFinite(value);
  }

  private static calculateColorHistogram(image: DecodedImage): { r: number; g: number; b: number } {
    const { pixels, width, height } = image;
    let rSum = 0, gSum = 0, bSum = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      rSum += pixels[i];
      gSum += pixels[i + 1];
      bSum += pixels[i + 2];
    }

    const pixelCount = width * height;
    return {
      r: rSum / (255 * pixelCount),
      g: gSum / (255 * pixelCount),
      b: bSum / (255 * pixelCount)
    };
  }

  private static calculateOrientation(image: DecodedImage): number {
    const { pixels, width, height } = image;
    // 计算亮度
    const luminance = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        luminance[y * width + x] =
          0.2126 * pixels[i] +
          0.7152 * pixels[i + 1] +
          0.0722 * pixels[i + 2];
      }
    }

    // Sobel 梯度方向直方图 (0-179 度)，线条方向 = 梯度方向 + 90
    const hist = new Int32Array(180).fill(0);
    let valid = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx =
          -luminance[i - width - 1] + luminance[i - width + 1] -
          2 * luminance[i - 1] + 2 * luminance[i + 1] -
          luminance[i + width - 1] + luminance[i + width + 1];
        const gy =
          -luminance[i - width - 1] - 2 * luminance[i - width] - luminance[i - width + 1] +
          luminance[i + width - 1] + 2 * luminance[i + width] + luminance[i + width + 1];
        const mag = Math.hypot(gx, gy);
        if (mag < 1e-6) continue;
        let angle = Math.atan2(gy, gx) * (180 / Math.PI); // -180..180
        if (angle < 0) angle += 180; // 0..180
        // 线条方向 = 梯度方向 + 90 (mod 180)
        let lineAngle = angle + 90;
        if (lineAngle >= 180) lineAngle -= 180;
        const bin = Math.round(lineAngle);
        if (bin === 180) continue;
        hist[bin]++;
        valid++;
      }
    }
    if (valid === 0) return 0;
    let maxBin = 0;
    let maxCount = hist[0];
    for (let i = 1; i < 180; i++) {
      if (hist[i] > maxCount) {
        maxCount = hist[i];
        maxBin = i;
      }
    }
    return maxBin;
  }

  private static calculateComplexity(image: DecodedImage): number {
    const { pixels, width, height } = image;
    const luminance = new Float32Array(width * height);

    // 计算亮度
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        luminance[y * width + x] = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      }
    }

    // 计算 Sobel 梯度幅值
    let gradientSum = 0;
    const validPixels = (width - 1) * (height - 1);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx =
          -luminance[i - width - 1] + luminance[i - width + 1] -
          2 * luminance[i - 1] + 2 * luminance[i + 1] -
          luminance[i + width - 1] + luminance[i + width + 1];

        const gy =
          -luminance[i - width - 1] - 2 * luminance[i - width] - luminance[i - width + 1] +
          luminance[i + width - 1] + 2 * luminance[i + width] + luminance[i + width + 1];

        const gradient = Math.sqrt(gx * gx + gy * gy);
        gradientSum += gradient;
      }
    }

    const avgGradient = gradientSum / Math.max(1, validPixels);

    // 计算亮度方差
    let varianceSum = 0;
    let mean = 0;
    for (let i = 0; i < luminance.length; i++) {
      mean += luminance[i];
    }
    mean /= luminance.length;

    for (let i = 0; i < luminance.length; i++) {
      const diff = luminance[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / luminance.length;

    // 综合复杂度得分
    const normalizedGradient = Math.min(1.0, avgGradient / 127.5); // 归一化到 0-1
    const normalizedVariance = Math.min(1.0, Math.sqrt(variance) / 127.5); // 归一化到 0-1
    return (normalizedGradient * 0.6 + normalizedVariance * 0.4);
  }

  private static validateFeatures(features: ImageFeatures): void {
    if (!features.colorHistogram || typeof features.colorHistogram.r !== 'number') {
      throw new Error('无效的颜色直方图数据');
    }
    if (!features.aspectRatio || typeof features.aspectRatio !== 'number') {
      throw new Error('无效的宽高比');
    }
    if (features.spatialOrientation === undefined || typeof features.spatialOrientation !== 'number') {
      throw new Error('无效的空间方向');
    }
    if (features.complexity === undefined || typeof features.complexity !== 'number') {
      throw new Error('无效的复杂度评分');
    }
  }
}

export default G1DataGate;