// A 轨 G1DataGate 的确定性图像特征测试
import sharp from 'sharp';
import { G1DataGate } from '../src/G1DataGate';
import { SceneCompilationSchema } from '../src/types';

const schema: SceneCompilationSchema = {
  allowedAspectRatios: { min: 1.5, max: 2.5 },
  allowedOrientations: { min: 0, max: 360 },
  allowedComplexity: { min: 0, max: 1 },
  colorHistogramRange: {
    r: { min: 0, max: 1 },
    g: { min: 0, max: 1 },
    b: { min: 0, max: 1 },
  },
};

async function createPng(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = paint(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function patternImage(type: string): Promise<Buffer> {
  const width = 128;
  const height = 128;
  const paint = (x: number, y: number): [number, number, number, number] => {
    if (type === 'horizontal') {
      const value = Math.floor(y / 16) % 2 === 0 ? 255 : 0;
      return [value, value, value, 255];
    }
    if (type === 'vertical') {
      const value = Math.floor(x / 16) % 2 === 0 ? 255 : 0;
      return [value, value, value, 255];
    }
    if (type === 'diagonal') {
      const value = Math.abs(x - y) <= 1 ? 255 : 0;
      return [value, value, value, 255];
    }
    const value = Math.round(((x + y) / 256) * 255);
    return [value, value, value, 255];
  };
  return createPng(width, height, paint);
}

describe('G1DataGate', () => {
  describe('extractFeatures', () => {
    it('should extract deterministic color, orientation, and complexity from a real image', async () => {
      const data = await sharp(Buffer.alloc(1920 * 1080 * 4, 128), {
        raw: { width: 1920, height: 1080, channels: 4 },
      }).png().toBuffer();
      const features = await G1DataGate.extractFeatures({
        data,
        width: 1920,
        height: 1080,
        format: 'png',
      });
      expect(features.colorHistogram.r).toBeCloseTo(0.5, 2);
      expect(features.colorHistogram.g).toBeCloseTo(0.5, 2);
      expect(features.colorHistogram.b).toBeCloseTo(0.5, 2);
      expect(features.spatialOrientation).toBeCloseTo(0, 1);
      expect(features.complexity).toBeCloseTo(0, 1);
      expect(features.metadata.width).toBe(1920);
      expect(features.metadata.height).toBe(1080);
      expect(features.metadata.format).toBe('png');
      expect(features.metadata.decodedWidth).toBe(1920);
      expect(features.metadata.decodedHeight).toBe(1080);
      expect(features.metadata.pixelCount).toBe(1920 * 1080);
      expect(features.metadata.size).toBe(1920 * 1080 * 4);
      expect(features.metadata.extractionAlgorithm).toBe('sharp-raw-rgb-moments-sobel-v1');
    });

    it('should calculate principal orientation for structural patterns', async () => {
      const horizontal = await patternImage('horizontal');
      const vertical = await patternImage('vertical');
      const diagonal = await patternImage('diagonal');

      const hFeatures = await G1DataGate.extractFeatures({ data: horizontal, width: 128, height: 128, format: 'png' });
      const vFeatures = await G1DataGate.extractFeatures({ data: vertical, width: 128, height: 128, format: 'png' });
      const dFeatures = await G1DataGate.extractFeatures({ data: diagonal, width: 128, height: 128, format: 'png' });

      expect(hFeatures.spatialOrientation).toBeLessThan(5);
      expect(vFeatures.spatialOrientation).toBeGreaterThan(85);
      expect(dFeatures.spatialOrientation).toBeGreaterThanOrEqual(40);
      expect(dFeatures.spatialOrientation).toBeLessThanOrEqual(50);
    });

    it('should rank checkerboard complexity above a smooth gradient', async () => {
      const gradient = await createPng(128, 128, (x, y) => {
        const value = Math.round(((x + y) / 256) * 255);
        return [value, value, value, 255];
      });
      const checkerboard = await createPng(128, 128, (x, y) => {
        const value = ((x >> 3) + (y >> 3)) % 2 === 0 ? 255 : 0;
        return [value, value, value, 255];
      });

      const gFeatures = await G1DataGate.extractFeatures({ data: gradient, width: 128, height: 128, format: 'png' });
      const cFeatures = await G1DataGate.extractFeatures({ data: checkerboard, width: 128, height: 128, format: 'png' });
      expect(cFeatures.complexity).toBeGreaterThan(gFeatures.complexity);
    });

    it('should accept canonical base64 image data', async () => {
      const pngData = await sharp(Buffer.alloc(8 * 8 * 4, 128), {
        raw: { width: 8, height: 8, channels: 4 },
      }).png().toBuffer();
      const base64Data = pngData.toString('base64');
      const features = await G1DataGate.extractFeatures({
        data: base64Data,
        width: 8,
        height: 8,
        format: 'png',
      });
      expect(features.metadata.width).toBe(8);
      expect(features.metadata.height).toBe(8);
    });

    it('should reject corrupt data', async () => {
      await expect(G1DataGate.extractFeatures({
        data: Buffer.from('not-an-image'),
        width: 8,
        height: 8,
        format: 'png',
      })).rejects.toThrow('G1 Data Gate feature extraction failed');
    });

    it('should reject dimension mismatches', async () => {
      const png = await createPng(8, 8, () => [0, 0, 0, 255]);
      await expect(G1DataGate.extractFeatures({
        data: png,
        width: 16,
        height: 8,
        format: 'png',
      })).rejects.toThrow('图像声明尺寸 16x8 与实际编码尺寸 8x8 不一致');
    });

    it('should extract features from a plain image without EXIF orientation', async () => {
      const raw = Buffer.alloc(128 * 64 * 4);
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 128; x += 1) {
          const offset = (y * 128 + x) * 4;
          const value = Math.round(((x + y) / 190) * 255);
          raw[offset] = value;
          raw[offset + 1] = value;
          raw[offset + 2] = value;
          raw[offset + 3] = 255;
        }
      }
      const data = await sharp(raw, { raw: { width: 128, height: 64, channels: 4 } })
        .jpeg()
        .toBuffer(); // no EXIF orientation
      const metadata = await sharp(data).metadata();
      expect(metadata.orientation).toBeUndefined();

      const features = await G1DataGate.extractFeatures({
        data,
        width: 128,
        height: 64,
        format: 'jpg',
      });

      expect(features.aspectRatio).toBe(2);
      expect(features.metadata.decodedWidth).toBe(128);
      expect(features.metadata.decodedHeight).toBe(64);
    });
  });

  describe('validateWithSchema', () => {
    it('should return valid for values within range', async () => {
      const features = await G1DataGate.extractFeatures({
        data: await patternImage('horizontal'),
        width: 128,
        height: 128,
        format: 'png',
      });
      const result = await G1DataGate.validateWithSchema(features, {
        ...schema,
        allowedAspectRatios: { min: 0.5, max: 2.5 },
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for aspectRatio out of range', async () => {
      const features = await G1DataGate.extractFeatures({
        data: await patternImage('horizontal'),
        width: 128,
        height: 128,
        format: 'png',
      });
      const result = await G1DataGate.validateWithSchema({ ...features, aspectRatio: 4 }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('宽高比 4.00 不在允许范围内');
    });
  });
});