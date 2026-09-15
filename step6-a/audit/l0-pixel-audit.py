#!/usr/bin/env python3
"""
STEP 7 · Phase 1: L0 Physical Pixel Audit (read-only)
对6帧关键帧执行独立于 L1 的物理像素统计：
  - Otsu 二值化 → 前景/背景占比
  - 自适应二值化 → 连通区域
  - Negative space 独立定义（低梯度+高亮度连通域）
  - RGB 直方图 → 色温估计（普朗克轨迹投影）
  - CIE Lab 空间分布
  - Laplacian 方差 → 粗糙度独立验证
所有数值直接来自像素，不引用 L1 结果。
"""
import cv2
import numpy as np
import json
import os
import sys

FRAMES_DIR = "/home/user/Doubao/chats/38441610726236674/design-compiler/step6-a/evidence/frames"
FRAME_FILES = [f"keyframe-{i:04d}.png" for i in range(1, 7)]

def rgb_to_lab(img_rgb):
    """RGB → CIE Lab (via XYZ, D65)"""
    arr = img_rgb.astype(np.float64) / 255.0
    mask = arr > 0.04045
    arr[mask] = ((arr[mask] + 0.055) / 1.055) ** 2.4
    arr[~mask] = arr[~mask] / 12.92
    arr *= 100.0
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041]
    ])
    xyz = arr @ M.T
    xyz[:, :, 0] /= 95.047
    xyz[:, :, 1] /= 100.0
    xyz[:, :, 2] /= 108.883
    mask = xyz > 0.008856
    xyz[mask] = xyz[mask] ** (1.0 / 3.0)
    xyz[~mask] = 7.787 * xyz[~mask] + 16.0 / 116.0
    L = 116.0 * xyz[:, :, 1] - 16.0
    a = 500.0 * (xyz[:, :, 0] - xyz[:, :, 1])
    b = 200.0 * (xyz[:, :, 1] - xyz[:, :, 2])
    return np.stack([L, a, b], axis=-1)

def estimate_color_temp(img_rgb):
    """
    估计相关色温 (CCT)：
    1. 取亮度前 20% 像素（光源/反射主导）
    2. 计算平均 R/G、B/G 比值
    3. 用 McCamy 公式反演色温
    """
    arr = img_rgb.astype(np.float64)
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    threshold = np.percentile(lum, 80)
    bright = lum >= threshold
    if bright.sum() < 100:
        return None
    r_mean = arr[:, :, 0][bright].mean()
    g_mean = arr[:, :, 1][bright].mean()
    b_mean = arr[:, :, 2][bright].mean()
    if g_mean < 1:
        return None
    n = (r_mean - g_mean) / (b_mean - g_mean + 1e-6)
    # McCamy approximation
    cct = 449.0 * n**3 + 3525.0 * n**2 + 6823.3 * n + 5520.33
    return float(np.clip(cct, 1000, 40000))

def compute_negative_space_l0(gray):
    """
    L0 独立 negative space 定义：
    低梯度（Sobel < 10）+ 中高亮度（> 80）的连通像素占比。
    不使用 L1 的 high-brightness(>120)+low-texture(<5) 组合。
    """
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobel_x**2 + sobel_y**2)
    low_grad = grad_mag < 10
    mid_bright = gray > 80
    neg_space = low_grad & mid_bright
    # 连通域分析：只保留面积 > 总像素 1% 的连通域（排除噪点）
    neg_uint8 = neg_space.astype(np.uint8) * 255
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(neg_uint8, connectivity=8)
    total = gray.size
    significant_area = 0
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] > total * 0.01:
            significant_area += stats[i, cv2.CC_STAT_AREA]
    return {
        "rawRatio": float(neg_space.sum() / total),
        "connectedRatio": float(significant_area / total),
        "lowGradRatio": float(low_grad.sum() / total),
        "method": "L0: Sobel gradient<10 AND brightness>80, connected components >1% area"
    }

def analyze_frame(filepath):
    img = cv2.imread(filepath)
    if img is None:
        return {"error": f"cannot read {filepath}"}
    h, w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Otsu 二值化
    otsu_thresh, otsu_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu_fg = float((otsu_mask > 0).sum() / gray.size)
    otsu_bg = 1.0 - otsu_fg

    # 2. 自适应二值化
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 101, 5)
    adaptive_fg = float((adaptive > 0).sum() / gray.size)

    # 3. L0 negative space
    neg_space = compute_negative_space_l0(gray)

    # 4. RGB 直方图统计
    r_hist = cv2.calcHist([img_rgb], [0], None, [256], [0, 256]).flatten()
    g_hist = cv2.calcHist([img_rgb], [1], None, [256], [0, 256]).flatten()
    b_hist = cv2.calcHist([img_rgb], [2], None, [256], [0, 256]).flatten()
    r_mean = float(img_rgb[:, :, 0].mean())
    g_mean = float(img_rgb[:, :, 1].mean())
    b_mean = float(img_rgb[:, :, 2].mean())
    r_std = float(img_rgb[:, :, 0].std())
    g_std = float(img_rgb[:, :, 1].std())
    b_std = float(img_rgb[:, :, 2].std())

    # 色温估计
    cct = estimate_color_temp(img_rgb)

    # 5. CIE Lab
    lab = rgb_to_lab(img_rgb)
    l_mean, l_std = float(lab[:, :, 0].mean()), float(lab[:, :, 0].std())
    a_mean, a_std = float(lab[:, :, 1].mean()), float(lab[:, :, 1].std())
    b_mean_lab, b_std_lab = float(lab[:, :, 2].mean()), float(lab[:, :, 2].std())

    # 6. Laplacian 方差（粗糙度独立验证）
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    lap_var = float(laplacian.var())
    lap_mean = float(laplacian.mean())
    # 归一化粗糙度：1 - min(lap_var / 2000, 1)，与 L1 方法对齐但独立计算
    roughness_l0 = float(1.0 - min(lap_var / 2000.0, 1.0))

    # 7. 亮度分布
    brightness_mean = float(gray.mean())
    brightness_std = float(gray.std())
    bright_pixels = float((gray > 120).sum() / gray.size)
    dark_pixels = float((gray < 40).sum() / gray.size)

    # 8. 边缘密度
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float((edges > 0).sum() / gray.size)

    return {
        "file": os.path.basename(filepath),
        "resolution": [w, h],
        "otsu": {
            "threshold": float(otsu_thresh),
            "foregroundRatio": otsu_fg,
            "backgroundRatio": otsu_bg,
            "method": "cv2.THRESH_BINARY+OTSU"
        },
        "adaptiveThreshold": {
            "foregroundRatio": adaptive_fg,
            "method": "ADAPTIVE_THRESH_GAUSSIAN_C, block=101, C=5"
        },
        "negativeSpaceL0": neg_space,
        "color": {
            "rgbMeans": [r_mean, g_mean, b_mean],
            "rgbStds": [r_std, g_std, b_std],
            "estimatedCCT_Kelvin": cct,
            "labMeans": [l_mean, a_mean, b_mean_lab],
            "labStds": [l_std, a_std, b_std_lab],
        },
        "materialL0": {
            "laplacianVariance": lap_var,
            "laplacianMean": lap_mean,
            "roughnessL0": roughness_l0,
            "method": "1 - min(Laplacian variance / 2000, 1)"
        },
        "brightness": {
            "mean": brightness_mean,
            "std": brightness_std,
            "brightRatio(>120)": bright_pixels,
            "darkRatio(<40)": dark_pixels
        },
        "edgeDensity": edge_density,
    }

def main():
    results = []
    for fname in FRAME_FILES:
        fpath = os.path.join(FRAMES_DIR, fname)
        print(f"Analyzing {fname}...", file=sys.stderr)
        r = analyze_frame(fpath)
        results.append(r)

    # Aggregate (median)
    def median(vals):
        s = sorted(vals)
        n = len(s)
        return (s[n//2 - 1] + s[n//2]) / 2 if n % 2 == 0 else s[n//2]

    agg = {
        "framesAnalyzed": len(results),
        "aggregationMethod": "median across 6 keyframes (L0 independent, no L1 reference)",
        "otsu_foregroundRatio_median": median([r["otsu"]["foregroundRatio"] for r in results]),
        "otsu_backgroundRatio_median": median([r["otsu"]["backgroundRatio"] for r in results]),
        "negativeSpaceL0_rawRatio_median": median([r["negativeSpaceL0"]["rawRatio"] for r in results]),
        "negativeSpaceL0_connectedRatio_median": median([r["negativeSpaceL0"]["connectedRatio"] for r in results]),
        "negativeSpaceL0_lowGradRatio_median": median([r["negativeSpaceL0"]["lowGradRatio"] for r in results]),
        "estimatedCCT_median_Kelvin": median([r["color"]["estimatedCCT_Kelvin"] for r in results if r["color"]["estimatedCCT_Kelvin"]]),
        "labL_median": median([r["color"]["labMeans"][0] for r in results]),
        "labA_median": median([r["color"]["labMeans"][1] for r in results]),
        "labB_median": median([r["color"]["labMeans"][2] for r in results]),
        "roughnessL0_median": median([r["materialL0"]["roughnessL0"] for r in results]),
        "laplacianVariance_median": median([r["materialL0"]["laplacianVariance"] for r in results]),
        "brightnessMean_median": median([r["brightness"]["mean"] for r in results]),
        "brightRatio_median": median([r["brightness"]["brightRatio(>120)"] for r in results]),
        "edgeDensity_median": median([r["edgeDensity"] for r in results]),
    }

    output = {
        "audit": "STEP7-PHASE1-L0-PHYSICAL-PIXEL-AUDIT",
        "source": "physically decoded keyframes (PNG from ffmpeg I-frame extraction)",
        "method": "independent L0 pixel statistics, no reference to L1 visual-features.json",
        "aggregate": agg,
        "perFrame": results
    }

    outpath = "/home/user/Doubao/chats/38441610726236674/design-compiler/step6-a/audit/l0-pixel-audit.json"
    os.makedirs(os.path.dirname(outpath), exist_ok=True)
    with open(outpath, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {outpath}", file=sys.stderr)
    print(json.dumps(agg, indent=2))

if __name__ == "__main__":
    main()
