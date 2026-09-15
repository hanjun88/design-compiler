/**
 * Block Analysis Algorithms — 分块分析算法
 *
 * 纯函数、无状态、确定性。将画面分为 N×M 块，计算块间亮度均值梯度。
 */

// 默认分块数（8×8 = 64 块）
const DEFAULT_BLOCK_COLS = 8;
const DEFAULT_BLOCK_ROWS = 8;

/**
 * 将画面分为 cols×rows 块，计算每块的平均亮度。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @param cols 列块数
 * @param rows 行块数
 * @returns 块平均亮度数组（行优先，长度 = cols * rows）
 */
export function blockMeanLuminance(
  luma: Float64Array,
  width: number,
  height: number,
  cols: number = DEFAULT_BLOCK_COLS,
  rows: number = DEFAULT_BLOCK_ROWS,
): number[] {
  const blockWidth = width / cols;
  const blockHeight = height / rows;
  const means = new Array<number>(cols * rows).fill(0);

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = Math.floor(bx * blockWidth);
      const x1 = Math.min(width, Math.floor((bx + 1) * blockWidth));
      const y0 = Math.floor(by * blockHeight);
      const y1 = Math.min(height, Math.floor((by + 1) * blockHeight));

      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += luma[y * width + x];
          count++;
        }
      }
      means[by * cols + bx] = count > 0 ? sum / count : 0;
    }
  }
  return means;
}

/**
 * 计算块亮度均值梯度范数（反映画面亮度的空间变化率）。
 * 计算相邻块（水平+垂直）的亮度差，取均方根。
 * @param blockMeans 块平均亮度数组
 * @param cols 列块数
 * @param rows 行块数
 * @returns 梯度范数
 */
export function blockLuminanceMeanGradient(
  blockMeans: number[],
  cols: number = DEFAULT_BLOCK_COLS,
  rows: number = DEFAULT_BLOCK_ROWS,
): number {
  let sumSqDiff = 0;
  let diffCount = 0;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const idx = by * cols + bx;
      // 水平相邻
      if (bx < cols - 1) {
        const diff = blockMeans[idx] - blockMeans[idx + 1];
        sumSqDiff += diff * diff;
        diffCount++;
      }
      // 垂直相邻
      if (by < rows - 1) {
        const diff = blockMeans[idx] - blockMeans[idx + cols];
        sumSqDiff += diff * diff;
        diffCount++;
      }
    }
  }

  if (diffCount === 0) return 0;
  return Math.sqrt(sumSqDiff / diffCount);
}
