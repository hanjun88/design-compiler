/**
 * Color Analysis Algorithms — 色彩分析算法
 *
 * 纯函数、无状态、确定性。主色提取（确定性量化）、WCAG 对比度、色温偏移。
 * 所有算法参数为命名常量（算法配置），非测量默认值。
 */

// 色彩量化：将 RGB 各通道量化为 N 级，减少色彩空间大小
const QUANTIZATION_LEVELS = 4; // 4×4×4 = 64 色桶
// 主色数量
const DOMINANT_COLOR_COUNT = 3;

/**
 * 将 RGB 量化为桶索引。
 */
function quantizeColor(r: number, g: number, b: number): number {
  const qr = Math.min(QUANTIZATION_LEVELS - 1, Math.floor(r / (256 / QUANTIZATION_LEVELS)));
  const qg = Math.min(QUANTIZATION_LEVELS - 1, Math.floor(g / (256 / QUANTIZATION_LEVELS)));
  const qb = Math.min(QUANTIZATION_LEVELS - 1, Math.floor(b / (256 / QUANTIZATION_LEVELS)));
  return qr * QUANTIZATION_LEVELS * QUANTIZATION_LEVELS + qg * QUANTIZATION_LEVELS + qb;
}

/**
 * 从桶索引反查平均色（取桶中心色）。
 */
function dequantizeColor(bucket: number): [number, number, number] {
  const qb = bucket % QUANTIZATION_LEVELS;
  const qg = Math.floor(bucket / QUANTIZATION_LEVELS) % QUANTIZATION_LEVELS;
  const qr = Math.floor(bucket / (QUANTIZATION_LEVELS * QUANTIZATION_LEVELS));
  const step = 256 / QUANTIZATION_LEVELS;
  return [
    Math.min(255, Math.round(qr * step + step / 2)),
    Math.min(255, Math.round(qg * step + step / 2)),
    Math.min(255, Math.round(qb * step + step / 2)),
  ];
}

/**
 * 提取主导色（确定性色彩量化 + 频次排序，非随机 k-means）。
 * @param buffer RGBA 像素缓冲
 * @param width 宽度
 * @param height 高度
 * @param count 提取颜色数量
 * @returns 主导色数组（hex 字符串，按面积降序）
 */
export function extractDominantColors(
  buffer: Uint8Array,
  width: number,
  height: number,
  count: number = DOMINANT_COLOR_COUNT,
): Array<{ hex: string; ratio: number }> {
  const pixelCount = width * height;
  const bucketCount = QUANTIZATION_LEVELS * QUANTIZATION_LEVELS * QUANTIZATION_LEVELS;
  const histogram = new Array<number>(bucketCount).fill(0);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const bucket = quantizeColor(buffer[offset], buffer[offset + 1], buffer[offset + 2]);
    histogram[bucket]++;
  }

  // 按频次排序（确定性：同频次按桶索引升序）
  const buckets = histogram
    .map((count, idx) => ({ bucket: idx, count }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.bucket - b.bucket);

  const result: Array<{ hex: string; ratio: number }> = [];
  for (let i = 0; i < Math.min(count, buckets.length); i++) {
    const [r, g, b] = dequantizeColor(buckets[i].bucket);
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    result.push({ hex, ratio: buckets[i].count / pixelCount });
  }
  return result;
}

/**
 * 计算 WCAG 对比度（两个 hex 颜色之间）。
 * @param hex1 颜色 1
 * @param hex2 颜色 2
 * @returns 对比度（1.0 - 21.0）
 */
export function wcagContrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 计算相对亮度（WCAG 定义）。
 */
function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 计算色温偏移（从全帧平均色温度量）。
 * 基于平均 RGB 的红蓝比映射到 [-1, 1]，-1=极冷，1=极暖。
 * @param buffer RGBA 像素缓冲
 * @param width 宽度
 * @param height 高度
 * @returns 色温偏移 [-1, 1]
 */
export function temperatureBias(buffer: Uint8Array, width: number, height: number): number {
  const pixelCount = width * height;
  let sumR = 0;
  let sumB = 0;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    sumR += buffer[offset];
    sumB += buffer[offset + 2];
  }
  if (pixelCount === 0) return 0;
  const meanR = sumR / pixelCount;
  const meanB = sumB / pixelCount;
  // 红蓝差映射到 [-1, 1]，差值范围 [-255, 255]
  const diff = meanR - meanB;
  return Math.max(-1, Math.min(1, diff / 255));
}
