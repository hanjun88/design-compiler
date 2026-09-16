#!/usr/bin/env node
/**
 * Fresh ReadPixels Capture for Byte-Level Golden Frame Comparison
 *
 * Launches headless Chromium with SwiftShader, renders the golden frame
 * reference triangle, captures gl.readPixels output, and saves it to a
 * temporary file for byte-level comparison against golden-frame.rgba.bin.
 *
 * Usage:
 *   node scripts/capture-fresh-readpixels.js [output_path]
 *
 * Default output: /tmp/fresh-golden-frame.rgba
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = process.argv[2] || '/tmp/fresh-golden-frame.rgba';
const HARNESS_PATH = path.join(__dirname, '..', 'tests', 'chinese-aesthetic', 'render', 'e2e', 'harness.html');
const CHROMIUM_PATH = '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

async function main() {
  console.log('=== Fresh ReadPixels Capture ===');
  console.log(`Harness: ${HARNESS_PATH}`);
  console.log(`Output:  ${OUTPUT_PATH}`);
  console.log('');

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--no-sandbox',
      '--disable-gpu-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 320, height: 240 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  await page.goto(`file://${HARNESS_PATH}`);
  await page.waitForTimeout(500);

  // Capture environment info
  const envInfo = await page.evaluate(() => {
    const canvas = window.__harness ? window.__harness.getCanvas() : document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      userAgent: navigator.userAgent,
      webglVersion: gl ? gl.getParameter(gl.VERSION) : 'null',
      vendor: gl ? gl.getParameter(gl.VENDOR) : 'null',
      renderer: gl ? gl.getParameter(gl.RENDERER) : 'null',
    };
  });
  console.log('Environment:');
  console.log(`  userAgent: ${envInfo.userAgent}`);
  console.log(`  gl.VERSION: ${envInfo.webglVersion}`);
  console.log(`  gl.VENDOR: ${envInfo.vendor}`);
  console.log(`  gl.RENDERER: ${envInfo.renderer}`);
  console.log('');

  // Render golden frame and capture readPixels
  const pixelData = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();

    const pipeline = new RP.GlPipeline({ canvas, initialTier: 'WEBGL2' });
    pipeline.dispatchInput('INITIALIZE');
    if (pipeline.powerSnapshot.state === 'THROTTLED') {
      pipeline.dispatchInput('VISIBILITY_VISIBLE');
    }

    pipeline.setRenderMode('standard');
    pipeline.setRenderMesh(RP.GOLDEN_FRAME_TRIANGLE);
    pipeline.updateCamera({
      eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0],
      fovYRad: Math.PI / 3, aspect: 320 / 240, near: 0.1, far: 100,
      viewportWidth: 320, viewportHeight: 240,
    });

    pipeline.renderFrame();
    const result = pipeline.readFramePixels();
    pipeline.dispose();

    return Array.from(result.data);
  });

  console.log(`Captured ${pixelData.length} bytes from gl.readPixels`);

  // Write to file
  const buffer = Buffer.from(pixelData);
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log(`Saved to ${OUTPUT_PATH} (${buffer.length} bytes)`);

  // Compute SHA-256 of fresh capture
  const crypto = require('crypto');
  const freshSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  console.log(`Fresh SHA-256: ${freshSha256}`);

  await browser.close();
  console.log('');
  console.log('Capture complete. Run:');
  console.log(`  node scripts/verify-golden-frame.js --compare ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
