#!/usr/bin/env node
/**
 * scripts/verify-golden-frame.js
 * 黄金帧物理回读字节级核验工具
 *
 * 严格退出码契约：
 *   exit 0 — 全部断言通过
 *   exit 1 — 验证失败（像素差异、清屏色违规、字节不匹配）
 *   exit 2 — 用法错误（缺参数、文件不存在）
 *
 * 用法：
 *   node scripts/verify-golden-frame.js --bin <rgba.bin> [--png <png>] [--tolerance <N>] [--compare-bin <fresh.rgba>]
 *
 * --tolerance 单位：LSB（Least Significant Bit，整数 [0,255]），默认 0（严格全等）
 *   tolerance=2 ⟹ Δ_byte ≤ 2 LSB ⟺ Δ_NDC ≤ 2/255 ≈ 0.007843
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

// ── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { bin: null, png: null, compareBin: null, tolerance: 0 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bin' && args[i + 1])       opts.bin = args[++i];
    else if (args[i] === '--png' && args[i + 1])  opts.png = args[++i];
    else if (args[i] === '--compare-bin' && args[i + 1]) opts.compareBin = args[++i];
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
    console.error('    Usage: node scripts/verify-golden-frame.js --bin <rgba.bin> [--tolerance N] [--compare-bin <fresh.rgba>]');
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

// ── 主流程 ────────────────────────────────────────────────────────────
const opts = parseArgs();

console.log('=== RENDER-07C Golden Frame Byte-Level Verification ===');
console.log(`  bin:       ${opts.bin}`);
console.log(`  tolerance: ${opts.tolerance} LSB (Δ_NDC ≤ ${opts.tolerance}/255)`);
console.log(`  expected:  ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} RGBA8 = ${EXPECTED_BYTES} bytes`);
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

// 3. SHA-256 独立计算
const computedSha = crypto.createHash('sha256').update(binBuffer).digest('hex');
console.log(`  SHA-256: ${computedSha}`);

// 4. 四角点清屏色硬断言
console.log('');
console.log('--- Clear-color corner assertions (source: clearColor(0.05,0.1,0.15) → [13,26,38,255]) ---');
for (const pt of CORNER_SAMPLES) {
  const actual = pixelAt(binBuffer, pt.x, pt.y);
  const maxDelta = Math.max(...actual.map((v, c) => Math.abs(v - CLEAR_COLOR[c])));
  if (maxDelta > opts.tolerance) {
    fail(`CLEAR_COLOR_VIOLATION at (${pt.x},${pt.y}): expected ${JSON.stringify(CLEAR_COLOR)}, got ${JSON.stringify(actual)}, max_delta=${maxDelta} LSB`);
  }
  console.log(`  (${String(pt.x).padStart(3)},${String(pt.y).padStart(3)}) = ${JSON.stringify(actual)}  Δ_max=${maxDelta} LSB  OK`);
}
pass('All 4 corner samples match clear color within tolerance');

// 5. 非背景像素统计（防止清屏-only 假阳性）
let nonBgPixels = 0;
for (let i = 0; i < binBuffer.length; i += 4) {
  const r = binBuffer[i], g = binBuffer[i + 1], b = binBuffer[i + 2];
  if (Math.abs(r - CLEAR_COLOR[0]) > opts.tolerance ||
      Math.abs(g - CLEAR_COLOR[1]) > opts.tolerance ||
      Math.abs(b - CLEAR_COLOR[2]) > opts.tolerance) {
    nonBgPixels++;
  }
}
console.log(`  Non-background pixels: ${nonBgPixels} / ${EXPECTED_BYTES / 4}`);
if (nonBgPixels === 0) fail('Zero non-background pixels — possible clear-only false positive');
pass(`Non-background pixel count > 0 (${nonBgPixels} pixels)`);

// 6. PNG 存在性检查（若提供）
if (opts.png) {
  console.log('');
  if (!fs.existsSync(opts.png)) {
    console.error(`[-] FATAL: png file not found: ${opts.png}`);
    process.exit(2);
  }
  const pngStat = fs.statSync(opts.png);
  const pngSha = crypto.createHash('sha256').update(fs.readFileSync(opts.png)).digest('hex');
  console.log(`  PNG: ${opts.png} (${pngStat.size} bytes, SHA-256: ${pngSha})`);
  pass('PNG companion file exists');
}

// 7. 逐字节对账（若提供 --compare-bin）
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
    console.log(`  First diff at byte offset ${firstDiffPos} (pixel x=${px % EXPECTED_WIDTH}, y=${Math.floor(px / EXPECTED_WIDTH)}, channel=${firstDiffPos % 4})`);
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
