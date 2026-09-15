/**
 * STEP 6-A · Tier-A WebGL2 Physical Render — Full Pipeline Adapter
 *
 * 将已锁定的 RuntimeExecutionPlan 接入真实 WebGL2 管线。
 * 流程: Pipeline(Step6-B→G1→Patch→G3) → ValidatedIR+ExecutionPlan →
 *        WebGL2 Context → GLSL Shaders → FBO → Draw → readPixels →
 *        webgl2RenderHash → 确定性验证 ×2
 *
 * 严禁使用 Software Render Reference 生成 pixel buffer。
 * 所有像素必须来自 gl.readPixels(...)。
 * softwareRenderHash 与 webgl2RenderHash 严格分离。
 */

require("ts-node").register({ project: require("path").join(__dirname, "../../tsconfig.test.json") });

const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { runDetailed } = require("../../tests/golden-cases/GOLDEN_CASE_02/run");

const WIDTH = 480;
const HEIGHT = 270;
const EVIDENCE_DIR = path.join(__dirname, "../evidence/webgl2");

async function getPipelineParams() {
  console.log("Running locked Core Pipeline (Step6-B → G1 → Patch → G3)...");
  const result = await runDetailed();

  if (!result.pipelineOutput || result.pipelineOutput.status !== "SUCCESS") {
    throw new Error("Pipeline did not succeed: " + JSON.stringify(result.pipelineOutput?.status));
  }

  const validated = result.pipelineOutput.validatedIR.validated;
  const plan = result.pipelineOutput.executionPlan;

  // Extract render-relevant parameters from ValidatedIR
  const params = {
    // Composition
    focalX: validated.composition.focalPoint.value[0],
    focalY: validated.composition.focalPoint.value[1],
    negativeSpace: validated.composition.negativeSpaceRatio.value,
    symmetry: validated.composition.symmetry.value,
    depthLayers: validated.composition.depthLayerCount.value,
    // Color
    dominant: validated.color.dominant.value,
    secondary: validated.color.secondary.value,
    accent: validated.color.accent.value,
    contrastRatio: validated.color.contrastRatio.value,
    temperatureBias: validated.color.temperatureBias.value,
    // Camera
    fov: validated.camera.fov.value,
    shotSize: validated.camera.shotSize.value,
    angle: validated.camera.angle.value,
    // Lighting
    keyAzimuth: validated.lighting.keyLight.azimuth.value,
    keyElevation: validated.lighting.keyLight.elevation.value,
    keyColorTemp: validated.lighting.keyLight.colorTemp.value,
    keyIntensity: validated.lighting.keyLight.intensity.value,
    ambientRatio: validated.lighting.ambientRatio.value,
    rimLightPresent: validated.lighting.rimLightPresent.value,
    // Materials (primary)
    roughness: validated.materials[0].roughness.value,
    metalness: validated.materials[0].metalness.value,
    wear: validated.materials[0].wear.value,
    // Execution plan
    toneMapping: plan.runtimePlan.pipeline.toneMapping,
    postProcessing: plan.runtimePlan.pipeline.postprocessing,
    rendererType: plan.runtimePlan.pipeline.rendererType,
    selectedTier: plan.negotiation.selectedTier,
    // Hashes
    softwareRenderHash: result.renderResult ? result.renderResult.renderHash : "not-available",
    executionPlanHash: result.pipelineOutput.hashChain.executionPlanHash,
    validatedIRHash: result.pipelineOutput.hashChain.validatedIRHash,
  };

  console.log(`Pipeline SUCCESS — TIER: ${params.selectedTier}`);
  console.log(`  Tone mapping: ${params.toneMapping}`);
  console.log(`  Post-processing: ${params.postProcessing.join(", ")}`);
  console.log(`  Dominant: ${params.dominant}, Focal: (${params.focalX.toFixed(3)}, ${params.focalY.toFixed(3)})`);
  console.log(`  Key light: azimuth=${params.keyAzimuth}°, elevation=${params.keyElevation}°, temp=${params.keyColorTemp}K`);

  return params;
}

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function buildWebGL2HTML(params) {
  const dom = hexToRgb(params.dominant);
  const sec = hexToRgb(params.secondary);
  const acc = hexToRgb(params.accent);

  // Key light color from color temperature
  const warm = params.keyColorTemp < 5000;
  const keyR = warm ? 1.0 : 0.85;
  const keyG = warm ? 0.88 : 0.92;
  const keyB = warm ? 0.72 : 1.0;

  // Light direction from azimuth/elevation
  const azRad = (params.keyAzimuth * Math.PI) / 180;
  const elRad = (params.keyElevation * Math.PI) / 180;
  const lightX = Math.cos(azRad) * Math.cos(elRad);
  const lightY = Math.sin(elRad);
  const lightZ = Math.sin(azRad) * Math.cos(elRad);

  const useACES = params.toneMapping === "ACESFilmicToneMapping" || params.toneMapping === "AgXToneMapping";

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tier-A WebGL2 Render</title></head>
<body>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
window.__renderResult = null;
(function() {
  const canvas = document.getElementById("c");
  const gl = canvas.getContext("webgl2", {
    alpha: false, depth: true, antialias: false, preserveDrawingBuffer: true,
  });
  if (!gl) { window.__renderResult = { error: "webgl2 context null" }; return; }

  // Vertex shader: fullscreen quad with UV + depth layer
  const vs = \`#version 300 es
    in vec2 aPos;
    in vec2 aUV;
    out vec2 vUV;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aUV; }
  \`;

  // Fragment shader: Tier-A procedural scene from ValidatedIR parameters
  const fs = \`#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;

    uniform vec3 uDominant;
    uniform vec3 uSecondary;
    uniform vec3 uAccent;
    uniform vec2 uFocal;
    uniform float uNegSpace;
    uniform float uSymmetry;
    uniform float uDepthLayers;
    uniform float uContrast;
    uniform float uTempBias;
    uniform vec3 uLightDir;
    uniform vec3 uLightColor;
    uniform float uLightIntensity;
    uniform float uAmbient;
    uniform float uRoughness;
    uniform float uMetalness;
    uniform float uWear;
    uniform float uFov;
    uniform int uUseToneMap;

    // Hash for deterministic noise
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUV;

      // Symmetry: mirror horizontally if symmetry > 0.5
      if (uSymmetry > 0.5) {
        uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
      }

      // Background gradient (sky/atmosphere)
      vec3 skyTop = mix(uDominant, vec3(0.95, 0.97, 1.0), 0.3 + uTempBias * 0.2);
      vec3 skyBottom = mix(uSecondary, uDominant, 0.5);
      vec3 col = mix(skyTop, skyBottom, uv.y * uv.y);

      // Depth layers (procedural mountains/architecture silhouettes)
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        if (fi >= uDepthLayers) break;
        float layerY = 0.45 + fi * 0.18;
        float layerH = 0.35 - fi * 0.08;
        float relY = (uv.y - layerY) / layerH;
        if (relY > -0.5 && relY < 0.5) {
          float peak = hash(vec2(floor(uv.x * 20.0), fi)) * 0.3;
          float silhouette = 0.5 + peak + sin(uv.x * 3.14159 * (3.0 + fi)) * 0.1;
          if (relY > silhouette - 0.5) {
            vec3 layerCol = mix(skyBottom, fi < 2.0 ? uSecondary : uDominant, 0.3 + fi * 0.15);
            // Lighting: simple NdotL
            vec2 dx = vec2(0.001, 0.0);
            float h1 = hash(vec2(floor((uv.x + dx.x) * 20.0), fi));
            float h0 = hash(vec2(floor(uv.x * 20.0), fi));
            vec3 normal = normalize(vec3(-(h1 - h0) * 5.0, 1.0, 0.3));
            float ndotl = max(0.0, dot(normal, uLightDir));
            float diffuse = uAmbient + ndotl * uLightIntensity * (1.0 - uAmbient);
            layerCol *= diffuse;
            layerCol *= uLightColor;
            // Specular (roughness-dependent)
            float spec = pow(ndotl, 10.0 + uRoughness * 40.0) * (1.0 - uRoughness) * uLightIntensity;
            layerCol += spec * (uMetalness > 0.5 ? uLightColor : vec3(1.0)) * 0.5;
            // Wear noise
            layerCol += (hash(uv * 100.0 + fi) - 0.5) * uWear * 0.3;
            // Atmospheric perspective
            float atmos = 1.0 - fi * 0.15;
            col = mix(skyBottom, layerCol, atmos);
          }
        }
      }

      // Focal element glow (accent color)
      float focalDist = distance(uv, uFocal);
      float focalRadius = 0.12 * (1.0 - uNegSpace * 0.5);
      if (focalDist < focalRadius) {
        float glow = pow(1.0 - focalDist / focalRadius, 2.0) * 0.3 * uLightIntensity;
        col += uAccent * glow + uLightColor * glow * 0.5;
      }

      // Contrast adjustment
      col = (col - 0.5) * (1.0 + (uContrast - 1.0) * 0.3) + 0.5;

      // Tone mapping (ACES/AgX approximation)
      if (uUseToneMap == 1) {
        vec3 x = col * uLightIntensity;
        col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      }

      // Film grain (deterministic)
      col += (hash(uv * 500.0) - 0.5) * 0.04;

      // Vignette
      vec2 vc = uv - 0.5;
      float vig = 1.0 - dot(vc, vc) * 0.7;
      col *= vig;

      fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  \`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    // Fullscreen quad
    const verts = new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, -1,1,0,1, 1,-1,1,0, 1,1,1,1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    const aUV = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

    // Set uniforms from ValidatedIR
    function set3(name, arr) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform3f(l, arr[0], arr[1], arr[2]); }
    function set1(name, v) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform1f(l, v); }
    function set2(name, x, y) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform2f(l, x, y); }
    function setI(name, v) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform1i(l, v); }

    set3("uDominant", [${dom[0]}, ${dom[1]}, ${dom[2]}]);
    set3("uSecondary", [${sec[0]}, ${sec[1]}, ${sec[2]}]);
    set3("uAccent", [${acc[0]}, ${acc[1]}, ${acc[2]}]);
    set2("uFocal", ${params.focalX}, ${params.focalY});
    set1("uNegSpace", ${params.negativeSpace});
    set1("uSymmetry", ${params.symmetry});
    set1("uDepthLayers", ${params.depthLayers});
    set1("uContrast", ${params.contrastRatio});
    set1("uTempBias", ${params.temperatureBias});
    set3("uLightDir", [${lightX.toFixed(4)}, ${lightY.toFixed(4)}, ${lightZ.toFixed(4)}]);
    set3("uLightColor", [${keyR}, ${keyG}, ${keyB}]);
    set1("uLightIntensity", ${params.keyIntensity});
    set1("uAmbient", ${params.ambientRatio});
    set1("uRoughness", ${params.roughness});
    set1("uMetalness", ${params.metalness});
    set1("uWear", ${params.wear});
    set1("uFov", ${params.fov});
    setI("uUseToneMap", ${useACES ? 1 : 0});

    // FBO
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ${WIDTH}, ${HEIGHT}, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    gl.viewport(0, 0, ${WIDTH}, ${HEIGHT});
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const drawError = gl.getError();

    const pixels = new Uint8Array(${WIDTH * HEIGHT * 4});
    gl.readPixels(0, 0, ${WIDTH}, ${HEIGHT}, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const readError = gl.getError();

    let nz = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 5 || pixels[i+1] > 5 || pixels[i+2] > 5) nz++;

    // Get renderer info
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    window.__renderResult = {
      success: true,
      width: ${WIDTH},
      height: ${HEIGHT},
      pixelBufferByteLength: pixels.length,
      nonZeroPixels: nz,
      drawCalls: 1,
      drawError: drawError === gl.NO_ERROR ? "NO_ERROR" : "0x" + drawError.toString(16),
      readError: readError === gl.NO_ERROR ? "NO_ERROR" : "0x" + readError.toString(16),
      glError: (drawError === gl.NO_ERROR && readError === gl.NO_ERROR) ? "NO_ERROR" : "HAS_ERROR",
      vendor: gl.getParameter(gl.VENDOR),
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      pixels: Array.from(pixels),
    };

    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
  } catch (e) {
    window.__renderResult = { success: false, error: e.message };
  }
})();
</script>
</body></html>
`;
}

async function runWebGL2Render(params, runId) {
  const start = Date.now();
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: false,
      executablePath: "/usr/local/bin/chromium",
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--enable-webgl", "--enable-webgl2-compute-context",
        "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
        "--use-gl=angle", "--use-angle=swiftshader", "--disable-gpu-sandbox",
      ],
    });
    const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
    const page = await ctx.newPage();
    await page.setContent(buildWebGL2HTML(params), { waitUntil: "load" });
    await page.waitForFunction(() => window.__renderResult !== null, { timeout: 30000 });
    const result = await page.evaluate(() => window.__renderResult);
    await ctx.close();

    if (!result.success) {
      return { runId, success: false, error: result.error, durationMs: Date.now() - start };
    }

    const pixelBuffer = Buffer.from(result.pixels);
    const webgl2RenderHash = "sha256:" + crypto.createHash("sha256").update(pixelBuffer).digest("hex");

    return {
      runId,
      success: true,
      width: result.width,
      height: result.height,
      pixelBufferByteLength: result.pixelBufferByteLength,
      webgl2RenderHash,
      nonZeroPixels: result.nonZeroPixels,
      drawCalls: result.drawCalls,
      glError: result.glError,
      vendor: result.vendor,
      renderer: result.renderer,
      version: result.version,
      durationMs: Date.now() - start,
      pixelBuffer,
    };
  } catch (e) {
    return { runId, success: false, error: e.message, durationMs: Date.now() - start };
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
}

async function main() {
  console.log("=== STEP 6-A · Tier-A WebGL2 Physical Render ===\n");

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  // 1. Run locked pipeline to get ValidatedIR + ExecutionPlan
  const params = await getPipelineParams();

  // 2. Tier-A WebGL2 Render (run twice for determinism)
  console.log("\nTier-A WebGL2 Render — Run 01...");
  const r1 = await runWebGL2Render(params, "run-01");
  if (!r1.success) {
    console.error("Render failed:", r1.error);
    process.exit(1);
  }
  console.log(`  webgl2RenderHash: ${r1.webgl2RenderHash}`);
  console.log(`  pixels: ${r1.pixelBufferByteLength}, nonZero: ${r1.nonZeroPixels}, glError: ${r1.glError}`);
  console.log(`  renderer: ${r1.renderer}`);
  console.log(`  duration: ${r1.durationMs}ms`);

  console.log("\nTier-A WebGL2 Render — Run 02 (determinism)...");
  const r2 = await runWebGL2Render(params, "run-02");
  if (!r2.success) {
    console.error("Render failed:", r2.error);
    process.exit(1);
  }
  console.log(`  webgl2RenderHash: ${r2.webgl2RenderHash}`);

  const determinism = r1.webgl2RenderHash === r2.webgl2RenderHash;
  console.log(`\n=== DETERMINISM ===`);
  console.log(`  run-01: ${r1.webgl2RenderHash}`);
  console.log(`  run-02: ${r2.webgl2RenderHash}`);
  console.log(`  IDENTICAL: ${determinism}`);

  // 3. Hash separation
  console.log(`\n=== HASH SEPARATION ===`);
  console.log(`  softwareRenderHash: ${params.softwareRenderHash}`);
  console.log(`  webgl2RenderHash:   ${r1.webgl2RenderHash}`);
  console.log(`  DIFFERENT: ${params.softwareRenderHash !== r1.webgl2RenderHash}`);

  // 4. Save evidence
  const metadata = {
    rendererTier: "TIER_A_WEBGL2",
    width: r1.width,
    height: r1.height,
    pixelFormat: "RGBA",
    pixelBufferByteLength: r1.pixelBufferByteLength,
    renderExecutionMs: r1.durationMs,
    webgl2RenderHash: r1.webgl2RenderHash,
    softwareRenderHash: params.softwareRenderHash,
    determinism,
    vendor: r1.vendor,
    renderer: r1.renderer,
    version: r1.version,
    glError: r1.glError,
    nonZeroPixels: r1.nonZeroPixels,
    drawCalls: r1.drawCalls,
    toneMapping: params.toneMapping,
    postProcessing: params.postProcessing,
    selectedTier: params.selectedTier,
    executionPlanHash: params.executionPlanHash,
    validatedIRHash: params.validatedIRHash,
    renderedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(EVIDENCE_DIR, "render-metadata.json"), JSON.stringify(metadata, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, "render-frame.rgba"), r1.pixelBuffer);
  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/`);
  console.log(`  render-metadata.json`);
  console.log(`  render-frame.rgba (${r1.pixelBufferByteLength} bytes)`);

  // 5. Final status
  const allPass = r1.success && r2.success &&
    r1.glError === "NO_ERROR" && r2.glError === "NO_ERROR" &&
    r1.nonZeroPixels > 1000 && determinism;

  console.log(`\n=== TIER-A WEBGL2 RENDER RESULT: ${allPass ? "PASS" : "FAIL"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("Tier-A render crashed:", e); process.exit(1); });
