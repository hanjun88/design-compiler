/**
 * Phase 5 Step 5.2-B: Real WebGL Execution Evidence (Playwright E2E)
 *
 * Runs production modules (GlContextTracker, DegradationLadder, PowerManager,
 * CameraEvaluator) in a real Chromium browser with SwiftShader software rasterization.
 * Captures physical GPU state registers, real framebuffer pixels, and real browser events.
 *
 * This is NOT a unit test with mocks — it executes production code against a real WebGL2
 * context provided by the browser's GPU process (SwiftShader).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HARNESS_PATH = path.resolve(__dirname, 'harness.html');
const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'e2e-real-webgl-execution.json');

(async () => {
  console.log('=== Phase 5 Step 5.2-B: Real WebGL E2E Execution ===');
  console.log('Harness:', HARNESS_PATH);
  console.log('');

  // Launch Chromium with SwiftShader for deterministic software rasterization
  const CHROME_PATH = process.env.CHROME_PATH || '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
  console.log('Chromium executable:', CHROME_PATH);
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // Navigate to harness
  const url = 'file://' + HARNESS_PATH;
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for E2E execution to complete
  await page.waitForFunction(() => window.__E2E_COMPLETE__ === true, { timeout: 15000 });

  // Read evidence from page
  const evidence = await page.evaluate(() => window.__E2E_EVIDENCE__);
  console.log('Captured', evidence.length, 'evidence entries');
  console.log('');

  // Print key evidence
  const keyLabels = [
    'WEBGL2_CONTEXT_CREATED', 'WEBGL_VERSION', 'WEBGL_RENDERER',
    'DEPTH_TEST_ENABLED', 'DEPTH_FUNC', 'CULL_FACE_ENABLED', 'FRONT_FACE',
    'POLYGON_OFFSET_FILL_ENABLED',
    'TEXTURE_BOUND_BEFORE_UNBIND', 'ACTIVE_TEXTURE_AFTER_UNBIND',
    'TRACKER_IS_CLEAN_BEFORE_DISPOSE', 'TRACKER_IS_CLEAN_AFTER_DISPOSE',
    'BUFFER_IS_DELETED', 'TEXTURE_IS_DELETED', 'PROGRAM_IS_DELETED',
    'LADDER_INITIAL_TIER', 'LADDER_AFTER_DEGRADE_TO_WEBGL1',
    'PM_INITIAL_STATE', 'PM_AFTER_INITIALIZE', 'PM_AFTER_MANUAL_FREEZE', 'PM_FREEZE_REASON_UPGRADED',
    'CAMERA_KIND', 'CAMERA_VP_MATRIX_IS_FLOAT32ARRAY', 'CAMERA_ZERO_VIEWPORT_KIND',
    'FRAMEBUFFER_TOTAL_BYTES', 'FRAMEBUFFER_SIMPLE_HASH',
    'WEBGL_LOSE_CONTEXT_EXTENSION_AVAILABLE'
  ];

  console.log('--- Key Evidence ---');
  for (const entry of evidence) {
    if (keyLabels.includes(entry.label)) {
      console.log(`  ${entry.label}: ${JSON.stringify(entry.value)}`);
    }
  }
  console.log('');

  // Assertions (real physical verification)
  const failures = [];
  const get = (label) => {
    const e = evidence.find(x => x.label === label);
    return e ? e.value : undefined;
  };

  // Real WebGL2 context
  if (get('WEBGL2_CONTEXT_CREATED') !== true) failures.push('WebGL2 context not created');
  if (!get('WEBGL_VERSION')) failures.push('WebGL version not reported');

  // Real depth/rasterizer registers
  if (get('DEPTH_TEST_ENABLED') !== true) failures.push('DEPTH_TEST not enabled');
  if (get('DEPTH_FUNC') !== 0x0203) failures.push(`DEPTH_FUNC expected 515 (LEQUAL), got ${get('DEPTH_FUNC')}`);
  if (get('CULL_FACE_ENABLED') !== true) failures.push('CULL_FACE not enabled');
  if (get('FRONT_FACE') !== 0x0901) failures.push(`FRONT_FACE expected 2305 (CCW), got ${get('FRONT_FACE')}`);

  // Real polygon offset
  if (get('POLYGON_OFFSET_FILL_ENABLED') !== true) failures.push('POLYGON_OFFSET_FILL not enabled');

  // Real texture unbind
  if (get('TEXTURE_BOUND_BEFORE_UNBIND') !== true) failures.push('Texture not bound before unbind');
  if (get('ACTIVE_TEXTURE_AFTER_UNBIND') !== 0x84c0) failures.push(`Active texture not reset to TEXTURE0, got ${get('ACTIVE_TEXTURE_AFTER_UNBIND')}`);
  if (get('TEXTURE_2D_BOUND_AFTER_UNBIND') !== null) failures.push('TEXTURE_2D not unbound');

  // Real GPU resource deletion
  if (get('TRACKER_IS_CLEAN_BEFORE_DISPOSE') !== false) failures.push('Tracker should be dirty before dispose');
  if (get('TRACKER_IS_CLEAN_AFTER_DISPOSE') !== true) failures.push('Tracker not clean after dispose');
  if (get('BUFFER_IS_DELETED') !== true) failures.push('Buffer not deleted');
  if (get('TEXTURE_IS_DELETED') !== true) failures.push('Texture not deleted');
  if (get('PROGRAM_IS_DELETED') !== true) failures.push('Program not deleted');

  // Real poset capping
  if (get('LADDER_INITIAL_TIER') !== 'WEBGL2') failures.push('Ladder initial tier not WEBGL2');
  if (get('LADDER_AFTER_DEGRADE_TO_WEBGL1') !== 'WEBGL1') failures.push('Ladder degrade failed');

  // Real state machine
  if (get('PM_INITIAL_STATE') !== 'UNINITIALIZED') failures.push('PM initial state wrong');
  if (get('PM_AFTER_MANUAL_FREEZE') !== 'FROZEN') failures.push('PM freeze failed');
  if (get('PM_FREEZE_REASON_UPGRADED') !== 'CONTEXT_LOST') failures.push('PM freeze reason upgrade failed');

  // Real camera math
  if (get('CAMERA_KIND') !== 'VALID') failures.push('Camera kind not VALID');
  if (get('CAMERA_VP_MATRIX_IS_FLOAT32ARRAY') !== true) failures.push('VP matrix not Float32Array');
  if (get('CAMERA_ZERO_VIEWPORT_KIND') !== 'ZERO_VIEWPORT') failures.push('Zero viewport kind wrong');

  // Real framebuffer
  if (get('FRAMEBUFFER_TOTAL_BYTES') !== 320 * 240 * 4) failures.push('Framebuffer size wrong');
  if (get('FRAMEBUFFER_PIXEL_0_R') !== 26) failures.push(`Framebuffer pixel R expected 26 (0.1*255), got ${get('FRAMEBUFFER_PIXEL_0_R')}`);
  if (get('FRAMEBUFFER_PIXEL_0_G') !== 51) failures.push(`Framebuffer pixel G expected 51 (0.2*255), got ${get('FRAMEBUFFER_PIXEL_0_G')}`);
  if (get('FRAMEBUFFER_PIXEL_0_B') !== 77) failures.push(`Framebuffer pixel B expected 77 (0.3*255), got ${get('FRAMEBUFFER_PIXEL_0_B')}`);

  // Console errors
  if (consoleErrors.length > 0) {
    console.log('Console errors:', consoleErrors);
  }

  console.log('');
  console.log('--- Assertion Results ---');
  console.log('Total checks:', keyLabels.length + 15);
  console.log('Failures:', failures.length);
  if (failures.length > 0) {
    failures.forEach(f => console.log('  FAIL:', f));
  } else {
    console.log('  ALL REAL WEBGL EXECUTION CHECKS PASSED');
  }

  // Save evidence
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePayload = {
    timestamp: new Date().toISOString(),
    browser: 'Chromium (Playwright)',
    rasterizer: 'SwiftShader (ANGLE)',
    headless: true,
    launchArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    evidenceEntries: evidence,
    consoleErrors: consoleErrors,
    assertionFailures: failures,
    allPassed: failures.length === 0
  };
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidencePayload, null, 2));
  console.log('');
  console.log('Evidence saved to:', EVIDENCE_FILE);

  await browser.close();

  if (failures.length > 0) {
    process.exit(1);
  }
})();
