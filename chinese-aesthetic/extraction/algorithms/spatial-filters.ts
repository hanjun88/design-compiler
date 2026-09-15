/**
 * Spatial Filter Algorithms — 空间滤波算法
 *
 * 纯函数、无状态、确定性。Laplacian 方差、Sobel 边缘检测、边缘方向直方图。
 * 所有算法参数为命名常量（算法配置），非测量默认值。
 */

// 3x3 Laplacian 核（命名常量，算法配置）
const LAPLACIAN_KERNEL = [
  0,  1, 0,
  1, -4, 1,
  0,  1, 0,
];

// Sobel X 核
const SOBEL_X = [
  -1, 0, 1,
  -2, 0, 2,
  -1, 0, 1,
];

// Sobel Y 核
const SOBEL_Y = [
  -1, -2, -1,
   0,  0,  0,
   1,  2,  1,
];

// 边缘阈值（Sobel 梯度幅值超过此值计为边缘像素）
const EDGE_THRESHOLD = 30;

// 边缘方向直方图 bin 数（8 方向）
const EDGE_ORIENTATION_BINS = 8;

/**
 * 计算 3x3 卷积（边界用零填充）。
 * @param input 输入数组（亮度场）
 * @param kernel 3x3 核（9 元素）
 * @param width 宽度
 * @param height 高度
 * @returns 卷积结果（Float64Array）
 */
function convolve3x3(input: Float64Array, kernel: number[], width: number, height: number): Float64Array {
  const output = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = x + kx;
          const py = y + ky;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            sum += input[py * width + px] * kernel[kernelIdx];
          }
        }
      }
      output[y * width + x] = sum;
    }
  }
  return output;
}

/**
 * 计算 Laplacian 方差（反映图像清晰度/细节丰富度）。
 * Laplacian 响应的方差越大，图像越清晰、细节越丰富。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns Laplacian 方差
 */
export function laplacianVariance(luma: Float64Array, width: number, height: number): number {
  const laplacian = convolve3x3(luma, LAPLACIAN_KERNEL, width, height);
  // 计算均值
  let mean = 0;
  for (let i = 0; i < laplacian.length; i++) {
    mean += laplacian[i];
  }
  mean /= laplacian.length;
  // 计算方差
  let variance = 0;
  for (let i = 0; i < laplacian.length; i++) {
    const diff = laplacian[i] - mean;
    variance += diff * diff;
  }
  variance /= laplacian.length;
  return variance;
}

/**
 * Sobel 边缘检测结果。
 */
export interface SobelResult {
  /** 梯度幅值数组 */
  magnitude: Float64Array;
  /** 梯度方向数组（弧度，[0, PI)） */
  orientation: Float64Array;
  /** 边缘像素数 */
  edgePixelCount: number;
}

/**
 * 执行 Sobel 边缘检测。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns Sobel 结果（幅值、方向、边缘像素数）
 */
export function sobelEdgeDetection(luma: Float64Array, width: number, height: number): SobelResult {
  const gx = convolve3x3(luma, SOBEL_X, width, height);
  const gy = convolve3x3(luma, SOBEL_Y, width, height);

  const pixelCount = width * height;
  const magnitude = new Float64Array(pixelCount);
  const orientation = new Float64Array(pixelCount);
  let edgePixelCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const gxVal = gx[i];
    const gyVal = gy[i];
    magnitude[i] = Math.sqrt(gxVal * gxVal + gyVal * gyVal);
    // atan2 范围 (-PI, PI]，取绝对值映射到 [0, PI)
    orientation[i] = Math.abs(Math.atan2(gyVal, gxVal));
    if (magnitude[i] >= EDGE_THRESHOLD) {
      edgePixelCount++;
    }
  }

  return { magnitude, orientation, edgePixelCount };
}

/**
 * 计算边缘梯度偏度（Sobel 幅值分布的偏度）。
 * 偏度 > 0 表示右偏（多数像素低梯度，少数高梯度）；偏度 < 0 表示左偏。
 * @param magnitude Sobel 梯度幅值
 * @returns 偏度
 */
export function edgeGradientSkew(magnitude: Float64Array): number {
  const n = magnitude.length;
  if (n === 0) return 0;

  // 均值
  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += magnitude[i];
  }
  mean /= n;

  // 二阶矩和三阶矩
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < n; i++) {
    const diff = magnitude[i] - mean;
    m2 += diff * diff;
    m3 += diff * diff * diff;
  }
  m2 /= n;
  m3 /= n;

  // 偏度 = m3 / (m2 ^ 1.5)
  if (m2 === 0) return 0;
  return m3 / Math.pow(m2, 1.5);
}

/**
 * 计算边缘方向直方图（8 bin）。
 * @param orientation 梯度方向数组（弧度，[0, PI)）
 * @param magnitude 梯度幅值数组（用于加权）
 * @returns 8 bin 直方图
 */
export function edgeOrientationHistogram(orientation: Float64Array, magnitude: Float64Array): number[] {
  const hist = new Array<number>(EDGE_ORIENTATION_BINS).fill(0);
  const binWidth = Math.PI / EDGE_ORIENTATION_BINS;
  for (let i = 0; i < orientation.length; i++) {
    // 只统计边缘像素（幅值 > 0）
    if (magnitude[i] > 0) {
      let bin = Math.floor(orientation[i] / binWidth);
      if (bin >= EDGE_ORIENTATION_BINS) bin = EDGE_ORIENTATION_BINS - 1;
      hist[bin] += magnitude[i]; // 按幅值加权
    }
  }
  return hist;
}
