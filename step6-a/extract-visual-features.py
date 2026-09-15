#!/usr/bin/env python3
"""
STEP 6-A Phase E: Visual Feature Extraction from Real Keyframes
Computes: color palette (k-means), composition (focal/symmetry/negative-space),
depth layers, material proxies (roughness/metalness). All from real decoded PNG frames.
"""
import json
import os
import numpy as np
import cv2
from sklearn.cluster import KMeans

BASE = "/home/user/Doubao/chats/38441610726236674/design-compiler"
FRAMES_DIR = os.path.join(BASE, "step6-a/evidence/frames")
OUTPUT = os.path.join(BASE, "step6-a/evidence/visual-features.json")

# Check sklearn availability
try:
    from sklearn.cluster import KMeans
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    print("WARNING: sklearn not available, using OpenCV k-means fallback")

def get_dominant_colors(img, k=5, sample_size=10000):
    """Extract dominant color palette using k-means clustering."""
    h, w = img.shape[:2]
    # Resize for speed
    small = cv2.resize(img, (200, int(200 * h / w)))
    pixels = small.reshape(-1, 3).astype(np.float32)

    # Subsample if too large
    if len(pixels) > sample_size:
        idx = np.random.choice(len(pixels), sample_size, replace=False)
        pixels = pixels[idx]

    if HAS_SKLEARN:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(pixels)
        centers = kmeans.cluster_centers_
    else:
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)

    # Count pixels per cluster
    counts = np.bincount(labels, minlength=k)
    total = counts.sum()

    # Sort by dominance
    order = np.argsort(-counts)
    colors = []
    for rank, idx in enumerate(order):
        b, g, r = centers[idx]
        hex_color = f"#{int(r):02x}{int(g):02x}{int(b):02x}"
        colors.append({
            "rank": rank,
            "hex": hex_color,
            "rgb": [int(r), int(g), int(b)],
            "pixelRatio": round(float(counts[idx] / total), 4),
        })
    return colors

def compute_composition(img):
    """Compute composition metrics: focal point, symmetry, negative space."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Focal point: center of mass of edge density (saliency proxy)
    edges = cv2.Canny(gray, 50, 150)
    # Weight by edge density in grid cells
    grid_h, grid_w = 20, 20
    cell_h, cell_w = h // grid_h, w // grid_w
    density_map = np.zeros((grid_h, grid_w))
    for i in range(grid_h):
        for j in range(grid_w):
            cell = edges[i*cell_h:(i+1)*cell_h, j*cell_w:(j+1)*cell_w]
            density_map[i, j] = np.sum(cell > 0) / (cell_h * cell_w)

    # Center of mass of density
    total_density = density_map.sum()
    if total_density > 0:
        y_coords, x_coords = np.mgrid[0:grid_h, 0:grid_w]
        focal_y = np.sum(density_map * y_coords) / total_density / grid_h
        focal_x = np.sum(density_map * x_coords) / total_density / grid_w
    else:
        focal_x, focal_y = 0.5, 0.5

    # Symmetry: normalized cross-correlation between left half and flipped right half
    left = gray[:, :w//2]
    right_flipped = cv2.flip(gray[:, w//2:], 1)
    # Resize to same dimensions if odd width
    min_w = min(left.shape[1], right_flipped.shape[1])
    left = left[:, :min_w]
    right_flipped = right_flipped[:, :min_w]
    # Normalized cross-correlation
    left_norm = (left - left.mean()) / (left.std() + 1e-8)
    right_norm = (right_flipped - right_flipped.mean()) / (right_flipped.std() + 1e-8)
    symmetry = float(np.mean(left_norm * right_norm))
    # Map from [-1, 1] to [0, 1]
    symmetry_normalized = (symmetry + 1) / 2

    # Negative space: ratio of low-texture + high-brightness regions (sky/clouds)
    # Use texture (Laplacian variance) and brightness thresholds
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    texture = np.abs(laplacian)
    brightness = gray.astype(np.float32)

    # Negative space = high brightness (>120) AND low texture (<5)
    negative_mask = (brightness > 120) & (texture < 5)
    negative_space_ratio = float(np.sum(negative_mask) / (h * w))

    # Depth layers: brightness quantization
    # Quantize into 4-6 layers based on brightness histogram
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    # Find significant peaks (depth boundaries)
    from scipy.signal import find_peaks
    try:
        peaks, _ = find_peaks(hist, distance=30, prominence=hist.max()*0.05)
        depth_layer_count = min(max(len(peaks), 3), 6)
    except Exception:
        depth_layer_count = 4

    return {
        "focalPoint": [round(float(focal_x), 4), round(float(focal_y), 4)],
        "focalMethod": "edge-density-center-of-mass (20x20 grid)",
        "symmetry": round(float(symmetry_normalized), 4),
        "symmetryMethod": "normalized-cross-correlation left vs flipped-right",
        "negativeSpaceRatio": round(float(negative_space_ratio), 4),
        "negativeSpaceMethod": "high-brightness(>120) + low-texture(<5) pixel ratio",
        "depthLayerCount": depth_layer_count,
        "depthMethod": "brightness-histogram peak counting",
        "edgeDensityMean": round(float(np.mean(edges > 0)), 4),
        "brightnessMean": round(float(np.mean(brightness)), 2),
        "brightnessStd": round(float(np.std(brightness)), 2),
    }

def compute_material_proxies(img):
    """Compute material property proxies from image statistics."""
    h, w = img.shape[:2]
    gray_u8 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = gray_u8.astype(np.float32)

    # Roughness proxy: inverse of edge sharpness.
    # High Laplacian variance = sharp edges = smooth material (low roughness)
    # Low Laplacian variance = soft/blurry = rough material
    laplacian = cv2.Laplacian(gray_u8, cv2.CV_64F)
    sharpness = np.var(laplacian)
    # Normalize: typical range 100-5000 for natural images
    roughness = float(1.0 - min(sharpness / 2000.0, 1.0))
    roughness = max(0.1, min(0.95, roughness))

    # Metalness proxy: ratio of specular highlights (very bright, low saturation pixels)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1].astype(np.float32)
    value = hsv[:, :, 2].astype(np.float32)
    # Specular = high value (>200) AND low saturation (<30)
    specular_mask = (value > 200) & (saturation < 30)
    specular_ratio = float(np.sum(specular_mask) / (h * w))
    # Metalness correlates with specular highlight ratio, capped
    metalness = float(min(specular_ratio * 10, 0.8))

    # Wear proxy: texture irregularity + color variance in mid-tones
    # High local variance in mid-tone regions = weathered/worn
    midtone_mask = (gray > 60) & (gray < 200)
    if np.sum(midtone_mask) > 100:
        midtone_gray = gray[midtone_mask]
        wear = float(np.std(midtone_gray) / 128.0)
        wear = max(0.05, min(0.9, wear))
    else:
        wear = 0.3

    return {
        "roughness": round(roughness, 4),
        "roughnessMethod": "1 - normalized Laplacian variance (sharpness inverse)",
        "metalness": round(metalness, 4),
        "metalnessMethod": "specular highlight ratio (high value + low saturation)",
        "wear": round(wear, 4),
        "wearMethod": "midtone luminance std / 128",
        "sharpness": round(float(sharpness), 2),
        "specularRatio": round(specular_ratio, 4),
    }

def compute_color_metrics(img, palette):
    """Compute color relationship metrics."""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Contrast ratio (WCAG-like): relative luminance of brightest/darkest 5%
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    sorted_gray = np.sort(gray.flatten())
    n = len(sorted_gray)
    darkest = np.mean(sorted_gray[:int(n*0.05)])
    brightest = np.mean(sorted_gray[int(n*0.95):])
    # WCAG relative luminance approximation
    L1 = (brightest / 255.0 + 0.05)
    L2 = (darkest / 255.0 + 0.05)
    contrast_ratio = float(max(L1, L2) / min(L1, L2))

    # Temperature bias: warm vs cool pixel ratio
    # Warm: hue in [0, 30] or [160, 180] (red/orange/yellow)
    # Cool: hue in [80, 160] (cyan/blue)
    hue = hsv[:, :, 0].astype(np.float32) * 2  # OpenCV hue is 0-179, scale to 0-360
    warm_mask = ((hue >= 0) & (hue <= 45)) | ((hue >= 330) & (hue <= 360))
    cool_mask = (hue >= 180) & (hue <= 270)
    warm_count = np.sum(warm_mask)
    cool_count = np.sum(cool_mask)
    total = warm_count + cool_count
    if total > 0:
        temperature_bias = float((warm_count - cool_count) / total)
    else:
        temperature_bias = 0.0

    # Accent isolation: ratio of least dominant color area
    if len(palette) >= 3:
        accent_ratio = palette[2]["pixelRatio"]
    else:
        accent_ratio = 0.05

    return {
        "contrastRatio": round(contrast_ratio, 2),
        "contrastMethod": "WCAG relative luminance (brightest 5% / darkest 5%)",
        "temperatureBias": round(temperature_bias, 4),
        "temperatureMethod": "warm-hue vs cool-hue pixel ratio difference",
        "warmPixelRatio": round(float(warm_count / (h*w)), 4),
        "coolPixelRatio": round(float(cool_count / (h*w)), 4),
        "accentIsolation": round(float(accent_ratio), 4),
        "dominantArea": round(float(palette[0]["pixelRatio"]), 4) if palette else 0,
    }

# ============================================================================
# Main: process all 6 keyframes and aggregate
# ============================================================================
print("=== Phase E: Visual Feature Extraction ===")
all_results = []

for i in range(1, 7):
    fname = f"keyframe-{i:04d}.png"
    fpath = os.path.join(FRAMES_DIR, fname)
    print(f"\n  Processing {fname}...")

    img = cv2.imread(fpath)
    if img is None:
        print(f"    ERROR: cannot read {fname}")
        continue

    h, w = img.shape[:2]
    print(f"    Resolution: {w}x{h}")

    # Downscale for faster computation (keep aspect ratio)
    scale = 800 / w
    img_small = cv2.resize(img, (800, int(h * scale)))

    palette = get_dominant_colors(img_small, k=5)
    print(f"    Dominant: {palette[0]['hex']} ({palette[0]['pixelRatio']*100:.1f}%)")
    print(f"    Secondary: {palette[1]['hex']} ({palette[1]['pixelRatio']*100:.1f}%)")
    print(f"    Accent: {palette[2]['hex']} ({palette[2]['pixelRatio']*100:.1f}%)")

    composition = compute_composition(img_small)
    print(f"    Focal: {composition['focalPoint']}, Symmetry: {composition['symmetry']}, "
          f"NegSpace: {composition['negativeSpaceRatio']}, Depth: {composition['depthLayerCount']}")

    materials = compute_material_proxies(img_small)
    print(f"    Roughness: {materials['roughness']}, Metalness: {materials['metalness']}, "
          f"Wear: {materials['wear']}")

    color_metrics = compute_color_metrics(img_small, palette)
    print(f"    Contrast: {color_metrics['contrastRatio']}, TempBias: {color_metrics['temperatureBias']}")

    all_results.append({
        "frame": fname,
        "frameIndex": (i-1) * 256,
        "timestampSec": round((i-1) * 4.266667, 2),
        "resolution": [w, h],
        "palette": palette,
        "composition": composition,
        "materialProxies": materials,
        "colorMetrics": color_metrics,
    })

# ============================================================================
# Aggregate across all keyframes (median for robustness)
# ============================================================================
print("\n=== Aggregating across keyframes (median) ===")

def median_field(results, field_path):
    vals = []
    for r in results:
        obj = r
        for key in field_path.split('.'):
            if isinstance(obj, list):
                obj = obj[int(key)]
            else:
                obj = obj[key]
        vals.append(obj)
    return float(np.median(vals))

aggregate = {
    "framesAnalyzed": len(all_results),
    "aggregationMethod": "median across keyframes (robust to outlier shots)",
    "palette": {
        "dominant": all_results[0]["palette"][0]["hex"],  # use frame 1 as representative
        "secondary": all_results[0]["palette"][1]["hex"],
        "accent": all_results[0]["palette"][2]["hex"],
        "dominantRatio": round(median_field(all_results, "palette.0.pixelRatio"), 4),
    },
    "composition": {
        "focalPoint": [
            round(median_field(all_results, "composition.focalPoint.0"), 4),
            round(median_field(all_results, "composition.focalPoint.1"), 4),
        ],
        "symmetry": round(median_field(all_results, "composition.symmetry"), 4),
        "negativeSpaceRatio": round(median_field(all_results, "composition.negativeSpaceRatio"), 4),
        "depthLayerCount": int(median_field(all_results, "composition.depthLayerCount")),
    },
    "materialProxies": {
        "roughness": round(median_field(all_results, "materialProxies.roughness"), 4),
        "metalness": round(median_field(all_results, "materialProxies.metalness"), 4),
        "wear": round(median_field(all_results, "materialProxies.wear"), 4),
    },
    "colorMetrics": {
        "contrastRatio": round(median_field(all_results, "colorMetrics.contrastRatio"), 2),
        "temperatureBias": round(median_field(all_results, "colorMetrics.temperatureBias"), 4),
        "warmPixelRatio": round(median_field(all_results, "colorMetrics.warmPixelRatio"), 4),
        "coolPixelRatio": round(median_field(all_results, "colorMetrics.coolPixelRatio"), 4),
    },
}

print(f"  Dominant: {aggregate['palette']['dominant']}")
print(f"  Secondary: {aggregate['palette']['secondary']}")
print(f"  Accent: {aggregate['palette']['accent']}")
print(f"  Focal: {aggregate['composition']['focalPoint']}")
print(f"  Symmetry: {aggregate['composition']['symmetry']}")
print(f"  NegSpace: {aggregate['composition']['negativeSpaceRatio']}")
print(f"  Depth: {aggregate['composition']['depthLayerCount']}")
print(f"  Roughness: {aggregate['materialProxies']['roughness']}")
print(f"  Metalness: {aggregate['materialProxies']['metalness']}")
print(f"  Contrast: {aggregate['colorMetrics']['contrastRatio']}")
print(f"  TempBias: {aggregate['colorMetrics']['temperatureBias']}")

output = {
    "sourceVideo": "fixtures/GOLDEN_CASE_02/source-video.mp4",
    "extractionMethod": "OpenCV + k-means on physically decoded I-frames",
    "framesUsed": [r["frame"] for r in all_results],
    "aggregate": aggregate,
    "perFrame": all_results,
}

with open(OUTPUT, "w") as f:
    json.dump(output, f, indent=2)
print(f"\n  visual-features.json written")
print("=== Phase E COMPLETE ===")
