/**
 * Optical Flow Algorithms — 光流算法
 *
 * 纯函数、无状态、确定性。基于块匹配的稠密光流估计（简化 Farneback 替代方案）。
 * 从真实帧序列计算光流矢量场，不伪造运动证据。
 */

// 块匹配参数（命名常量，算法配置）
const BLOCK_SIZE = 8;
const SEARCH_RANGE = 4;

/**
 * 光流计算结果。
 */
export interface OpticalFlowResult {
  /** 每块的光流矢量 [dx, dy]（行优先，长度 = blockCols * blockRows） */
  flowVectors: Array<[number, number]>;
  /** 块列数 */
  blockCols: number;
  /** 块行数 */
  blockRows: number;
  /** 方向一致性（所有矢量方向的余弦相似度均值，[0, 1]） */
  directionCoherence: number;
  /** 幅度稳定性（幅度变异系数的倒数，[0, 1]） */
  amplitudeStability: number;
  /** 全局位移均值 [dx, dy] */
  globalDisplacementMean: [number, number];
  /** 全局位移标准差 */
  globalDisplacementStdDev: number;
}

/**
 * 计算两个亮度场之间的 SAD（绝对差之和）。
 */
function blockSAD(
  frame1: Float64Array,
  frame2: Float64Array,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): number {
  let sad = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px1 = x1 + dx;
      const py1 = y1 + dy;
      const px2 = x2 + dx;
      const py2 = y2 + dy;
      if (px1 >= 0 && px1 < width && py1 >= 0 && py1 < height &&
          px2 >= 0 && px2 < width && py2 >= 0 && py2 < height) {
        sad += Math.abs(frame1[py1 * width + px1] - frame2[py2 * width + px2]);
      }
    }
  }
  return sad;
}

/**
 * 基于块匹配的稠密光流估计。
 * 将 frame1 分为 BLOCK_SIZE×BLOCK_SIZE 块，在 frame2 中搜索最佳匹配块。
 * @param luma1 帧 1 亮度场
 * @param luma2 帧 2 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns 光流结果
 */
export function computeOpticalFlow(
  luma1: Float64Array,
  luma2: Float64Array,
  width: number,
  height: number,
): OpticalFlowResult {
  const blockCols = Math.floor(width / BLOCK_SIZE);
  const blockRows = Math.floor(height / BLOCK_SIZE);
  const flowVectors: Array<[number, number]> = [];

  for (let by = 0; by < blockRows; by++) {
    for (let bx = 0; bx < blockCols; bx++) {
      const x1 = bx * BLOCK_SIZE;
      const y1 = by * BLOCK_SIZE;

      let bestDx = 0;
      let bestDy = 0;
      let bestSAD = Infinity;

      // 穷举搜索
      for (let dy = -SEARCH_RANGE; dy <= SEARCH_RANGE; dy++) {
        for (let dx = -SEARCH_RANGE; dx <= SEARCH_RANGE; dx++) {
          const x2 = x1 + dx;
          const y2 = y1 + dy;
          if (x2 >= 0 && x2 + BLOCK_SIZE <= width && y2 >= 0 && y2 + BLOCK_SIZE <= height) {
            const sad = blockSAD(luma1, luma2, width, height, x1, y1, x2, y2, BLOCK_SIZE);
            // SAD 严格更优时更新；SAD 相同时选择幅度更小的位移（解决孔径问题歧义）
            const currentMag2 = bestDx * bestDx + bestDy * bestDy;
            const newMag2 = dx * dx + dy * dy;
            if (sad < bestSAD || (sad === bestSAD && newMag2 < currentMag2)) {
              bestSAD = sad;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
      }

      flowVectors.push([bestDx, bestDy]);
    }
  }

  // 计算方向一致性
  let directionCoherence = 0;
  if (flowVectors.length > 0) {
    // 统计零幅度矢量数（无纹理/模糊区域）
    let zeroMagCount = 0;
    for (const [dx, dy] of flowVectors) {
      if (dx === 0 && dy === 0) zeroMagCount++;
    }

    if (zeroMagCount === flowVectors.length) {
      // 所有矢量均为零（无纹理/静止），方向完全一致
      directionCoherence = 1;
    } else {
      let sumCos = 0;
      let pairCount = 0;
      for (let i = 0; i < flowVectors.length; i++) {
        for (let j = i + 1; j < flowVectors.length; j++) {
          const [dx1, dy1] = flowVectors[i];
          const [dx2, dy2] = flowVectors[j];
          const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
          const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (mag1 > 0 && mag2 > 0) {
            const cos = (dx1 * dx2 + dy1 * dy2) / (mag1 * mag2);
            sumCos += cos;
            pairCount++;
          }
        }
      }
      directionCoherence = pairCount > 0 ? (sumCos / pairCount + 1) / 2 : 1; // 映射到 [0, 1]；无非零对时视为一致
    }
  }

  // 计算幅度稳定性
  const magnitudes = flowVectors.map(([dx, dy]) => Math.sqrt(dx * dx + dy * dy));
  const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const stdMag = magnitudes.length > 1
    ? Math.sqrt(magnitudes.reduce((s, m) => s + (m - meanMag) * (m - meanMag), 0) / magnitudes.length)
    : 0;
  const amplitudeStability = meanMag > 0 ? 1 / (1 + stdMag / meanMag) : 1;

  // 全局位移
  const meanDx = flowVectors.reduce((s, [dx]) => s + dx, 0) / flowVectors.length;
  const meanDy = flowVectors.reduce((s, [, dy]) => s + dy, 0) / flowVectors.length;
  const dxs = flowVectors.map(([dx]) => dx);
  const dys = flowVectors.map(([, dy]) => dy);
  const stdDx = dxs.length > 1 ? Math.sqrt(dxs.reduce((s, v) => s + (v - meanDx) * (v - meanDx), 0) / dxs.length) : 0;
  const stdDy = dys.length > 1 ? Math.sqrt(dys.reduce((s, v) => s + (v - meanDy) * (v - meanDy), 0) / dys.length) : 0;
  const globalDisplacementStdDev = Math.sqrt(stdDx * stdDx + stdDy * stdDy);

  return {
    flowVectors,
    blockCols,
    blockRows,
    directionCoherence,
    amplitudeStability,
    globalDisplacementMean: [meanDx, meanDy],
    globalDisplacementStdDev,
  };
}

/**
 * 计算相机运动平滑度（与旧原型计算一致：1 / (1 + stdDx / 5)）。
 * @param globalDisplacementStdDev 全局位移标准差
 * @returns 平滑度 [0, 1]
 */
export function cameraMotionSmoothness(globalDisplacementStdDev: number): number {
  return 1 / (1 + globalDisplacementStdDev / 5);
}

/**
 * 检测节奏变化点（光流幅度序列中的显著变化位置）。
 * @param flowVectors 光流矢量序列（按时间顺序）
 * @returns 变化点数
 */
export function detectRhythmChangePoints(flowVectors: Array<[number, number]>): number {
  if (flowVectors.length < 3) return 0;
  const magnitudes = flowVectors.map(([dx, dy]) => Math.sqrt(dx * dx + dy * dy));
  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const std = magnitudes.length > 1
    ? Math.sqrt(magnitudes.reduce((s, m) => s + (m - mean) * (m - mean), 0) / magnitudes.length)
    : 0;

  let changePoints = 0;
  for (let i = 1; i < magnitudes.length - 1; i++) {
    // 局部极值（峰或谷）且偏离均值超过 0.5 std
    const isPeak = magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1];
    const isValley = magnitudes[i] < magnitudes[i - 1] && magnitudes[i] < magnitudes[i + 1];
    if ((isPeak || isValley) && Math.abs(magnitudes[i] - mean) > 0.5 * std) {
      changePoints++;
    }
  }
  return changePoints;
}
