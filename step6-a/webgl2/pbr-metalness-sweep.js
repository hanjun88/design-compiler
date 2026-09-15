/**
 * STEP ② PBR Modernization · Metalness Sweeping Conformance Test (v2 - HARDENED)
 *
 * 验证 Cook-Torrance PBR 渲染器中 metalness 参数在 [0.0, 1.0] 全区间
 * 产生连续、非零的像素响应，彻底废除 Phong 时代的 >0.5 二值化分支。
 *
 * 测试项：
 * 1. 阶梯采样：metalness ∈ {0.00, 0.25, 0.50, 0.75, 1.00}
 * 2. 连续性验证：相邻阶梯间像素均值差异 Δ > 0.001
 * 3. 二值化废除：metalness=0.49999 与 0.50001 像素差异极限收敛（maxPixelDiff <= 2）
 * 4. Shader 级有限值探针：片元着色器内部检测 NaN/Inf，用 MAGENTA_MARKER 标记
 *
 * 硬边界：
 * - 不修改 Core Compiler / Step 6-B / ABI / Evaluator
 * - 不修改历史 Phong baseline 证据
 * - 新渲染结果独立归档
 *
 * v2 修正记录：
 * - FIX: sweepResults[i-1].toFixed() → .metalness.toFixed() (Hard Bug TypeError)
 * - FIX: Shader 级 NaN/Inf 探针 (替代 Uint8Array 假验证)
 * - FIX: binaryPass 纳入 allPass 综合门禁 (门禁逻辑断路)
 * - FIX: Report 序列化与对象结构 100% 严格吻合
 */

require("ts-node").register({ project: require("path").join(__dirname, "../../tsconfig.test.json") });

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const { runDetailed } = require("../../tests/golden-cases/GOLDEN_CASE_02/run");

const WIDTH = 480;
const HEIGHT = 270;
const OUTPUT_DIR = path.join(__dirname, "../evidence/webgl2-pbr");

// MAGENTA_MARKER: Shader 内部 NaN/Inf 探针标记色 (R=255, G=0, B=255)
const NAN_INF_MARKER = { r: 255, g: 0, b: 255 };

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

/**
 * 构建 PBR 渲染 HTML，允许自定义 metalness 参数
 * 包含 Shader 级 NaN/Inf 有限值探针
 */
function buildPBRHTML(params, customMetalness) {
  const dom = hexToRgb(params.dominant);
  const sec = hexToRgb(params.secondary);
  const acc = hexToRgb(params.accent);

  const warm = params.keyColorTemp < 5000;
  const keyR = warm ? 1.0 : 0.85;
  const keyG = warm ? 0.88 : 0.92;
  const keyB = warm ? 0.72 : 1.0;

  const azRad = (params.keyAzimuth * Math.PI) / 180;
  const elRad = (params.keyElevation * Math.PI) / 180;
  const lightX = Math.cos(azRad) * Math.cos(elRad);
  const lightY = Math.sin(elRad);
  const lightZ = Math.sin(azRad) * Math.cos(elRad);

  const useACES = params.toneMapping === "ACESFilmicToneMapping" || params.toneMapping === "AgXToneMapping";

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PBR Metalness Sweep v2</title></head>
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

  const vs = \`#version 300 es
    in vec2 aPos;
    in vec2 aUV;
    out vec2 vUV;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aUV; }
  \`;

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
    uniform vec3 uAlbedo;
    uniform vec3 uViewDir;
    uniform int uUseToneMap;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    const float PI = 3.14159265359;

    float DistributionGGX(vec3 N, vec3 H, float roughness) {
      float a = max(roughness * roughness, 0.001);
      float a2 = a * a;
      float NdotH = max(dot(N, H), 0.0);
      float NdotH2 = NdotH * NdotH;
      float denom = (NdotH2 * (a2 - 1.0) + 1.0);
      return a2 / (PI * denom * denom);
    }

    float GeometrySchlickGGX(float NdotV, float roughness) {
      float r = (roughness + 1.0);
      float k = (r * r) / 8.0;
      return NdotV / (NdotV * (1.0 - k) + k);
    }

    float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
      float NdotV = max(dot(N, V), 0.0001);
      float NdotL = max(dot(N, L), 0.0001);
      float ggx2 = GeometrySchlickGGX(NdotV, roughness);
      float ggx1 = GeometrySchlickGGX(NdotL, roughness);
      return ggx1 * ggx2;
    }

    vec3 fresnelSchlick(float cosTheta, vec3 F0) {
      return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }

    void main() {
      vec2 uv = vUV;
      if (uSymmetry > 0.5) {
        uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
      }

      vec3 skyTop = mix(uDominant, vec3(0.95, 0.97, 1.0), 0.3 + uTempBias * 0.2);
      vec3 skyBottom = mix(uSecondary, uDominant, 0.5);
      vec3 col = mix(skyTop, skyBottom, uv.y * uv.y);

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

            vec2 dx = vec2(0.001, 0.0);
            float h1 = hash(vec2(floor((uv.x + dx.x) * 20.0), fi));
            float h0 = hash(vec2(floor(uv.x * 20.0), fi));
            vec3 normal = normalize(vec3(-(h1 - h0) * 5.0, 1.0, 0.3));

            vec3 N = normalize(normal);
            vec3 V = normalize(uViewDir);
            vec3 L = normalize(uLightDir);
            vec3 H = normalize(V + L);

            float NdotL = max(dot(N, L), 0.0001);
            float NdotV = max(dot(N, V), 0.0001);

            vec3 F0 = mix(vec3(0.04), uAlbedo, clamp(uMetalness, 0.0, 1.0));

            float NDF = DistributionGGX(N, H, clamp(uRoughness, 0.0, 1.0));
            float G = GeometrySmith(N, V, L, clamp(uRoughness, 0.0, 1.0));
            vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

            vec3 numerator = NDF * G * F;
            float denominator = max(4.0 * NdotV * NdotL, 0.001);
            vec3 specular = numerator / denominator;

            vec3 kS = F;
            vec3 kD = (vec3(1.0) - kS) * (1.0 - clamp(uMetalness, 0.0, 1.0));

            vec3 radiance = uLightColor * uLightIntensity;
            vec3 pbrSurface = (kD * uAlbedo / PI + specular) * radiance * NdotL;

            layerCol = layerCol * uAmbient + pbrSurface;

            layerCol += (hash(uv * 100.0 + fi) - 0.5) * uWear * 0.3;

            float atmos = 1.0 - fi * 0.15;
            col = mix(skyBottom, layerCol, atmos);
          }
        }
      }

      float focalDist = distance(uv, uFocal);
      float focalRadius = 0.12 * (1.0 - uNegSpace * 0.5);
      if (focalDist < focalRadius) {
        float glow = pow(1.0 - focalDist / focalRadius, 2.0) * 0.3 * uLightIntensity;
        col += uAccent * glow + uLightColor * glow * 0.5;
      }

      col = (col - 0.5) * (1.0 + (uContrast - 1.0) * 0.3) + 0.5;

      if (uUseToneMap == 1) {
        vec3 x = col * uLightIntensity;
        col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      }

      col += (hash(uv * 500.0) - 0.5) * 0.04;

      vec2 vc = uv - 0.5;
      float vig = 1.0 - dot(vc, vc) * 0.7;
      col *= vig;

      // ========================================================================
      // SHADER-LEVEL FINITE VALUE PROBE (PBR Conformance v2)
      // 检测片元着色器浮点计算中是否产生 NaN 或 Infinity。
      // 若触发，输出 MAGENTA_MARKER (1.0, 0.0, 1.0) 并立即返回。
      // 回读端通过检索 R=255,G=0,B=255 像素判断是否存在浮点异常。
      // 这替代了 v1 中在 Uint8Array 上假检查 NaN/Inf 的无效验证。
      // ========================================================================
      if (isnan(col.r) || isnan(col.g) || isnan(col.b) ||
          isinf(col.r) || isinf(col.g) || isinf(col.b)) {
        fragColor = vec4(1.0, 0.0, 1.0, 1.0); // MAGENTA_MARKER
        return;
      }

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
    set1("uMetalness", ${customMetalness});
    set1("uWear", ${params.wear});
    set3("uAlbedo", [${dom[0]}, ${dom[1]}, ${dom[2]}]);
    set3("uViewDir", [0.0, 0.0, 1.0]);
    setI("uUseToneMap", ${useACES ? 1 : 0});

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
    let sumR = 0, sumG = 0, sumB = 0;
    let nanInfMarkerPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 5 || pixels[i+1] > 5 || pixels[i+2] > 5) nz++;
      sumR += pixels[i]; sumG += pixels[i+1]; sumB += pixels[i+2];
      // Shader-level NaN/Inf probe: detect MAGENTA_MARKER (R=255, G=0, B=255)
      if (pixels[i] === 255 && pixels[i+1] === 0 && pixels[i+2] === 255) {
        nanInfMarkerPixels++;
      }
    }

    window.__renderResult = {
      success: true,
      metalness: ${customMetalness},
      width: ${WIDTH},
      height: ${HEIGHT},
      pixelBufferByteLength: pixels.length,
      nonZeroPixels: nz,
      meanR: sumR / (${WIDTH * HEIGHT}),
      meanG: sumG / (${WIDTH * HEIGHT}),
      meanB: sumB / (${WIDTH * HEIGHT}),
      meanLuminance: (sumR * 0.2126 + sumG * 0.7152 + sumB * 0.0722) / (${WIDTH * HEIGHT}),
      // Shader-level finite value probe result (replaces Uint8Array fake check)
      nanInfMarkerPixels: nanInfMarkerPixels,
      shaderFiniteValuePass: nanInfMarkerPixels === 0,
      drawError: drawError === gl.NO_ERROR ? "NO_ERROR" : "0x" + drawError.toString(16),
      readError: readError === gl.NO_ERROR ? "NO_ERROR" : "0x" + readError.toString(16),
      glError: (drawError === gl.NO_ERROR && readError === gl.NO_ERROR) ? "NO_ERROR" : "HAS_ERROR",
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

async function renderWithMetalness(params, metalness) {
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
    await page.setContent(buildPBRHTML(params, metalness), { waitUntil: "load" });
    await page.waitForFunction(() => window.__renderResult !== null, { timeout: 30000 });
    const result = await page.evaluate(() => window.__renderResult);
    await ctx.close();
    return result;
  } catch (e) {
    return { success: false, error: e.message, metalness };
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
}

async function main() {
  console.log("=== PBR Metalness Sweeping Conformance Test (v2 HARDENED) ===\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Run locked pipeline to get parameters
  console.log("Running locked Core Pipeline...");
  const result = await runDetailed();
  if (!result.pipelineOutput || result.pipelineOutput.status !== "SUCCESS") {
    console.error("Pipeline failed:", result.pipelineOutput?.status);
    process.exit(1);
  }

  const validated = result.pipelineOutput.validatedIR.validated;
  const plan = result.pipelineOutput.executionPlan;

  const params = {
    focalX: validated.composition.focalPoint.value[0],
    focalY: validated.composition.focalPoint.value[1],
    negativeSpace: validated.composition.negativeSpaceRatio.value,
    symmetry: validated.composition.symmetry.value,
    depthLayers: validated.composition.depthLayerCount.value,
    dominant: validated.color.dominant.value,
    secondary: validated.color.secondary.value,
    accent: validated.color.accent.value,
    contrastRatio: validated.color.contrastRatio.value,
    temperatureBias: validated.color.temperatureBias.value,
    keyAzimuth: validated.lighting.keyLight.azimuth.value,
    keyElevation: validated.lighting.keyLight.elevation.value,
    keyColorTemp: validated.lighting.keyLight.colorTemp.value,
    keyIntensity: validated.lighting.keyLight.intensity.value,
    ambientRatio: validated.lighting.ambientRatio.value,
    roughness: validated.materials[0].roughness.value,
    metalness: validated.materials[0].metalness.value,
    wear: validated.materials[0].wear.value,
    toneMapping: plan.runtimePlan.pipeline.toneMapping,
  };

  console.log(`Pipeline SUCCESS — roughness=${params.roughness}, original metalness=${params.metalness}\n`);

  // 2. Metalness sweeping test
  const sweepValues = [0.00, 0.25, 0.50, 0.75, 1.00];
  const sweepResults = [];

  console.log("=== Metalness Sweeping Test ===");
  for (const m of sweepValues) {
    console.log(`\nRendering with metalness=${m.toFixed(2)}...`);
    const r = await renderWithMetalness(params, m);
    if (!r.success) {
      console.error(`  FAILED: ${r.error}`);
      process.exit(1);
    }
    sweepResults.push(r);
    console.log(`  meanLuminance=${r.meanLuminance.toFixed(4)}, nonZero=${r.nonZeroPixels}, glError=${r.glError}, shaderFiniteValuePass=${r.shaderFiniteValuePass}, nanInfMarkers=${r.nanInfMarkerPixels}`);
  }

  // 3. Continuity verification (FIX: use .metalness.toFixed(), not object.toFixed())
  console.log("\n=== Continuity Verification ===");
  let allContinuous = true;
  for (let i = 1; i < sweepResults.length; i++) {
    const delta = Math.abs(sweepResults[i].meanLuminance - sweepResults[i-1].meanLuminance);
    const passed = delta > 0.001;
    console.log(`  metalness ${sweepResults[i-1].metalness.toFixed(2)} → ${sweepResults[i].metalness.toFixed(2)}: ΔmeanLuminance=${delta.toFixed(6)} ${passed ? "PASS" : "FAIL (no change)"}`);
    if (!passed) allContinuous = false;
  }

  // 4. Binary threshold abolition test (0.49999 vs 0.50001)
  console.log("\n=== Binary Threshold Abolition Test ===");
  console.log("Rendering with metalness=0.49999...");
  const rLow = await renderWithMetalness(params, 0.49999);
  console.log("Rendering with metalness=0.50001...");
  const rHigh = await renderWithMetalness(params, 0.50001);

  let maxPixelDiff = -1;
  let binaryPass = false;
  if (rLow.success && rHigh.success) {
    maxPixelDiff = 0;
    for (let i = 0; i < rLow.pixels.length; i++) {
      maxPixelDiff = Math.max(maxPixelDiff, Math.abs(rLow.pixels[i] - rHigh.pixels[i]));
    }
    // FIX: binaryPass 纳入综合门禁 (threshold <= 2 for 8-bit quantization)
    binaryPass = maxPixelDiff <= 2;
    console.log(`  maxPixelDiff(0.49999 vs 0.50001) = ${maxPixelDiff}`);
    console.log(`  meanLuminance: low=${rLow.meanLuminance.toFixed(6)}, high=${rHigh.meanLuminance.toFixed(6)}`);
    console.log(`  No step jump at 0.5 threshold: ${binaryPass ? "PASS" : "FAIL"}`);
  } else {
    console.log(`  FAILED: low=${rLow.error}, high=${rHigh.error}`);
  }

  // 5. Shader-level finite value assertion (FIX: replaces Uint8Array fake check)
  console.log("\n=== Shader-Level Finite Value Assertion ===");
  let allFinite = true;
  for (const r of sweepResults) {
    if (!r.shaderFiniteValuePass) {
      console.log(`  metalness=${r.metalness}: nanInfMarkerPixels=${r.nanInfMarkerPixels} FAIL`);
      allFinite = false;
    }
  }
  // Also check binary threshold renders
  if (rLow.success && !rLow.shaderFiniteValuePass) {
    console.log(`  metalness=0.49999: nanInfMarkerPixels=${rLow.nanInfMarkerPixels} FAIL`);
    allFinite = false;
  }
  if (rHigh.success && !rHigh.shaderFiniteValuePass) {
    console.log(`  metalness=0.50001: nanInfMarkerPixels=${rHigh.nanInfMarkerPixels} FAIL`);
    allFinite = false;
  }
  if (allFinite) console.log("  All shader computations finite (no NaN/Inf markers): PASS");

  // 6. Save sweep report (FIX: ensure all results contain meanR/meanG/meanB, structure 100% consistent)
  const report = {
    test: "PBR Metalness Sweeping Conformance",
    testVersion: "v2-HARDENED",
    testDate: new Date().toISOString(),
    roughness: params.roughness,
    originalMetalness: params.metalness,
    sweepValues: sweepValues,
    results: sweepResults.map(r => ({
      metalness: r.metalness,
      meanLuminance: r.meanLuminance,
      meanR: r.meanR,
      meanG: r.meanG,
      meanB: r.meanB,
      nonZeroPixels: r.nonZeroPixels,
      glError: r.glError,
      shaderFiniteValuePass: r.shaderFiniteValuePass,
      nanInfMarkerPixels: r.nanInfMarkerPixels,
    })),
    continuityVerification: {
      transitions: sweepResults.slice(1).map((r, i) => ({
        from: sweepResults[i].metalness,
        to: r.metalness,
        deltaMeanLuminance: Math.abs(r.meanLuminance - sweepResults[i].meanLuminance),
        passed: Math.abs(r.meanLuminance - sweepResults[i].meanLuminance) > 0.001,
      })),
      allContinuous: allContinuous,
    },
    binaryThresholdAbolition: {
      metalnessLow: 0.49999,
      metalnessHigh: 0.50001,
      maxPixelDiff: maxPixelDiff,
      lowMeanLuminance: rLow.success ? rLow.meanLuminance : null,
      highMeanLuminance: rHigh.success ? rHigh.meanLuminance : null,
      noStepJump: binaryPass,
      threshold: 2,
      note: "maxPixelDiff <= 2 is 8-bit quantization tolerance; no阶跃跳变 at former binary threshold 0.5",
    },
    shaderFiniteValueAssertion: {
      method: "MAGENTA_MARKER probe in fragment shader (R=255,G=0,B=255)",
      allFinite: allFinite,
      note: "Replaces v1 Uint8Array fake NaN/Inf check; shader-level isnan()/isinf() detection",
    },
    conclusion: {
      metalnessContinuousResponse: allContinuous ? "PASS" : "FAIL",
      binaryThresholdAbolished: binaryPass ? "PASS" : "FAIL",
      shaderFiniteValues: allFinite ? "PASS" : "FAIL",
      phongDefectResolved: "PBR continuous metalness mix() replaces Phong >0.5 binary branch",
      overall: null, // filled below
    },
  };

  // FIX: allPass includes continuity AND finite AND binary threshold
  const allPass = allContinuous && allFinite && binaryPass;
  report.conclusion.overall = allPass ? "PASS" : "FAIL";

  const reportPath = path.join(OUTPUT_DIR, "metalness-sweep-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nSweep report saved to ${reportPath}`);

  // 7. Final verdict (FIX: binaryPass is now part of allPass)
  console.log("\n=== FINAL VERDICT (v2 HARDENED) ===");
  console.log(`  Continuity:              ${allContinuous ? "PASS" : "FAIL"}`);
  console.log(`  Shader Finite Values:    ${allFinite ? "PASS" : "FAIL"}`);
  console.log(`  Binary Threshold Abolition: ${binaryPass ? "PASS" : "FAIL"}`);
  console.log(`  OVERALL:                 ${allPass ? "PASS" : "FAIL"}`);

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("Metalness sweep crashed:", e); process.exit(1); });
