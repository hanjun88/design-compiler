#!/usr/bin/env node
/**
 * scripts/verify-golden-frame.js
 * 黄金帧物理回读字节级核验工具 (R3.11)
 *
 * 容差隔离契约：
 *   STRICT_ZERO_PROBES (0 LSB 绝对全等)：清屏色四角点 + 裁剪越界点 (10,10)
 *   TOLERATED_PROBES (--tolerance, 默认 2 LSB)：中心插值点 (160,120) + 逐字节对账
 *   --strict-exact：所有探针强制 0 LSB
 *
 * 严格退出码契约：
 *   exit 0 — 全部断言通过
 *   exit 1 — 验证失败（SHA 清单不匹配、像素差异、清屏色违规、PNG 头损坏、字节不匹配）
 *   exit 2 — 用法错误（缺参数、文件不存在）
 *
 * 用法：
 *   node scripts/verify-golden-frame.js --bin <rgba.bin> [--png <png>] [--sha256 <file>] [--tolerance <N>] [--compare-bin <fresh.rgba>]
 *
 * --tolerance 单位：LSB（Least Significant Bit，整数 [0,255]），默认 2。
 *   2 LSB ⟺ Δ_NDC ≤ 2/255 ≈ 0.007843（与黄金帧卷宗 §2 理论误差上界一致）
 *
 * 渲染基线：Headless Chromium + ANGLE SwiftShader CPU 软光栅 WebGL2。
 * 着色器：'standard' 输出插值顶点色（非 NDC 编码）。
 * 清屏色：gl.clearColor(0.05, 0.1, 0.15, 1) → [13, 26, 38, 255]
 * 图元：golden-frame-reference 三角形（primitiveType: "triangles"），RGB 顶点插值
 */

const fs = require('fs');
const crypto = require('crypto');

// ── 常量 ──────────────────────────────────────────────────────────────
const EXPECTED_WIDTH = 320;
const EXPECTED_HEIGHT = 240;
const EXPECTED_BYTES = EXPECTED_WIDTH * EXPECTED_HEIGHT * 4; // 307200

// 源码真实清屏色：gl.clearColor(0.05, 0.1, 0.15, 1) → [13, 26, 38, 255]
const CLEAR_COLOR = [13, 26, 38, 255];

// 几何凸包绝对包络之外的 4 角点（三角形边界 x:127..192, y:95..152）
const CORNER_SAMPLES = [
  { x: 2,   y: 2   },
  { x: 317, y: 2   },
  { x: 2,   y: 237 },
  { x: 317, y: 237 },
];

// 几何语义探针：容差隔离
// STRICT_ZERO (0 LSB)：(10,10) 裁剪越界点，必须为清屏色
// TOLERATED (--tolerance)：(160,120) 中心插值点，允许浮点量化误差
const STRICT_ZERO_PROBES = [
  { name: 'FRUSTUM_CLIP_OUT_OF_BOUNDS', x: 10, y: 10, expected: CLEAR_COLOR },
];
const TOLERATED_PROBES = [
  { name: 'TRIANGLE_CENTER_RENDERED', x: 160, y: 120, expected: [129, 93, 95, 255] },
];

// 非背景像素精确计数（实测固定值，证明渲染确定性）
const EXPECTED_NON_BG_PIXELS = 1980;

// PNG 8 字节签名: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// ── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    bin: null,
    png: null,
    sha256File: null,
    compareBin: null,
    tolerance: 2, // 默认 2 LSB，绑定卷宗 §2 理论误差上界
    strictExact: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bin' && args[i + 1])       opts.bin = args[++i];
    else if (args[i] === '--png' && args[i + 1])  opts.png = args[++i];
    else if (args[i] === '--sha256' && args[i + 1]) opts.sha256File = args[++i];
    else if (args[i] === '--compare-bin' && args[i + 1]) opts.compareBin = args[++i];
    else if (args[i] === '--strict-exact') { opts.strictExact = true; opts.tolerance = 0; }
    else if (args[i] === '--tolerance' && args[i + 1]) {
      const t = parseInt(args[++i], 10);
      if (isNaN(t) || t < 0 || t > 255) {
        console.error(`[-] FATAL: --tolerance must be integer 0..255, got "${args[i]}"`);
        process.exit(2);
      }
      opts.tolerance = t;
    } else {
      console.error(`[-] FATAL: Unknown or incomplete argument: "${args[i]}"`);
      process.exit(2);
    }
  }

  if (!opts.bin) {
    console.error('[-] FATAL: Missing mandatory --bin <path>');
    console.error('    Usage: node scripts/verify-golden-frame.js --bin <rgba.bin> [--png <png>] [--sha256 <file>] [--tolerance N] [--compare-bin <fresh.rgba>]');
    process.exit(2);
  }
  return opts;
}

// ── 辅助 ──────────────────────────────────────────────────────────────
function fail(msg) { console.error(`[-] ${msg}`); process.exit(1); }
function pass(msg) { console.log(`[+] ${msg}`); }

function pixelAt(buf, x, y) {
  const idx = (y * EXPECTED_WIDTH + x) * 4;
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

function pixelDelta(a, b) {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

// ── 主流程 ────────────────────────────────────────────────────────────
const opts = parseArgs();

console.log('=== RENDER-07C Golden Frame Byte-Level Verification (R3.11) ===');
console.log(`  bin:       ${opts.bin}`);
console.log(`  tolerance: ${opts.tolerance} LSB (Δ_NDC ≤ ${opts.tolerance}/255 ≈ ${(opts.tolerance/255).toFixed(5)})`);
console.log(`  expected:  ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} RGBA8 = ${EXPECTED_BYTES} bytes`);
console.log(`  baseline:  Headless Chromium + ANGLE SwiftShader CPU soft-rasterizer`);
console.log('');

// 1. 文件存在性
if (!fs.existsSync(opts.bin)) {
  console.error(`[-] FATAL: bin file not found: ${opts.bin}`);
  process.exit(2);
}

// 2. 字节长度
const binBuffer = fs.readFileSync(opts.bin);
if (binBuffer.length !== EXPECTED_BYTES) {
  fail(`Binary size mismatch: expected ${EXPECTED_BYTES}, got ${binBuffer.length}`);
}
pass(`Byte length: ${binBuffer.length} (matches ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}x4)`);

// 3. SHA-256 清单独立读取与严格比对（R3.9 恢复）
const sha256Path = opts.sha256File || `${opts.bin}.sha256`;
if (!fs.existsSync(sha256Path)) {
  fail(`SHA256_MANIFEST_MISSING: ${sha256Path}`);
}
const computedSha = crypto.createHash('sha256').update(binBuffer).digest('hex');
const manifestRaw = fs.readFileSync(sha256Path, 'utf8').trim();
const manifestSha = manifestRaw.split(/\s+/)[0].toLowerCase();
if (computedSha.toLowerCase() !== manifestSha) {
  fail(`SHA256_MANIFEST_MISMATCH: computed=${computedSha}, manifest=${manifestSha}`);
}
pass(`SHA256 manifest verified: ${computedSha} (independent read from ${sha256Path})`);

// 4. PNG 物理二进制头校验（Magic Bytes + IHDR 尺寸解析，零外部依赖）
if (opts.png) {
  console.log('');
  console.log('--- PNG binary header validation ---');
  if (!fs.existsSync(opts.png)) {
    console.error(`[-] FATAL: png file not found: ${opts.png}`);
    process.exit(2);
  }
  const pngBuffer = fs.readFileSync(opts.png);
  if (pngBuffer.length < 24 || !pngBuffer.subarray(0, 8).equals(PNG_MAGIC)) {
    fail('PNG_BINARY_CORRUPT: invalid PNG signature header');
  }
  const chunkType = pngBuffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    fail(`PNG_IHDR_CORRUPT: expected first chunk "IHDR", got "${chunkType}"`);
  }
  const pngWidth = pngBuffer.readUInt32BE(16);
  const pngHeight = pngBuffer.readUInt32BE(20);
  if (pngWidth !== EXPECTED_WIDTH || pngHeight !== EXPECTED_HEIGHT) {
    fail(`PNG_DIMENSION_MISMATCH: expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}, parsed ${pngWidth}x${pngHeight}`);
  }
  const pngSha = crypto.createHash('sha256').update(pngBuffer).digest('hex');
  pass(`PNG_HEADER_IHDR_VERIFIED: magic+IHDR OK, ${pngWidth}x${pngHeight}, ${pngBuffer.length} bytes, SHA-256: ${pngSha}`);
  console.log('  NOTE: IDAT pixel decode and RGBA.bin byte-level comparison NOT performed (scope: header only)');
}

// 5. 四角点清屏色硬断言（STRICT_ZERO: 0 LSB 绝对全等）
console.log('');
console.log('--- Clear-color corner assertions (STRICT_ZERO, 0 LSB) ---');
for (const pt of CORNER_SAMPLES) {
  const actual = pixelAt(binBuffer, pt.x, pt.y);
  const delta = pixelDelta(actual, CLEAR_COLOR);
  if (delta !== 0) {
    fail(`CLEAR_COLOR_VIOLATION at (${pt.x},${pt.y}): expected ${JSON.stringify(CLEAR_COLOR)}, got ${JSON.stringify(actual)}, Δ_max=${delta} LSB (requires 0)`);
  }
  console.log(`  (${String(pt.x).padStart(3)},${String(pt.y).padStart(3)}) = ${JSON.stringify(actual)}  Δ_max=${delta} LSB  OK`);
}
pass('All 4 corner samples match clear color strictly (0 LSB)');

// 6. 几何语义探针（容差隔离）
console.log('');
console.log('--- Geometric semantic probes ---');
console.log('  [STRICT_ZERO probes: 0 LSB absolute equality]');
for (const probe of STRICT_ZERO_PROBES) {
  const actual = pixelAt(binBuffer, probe.x, probe.y);
  const delta = pixelDelta(actual, probe.expected);
  if (delta !== 0) {
    fail(`STRICT_PROBE_FAIL: ${probe.name} at (${probe.x},${probe.y}): expected ${JSON.stringify(probe.expected)}, got ${JSON.stringify(actual)}, Δ_max=${delta} LSB (requires 0)`);
  }
  console.log(`  ${probe.name} (${probe.x},${probe.y}) = ${JSON.stringify(actual)}  Δ_max=${delta} LSB  OK`);
}
console.log(`  [TOLERATED probes: ${opts.tolerance} LSB]`);
for (const probe of TOLERATED_PROBES) {
  const actual = pixelAt(binBuffer, probe.x, probe.y);
  const delta = pixelDelta(actual, probe.expected);
  if (delta > opts.tolerance) {
    fail(`TOLERATED_PROBE_FAIL: ${probe.name} at (${probe.x},${probe.y}): expected ${JSON.stringify(probe.expected)}, got ${JSON.stringify(actual)}, Δ_max=${delta} LSB > tol=${opts.tolerance}`);
  }
  console.log(`  ${probe.name} (${probe.x},${probe.y}) = ${JSON.stringify(actual)}  Δ_max=${delta} LSB  OK`);
}
pass('Geometric semantic probes verified (tolerance-isolated)');

// 7. 非背景像素统计（防止清屏-only 假阳性）
let nonBgPixels = 0;
for (let i = 0; i < binBuffer.length; i += 4) {
  const p = [binBuffer[i], binBuffer[i + 1], binBuffer[i + 2], binBuffer[i + 3]];
  if (pixelDelta(p, CLEAR_COLOR) > opts.tolerance) nonBgPixels++;
}
console.log(`  Non-background pixels: ${nonBgPixels} / ${EXPECTED_BYTES / 4} (expected ${EXPECTED_NON_BG_PIXELS})`);
if (nonBgPixels === 0) fail('Zero non-background pixels — possible clear-only false positive');
if (nonBgPixels !== EXPECTED_NON_BG_PIXELS) {
  fail(`NON_BG_PIXEL_COUNT_MISMATCH: expected ${EXPECTED_NON_BG_PIXELS}, got ${nonBgPixels} (rendering nondeterminism or geometry change)`);
}
pass(`Non-background pixel count exact match: ${nonBgPixels} == ${EXPECTED_NON_BG_PIXELS}`);

// 8. 逐字节对账（若提供 --compare-bin）
if (opts.compareBin) {
  console.log('');
  console.log('--- Byte-level comparison against fresh render ---');
  if (!fs.existsSync(opts.compareBin)) {
    console.error(`[-] FATAL: compare-bin file not found: ${opts.compareBin}`);
    process.exit(2);
  }
  const cmpBuffer = fs.readFileSync(opts.compareBin);
  if (cmpBuffer.length !== EXPECTED_BYTES) {
    fail(`Compare buffer size mismatch: expected ${EXPECTED_BYTES}, got ${cmpBuffer.length}`);
  }

  let diffBytes = 0;
  let maxDelta = 0;
  let firstDiffPos = -1;
  for (let i = 0; i < EXPECTED_BYTES; i++) {
    const delta = Math.abs(binBuffer[i] - cmpBuffer[i]);
    if (delta > opts.tolerance) {
      diffBytes++;
      if (delta > maxDelta) maxDelta = delta;
      if (firstDiffPos < 0) firstDiffPos = i;
    }
  }

  const cmpSha = crypto.createHash('sha256').update(cmpBuffer).digest('hex');
  console.log(`  Reference SHA-256: ${computedSha}`);
  console.log(`  Compare   SHA-256: ${cmpSha}`);
  console.log(`  Differing bytes:   ${diffBytes} / ${EXPECTED_BYTES} (tolerance=${opts.tolerance} LSB)`);
  console.log(`  Max delta:         ${maxDelta} LSB`);
  if (firstDiffPos >= 0) {
    const px = Math.floor(firstDiffPos / 4);
    console.log(`  First diff at byte ${firstDiffPos} (pixel x=${px % EXPECTED_WIDTH}, y=${Math.floor(px / EXPECTED_WIDTH)}, ch=${firstDiffPos % 4})`);
  }

  if (diffBytes > 0) {
    fail(`VERIFICATION_FAILURE: ${diffBytes} bytes exceed tolerance (${opts.tolerance} LSB). Golden frame is NOT bit-exact with fresh render.`);
  }
  pass(`BYTE_EXACT_MATCH: all ${EXPECTED_BYTES} bytes within tolerance ${opts.tolerance} LSB`);
}

// ── 完成 ──────────────────────────────────────────────────────────────
console.log('');
console.log('=== RENDER-07C VERIFICATION: PASS ===');
process.exit(0);
