#!/usr/bin/env python3
"""
STEP 7-A · CASE_03 L0 Physical Pixel Audit (ISOLATED)
严格指向 GOLDEN_CASE_03 资产，严禁复用 CASE_02 数据。
FRAMES_DIR = step6-a/evidence-03/frames (1920x1080, 10 frames)
SOURCE_VIDEO = fixtures/GOLDEN_CASE_03/source-video.mp4
"""
import cv2
import numpy as np
import json
import os
import sys
import hashlib

# === HARD-CODED CASE_03 IDENTITY (never point to CASE_02) ===
FRAMES_DIR = "/home/user/Doubao/chats/38441610726236674/design-compiler/step6-a/evidence-03/frames"
SOURCE_VIDEO = "fixtures/GOLDEN_CASE_03/source-video.mp4"
EXPECTED_RESOLUTION = (1920, 1080)
EXPECTED_FRAME_COUNT = 10
CASE_ID = "GOLDEN_CASE_03"

FRAME_FILES = [f"keyframe-{i:04d}.png" for i in range(1, EXPECTED_FRAME_COUNT + 1)]


def file_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def rgb_to_lab(img_rgb):
    """RGB -> CIE Lab (via XYZ, D65)"""
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
    cct = 449.0 * n**3 + 3525.0 * n**2 + 6823.3 * n + 5520.33
    return float(np.clip(cct, 1000, 40000))


def compute_negative_space_l0(gray):
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobel_x**2 + sobel_y**2)
    low_grad = grad_mag < 12.0
    mid_bright = gray > 80
    neg_space = low_grad & mid_bright
    neg_uint8 = neg_space.astype(np.uint8) * 255
    # Morphological opening to denoise
    kernel = np.ones((5, 5), np.uint8)
    neg_uint8 = cv2.morphologyEx(neg_uint8, cv2.MORPH_OPEN, kernel)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(neg_uint8, connectivity=8)
    total = gray.size
    significant_area = 0
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] > total * 0.01:
            significant_area += stats[i, cv2.CC_STAT_AREA]
    return {
        "rawRatio": float((neg_uint8 > 0).sum() / total),
        "connectedRatio": float(significant_area / total),
        "lowGradRatio": float(low_grad.sum() / total),
        "method": "L0: Sobel gradient<12 AND brightness>80, morph-open, connected components >1% area"
    }


def analyze_frame(filepath):
    img = cv2.imread(filepath)
    if img is None:
        return {"error": f"cannot read {filepath}"}
    h, w = img.shape[:2]

    # HARD ASSERT: resolution must be 1920x1080
    if (w, h) != EXPECTED_RESOLUTION:
        return {
            "error": f"CORRUPTED_ASSET: expected {EXPECTED_RESOLUTION}, got ({w},{h})",
            "file": os.path.basename(filepath),
            "actualResolution": [w, h]
        }

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # File SHA-256
    sha = file_sha256(filepath)

    # Otsu
    otsu_thresh, otsu_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu_fg = float((otsu_mask > 0).sum() / gray.size)

    # Adaptive
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 101, 5)
    adaptive_fg = float((adaptive > 0).sum() / gray.size)

    # Negative space L0
    neg_space = compute_negative_space_l0(gray)

    # RGB stats
    r_mean = float(img_rgb[:, :, 0].mean())
    g_mean = float(img_rgb[:, :, 1].mean())
    b_mean = float(img_rgb[:, :, 2].mean())

    # CCT
    cct = estimate_color_temp(img_rgb)

    # CIE Lab
    lab = rgb_to_lab(img_rgb)
    l_mean, l_std = float(lab[:, :, 0].mean()), float(lab[:, :, 0].std())
    a_mean, a_std = float(lab[:, :, 1].mean()), float(lab[:, :, 1].std())
    b_mean_lab, b_std_lab = float(lab[:, :, 2].mean()), float(lab[:, :, 2].std())

    # Laplacian
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    lap_var = float(laplacian.var())
    roughness_l0 = float(1.0 - min(lap_var / 2000.0, 1.0))

    # Brightness
    brightness_mean = float(gray.mean())
    bright_pixels = float((gray > 120).sum() / gray.size)
    dark_pixels = float((gray < 40).sum() / gray.size)

    # Canny edge density
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float((edges > 0).sum() / gray.size)

    return {
        "file": os.path.basename(filepath),
        "sha256": sha,
        "resolution": [w, h],
        "otsu": {
            "threshold": float(otsu_thresh),
            "foregroundRatio": otsu_fg,
            "backgroundRatio": 1.0 - otsu_fg,
        },
        "adaptiveThreshold": {"foregroundRatio": adaptive_fg},
        "negativeSpaceL0": neg_space,
        "color": {
            "rgbMeans": [r_mean, g_mean, b_mean],
            "estimatedCCT_Kelvin": cct,
            "labMeans": [l_mean, a_mean, b_mean_lab],
            "labStds": [l_std, a_std, b_std_lab],
        },
        "materialL0": {
            "laplacianVariance": lap_var,
            "roughnessL0": roughness_l0,
        },
        "brightness": {
            "mean": brightness_mean,
            "brightRatio(>120)": bright_pixels,
            "darkRatio(<40)": dark_pixels,
        },
        "edgeDensity": edge_density,
    }


def main():
    print(f"=== CASE_03 L0 PHYSICAL PIXEL AUDIT (ISOLATED) ===", file=sys.stderr)
    print(f"FRAMES_DIR: {FRAMES_DIR}", file=sys.stderr)
    print(f"EXPECTED_RESOLUTION: {EXPECTED_RESOLUTION}", file=sys.stderr)
    print(f"EXPECTED_FRAME_COUNT: {EXPECTED_FRAME_COUNT}", file=sys.stderr)

    results = []
    for fname in FRAME_FILES:
        fpath = os.path.join(FRAMES_DIR, fname)
        if not os.path.exists(fpath):
            print(f"ERROR: missing frame {fpath}", file=sys.stderr)
            sys.exit(2)
        print(f"Analyzing {fname}...", file=sys.stderr)
        r = analyze_frame(fpath)
        if "error" in r and "CORRUPTED_ASSET" in r.get("error", ""):
            print(f"STOP: {r['error']}", file=sys.stderr)
            sys.exit(3)
        results.append(r)

    # Aggregate (median)
    def median(vals):
        s = sorted(vals)
        n = len(s)
        return (s[n//2 - 1] + s[n//2]) / 2 if n % 2 == 0 else s[n//2]

    agg = {
        "framesAnalyzed": len(results),
        "aggregationMethod": f"median across {len(results)} keyframes (CASE_03 L0 independent, no CASE_02 reference)",
        "otsu_threshold_median": median([r["otsu"]["threshold"] for r in results]),
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

    # Source video SHA-256
    source_video_path = os.path.join(
        "/home/user/Doubao/chats/38441610726236674/design-compiler",
        SOURCE_VIDEO
    )
    source_sha = file_sha256(source_video_path) if os.path.exists(source_video_path) else "NOT_FOUND"

    provenance_meta = {
        "caseId": CASE_ID,
        "sourceVideo": SOURCE_VIDEO,
        "sourceResolution": list(EXPECTED_RESOLUTION),
        "framesPath": "step6-a/evidence-03/frames",
        "frameCount": EXPECTED_FRAME_COUNT,
        "sha256": source_sha,
        "auditLayer": "L0",
        "auditMethod": "opencv-python independent pixel statistics (ITU-R BT.709), ISOLATED from CASE_02",
        "isolatedFrom": "GOLDEN_CASE_02 (separate directory, separate source video, separate frame set)",
        "resolutionAssertion": f"ALL_FRAMES_MUST_BE_{EXPECTED_RESOLUTION[0]}x{EXPECTED_RESOLUTION[1]}"
    }

    output = {
        "provenanceMeta": provenance_meta,
        "audit": "STEP7A-CASE03-L0-PHYSICAL-PIXEL-AUDIT-ISOLATED",
        "source": "physically decoded keyframes from GOLDEN_CASE_03 source video",
        "method": "independent L0 pixel statistics, NO reference to CASE_02 data",
        "aggregate": agg,
        "perFrame": results
    }

    outpath = "/home/user/Doubao/chats/38441610726236674/design-compiler/step6-a/audit/case-03/l0-pixel-audit.json"
    with open(outpath, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved to {outpath}", file=sys.stderr)
    print(json.dumps(agg, indent=2))
    print(f"\nCASE_03 L0 AUDIT: PASS (all {EXPECTED_FRAME_COUNT} frames at {EXPECTED_RESOLUTION})", file=sys.stderr)


if __name__ == "__main__":
    main()
