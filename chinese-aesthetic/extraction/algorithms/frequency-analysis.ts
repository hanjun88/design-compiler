/**
 * Frequency Analysis Algorithms — 频域/高频分析算法
 *
 * 纯函数、无状态、确定性。微表面高频能量、高光检测、粗糙度空间方差。
 */

// 高光检测：亮度 > 阈值 且 饱和度低
const SPECULAR_LUMA_THRESHOLD = 200;
const SPECULAR_SATURATION_THRESHOLD = 30;

/**
 * 计算高频能量（Laplacian 高通带能量占比）。
 * 使用 Laplacian 响应的能量 / 原始亮度能量作为高频能量比。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns 高频能量比 [0, 1]
 */
export function highFrequencyEnergyRatio(
  luma: Float64Array,
  width: number,
  height: number,
): number {
  // 复用 Laplacian 计算（内联以避免循环依赖）
  const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  const pixelCount = width * height;
  let highFreqEnergy = 0;
  let totalEnergy = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      totalEnergy += luma[idx] * luma[idx];

      let lap = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = x + kx;
          const py = y + ky;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            lap += luma[py * width + px] * LAPLACIAN_KERNEL[(ky + 1) * 3 + (kx + 1)];
          }
        }
      }
      highFreqEnergy += lap * lap;
    }
  }

  if (totalEnergy === 0) return 0;
  return Math.min(1, highFreqEnergy / totalEnergy);
}

/**
 * 高光检测结果。
 */
export interface SpecularAnalysisResult {
  /** 高光像素占比 */
  specularRatio: number;
  /** 高光锐利度（高光区域亮度梯度均值） */
  specularSharpness: number;
}

/**
 * 检测镜面高光（高亮度低饱和度像素）并计算锐利度。
 * @param buffer RGBA 像素缓冲
 * @param width 宽度
 * @param height 高度
 * @returns 高光分析结果
 */
export function specularAnalysis(
  buffer: Uint8Array,
  width: number,
  height: number,
): SpecularAnalysisResult {
  const pixelCount = width * height;
  let specularCount = 0;
  let sharpnessSum = 0;
  let sharpnessCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const offset = idx * 4;
      const r = buffer[offset];
      const g = buffer[offset + 1];
      const b = buffer[offset + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = maxC - minC;

      if (luma >= SPECULAR_LUMA_THRESHOLD && saturation <= SPECULAR_SATURATION_THRESHOLD) {
        specularCount++;

        // 计算该像素的局部梯度（作为锐利度代理）
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          const left = buffer[(idx - 1) * 4];
          const right = buffer[(idx + 1) * 4];
          const up = buffer[(idx - width) * 4];
          const down = buffer[(idx + width) * 4];
          const gx = right - left;
          const gy = down - up;
          sharpnessSum += Math.sqrt(gx * gx + gy * gy);
          sharpnessCount++;
        }
      }
    }
  }

  return {
    specularRatio: pixelCount > 0 ? specularCount / pixelCount : 0,
    specularSharpness: sharpnessCount > 0 ? sharpnessSum / sharpnessCount : 0,
  };
}

/**
 * 计算粗糙度空间方差（同一材质区域内粗糙度的空间变化）。
 * 注意：此函数从渲染帧的高频能量空间分布推断粗糙度变化，
 * 不直接读取 IR 中的 roughness 参数（那是 DOMAIN-IR 的职责）。
 * @param luma 亮度场
 * @param width 宽度
 * @param height 高度
 * @returns 粗糙度空间方差（高频能量的空间方差）
 */
export function roughnessSpatialVariance(
  luma: Float64Array,
  width: number,
  height: number,
): number {
  // 将画面分为 4×4 块，计算每块的高频能量，然后计算块间方差
  const cols = 4;
  const rows = 4;
  const blockWidth = width / cols;
  const blockHeight = height / rows;
  const blockEnergies: number[] = [];

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = Math.floor(bx * blockWidth);
      const x1 = Math.min(width, Math.floor((bx + 1) * blockWidth));
      const y0 = Math.floor(by * blockHeight);
      const y1 = Math.min(height, Math.floor((by + 1) * blockHeight));

      let sumLap = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          // 简化：用局部方差作为高频能量代理
          if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
            const lap = Math.abs(
              4 * luma[y * width + x] -
              luma[(y - 1) * width + x] -
              luma[(y + 1) * width + x] -
              luma[y * width + x - 1] -
              luma[y * width + x + 1],
            );
            sumLap += lap;
            count++;
          }
        }
      }
      blockEnergies.push(count > 0 ? sumLap / count : 0);
    }
  }

  // 计算块间方差
  const mean = blockEnergies.reduce((a, b) => a + b, 0) / blockEnergies.length;
  const variance = blockEnergies.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / blockEnergies.length;
  return variance;
}

/**
 * 计算颜色变化空间梯度（同一材质区域内颜色的空间渐变，作为沁色/风化代理）。
 * @param buffer RGBA 像素缓冲
 * @param width 宽度
 * @param height 高度
 * @returns 颜色变化空间梯度（平均颜色梯度幅值）
 */
export function colorVariationSpatialGradient(
  buffer: Uint8Array,
  width: number,
  height: number,
): number {
  let sumGradient = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const offset = idx * 4;

      // 计算 RGB 空间梯度
      const gx = Math.abs(buffer[(idx + 1) * 4] - buffer[(idx - 1) * 4]) +
        Math.abs(buffer[(idx + 1) * 4 + 1] - buffer[(idx - 1) * 4 + 1]) +
        Math.abs(buffer[(idx + 1) * 4 + 2] - buffer[(idx - 1) * 4 + 2]);
      const gy = Math.abs(buffer[(idx + width) * 4] - buffer[(idx - width) * 4]) +
        Math.abs(buffer[(idx + width) * 4 + 1] - buffer[(idx - width) * 4 + 1]) +
        Math.abs(buffer[(idx + width) * 4 + 2] - buffer[(idx - width) * 4 + 2]);

      sumGradient += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }

  return count > 0 ? sumGradient / count : 0;
}
