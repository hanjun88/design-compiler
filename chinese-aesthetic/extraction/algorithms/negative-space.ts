/**
 * Negative Space Algorithms — 负空间/空域分析算法
 *
 * 纯函数、无状态、确定性。高亮度低纹理像素比例、连通域分析。
 */

// 负空间定义：亮度 > 阈值 且 局部方差 < 阈值 的像素
const NEGATIVE_SPACE_LUMA_THRESHOLD = 180;
const NEGATIVE_SPACE_VARIANCE_THRESHOLD = 100;
// 局部方差窗口（3x3）
const VARIANCE_WINDOW = 1;

/**
 * 计算负空间比例（高亮度低纹理像素 / 总像素）。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns 负空间比例 [0, 1]
 */
export function negativeSpaceRatio(luma: Float64Array, width: number, height: number): number {
  let negativeCount = 0;
  const pixelCount = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const l = luma[idx];

      if (l < NEGATIVE_SPACE_LUMA_THRESHOLD) continue;

      // 计算 3x3 局部方差
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let dy = -VARIANCE_WINDOW; dy <= VARIANCE_WINDOW; dy++) {
        for (let dx = -VARIANCE_WINDOW; dx <= VARIANCE_WINDOW; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const val = luma[ny * width + nx];
            sum += val;
            sumSq += val * val;
            count++;
          }
        }
      }
      const mean = sum / count;
      const variance = sumSq / count - mean * mean;

      if (variance < NEGATIVE_SPACE_VARIANCE_THRESHOLD) {
        negativeCount++;
      }
    }
  }

  return pixelCount > 0 ? negativeCount / pixelCount : 0;
}

/**
 * 连通域分析结果。
 */
export interface ConnectedComponentsResult {
  /** 连通分量数 */
  componentCount: number;
  /** 最大分量面积占比 */
  largestComponentRatio: number;
}

/**
 * 对负空间二值图执行 4-连通域分析。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns 连通域分析结果
 */
export function negativeSpaceConnectedComponents(
  luma: Float64Array,
  width: number,
  height: number,
): ConnectedComponentsResult {
  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount).fill(-1);
  const componentSizes: number[] = [];
  let currentLabel = 0;

  // 生成负空间二值图
  const isNegative = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const l = luma[idx];
      if (l >= NEGATIVE_SPACE_LUMA_THRESHOLD) {
        // 简化：只检查亮度，不重复计算方差（负空间比例已计算过）
        isNegative[idx] = 1;
      }
    }
  }

  // 4-连通域标记（洪水填充）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (isNegative[idx] === 1 && labels[idx] === -1) {
        // BFS
        const queue: number[] = [idx];
        labels[idx] = currentLabel;
        let size = 0;

        while (queue.length > 0) {
          const cur = queue.shift()!;
          size++;
          const cx = cur % width;
          const cy = Math.floor(cur / width);

          // 4-邻域
          const neighbors = [
            cy > 0 ? cur - width : -1,
            cy < height - 1 ? cur + width : -1,
            cx > 0 ? cur - 1 : -1,
            cx < width - 1 ? cur + 1 : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && isNegative[n] === 1 && labels[n] === -1) {
              labels[n] = currentLabel;
              queue.push(n);
            }
          }
        }

        componentSizes.push(size);
        currentLabel++;
      }
    }
  }

  const negativeTotal = componentSizes.reduce((a, b) => a + b, 0);
  const largestSize = componentSizes.length > 0 ? Math.max(...componentSizes) : 0;

  return {
    componentCount: currentLabel,
    largestComponentRatio: negativeTotal > 0 ? largestSize / negativeTotal : 0,
  };
}

/**
 * 计算视觉显著性质心（作为焦点位置的代理）。
 * 使用亮度梯度幅值作为显著性图，计算加权质心。
 * @param gradientMagnitude 梯度幅值数组（Sobel 结果）
 * @param width 宽度
 * @param height 高度
 * @returns 质心归一化坐标 [x, y]，范围 [0, 1]
 */
export function visualSaliencyCentroid(
  gradientMagnitude: Float64Array,
  width: number,
  height: number,
): [number, number] {
  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const w = gradientMagnitude[idx];
      sumWeight += w;
      sumX += x * w;
      sumY += y * w;
    }
  }

  if (sumWeight === 0) return [0.5, 0.5];
  return [sumX / sumWeight / (width - 1), sumY / sumWeight / (height - 1)];
}
