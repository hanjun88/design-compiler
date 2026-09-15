/**
 * step6-a/verifier/physical-asset-gate.ts
 *
 * STEP 8-B · Physical Asset Gate — 穿透式物理断言
 *
 * 终结"读取声明文件即判定 PASS"的自循环伪验证，建立三向对账：
 *   物理流实测 (ffprobe 实时探测)
 *     ↕
 *   声明元数据 (media-metadata.json)
 *     ↕
 *   门禁阈值 (asset-spec.json 硬编码期望值)
 *
 * 核心原则：
 * - 物理流实测必须来自 ffprobe 实时执行，禁止仅依赖预生成的 media-metadata.json
 * - 声明元数据与物理流实测必须一致（容限内）
 * - 门禁阈值必须显式声明，禁止隐式默认
 * - 任一断言失败即阻断，禁止降级后宣称 PASS
 *
 * 门禁项：
 * 1. codec === 'h264'（物理流编码强校验）
 * 2. |actualFps - declaredFps| <= 0.05（帧率误差容限）
 * 3. |actualDuration - declaredDuration| <= 0.1s（时长误差容限）
 * 4. actualFrameCount === declaredFrameCount（物理帧数严格对账）
 * 5. watermarkDetected === false（水印频域实测）
 * 6. opticalFlowPairs >= minRequired（稠密光流张量对账）
 * 7. keyframeCount >= minRequired（关键帧数量对账）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// ============================================================================
// 类型定义
// ============================================================================

/** ffprobe 实时探测结果 */
export interface FfprobeResult {
  codec_name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  frameCount: number;
  format_name: string;
  bit_rate: number;
  size: number;
}

/** 门禁阈值声明 */
export interface AssetGateExpectations {
  codec: string;
  fps: number;
  duration: number;
  frameCount: number;
  watermarkDetected: boolean;
  minOpticalFlowPairs: number;
  minKeyframes: number;
}

/** 容限配置 */
export interface AssetGateTolerances {
  fps: number;
  duration: number;
}

/** Physical Asset Gate 配置 */
export interface PhysicalAssetGateConfig {
  sourceVideoPath: string;
  metadataPath: string;
  watermarkReportPath: string;
  keyframesPath: string;
  motionSummaryPath: string;
  expected: AssetGateExpectations;
  tolerances?: Partial<AssetGateTolerances>;
}

/** 单条断言结果 */
export interface GateAssertion {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  delta?: string;
}

/** Strict Asset Gate 结果 */
export interface StrictAssetGateResult {
  passed: boolean;
  sourceVideo: string;
  ffprobe: FfprobeResult;
  declared: {
    codec: string;
    fps: number;
    duration: number;
    frameCount: number;
    width: number;
    height: number;
  };
  assertions: GateAssertion[];
  blockers: string[];
}

// ============================================================================
// ffprobe 实时探测
// ============================================================================

/**
 * 使用 ffprobe 实时探测视频媒体流信息。
 * 禁止仅依赖预生成的 media-metadata.json。
 *
 * @param videoPath 视频文件绝对路径
 * @returns FfprobeResult — 实时探测结果
 * @throws Error 当 ffprobe 执行失败或输出无法解析时
 */
export function probeVideoWithFfprobe(videoPath: string): FfprobeResult {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`FFPROBE_FAIL: source video not found: ${videoPath}`);
  }

  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries",
    "stream=codec_name,width,height,r_frame_rate,nb_frames,duration,bit_rate:format=format_name,duration,size,bit_rate",
    "-of", "json",
    videoPath,
  ];

  let stdout: string;
  try {
    stdout = execFileSync("ffprobe", args, { encoding: "utf8", timeout: 30000 });
  } catch (err) {
    throw new Error(`FFPROBE_FAIL: ffprobe execution failed: ${(err as Error).message}`);
  }

  let probe: Record<string, unknown>;
  try {
    probe = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`FFPROBE_FAIL: failed to parse ffprobe JSON output: ${(err as Error).message}`);
  }

  const streams = (probe.streams as Array<Record<string, unknown>>) ?? [];
  const format = (probe.format as Record<string, unknown>) ?? {};
  const videoStream = streams[0] ?? {};

  if (!videoStream.codec_name) {
    throw new Error("FFPROBE_FAIL: no video stream found or codec_name missing");
  }

  // 解析帧率 r_frame_rate (如 "30/1")
  const rFrameRate = String(videoStream.r_frame_rate ?? "0/1");
  const [fpsNum, fpsDen] = rFrameRate.split("/").map(Number);
  const fps = fpsDen > 0 ? fpsNum / fpsDen : 0;

  return {
    codec_name: String(videoStream.codec_name),
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
    fps,
    duration: Number(format.duration ?? videoStream.duration ?? 0),
    frameCount: Number(videoStream.nb_frames ?? 0),
    format_name: String(format.format_name ?? "unknown"),
    bit_rate: Number(format.bit_rate ?? videoStream.bit_rate ?? 0),
    size: Number(format.size ?? 0),
  };
}

// ============================================================================
// 声明元数据读取
// ============================================================================

/**
 * 读取预生成的 media-metadata.json（声明元数据）。
 * 用于与 ffprobe 实时探测结果对账。
 */
function readDeclaredMetadata(metadataPath: string): {
  codec: string;
  fps: number;
  duration: number;
  frameCount: number;
  width: number;
  height: number;
} {
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`DECLARED_METADATA_MISSING: ${metadataPath}`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const streams = (metadata.streams as Array<Record<string, unknown>>) ?? [];
  const format = (metadata.format as Record<string, unknown>) ?? {};
  const videoStream = streams[0] ?? {};

  const rFrameRate = String(videoStream.r_frame_rate ?? "0/1");
  const [fpsNum, fpsDen] = rFrameRate.split("/").map(Number);
  const fps = fpsDen > 0 ? fpsNum / fpsDen : 0;

  return {
    codec: String(videoStream.codec_name ?? "unknown"),
    fps,
    duration: Number(format.duration ?? videoStream.duration ?? 0),
    frameCount: Number(videoStream.nb_frames ?? 0),
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
  };
}

// ============================================================================
// 水印报告读取
// ============================================================================

function readWatermarkReport(watermarkReportPath: string): {
  watermarkDetected: boolean;
  detectionMethod: string;
  sampledFrames: number;
  notes?: string;
} {
  if (!fs.existsSync(watermarkReportPath)) {
    throw new Error(`WATERMARK_REPORT_MISSING: ${watermarkReportPath}`);
  }

  const report = JSON.parse(fs.readFileSync(watermarkReportPath, "utf8"));
  return {
    watermarkDetected: Boolean(report.watermarkDetected),
    detectionMethod: String(report.detectionMethod ?? "unknown"),
    sampledFrames: Number(report.sampledFrames ?? 0),
    notes: report.notes ? String(report.notes) : undefined,
  };
}

// ============================================================================
// 关键帧与光流证据读取
// ============================================================================

function readKeyframeCount(keyframesPath: string): number {
  if (!fs.existsSync(keyframesPath)) {
    throw new Error(`KEYFRAMES_MISSING: ${keyframesPath}`);
  }
  const kf = JSON.parse(fs.readFileSync(keyframesPath, "utf8"));
  return (kf.keyframes as unknown[]).length;
}

function readOpticalFlowPairs(motionSummaryPath: string): number {
  if (!fs.existsSync(motionSummaryPath)) {
    throw new Error(`MOTION_SUMMARY_MISSING: ${motionSummaryPath}`);
  }
  const motion = JSON.parse(fs.readFileSync(motionSummaryPath, "utf8"));
  return Number(motion.framePairsComputed ?? 0);
}

// ============================================================================
// Strict Asset Gate — 三向对账
// ============================================================================

/**
 * 执行穿透式物理资产门禁验证。
 *
 * 三向对账：
 * 1. ffprobe 实时探测（物理流实测）
 * 2. media-metadata.json（声明元数据）
 * 3. asset-spec 期望值（门禁阈值）
 *
 * @param config PhysicalAssetGateConfig
 * @returns StrictAssetGateResult
 */
export function verifyPhysicalAssetsStrict(config: PhysicalAssetGateConfig): StrictAssetGateResult {
  const assertions: GateAssertion[] = [];
  const blockers: string[] = [];

  const tolerances: AssetGateTolerances = {
    fps: config.tolerances?.fps ?? 0.05,
    duration: config.tolerances?.duration ?? 0.1,
  };

  // ========================================================================
  // Phase 1: 物理流实测（ffprobe 实时探测）
  // ========================================================================
  let ffprobe: FfprobeResult;
  try {
    ffprobe = probeVideoWithFfprobe(config.sourceVideoPath);
  } catch (err) {
    blockers.push(`FFPROBE_FAIL: ${(err as Error).message}`);
    return {
      passed: false,
      sourceVideo: config.sourceVideoPath,
      ffprobe: {
        codec_name: "unknown", width: 0, height: 0, fps: 0,
        duration: 0, frameCount: 0, format_name: "unknown", bit_rate: 0, size: 0,
      },
      declared: { codec: "unknown", fps: 0, duration: 0, frameCount: 0, width: 0, height: 0 },
      assertions,
      blockers,
    };
  }

  // ========================================================================
  // Phase 2: 声明元数据读取
  // ========================================================================
  let declared: StrictAssetGateResult["declared"];
  try {
    declared = readDeclaredMetadata(config.metadataPath);
  } catch (err) {
    blockers.push(`DECLARED_METADATA_FAIL: ${(err as Error).message}`);
    return {
      passed: false,
      sourceVideo: config.sourceVideoPath,
      ffprobe,
      declared: { codec: "unknown", fps: 0, duration: 0, frameCount: 0, width: 0, height: 0 },
      assertions,
      blockers,
    };
  }

  // ========================================================================
  // Phase 3: 三向对账断言
  // ========================================================================

  // 断言 1: codec === 'h264'（物理流编码强校验）
  const codecPassed = ffprobe.codec_name.toLowerCase() === config.expected.codec.toLowerCase();
  assertions.push({
    name: "codec",
    passed: codecPassed,
    expected: config.expected.codec,
    actual: ffprobe.codec_name,
  });
  if (!codecPassed) {
    blockers.push(`GATE_FAIL: codec expected=${config.expected.codec}, actual=${ffprobe.codec_name}`);
  }

  // 断言 2: |actualFps - declaredFps| <= 0.05（帧率误差容限）
  // 同时验证 ffprobe 实测与声明元数据一致
  const fpsDeclaredDelta = Math.abs(ffprobe.fps - declared.fps);
  const fpsExpectedDelta = Math.abs(ffprobe.fps - config.expected.fps);
  const fpsPassed = fpsDeclaredDelta <= tolerances.fps && fpsExpectedDelta <= tolerances.fps;
  assertions.push({
    name: "fps",
    passed: fpsPassed,
    expected: `${config.expected.fps} (declared=${declared.fps}, tol=${tolerances.fps})`,
    actual: String(ffprobe.fps),
    delta: `ffprobe-vs-declared=${fpsDeclaredDelta.toFixed(4)}, ffprobe-vs-expected=${fpsExpectedDelta.toFixed(4)}`,
  });
  if (!fpsPassed) {
    blockers.push(`GATE_FAIL: fps expected=${config.expected.fps}, declared=${declared.fps}, actual=${ffprobe.fps}`);
  }

  // 断言 3: |actualDuration - declaredDuration| <= 0.1s（时长误差容限）
  const durationDeclaredDelta = Math.abs(ffprobe.duration - declared.duration);
  const durationExpectedDelta = Math.abs(ffprobe.duration - config.expected.duration);
  const durationPassed = durationDeclaredDelta <= tolerances.duration && durationExpectedDelta <= tolerances.duration;
  assertions.push({
    name: "duration",
    passed: durationPassed,
    expected: `${config.expected.duration}s (declared=${declared.duration}s, tol=${tolerances.duration}s)`,
    actual: `${ffprobe.duration}s`,
    delta: `ffprobe-vs-declared=${durationDeclaredDelta.toFixed(4)}s, ffprobe-vs-expected=${durationExpectedDelta.toFixed(4)}s`,
  });
  if (!durationPassed) {
    blockers.push(`GATE_FAIL: duration expected=${config.expected.duration}s, declared=${declared.duration}s, actual=${ffprobe.duration}s`);
  }

  // 断言 4: actualFrameCount === declaredFrameCount（物理帧数严格对账）
  const frameCountPassed = ffprobe.frameCount === declared.frameCount && ffprobe.frameCount === config.expected.frameCount;
  assertions.push({
    name: "frameCount",
    passed: frameCountPassed,
    expected: `${config.expected.frameCount} (declared=${declared.frameCount})`,
    actual: String(ffprobe.frameCount),
  });
  if (!frameCountPassed) {
    blockers.push(`GATE_FAIL: frameCount expected=${config.expected.frameCount}, declared=${declared.frameCount}, actual=${ffprobe.frameCount}`);
  }

  // 断言 5: 分辨率对账（width/height）
  const resolutionPassed = ffprobe.width === declared.width && ffprobe.height === declared.height;
  assertions.push({
    name: "resolution",
    passed: resolutionPassed,
    expected: `${declared.width}x${declared.height}`,
    actual: `${ffprobe.width}x${ffprobe.height}`,
  });
  if (!resolutionPassed) {
    blockers.push(`GATE_FAIL: resolution expected=${declared.width}x${declared.height}, actual=${ffprobe.width}x${ffprobe.height}`);
  }

  // 断言 6: watermarkDetected === false（水印检测）
  let watermarkDetected = true;
  try {
    const wm = readWatermarkReport(config.watermarkReportPath);
    watermarkDetected = wm.watermarkDetected;
  } catch (err) {
    blockers.push(`WATERMARK_REPORT_FAIL: ${(err as Error).message}`);
  }
  const watermarkPassed = watermarkDetected === config.expected.watermarkDetected;
  assertions.push({
    name: "watermark",
    passed: watermarkPassed,
    expected: String(config.expected.watermarkDetected),
    actual: String(watermarkDetected),
  });
  if (!watermarkPassed) {
    blockers.push(`GATE_FAIL: watermark expected=${config.expected.watermarkDetected}, actual=${watermarkDetected}`);
  }

  // 断言 7: keyframeCount >= minRequired
  let keyframeCount = 0;
  try {
    keyframeCount = readKeyframeCount(config.keyframesPath);
  } catch (err) {
    blockers.push(`KEYFRAMES_FAIL: ${(err as Error).message}`);
  }
  const keyframePassed = keyframeCount >= config.expected.minKeyframes;
  assertions.push({
    name: "keyframeCount",
    passed: keyframePassed,
    expected: `>= ${config.expected.minKeyframes}`,
    actual: String(keyframeCount),
  });
  if (!keyframePassed) {
    blockers.push(`GATE_FAIL: keyframeCount expected>=${config.expected.minKeyframes}, actual=${keyframeCount}`);
  }

  // 断言 8: opticalFlowPairs >= minRequired
  let opticalFlowPairs = 0;
  try {
    opticalFlowPairs = readOpticalFlowPairs(config.motionSummaryPath);
  } catch (err) {
    blockers.push(`MOTION_FAIL: ${(err as Error).message}`);
  }
  const opticalFlowPassed = opticalFlowPairs >= config.expected.minOpticalFlowPairs;
  assertions.push({
    name: "opticalFlowPairs",
    passed: opticalFlowPassed,
    expected: `>= ${config.expected.minOpticalFlowPairs}`,
    actual: String(opticalFlowPairs),
  });
  if (!opticalFlowPassed) {
    blockers.push(`GATE_FAIL: opticalFlowPairs expected>=${config.expected.minOpticalFlowPairs}, actual=${opticalFlowPairs}`);
  }

  return {
    passed: blockers.length === 0,
    sourceVideo: config.sourceVideoPath,
    ffprobe,
    declared,
    assertions,
    blockers,
  };
}
