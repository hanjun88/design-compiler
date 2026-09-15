/**
 * Luminance Algorithms — 亮度场计算
 *
 * 纯函数、无状态、确定性。从 RGBA 像素缓冲计算 Rec.601 亮度场及其统计量。
 * 所有算法参数为命名常量（算法配置），非测量默认值。
 */

// Rec.601 亮度转换系数（命名常量，算法配置）
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

// 亮度直方图 bin 数
const HISTOGRAM_BINS = 256;

// 峰值检测：最小峰高（相对于直方图最大值的比例）
const PEAK_MIN_HEIGHT_RATIO = 0.05;
// 峰值检测：最小峰宽（bin 数）
const PEAK_MIN_WIDTH = 2;

/**
 * 将 RGBA 像素缓冲转换为亮度数组（Rec.601）。
 * @param buffer RGBA 像素缓冲（Uint8Array，长度 = width * height * 4）
 * @param width 帧宽度
 * @param height 帧高度
 * @returns 亮度数组（Float64Array，长度 = width * height，值范围 [0, 255]）
 */
export function toLuminance(buffer: Uint8Array, width: number, height: number): Float64Array {
  const pixelCount = width * height;
  const luma = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = buffer[offset];
    const g = buffer[offset + 1];
    const b = buffer[offset + 2];
    luma[i] = r * LUMA_R + g * LUMA_G + b * LUMA_B;
  }
  return luma;
}

/**
 * 计算亮度均值。
 */
export function meanLuminance(luma: Float64Array): number {
  if (luma.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < luma.length; i++) {
    sum += luma[i];
  }
  return sum / luma.length;
}

/**
 * 计算亮度标准差（总体标准差，非样本标准差）。
 */
export function stdDevLuminance(luma: Float64Array, mean: number): number {
  if (luma.length === 0) return 0;
  let sumSqDiff = 0;
  for (let i = 0; i < luma.length; i++) {
    const diff = luma[i] - mean;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / luma.length);
}

/**
 * 计算亮度直方图（256 bin）。
 */
export function luminanceHistogram(luma: Float64Array): number[] {
  const hist = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (let i = 0; i < luma.length; i++) {
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(luma[i])));
    hist[bin]++;
  }
  return hist;
}

/**
 * 检测直方图峰数。
 * 使用简单的局部最大值检测：一个 bin 的值大于左右邻居且超过最小峰高。
 * @param hist 直方图（256 bin）
 * @returns 峰数
 */
export function histogramPeakCount(hist: number[]): number {
  if (hist.length === 0) return 0;
  const maxVal = Math.max(...hist);
  const minHeight = maxVal * PEAK_MIN_HEIGHT_RATIO;
  let peaks = 0;
  for (let i = 1; i < hist.length - 1; i++) {
    if (hist[i] > hist[i - 1] && hist[i] >= hist[i + 1] && hist[i] >= minHeight) {
      // 检查峰宽：向右延伸直到下降
      let width = 1;
      let j = i + 1;
      while (j < hist.length - 1 && hist[j] >= hist[j + 1] && hist[j] >= minHeight) {
        width++;
        j++;
      }
      if (width >= PEAK_MIN_WIDTH) {
        peaks++;
      }
      i = j; // 跳过已检测的峰
    }
  }
  return peaks;
}

/**
 * 计算非零像素数（RGBA 不全为 0 的像素）。
 */
export function nonZeroPixelCount(buffer: Uint8Array, width: number, height: number): number {
  const pixelCount = width * height;
  let count = 0;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    if (buffer[offset] !== 0 || buffer[offset + 1] !== 0 || buffer[offset + 2] !== 0 || buffer[offset + 3] !== 0) {
      count++;
    }
  }
  return count;
}

/**
 * 计算 NaN/Inf 像素标记数。
 * 软件渲染器输出 Uint8Array，不可能有 NaN/Inf，此函数保留接口完整性。
 * 对于浮点渲染缓冲，应检查每个通道。
 */
export function nanInfPixelCount(buffer: Uint8Array): number {
  // Uint8Array 不可能包含 NaN/Inf，固定返回 0
  return 0;
}
