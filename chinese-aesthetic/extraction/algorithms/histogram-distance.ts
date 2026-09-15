/**
 * Histogram Distance Algorithms — 直方图距离算法
 *
 * 纯函数、无状态、确定性。Bhattacharyya 距离、帧间亮度/色彩连续性。
 */

/**
 * 计算两个直方图之间的 Bhattacharyya 距离。
 * Bhattacharyya 距离 = -ln(BC)，其中 BC = sum(sqrt(p_i * q_i))。
 * 距离为 0 表示完全相同，距离越大表示差异越大。
 * @param hist1 直方图 1（已归一化或未归一化均可）
 * @param hist2 直方图 2
 * @returns Bhattacharyya 距离 [0, Infinity)
 */
export function bhattacharyyaDistance(hist1: number[], hist2: number[]): number {
  if (hist1.length !== hist2.length) {
    throw new Error(`Histogram length mismatch: ${hist1.length} vs ${hist2.length}`);
  }

  // 归一化
  const sum1 = hist1.reduce((a, b) => a + b, 0);
  const sum2 = hist2.reduce((a, b) => a + b, 0);

  if (sum1 === 0 || sum2 === 0) return Infinity;

  let bc = 0;
  for (let i = 0; i < hist1.length; i++) {
    const p = hist1[i] / sum1;
    const q = hist2[i] / sum2;
    bc += Math.sqrt(p * q);
  }

  if (bc <= 0) return Infinity;
  return -Math.log(bc);
}

/**
 * 计算帧间亮度连续性（相邻帧亮度差的倒数归一化）。
 * @param meanLuma1 帧 1 平均亮度
 * @param meanLuma2 帧 2 平均亮度
 * @returns 连续性 [0, 1]，1=完全连续，0=完全不连续
 */
export function luminanceContinuity(meanLuma1: number, meanLuma2: number): number {
  const diff = Math.abs(meanLuma1 - meanLuma2);
  return 1 / (1 + diff / 30);
}

/**
 * 计算色彩连续性（Bhattacharyya 距离的倒数归一化）。
 * @param hist1 帧 1 颜色直方图
 * @param hist2 帧 2 颜色直方图
 * @returns 连续性 [0, 1]
 */
export function chromaticContinuity(hist1: number[], hist2: number[]): number {
  const dist = bhattacharyyaDistance(hist1, hist2);
  if (!isFinite(dist)) return 0;
  return 1 / (1 + dist);
}

/**
 * 计算运动连续性（相机平滑度与光流相干性的均值）。
 * @param cameraSmoothness 相机运动平滑度
 * @param flowCoherence 光流方向一致性
 * @returns 运动连续性 [0, 1]
 */
export function motionContinuity(cameraSmoothness: number, flowCoherence: number): number {
  return (cameraSmoothness + flowCoherence) / 2;
}

/**
 * 计算运动速度变异系数（光流幅度的标准差/均值）。
 * @param magnitudes 光流幅度数组
 * @returns 变异系数
 */
export function motionSpeedCoefficientOfVariation(magnitudes: number[]): number {
  if (magnitudes.length === 0) return 0;
  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  if (mean === 0) return 0;
  const std = magnitudes.length > 1
    ? Math.sqrt(magnitudes.reduce((s, m) => s + (m - mean) * (m - mean), 0) / magnitudes.length)
    : 0;
  return std / mean;
}
