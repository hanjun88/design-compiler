/**
 * Phase 5 Step 5.2-B: Complete Real Shader & Draw Pipeline E2E (Playwright)
 *
 * Runs production modules in real Chromium + SwiftShader.
 * Tests:
 *   1. Environment info (userAgent, gl.VERSION raw strings)
 *   2. Basic WebGL2 context & state registers (42-item baseline)
 *   3. Real shader compilation & linking (NDC-encode + standard)
 *   4. NDC camera-matrix pixel-causal verification (3 poses x 3 vertices)
 *   5. Near-plane hardware clipping (partial-visible + fully-invisible)
 *   6. Golden frame generation (RGBA + SHA-256)
 *
 * Conforms to CHINESE-AESTHETIC-P5-S5.2-PLAN-02
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HARNESS_PATH = path.resolve(__dirname, 'harness.html');
const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'e2e-real-webgl-execution.json');

// Ensure directories exist
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });

(async () => {
  console.log('=== Phase 5 Step 5.2-B: Complete Real Shader & Draw Pipeline E2E ===');
  console.log('Harness:', HARNESS_PATH);
  console.log('');

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

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const url = 'file://' + HARNESS_PATH;
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for bundle to load
  await page.waitForFunction(() => typeof window.RenderPipeline !== 'undefined' && typeof window.__harness !== 'undefined', { timeout: 10000 });

  const evidence = {
    timestamp: new Date().toISOString(),
    browser: 'Chromium (Playwright)',
    rasterizer: 'SwiftShader (ANGLE)',
    chromeExecutable: CHROME_PATH,
    evidenceEntries: [],
    assertionFailures: [],
    allPassed: true
  };

  function record(id, value, passed, detail) {
    evidence.evidenceEntries.push({ id, value, passed: !!passed, detail: detail || '' });
    if (!passed) {
      evidence.assertionFailures.push({ id, value, detail: detail || '' });
      evidence.allPassed = false;
    }
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${id}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }

  // ─── Test 1: Environment Info ───
  console.log('\n--- Test 1: Environment Info ---');
  const env = await page.evaluate(() => window.__harness.getEnvironment());
  record('ENV_USER_AGENT', env.userAgent, !!env.userAgent && env.userAgent.length > 0);
  record('ENV_WEBGL_VERSION', env.webglVersion, !!env.webglVersion && env.webglVersion.includes('WebGL'));
  record('ENV_WEBGL_VENDOR', env.webglVendor, !!env.webglVendor);
  record('ENV_WEBGL_RENDERER', env.webglRenderer, !!env.webglRenderer);
  record('ENV_SHADING_LANGUAGE_VERSION', env.shadingLanguageVersion, !!env.shadingLanguageVersion);
  record('ENV_CANVAS_SIZE', `${env.canvasWidth}x${env.canvasHeight}`, env.canvasWidth === 320 && env.canvasHeight === 240);

  // ─── Test 2: Basic WebGL2 Context & State Registers ───
  console.log('\n--- Test 2: Basic WebGL2 Context & State Registers ---');
  const basicResults = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();
    const gl = canvas.getContext('webgl2');
    const results = {};

    // Context
    results.WEBGL2_CONTEXT_CREATED = !!gl;
    results.WEBGL_VERSION = gl ? gl.getParameter(gl.VERSION) : null;

    // State registers via GlContextTracker
    const tracker = new RP.GlContextTracker(gl, 'WEBGL2');
    tracker.applyDepthAndRasterizerDefaults();
    results.DEPTH_TEST_ENABLED = gl.isEnabled(gl.DEPTH_TEST);
    results.DEPTH_FUNC = gl.getParameter(gl.DEPTH_FUNC);
    results.DEPTH_MASK = gl.getParameter(gl.DEPTH_WRITEMASK);
    results.CLEAR_DEPTH = gl.getParameter(gl.DEPTH_CLEAR_VALUE);
    results.FRONT_FACE = gl.getParameter(gl.FRONT_FACE);
    results.CULL_FACE_ENABLED = gl.isEnabled(gl.CULL_FACE);
    results.CULL_FACE_MODE = gl.getParameter(gl.CULL_FACE_MODE);

    // Polygon offset
    tracker.setPolygonOffsetEnabled(true);
    results.POLYGON_OFFSET_ENABLED = gl.isEnabled(gl.POLYGON_OFFSET_FILL);
    results.POLYGON_OFFSET_FACTOR = gl.getParameter(gl.POLYGON_OFFSET_FACTOR);
    results.POLYGON_OFFSET_UNITS = gl.getParameter(gl.POLYGON_OFFSET_UNITS);

    // Texture unbind
    tracker.unbindAllResources();
    results.ACTIVE_TEXTURE_AFTER_UNBIND = gl.getParameter(gl.ACTIVE_TEXTURE);
    results.TEXTURE_2D_BOUND_AFTER_UNBIND = gl.getParameter(gl.TEXTURE_BINDING_2D);
    results.TEXTURE_CUBE_BOUND_AFTER_UNBIND = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP);

    // Resource lifecycle (bind first so isBuffer/isTexture return true)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    results.BUFFER_CREATED = gl.isBuffer(buf);
    tracker.trackBuffer(buf);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    results.TEXTURE_CREATED = gl.isTexture(tex);
    tracker.trackTexture(tex);
    const prog = gl.createProgram();
    results.PROGRAM_CREATED = gl.isProgram(prog);
    tracker.trackProgram(prog);

    tracker.disposeAll();
    results.BUFFER_IS_DELETED = !gl.isBuffer(buf);
    results.TEXTURE_IS_DELETED = !gl.isTexture(tex);
    results.PROGRAM_IS_DELETED = !gl.isProgram(prog);
    results.TRACKER_IS_CLEAN = tracker.isClean;

    // Framebuffer clear + readPixels
    gl.viewport(0, 0, 320, 240);
    gl.clearColor(0.1, 0.2, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixels = new Uint8Array(320 * 240 * 4);
    gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    results.FRAMEBUFFER_TOTAL_BYTES = pixels.length;
    results.PIXEL_0_0_R = pixels[0];
    results.PIXEL_0_0_G = pixels[1];
    results.PIXEL_0_0_B = pixels[2];
    results.PIXEL_0_0_A = pixels[3];

    // WEBGL_lose_context extension
    const loseExt = gl.getExtension('WEBGL_lose_context');
    results.WEBGL_LOSE_CONTEXT_AVAILABLE = !!loseExt;

    return results;
  });

  record('WEBGL2_CONTEXT_CREATED', basicResults.WEBGL2_CONTEXT_CREATED, basicResults.WEBGL2_CONTEXT_CREATED);
  record('WEBGL_VERSION', basicResults.WEBGL_VERSION, !!basicResults.WEBGL_VERSION && basicResults.WEBGL_VERSION.includes('WebGL 2'));
  record('DEPTH_TEST_ENABLED', basicResults.DEPTH_TEST_ENABLED, basicResults.DEPTH_TEST_ENABLED === true);
  record('DEPTH_FUNC', basicResults.DEPTH_FUNC, basicResults.DEPTH_FUNC === 515); // LEQUAL=0x0203
  record('FRONT_FACE', basicResults.FRONT_FACE, basicResults.FRONT_FACE === 2305); // CCW=0x0901
  record('CULL_FACE_ENABLED', basicResults.CULL_FACE_ENABLED, basicResults.CULL_FACE_ENABLED === true);
  record('POLYGON_OFFSET_ENABLED', basicResults.POLYGON_OFFSET_ENABLED, basicResults.POLYGON_OFFSET_ENABLED === true);
  record('ACTIVE_TEXTURE_AFTER_UNBIND', basicResults.ACTIVE_TEXTURE_AFTER_UNBIND, basicResults.ACTIVE_TEXTURE_AFTER_UNBIND === 33984); // TEXTURE0
  record('TEXTURE_2D_BOUND_AFTER_UNBIND', basicResults.TEXTURE_2D_BOUND_AFTER_UNBIND, basicResults.TEXTURE_2D_BOUND_AFTER_UNBIND === null);
  record('BUFFER_CREATED', basicResults.BUFFER_CREATED, basicResults.BUFFER_CREATED === true);
  record('TEXTURE_CREATED', basicResults.TEXTURE_CREATED, basicResults.TEXTURE_CREATED === true);
  record('PROGRAM_CREATED', basicResults.PROGRAM_CREATED, basicResults.PROGRAM_CREATED === true);
  record('BUFFER_IS_DELETED', basicResults.BUFFER_IS_DELETED, basicResults.BUFFER_IS_DELETED === true);
  record('TEXTURE_IS_DELETED', basicResults.TEXTURE_IS_DELETED, basicResults.TEXTURE_IS_DELETED === true);
  record('PROGRAM_IS_DELETED', basicResults.PROGRAM_IS_DELETED, basicResults.PROGRAM_IS_DELETED === true);
  record('TRACKER_IS_CLEAN', basicResults.TRACKER_IS_CLEAN, basicResults.TRACKER_IS_CLEAN === true);
  record('FRAMEBUFFER_TOTAL_BYTES', basicResults.FRAMEBUFFER_TOTAL_BYTES, basicResults.FRAMEBUFFER_TOTAL_BYTES === 307200);
  record('PIXEL_0_0_R', basicResults.PIXEL_0_0_R, Math.abs(basicResults.PIXEL_0_0_R - 26) <= 1); // 0.1*255≈25.5
  record('PIXEL_0_0_G', basicResults.PIXEL_0_0_G, Math.abs(basicResults.PIXEL_0_0_G - 51) <= 1); // 0.2*255≈51
  record('PIXEL_0_0_B', basicResults.PIXEL_0_0_B, Math.abs(basicResults.PIXEL_0_0_B - 77) <= 1); // 0.3*255≈76.5
  record('WEBGL_LOSE_CONTEXT_AVAILABLE', basicResults.WEBGL_LOSE_CONTEXT_AVAILABLE, basicResults.WEBGL_LOSE_CONTEXT_AVAILABLE === true);

  // ─── Test 3: Real Shader Compilation & Linking ───
  console.log('\n--- Test 3: Real Shader Compilation & Linking ---');
  const shaderResults = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();
    const gl = canvas.getContext('webgl2');
    const results = {};

    // Compile NDC shader pair
    try {
      const ndcResult = RP.compileShaderProgram(gl, RP.NDC_VERTEX_SHADER, RP.NDC_FRAGMENT_SHADER);
      results.NDC_VERTEX_COMPILE_OK = true;
      results.NDC_FRAGMENT_COMPILE_OK = true;
      results.NDC_PROGRAM_LINK_OK = ndcResult.linkStatus;
      results.NDC_PROGRAM_IS_PROGRAM = gl.isProgram(ndcResult.program);
      results.NDC_UNIFORM_LOCATION = gl.getUniformLocation(ndcResult.program, 'uViewProjection') !== null;
      RP.disposeShaderProgram(gl, ndcResult);
      results.NDC_PROGRAM_DISPOSED = !gl.isProgram(ndcResult.program);
    } catch (e) {
      results.NDC_COMPILE_ERROR = e.message;
      results.NDC_VERTEX_COMPILE_OK = false;
      results.NDC_FRAGMENT_COMPILE_OK = false;
      results.NDC_PROGRAM_LINK_OK = false;
    }

    // Compile standard shader pair
    try {
      const stdResult = RP.compileShaderProgram(gl, RP.STANDARD_VERTEX_SHADER, RP.STANDARD_FRAGMENT_SHADER);
      results.STD_VERTEX_COMPILE_OK = true;
      results.STD_FRAGMENT_COMPILE_OK = true;
      results.STD_PROGRAM_LINK_OK = stdResult.linkStatus;
      results.STD_PROGRAM_IS_PROGRAM = gl.isProgram(stdResult.program);
      results.STD_UNIFORM_LOCATION = gl.getUniformLocation(stdResult.program, 'uViewProjection') !== null;
      RP.disposeShaderProgram(gl, stdResult);
      results.STD_PROGRAM_DISPOSED = !gl.isProgram(stdResult.program);
    } catch (e) {
      results.STD_COMPILE_ERROR = e.message;
      results.STD_VERTEX_COMPILE_OK = false;
      results.STD_FRAGMENT_COMPILE_OK = false;
      results.STD_PROGRAM_LINK_OK = false;
    }

    return results;
  });

  record('NDC_VERTEX_COMPILE_OK', shaderResults.NDC_VERTEX_COMPILE_OK, shaderResults.NDC_VERTEX_COMPILE_OK === true);
  record('NDC_FRAGMENT_COMPILE_OK', shaderResults.NDC_FRAGMENT_COMPILE_OK, shaderResults.NDC_FRAGMENT_COMPILE_OK === true);
  record('NDC_PROGRAM_LINK_OK', shaderResults.NDC_PROGRAM_LINK_OK, shaderResults.NDC_PROGRAM_LINK_OK === true);
  record('NDC_PROGRAM_IS_PROGRAM', shaderResults.NDC_PROGRAM_IS_PROGRAM, shaderResults.NDC_PROGRAM_IS_PROGRAM === true);
  record('NDC_UNIFORM_LOCATION_FOUND', shaderResults.NDC_UNIFORM_LOCATION, shaderResults.NDC_UNIFORM_LOCATION === true);
  record('NDC_PROGRAM_DISPOSED', shaderResults.NDC_PROGRAM_DISPOSED, shaderResults.NDC_PROGRAM_DISPOSED === true);
  record('STD_VERTEX_COMPILE_OK', shaderResults.STD_VERTEX_COMPILE_OK, shaderResults.STD_VERTEX_COMPILE_OK === true);
  record('STD_FRAGMENT_COMPILE_OK', shaderResults.STD_FRAGMENT_COMPILE_OK, shaderResults.STD_FRAGMENT_COMPILE_OK === true);
  record('STD_PROGRAM_LINK_OK', shaderResults.STD_PROGRAM_LINK_OK, shaderResults.STD_PROGRAM_LINK_OK === true);
  record('STD_PROGRAM_IS_PROGRAM', shaderResults.STD_PROGRAM_IS_PROGRAM, shaderResults.STD_PROGRAM_IS_PROGRAM === true);
  record('STD_UNIFORM_LOCATION_FOUND', shaderResults.STD_UNIFORM_LOCATION, shaderResults.STD_UNIFORM_LOCATION === true);
  record('STD_PROGRAM_DISPOSED', shaderResults.STD_PROGRAM_DISPOSED, shaderResults.STD_PROGRAM_DISPOSED === true);

  // ─── Test 4: NDC Camera-Matrix Pixel-Causal Verification ───
  console.log('\n--- Test 4: NDC Camera-Matrix Pixel-Causal Verification ---');
  const ndcResults = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();
    const gl = canvas.getContext('webgl2');
    const results = { poses: [], allPassed: true };

    const poses = [
      { name: 'front', eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0] },
      { name: 'side', eye: [3, 0, 5], target: [0, 0, 0], up: [0, 1, 0] },
      { name: 'back', eye: [0, 0, -5], target: [0, 0, 0], up: [0, 1, 0] },
    ];

    const testVertices = RP.NDC_TEST_VERTICES;

    // Create ONE pipeline reused across all poses (avoid context state pollution)
    const pipeline = new RP.GlPipeline({ canvas, initialTier: 'WEBGL2' });
    pipeline.dispatchInput('INITIALIZE');
    if (pipeline.powerSnapshot.state === 'THROTTLED') pipeline.dispatchInput('VISIBILITY_VISIBLE');
    pipeline.setRenderMode('ndc-encode');
    pipeline.setRenderMesh(RP.NDC_TEST_MESH);

    for (const pose of poses) {
      const poseResult = { name: pose.name, vertices: [] };

      // Clear gl errors before render
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }

      // Update camera
      const camInputs = {
        eye: pose.eye, target: pose.target, up: pose.up,
        fovYRad: Math.PI / 3, aspect: 320 / 240, near: 0.1, far: 100,
        viewportWidth: 320, viewportHeight: 240
      };
      const evaluated = pipeline.updateCamera(camInputs);

      // CPU-side expected NDC for each vertex
      const vp = evaluated.viewProjectionMatrix;
      const expectedNdc = testVertices.map(v => {
        const cx = vp[0]*v.x + vp[4]*v.y + vp[8]*v.z + vp[12];
        const cy = vp[1]*v.x + vp[5]*v.y + vp[9]*v.z + vp[13];
        const cz = vp[2]*v.x + vp[6]*v.y + vp[10]*v.z + vp[14];
        const cw = vp[3]*v.x + vp[7]*v.y + vp[11]*v.z + vp[15];
        return { x: cx/cw, y: cy/cw, z: cz/cw, w: cw };
      });

      // Render
      pipeline.renderFrame();

      // Check gl errors after render
      const glErrors = [];
      let err;
      while ((err = gl.getError()) !== gl.NO_ERROR) { glErrors.push(err); }

      // Read pixels
      const pixelResult = pipeline.readFramePixels();
      const pixels = pixelResult.data;
      const w = pixelResult.width, h = pixelResult.height;

      // Find non-background pixels and decode NDC
      const decodedPoints = [];
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const idx = (py * w + px) * 4;
          const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2], a = pixels[idx+3];
          if (b === 0 && a === 255 && (r > 1 || g > 1)) {
            const ndcX = RP.decodeByteToNdc(r);
            const ndcY = RP.decodeByteToNdc(g);
            decodedPoints.push({ px, py, ndcX, ndcY, r, g });
          }
        }
      }

      // Match decoded points to expected vertices (closest match)
      for (let vi = 0; vi < expectedNdc.length; vi++) {
        const exp = expectedNdc[vi];
        let bestMatch = null;
        let bestDist = Infinity;
        for (const dp of decodedPoints) {
          const dist = Math.abs(dp.ndcX - exp.x) + Math.abs(dp.ndcY - exp.y);
          if (dist < bestDist) { bestDist = dist; bestMatch = dp; }
        }
        const tolerance = RP.NDC_DECODE_TOLERANCE;
        const passed = bestMatch !== null &&
          Math.abs(bestMatch.ndcX - exp.x) <= tolerance &&
          Math.abs(bestMatch.ndcY - exp.y) <= tolerance;

        poseResult.vertices.push({
          index: vi,
          expectedNdc: { x: exp.x, y: exp.y },
          decodedNdc: bestMatch ? { x: bestMatch.ndcX, y: bestMatch.ndcY } : null,
          error: bestMatch ? { x: Math.abs(bestMatch.ndcX - exp.x), y: Math.abs(bestMatch.ndcY - exp.y) } : null,
          tolerance,
          passed
        });
        if (!passed) results.allPassed = false;
      }

      results.poses.push({
        name: pose.name,
        vertices: poseResult.vertices,
        debug: {
          powerState: pipeline.powerSnapshot.state,
          glErrors,
          expectedNdc: expectedNdc.map(e => ({ x: e.x, y: e.y, w: e.w })),
          decodedPointCount: decodedPoints.length,
          samplePixels: decodedPoints.slice(0, 5).map(dp => ({ px: dp.px, py: dp.py, r: dp.r, g: dp.g, ndcX: dp.ndcX, ndcY: dp.ndcY }))
        }
      });
    }

    pipeline.dispose();
    return results;
  });

  record('NDC_VERIFICATION_ALL_POSES_PASSED', ndcResults.allPassed, ndcResults.allPassed === true);
  // DEBUG: print NDC verification details
  for (const pose of ndcResults.poses) {
    const dbg = pose.debug;
    console.log(`  [DEBUG] NDC pose=${pose.name} power=${dbg.powerState} glErrors=${JSON.stringify(dbg.glErrors)} decoded=${dbg.decodedPointCount}`);
    console.log(`  [DEBUG]   expectedNdc=${JSON.stringify(dbg.expectedNdc)}`);
    console.log(`  [DEBUG]   samples=${JSON.stringify(dbg.samplePixels)}`);
  }
  for (const pose of ndcResults.poses) {
    for (const v of pose.vertices) {
      const id = `NDC_${pose.name}_V${v.index}`;
      record(id, v.passed ? `err=(${v.error.x.toFixed(4)},${v.error.y.toFixed(4)})` : 'NO_MATCH', v.passed,
        `expected=(${v.expectedNdc.x.toFixed(4)},${v.expectedNdc.y.toFixed(4)}) decoded=${v.decodedNdc ? `(${v.decodedNdc.x.toFixed(4)},${v.decodedNdc.y.toFixed(4)})` : 'null'} tol=${v.tolerance.toFixed(4)}`);
    }
  }

  // ─── Test 5: Near-Plane Hardware Clipping ───
  console.log('\n--- Test 5: Near-Plane Hardware Clipping ---');
  const clipResults = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();
    const results = {};

    function countNonBackgroundPixels(pixels, w, h) {
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // Background: (0.05,0.1,0.15,1) ≈ (13,26,38,255)
        if (pixels[i] > 20 || pixels[i+1] > 35 || pixels[i+2] > 50) {
          count++;
        }
      }
      return count;
    }

    // Partial-visible triangle
    const pipeline1 = new RP.GlPipeline({ canvas, initialTier: 'WEBGL2' });
    pipeline1.dispatchInput('INITIALIZE');
    if (pipeline1.powerSnapshot.state === 'THROTTLED') pipeline1.dispatchInput('VISIBILITY_VISIBLE');
    pipeline1.setRenderMode('standard');
    pipeline1.setRenderMesh(RP.NEAR_CLIP_PARTIAL_TRIANGLE);
    // Camera for near-clip test: FOV 90, aspect 1, near 1, far 10
    // Triangle is in camera space, so use identity view (camera at origin looking -Z)
    pipeline1.updateCamera({
      eye: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0],
      fovYRad: Math.PI / 2, aspect: 1.0, near: 1.0, far: 10.0,
      viewportWidth: 320, viewportHeight: 240
    });
    pipeline1.renderFrame();
    const partialPixels = pipeline1.readFramePixels();
    results.PARTIAL_VISIBLE_NON_BG_PIXELS = countNonBackgroundPixels(partialPixels.data, 320, 240);
    results.PARTIAL_VISIBLE_HAS_FRAGMENTS = results.PARTIAL_VISIBLE_NON_BG_PIXELS > 0;
    pipeline1.dispose();

    // Fully-invisible triangle
    const pipeline2 = new RP.GlPipeline({ canvas, initialTier: 'WEBGL2' });
    pipeline2.dispatchInput('INITIALIZE');
    if (pipeline2.powerSnapshot.state === 'THROTTLED') pipeline2.dispatchInput('VISIBILITY_VISIBLE');
    pipeline2.setRenderMode('standard');
    pipeline2.setRenderMesh(RP.NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE);
    pipeline2.updateCamera({
      eye: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0],
      fovYRad: Math.PI / 2, aspect: 1.0, near: 1.0, far: 10.0,
      viewportWidth: 320, viewportHeight: 240
    });
    pipeline2.renderFrame();
    const invisiblePixels = pipeline2.readFramePixels();
    results.FULLY_INVISIBLE_NON_BG_PIXELS = countNonBackgroundPixels(invisiblePixels.data, 320, 240);
    results.FULLY_INVISIBLE_ZERO_FRAGMENTS = results.FULLY_INVISIBLE_NON_BG_PIXELS === 0;
    pipeline2.dispose();

    // Results differ
    results.CLIPPING_RESULTS_DIFFER = results.PARTIAL_VISIBLE_HAS_FRAGMENTS && results.FULLY_INVISIBLE_ZERO_FRAGMENTS;

    return results;
  });

  record('PARTIAL_VISIBLE_HAS_FRAGMENTS', clipResults.PARTIAL_VISIBLE_HAS_FRAGMENTS, clipResults.PARTIAL_VISIBLE_HAS_FRAGMENTS === true,
    `non-bg pixels=${clipResults.PARTIAL_VISIBLE_NON_BG_PIXELS}`);
  record('FULLY_INVISIBLE_ZERO_FRAGMENTS', clipResults.FULLY_INVISIBLE_ZERO_FRAGMENTS, clipResults.FULLY_INVISIBLE_ZERO_FRAGMENTS === true,
    `non-bg pixels=${clipResults.FULLY_INVISIBLE_NON_BG_PIXELS}`);
  record('CLIPPING_RESULTS_DIFFER', clipResults.CLIPPING_RESULTS_DIFFER, clipResults.CLIPPING_RESULTS_DIFFER === true);

  // ─── Test 6: Golden Frame Generation ───
  console.log('\n--- Test 6: Golden Frame Generation ---');
  const goldenResults = await page.evaluate(() => {
    const RP = window.RenderPipeline;
    const canvas = window.__harness.getCanvas();
    const results = {};

    const pipeline = new RP.GlPipeline({ canvas, initialTier: 'WEBGL2' });
    pipeline.dispatchInput('INITIALIZE');
    if (pipeline.powerSnapshot.state === 'THROTTLED') pipeline.dispatchInput('VISIBILITY_VISIBLE');
    pipeline.setRenderMode('standard');
    pipeline.setRenderMesh(RP.GOLDEN_FRAME_TRIANGLE);
    // Golden frame camera: FOV 60, aspect 320/240, near 0.1, far 100
    // Triangle in camera space centered at origin, camera at (0,0,5)
    pipeline.updateCamera({
      eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0],
      fovYRad: Math.PI / 3, aspect: 320 / 240, near: 0.1, far: 100,
      viewportWidth: 320, viewportHeight: 240
    });
    pipeline.renderFrame();
    const framePixels = pipeline.readFramePixels();
    results.GOLDEN_FRAME_WIDTH = framePixels.width;
    results.GOLDEN_FRAME_HEIGHT = framePixels.height;
    results.GOLDEN_FRAME_TOTAL_BYTES = framePixels.data.length;

    // Count non-background pixels (triangle should be visible)
    let nonBg = 0;
    for (let i = 0; i < framePixels.data.length; i += 4) {
      if (framePixels.data[i] > 20 || framePixels.data[i+1] > 35 || framePixels.data[i+2] > 50) nonBg++;
    }
    results.GOLDEN_FRAME_NON_BG_PIXELS = nonBg;
    results.GOLDEN_FRAME_HAS_CONTENT = nonBg > 100; // triangle should have many pixels

    // Convert pixel data to base64 for transfer (browser-safe, no Node Buffer)
    let binary = '';
    const pxBytes = new Uint8Array(framePixels.data);
    for (let i = 0; i < pxBytes.length; i++) binary += String.fromCharCode(pxBytes[i]);
    results.GOLDEN_FRAME_RGBA_BASE64 = btoa(binary);

    // Sample some pixels
    const centerIdx = (120 * 320 + 160) * 4;
    results.GOLDEN_PIXEL_CENTER = [framePixels.data[centerIdx], framePixels.data[centerIdx+1], framePixels.data[centerIdx+2], framePixels.data[centerIdx+3]];

    pipeline.dispose();
    return results;
  });

  record('GOLDEN_FRAME_SIZE', `${goldenResults.GOLDEN_FRAME_WIDTH}x${goldenResults.GOLDEN_FRAME_HEIGHT}`,
    goldenResults.GOLDEN_FRAME_WIDTH === 320 && goldenResults.GOLDEN_FRAME_HEIGHT === 240);
  record('GOLDEN_FRAME_TOTAL_BYTES', goldenResults.GOLDEN_FRAME_TOTAL_BYTES, goldenResults.GOLDEN_FRAME_TOTAL_BYTES === 307200);
  record('GOLDEN_FRAME_HAS_CONTENT', goldenResults.GOLDEN_FRAME_HAS_CONTENT, goldenResults.GOLDEN_FRAME_HAS_CONTENT === true,
    `non-bg pixels=${goldenResults.GOLDEN_FRAME_NON_BG_PIXELS}`);
  record('GOLDEN_PIXEL_CENTER', `RGBA(${goldenResults.GOLDEN_PIXEL_CENTER.join(',')})`, true);

  // Save golden frame files
  const goldenRgba = Buffer.from(goldenResults.GOLDEN_FRAME_RGBA_BASE64, 'base64');
  const goldenSha256 = crypto.createHash('sha256').update(goldenRgba).digest('hex');
  fs.writeFileSync(path.join(FIXTURES_DIR, 'golden-frame.rgba.bin'), goldenRgba);
  fs.writeFileSync(path.join(FIXTURES_DIR, 'golden-frame-sha256.txt'), goldenSha256 + '\n');

  // Save PNG via canvas
  const goldenPngPath = path.join(FIXTURES_DIR, 'golden-frame.png');
  await page.evaluate((rgbaB64) => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 240;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(320, 240);
    const binStr = atob(rgbaB64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    imgData.data.set(bytes);
    ctx.putImageData(imgData, 0, 0);
    window.__goldenPngDataUrl = c.toDataURL('image/png');
  }, goldenResults.GOLDEN_FRAME_RGBA_BASE64);
  const pngDataUrl = await page.evaluate(() => window.__goldenPngDataUrl);
  const pngBase64 = pngDataUrl.split(',')[1];
  fs.writeFileSync(goldenPngPath, Buffer.from(pngBase64, 'base64'));

  // Save input manifest
  const inputManifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    environment: {
      userAgent: env.userAgent,
      webglVersion: env.webglVersion,
      chromiumExecutable: CHROME_PATH,
      rasterizer: 'SwiftShader (ANGLE)',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
    },
    viewport: { width: 320, height: 240, dpr: 1.0 },
    camera: {
      eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0],
      fovYRad: Math.PI / 3, aspect: 320 / 240, near: 0.1, far: 100
    },
    mesh: {
      id: 'golden-frame-reference',
      coordinateSpace: 'camera',
      primitiveType: 'triangles',
      vertexCount: 3,
      vertexDataSha256: crypto.createHash('sha256')
        .update(JSON.stringify({ vertices: [
          { x: 0, y: 0.8, z: 0, r: 0.9, g: 0.2, b: 0.2 },
          { x: -0.8, y: -0.6, z: 0, r: 0.2, g: 0.8, b: 0.2 },
          { x: 0.8, y: -0.6, z: 0, r: 0.2, g: 0.2, b: 0.8 }
        ]})).digest('hex')
    },
    shaders: {
      vertexSha256: crypto.createHash('sha256').update(
        '#version 300 es\nprecision highp float;\n\nlayout(location = 0) in vec3 aPosition;\nlayout(location = 1) in vec3 aColor;\n\nuniform mat4 uViewProjection;\n\nout vec3 vColor;\n\nvoid main() {\n  gl_Position = uViewProjection * vec4(aPosition, 1.0);\n  vColor = aColor;\n}\n'
      ).digest('hex'),
      fragmentSha256: crypto.createHash('sha256').update(
        '#version 300 es\nprecision highp float;\n\nin vec3 vColor;\nout vec4 fragColor;\n\nvoid main() {\n  fragColor = vec4(vColor, 1.0);\n}\n'
      ).digest('hex')
    },
    goldenFrame: {
      rgbaBytes: goldenRgba.length,
      sha256: goldenSha256,
      nonBackgroundPixels: goldenResults.GOLDEN_FRAME_NON_BG_PIXELS
    }
  };
  fs.writeFileSync(path.join(FIXTURES_DIR, 'golden-frame-input-manifest.json'), JSON.stringify(inputManifest, null, 2));

  // Save review template (NOT auto-signed — requires independent reviewer)
  const reviewTemplate = `# Golden Frame Review

## Review Status
PENDING_REVIEW (NOT auto-signed — requires independent reviewer)

## Frame Information
- Generated at: ${new Date().toISOString()}
- Environment: Chromium + SwiftShader (ANGLE)
- Viewport: 320x240, DPR 1.0
- SHA-256: ${goldenSha256}
- RGBA bytes: ${goldenRgba.length}
- Non-background pixels: ${goldenResults.GOLDEN_FRAME_NON_BG_PIXELS}

## Reviewer Checklist
- [ ] Triangle position matches expectation (centered, pointing up)
- [ ] Background is dark (0.05, 0.1, 0.15), no clear-only false positive
- [ ] Vertex colors: top=red, bottom-left=green, bottom-right=blue
- [ ] No unexpected full-screen fill
- [ ] Triangle edges are clean
- [ ] SHA-256 matches golden-frame.rgba.bin

## Review Sign-off
- Reviewer: [NAME]
- Review time: [YYYY-MM-DDTHH:MM:SSZ]
- Review environment: [Chrome XX / SwiftShader / 320x240]
- Review conclusion: [PASS / FAIL]
- Review evidence: [description of visual verification]
- Signature: [commit SHA or GPG fingerprint]
`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'golden-frame-review.md'), reviewTemplate);

  record('GOLDEN_FRAME_RGBA_SAVED', goldenRgba.length + ' bytes', goldenRgba.length === 307200);
  record('GOLDEN_FRAME_SHA256', goldenSha256, goldenSha256.length === 64);
  record('GOLDEN_FRAME_PNG_SAVED', fs.existsSync(goldenPngPath), fs.existsSync(goldenPngPath));
  record('GOLDEN_FRAME_MANIFEST_SAVED', 'golden-frame-input-manifest.json', true);
  record('GOLDEN_FRAME_REVIEW_TEMPLATE_SAVED', 'golden-frame-review.md (PENDING_REVIEW)', true);

  // ─── Console Errors ───
  console.log('\n--- Console Errors ---');
  record('CONSOLE_ERROR_COUNT', consoleErrors.length, consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.join('; ') : 'none');

  // ─── Summary ───
  const totalChecks = evidence.evidenceEntries.length;
  const passedChecks = evidence.evidenceEntries.filter(e => e.passed).length;
  console.log(`\n=== SUMMARY: ${passedChecks}/${totalChecks} checks passed, ${evidence.assertionFailures.length} failures ===`);
  console.log(`ALL_PASSED: ${evidence.allPassed}`);

  // Write evidence JSON
  evidence.summary = { total: totalChecks, passed: passedChecks, failed: evidence.assertionFailures.length };
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2));
  console.log(`Evidence written to: ${EVIDENCE_FILE}`);

  await browser.close();
  process.exit(evidence.allPassed ? 0 : 1);
})();
