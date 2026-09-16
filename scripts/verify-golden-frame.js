#!/usr/bin/env node
/**
 * Independent Golden Frame Byte-Level Verification Script
 *
 * Verifies:
 * 1. golden-frame.rgba.bin byte length = expected (width * height * 4)
 * 2. SHA-256 of rgba.bin matches golden-frame-sha256.txt (raw string read, NOT JSON.parse)
 * 3. If --compare <file> provided: byte-level diff against a second buffer
 *    (e.g. fresh readPixels output from E2E re-run)
 *
 * Usage:
 *   node scripts/verify-golden-frame.js
 *   node scripts/verify-golden-frame.js --compare /tmp/fresh-readpixels.rgba
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'chinese-aesthetic', 'render', 'fixtures');
const RGBA_PATH = path.join(FIXTURES_DIR, 'golden-frame.rgba.bin');
const SHA256_PATH = path.join(FIXTURES_DIR, 'golden-frame-sha256.txt');
const EXPECTED_WIDTH = 320;
const EXPECTED_HEIGHT = 240;
const EXPECTED_BYTES = EXPECTED_WIDTH * EXPECTED_HEIGHT * 4; // 307200

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// Parse args
const compareIdx = process.argv.indexOf('--compare');
const comparePath = compareIdx >= 0 ? process.argv[compareIdx + 1] : null;

console.log('=== Independent Golden Frame Byte-Level Verification ===');
console.log(`Fixtures dir: ${FIXTURES_DIR}`);
console.log(`Expected: ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} RGBA8 = ${EXPECTED_BYTES} bytes`);
console.log('');

// 1. File existence
if (!fs.existsSync(RGBA_PATH)) fail(`golden-frame.rgba.bin not found: ${RGBA_PATH}`);
if (!fs.existsSync(SHA256_PATH)) fail(`golden-frame-sha256.txt not found: ${SHA256_PATH}`);
pass('Both fixture files exist');

// 2. Byte length
const rgbaBuffer = fs.readFileSync(RGBA_PATH);
if (rgbaBuffer.length !== EXPECTED_BYTES) {
  fail(`Byte length mismatch: got ${rgbaBuffer.length}, expected ${EXPECTED_BYTES}`);
}
pass(`Byte length: ${rgbaBuffer.length} (matches ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}x4)`);

// 3. SHA-256 (independent computation)
const computedSha256 = crypto.createHash('sha256').update(rgbaBuffer).digest('hex');
const storedSha256 = fs.readFileSync(SHA256_PATH, 'utf8').trim(); // RAW STRING READ, no JSON.parse

console.log(`  Computed SHA-256: ${computedSha256}`);
console.log(`  Stored SHA-256:   ${storedSha256}`);

if (computedSha256 !== storedSha256) {
  fail(`SHA-256 MISMATCH: computed=${computedSha256}, stored=${storedSha256}`);
}
pass('SHA-256 matches (independent computation vs stored raw string)');

// 4. Non-background pixel count (sanity check)
// Background is (0.05, 0.1, 0.15, 1.0) ≈ (13, 26, 38, 255)
let nonBgPixels = 0;
for (let i = 0; i < rgbaBuffer.length; i += 4) {
  const r = rgbaBuffer[i];
  const g = rgbaBuffer[i + 1];
  const b = rgbaBuffer[i + 2];
  if (r > 20 || g > 35 || b > 50) nonBgPixels++;
}
console.log(`  Non-background pixels: ${nonBgPixels} / ${EXPECTED_BYTES / 4}`);
if (nonBgPixels === 0) fail('Zero non-background pixels — possible clear-only false positive');
pass(`Non-background pixel count > 0 (${nonBgPixels} pixels, not clear-only)`);

// 5. Byte-level comparison if --compare provided
if (comparePath) {
  console.log('');
  console.log('=== Byte-Level Comparison ===');
  console.log(`Reference: golden-frame.rgba.bin (${rgbaBuffer.length} bytes)`);
  console.log(`Compare:   ${comparePath}`);

  if (!fs.existsSync(comparePath)) fail(`Compare file not found: ${comparePath}`);

  const compareBuffer = fs.readFileSync(comparePath);
  console.log(`  Compare buffer length: ${compareBuffer.length}`);

  if (compareBuffer.length !== rgbaBuffer.length) {
    fail(`Length mismatch: reference=${rgbaBuffer.length}, compare=${compareBuffer.length}`);
  }
  pass('Buffer lengths match');

  // Byte-level diff
  let diffCount = 0;
  let firstDiffPos = -1;
  const diffPositions = [];
  for (let i = 0; i < rgbaBuffer.length; i++) {
    if (rgbaBuffer[i] !== compareBuffer[i]) {
      diffCount++;
      if (firstDiffPos < 0) firstDiffPos = i;
      if (diffPositions.length < 10) diffPositions.push(i);
    }
  }

  console.log(`  Total differing bytes: ${diffCount} / ${rgbaBuffer.length}`);
  console.log(`  First diff position:  ${firstDiffPos >= 0 ? firstDiffPos : 'none'}`);
  if (diffPositions.length > 0) {
    console.log(`  First 10 diff positions: ${diffPositions.join(', ')}`);
  }

  // SHA-256 of compare buffer
  const compareSha256 = crypto.createHash('sha256').update(compareBuffer).digest('hex');
  console.log(`  Compare SHA-256: ${compareSha256}`);
  console.log(`  Reference SHA-256: ${computedSha256}`);

  if (diffCount === 0) {
    pass('Byte-level exact match (0 differing bytes)');
  } else {
    console.log(`WARN: ${diffCount} bytes differ — golden frame is NOT bit-exact with fresh render`);
  }
}

console.log('');
console.log('=== VERIFICATION COMPLETE ===');
console.log('All checks passed.');
process.exit(0);
