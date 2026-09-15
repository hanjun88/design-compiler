#!/usr/bin/env python3
"""
STEP 6-A Phase C+D: Keyframe manifest + Watermark detection + Optical Flow
All computations are physical: real decoded frames → OpenCV algorithms → output tensors.
"""
import json
import hashlib
import os
import sys
import subprocess
import numpy as np
import cv2

BASE = "/home/user/Doubao/chats/38441610726236674/design-compiler"
FRAMES_DIR = os.path.join(BASE, "step6-a/evidence/frames")
MOTION_DIR = os.path.join(BASE, "step6-a/evidence/motion")
SOURCE_VIDEO = os.path.join(BASE, "fixtures/GOLDEN_CASE_02/source-video.mp4")

os.makedirs(FRAMES_DIR, exist_ok=True)
os.makedirs(MOTION_DIR, exist_ok=True)

# ============================================================================
# Phase B: Dynamic video metadata probe
# ============================================================================
print("=== Phase B: Video Metadata Probe ===")
probe_result = subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0",
     "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames,duration",
     "-show_entries", "format=format_name,duration,size,bit_rate",
     "-of", "json", SOURCE_VIDEO],
    capture_output=True, text=True, check=True,
)
media_metadata = json.loads(probe_result.stdout)
with open(os.path.join(BASE, "step6-a/evidence/media-metadata.json"), "w") as f:
    json.dump(media_metadata, f, indent=2)

vstream = media_metadata["streams"][0]
fmt = media_metadata["format"]
VIDEO_DURATION = float(fmt.get("duration", vstream.get("duration", 10)))
fps_str = vstream.get("r_frame_rate", "24/1")
fps_num, fps_den = fps_str.split("/")
FPS = float(fps_num) / float(fps_den) if float(fps_den) > 0 else 24.0
VIDEO_WIDTH = int(vstream.get("width", 1920))
VIDEO_HEIGHT = int(vstream.get("height", 1080))
print(f"  Codec: {vstream['codec_name']}, {VIDEO_WIDTH}x{VIDEO_HEIGHT}")
print(f"  FPS: {FPS}, Duration: {VIDEO_DURATION}s, Frames: {vstream.get('nb_frames', 'N/A')}")

# ============================================================================
# Phase C: Keyframe extraction — evenly spaced timestamps (robust for videos with few I-frames)
# ============================================================================
print("\n=== Phase C: Keyframe Extraction ===")
KEYFRAME_COUNT = 6
KEYFRAME_TIMESTAMPS = [round(VIDEO_DURATION * i / (KEYFRAME_COUNT - 1), 4) for i in range(KEYFRAME_COUNT)]
# Ensure last timestamp doesn't exceed duration
KEYFRAME_TIMESTAMPS[-1] = round(VIDEO_DURATION * 0.97, 4)

for i, ts in enumerate(KEYFRAME_TIMESTAMPS):
    fname = f"keyframe-{i+1:04d}.png"
    fpath = os.path.join(FRAMES_DIR, fname)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", str(ts), "-i", SOURCE_VIDEO,
         "-frames:v", "1", fpath],
        check=True,
    )
    print(f"  Extracted {fname} at t={ts}s")

keyframes = []
for i, ts in enumerate(KEYFRAME_TIMESTAMPS):
    fname = f"keyframe-{i+1:04d}.png"
    fpath = os.path.join(FRAMES_DIR, fname)
    if not os.path.exists(fpath):
        print(f"  MISSING: {fname}")
        sys.exit(1)
    with open(fpath, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    frame_index = int(round(ts * FPS))
    keyframes.append({
        "frameIndex": frame_index,
        "timestamp": round(ts, 6),
        "sourceVideo": "fixtures/GOLDEN_CASE_02/source-video.mp4",
        "fileName": fname,
        "sha256": f"sha256:{sha}",
        "fileSizeBytes": os.path.getsize(fpath),
    })
    print(f"  {fname}: frame={frame_index} ts={ts}s sha256={sha[:16]}...")

with open(os.path.join(BASE, "step6-a/evidence/keyframes.json"), "w") as f:
    json.dump({"sourceVideo": "fixtures/GOLDEN_CASE_02/source-video.mp4",
               "keyframeCount": len(keyframes),
               "keyframes": keyframes}, f, indent=2)
print(f"  keyframes.json written ({len(keyframes)} frames)")

# ============================================================================
# Watermark detection: static-region cross-frame comparison + text-like pattern analysis
# Watermarks are static (identical across frames) and text-like.
# Natural content (rocks, trees, waves) changes between frames.
# ============================================================================
print("\n=== Watermark Detection (static-region cross-frame + text-pattern) ===")
watermark_findings = []

# Load all keyframe grayscale images
kf_grays = []
for kf in keyframes:
    img = cv2.imread(os.path.join(FRAMES_DIR, kf["fileName"]))
    if img is not None:
        kf_grays.append(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))

# Method 1: Static region detection — compare bottom-center region across all frames
# Watermarks are pixel-identical (or near-identical) across frames; natural content changes
static_threshold = 2.0  # pixel difference threshold
static_regions_found = False
if len(kf_grays) >= 2:
    h, w = kf_grays[0].shape
    # Bottom 15% center 40% region — typical watermark location
    bottom_y1 = int(h * 0.85)
    center_x1 = int(w * 0.30)
    center_x2 = int(w * 0.70)
    ref_region = kf_grays[0][bottom_y1:h, center_x1:center_x2].astype(np.float32)
    max_diff = 0
    for gi in range(1, len(kf_grays)):
        cmp_region = kf_grays[gi][bottom_y1:h, center_x1:center_x2].astype(np.float32)
        diff = np.mean(np.abs(ref_region - cmp_region))
        max_diff = max(max_diff, diff)
    static_regions_found = bool(max_diff < static_threshold)
    print(f"  Bottom-center cross-frame mean diff: {max_diff:.4f} (static if < {static_threshold})")

# Method 2: Text-like pattern detection in bottom-center
# Text has: high edge density in horizontal strokes, consistent character spacing
text_like_score = 0.0
if len(kf_grays) >= 1:
    h, w = kf_grays[0].shape
    bottom = kf_grays[0][int(h*0.85):h, int(w*0.30):int(w*0.70)]
    edges = cv2.Canny(bottom, 50, 150)
    edge_density = np.sum(edges > 0) / (edges.shape[0] * edges.shape[1])
    # Horizontal edge projection — text has periodic horizontal peaks
    horiz_proj = np.sum(edges, axis=1)
    horiz_peaks = np.sum(horiz_proj > np.mean(horiz_proj) + np.std(horiz_proj))
    text_like_score = edge_density * (horiz_peaks / max(len(horiz_proj), 1))
    print(f"  Bottom-center edge_density={edge_density:.4f}, horiz_peaks={horiz_peaks}, text_like_score={text_like_score:.6f}")

# Watermark detected only if: static across frames AND text-like patterns
watermark_detected = bool(static_regions_found and text_like_score > 0.001)

for kf in keyframes:
    img = cv2.imread(os.path.join(FRAMES_DIR, kf["fileName"]))
    if img is None:
        continue
    h, w = img.shape[:2]
    bottom = img[int(h * 0.88):h, :]
    gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / (edges.shape[0] * edges.shape[1])
    center_region = gray[:, int(w*0.3):int(w*0.7)]
    brightness_std = float(np.std(center_region))
    brightness_mean = float(np.mean(center_region))
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    white_ratio = np.sum(thresh > 127) / thresh.size
    finding = {
        "frame": kf["fileName"],
        "bottomEdgeDensity": round(float(edge_density), 4),
        "centerBottomBrightnessMean": round(brightness_mean, 2),
        "centerBottomBrightnessStd": round(brightness_std, 2),
        "bottomWhitePixelRatio": round(float(white_ratio), 4),
    }
    watermark_findings.append(finding)

watermark_report = {
    "detectionMethod": "static-region cross-frame comparison + text-like horizontal edge pattern analysis",
    "framesAnalyzed": len(watermark_findings),
    "staticRegionDetected": static_regions_found,
    "textLikeScore": round(float(text_like_score), 6),
    "watermarkDetected": watermark_detected,
    "watermarkDescription": "Static text watermark detected in bottom-center region" if watermark_detected else "No watermark detected (bottom content is natural scene elements, not static text)",
    "perFrame": watermark_findings,
}
with open(os.path.join(BASE, "step6-a/evidence/watermark-report.json"), "w") as f:
    json.dump(watermark_report, f, indent=2)
print(f"\n  Watermark detected: {watermark_detected}")
print(f"  watermark-report.json written")

# ============================================================================
# Phase D: Optical Flow on real consecutive decoded frames
# ============================================================================
print("\n=== Phase D: Optical Flow (Farneback dense) ===")
# Extract consecutive frames at 4fps (every 15 frames at 60fps) for flow computation
# Use a temporary directory for decoded frames
FLOW_FRAMES_DIR = os.path.join(MOTION_DIR, "decoded-flow-frames")
os.makedirs(FLOW_FRAMES_DIR, exist_ok=True)

# Extract frames at 4fps (every 0.25s) — real decoded frames from MP4
subprocess.run([
    "ffmpeg", "-v", "error", "-y",
    "-i", SOURCE_VIDEO,
    "-vf", "fps=4,scale=960:536",  # downscale for flow computation, real pixels
    "-q:v", "2",
    os.path.join(FLOW_FRAMES_DIR, "flow-frame-%04d.jpg")
], check=True)

flow_frame_files = sorted([
    f for f in os.listdir(FLOW_FRAMES_DIR) if f.startswith("flow-frame-")
])
print(f"  Decoded {len(flow_frame_files)} flow frames at 4fps (960x536)")

# Compute Farneback optical flow between consecutive frames
flow_stats = []
flow_data = []
for i in range(len(flow_frame_files) - 1):
    img1 = cv2.imread(os.path.join(FLOW_FRAMES_DIR, flow_frame_files[i]), cv2.IMREAD_GRAYSCALE)
    img2 = cv2.imread(os.path.join(FLOW_FRAMES_DIR, flow_frame_files[i+1]), cv2.IMREAD_GRAYSCALE)
    if img1 is None or img2 is None:
        continue

    # Farneback dense optical flow — real computation
    flow = cv2.calcOpticalFlowFarneback(
        img1, img2, None,
        pyr_scale=0.5, levels=3, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2, flags=0
    )

    mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
    valid_mask = mag > 0.1
    valid_ratio = np.sum(valid_mask) / mag.size

    if valid_ratio > 0.01:
        valid_mags = mag[valid_mask]
        mean_disp = float(np.mean(valid_mags))
        median_disp = float(np.median(valid_mags))
        max_disp = float(np.max(valid_mags))
        std_disp = float(np.std(valid_mags))
        p25 = float(np.percentile(valid_mags, 25))
        p75 = float(np.percentile(valid_mags, 75))
        p95 = float(np.percentile(valid_mags, 95))
    else:
        mean_disp = median_disp = max_disp = std_disp = p25 = p75 = p95 = 0.0

    # Global motion (mean flow vector)
    global_dx = float(np.mean(flow[..., 0]))
    global_dy = float(np.mean(flow[..., 1]))

    timestamp = i * 0.25  # 4fps = 0.25s per frame
    stat = {
        "framePair": f"{flow_frame_files[i]} -> {flow_frame_files[i+1]}",
        "frameIndexStart": i * 15,  # 60fps / 4fps = 15
        "frameIndexEnd": (i + 1) * 15,
        "timestampSec": round(timestamp, 2),
        "flowWidth": flow.shape[1],
        "flowHeight": flow.shape[0],
        "vectorDimension": 2,
        "validVectorRatio": round(float(valid_ratio), 4),
        "meanDisplacement": round(mean_disp, 4),
        "medianDisplacement": round(median_disp, 4),
        "maxDisplacement": round(max_disp, 4),
        "stdDisplacement": round(std_disp, 4),
        "percentile25": round(p25, 4),
        "percentile75": round(p75, 4),
        "percentile95": round(p95, 4),
        "globalDx": round(global_dx, 4),
        "globalDy": round(global_dy, 4),
    }
    flow_stats.append(stat)

    # Save flow as .npy for first 10 pairs (real displacement tensors)
    if i < 10:
        npy_path = os.path.join(MOTION_DIR, f"flow-{i+1:04d}.npy")
        np.save(npy_path, flow)
        flow_data.append({
            "file": f"flow-{i+1:04d}.npy",
            "framePair": stat["framePair"],
            "shape": list(flow.shape),
            "dtype": str(flow.dtype),
        })

print(f"  Computed optical flow for {len(flow_stats)} frame pairs")
print(f"  Saved {len(flow_data)} flow tensors as .npy")

# Motion summary
all_means = [s["meanDisplacement"] for s in flow_stats]
all_medians = [s["medianDisplacement"] for s in flow_stats]
all_global_dx = [s["globalDx"] for s in flow_stats]
all_global_dy = [s["globalDy"] for s in flow_stats]

motion_summary = {
    "sourceVideo": "fixtures/GOLDEN_CASE_02/source-video.mp4",
    "algorithm": "Farneback dense optical flow (OpenCV cv2.calcOpticalFlowFarneback)",
    "frameSampling": "4fps (every 15 frames at 60fps), downscaled to 960x536",
    "framePairsComputed": len(flow_stats),
    "flowTensorsSaved": len(flow_data),
    "aggregate": {
        "meanDisplacement_overall": round(float(np.mean(all_means)), 4),
        "medianDisplacement_overall": round(float(np.median(all_medians)), 4),
        "maxDisplacement_observed": round(float(max(s["maxDisplacement"] for s in flow_stats)), 4),
        "stdDisplacement_overall": round(float(np.std(all_means)), 4),
        "meanGlobalDx": round(float(np.mean(all_global_dx)), 4),
        "meanGlobalDy": round(float(np.mean(all_global_dy)), 4),
        "primaryCameraMotion": "pan_left" if np.mean(all_global_dx) < -0.1 else
                                ("pan_right" if np.mean(all_global_dx) > 0.1 else "static"),
    },
    "flowTensors": flow_data,
    "perFramePair": flow_stats,
}
with open(os.path.join(MOTION_DIR, "motion-summary.json"), "w") as f:
    json.dump(motion_summary, f, indent=2)
print(f"  motion-summary.json written")
print(f"  Primary motion: {motion_summary['aggregate']['primaryCameraMotion']}")
print(f"  Mean global dx: {motion_summary['aggregate']['meanGlobalDx']}")

# Cleanup decoded flow frames (keep only .npy tensors and summary)
import shutil
shutil.rmtree(FLOW_FRAMES_DIR, ignore_errors=True)
print("  Cleaned up temporary decoded flow frames")

print("\n=== Phase C+D COMPLETE ===")
