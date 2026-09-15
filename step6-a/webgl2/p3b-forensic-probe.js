/**
 * STEP 7-B P3-B · Shader-Level Forensic Corroboration — READ-ONLY PROBE
 *
 * 独立只读探测：复用 tier-a-render.js 的 GLSL 源码与参数，
 * 仅查询 uniform location / 上传值 / shader 编译信息，
 * 不修改任何现有文件，不向 master 写入补丁。
 *
 * 输出：uniform-level forensic evidence JSON
 */
require("ts-node").register({ project: require("path").join(__dirname, "../../tsconfig.test.json") });

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const { runDetailed } = require("../../tests/golden-cases/GOLDEN_CASE_02/run");

const WIDTH = 480;
const HEIGHT = 270;

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

/**
 * 构建与 tier-a-render.js 完全相同的 GLSL shader，
 * 但在渲染后额外查询 uniform location 和值。
 */
function buildForensicHTML(params) {
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
<!DOCTYPE html><html><head><meta charset="utf-8"><title>P3-B Forensic Probe</title></head>
<body>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
window.__forensicResult = null;
(function() {
  const canvas = document.getElementById("c");
  const gl = canvas.getContext("webgl2", {
    alpha: false, depth: true, antialias: false, preserveDrawingBuffer: true,
  });
  if (!gl) { window.__forensicResult = { error: "webgl2 context null" }; return; }

  // === EXACT SAME SHADERS AS tier-a-render.js ===
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
    uniform float uFov;
    uniform int uUseToneMap;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUV;
      if (uSymmetry > 0.5) { uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x; }
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
            float ndotl = max(0.0, dot(normal, uLightDir));
            float diffuse = uAmbient + ndotl * uLightIntensity * (1.0 - uAmbient);
            layerCol *= diffuse;
            layerCol *= uLightColor;
            float spec = pow(ndotl, 10.0 + uRoughness * 40.0) * (1.0 - uRoughness) * uLightIntensity;
            layerCol += spec * (uMetalness > 0.5 ? uLightColor : vec3(1.0)) * 0.5;
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
      fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  \`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(s);
    return { shader: s, ok, log };
  }

  try {
    const vsResult = compile(gl.VERTEX_SHADER, vs);
    const fsResult = compile(gl.FRAGMENT_SHADER, fs);
    const program = gl.createProgram();
    gl.attachShader(program, vsResult.shader);
    gl.attachShader(program, fsResult.shader);
    gl.linkProgram(program);
    const linkOk = gl.getProgramParameter(program, gl.LINK_STATUS);
    const linkLog = gl.getProgramInfoLog(program);
    gl.useProgram(program);

    // === FORENSIC: Query ALL uniform locations BEFORE upload ===
    const uniformNames = [
      "uDominant", "uSecondary", "uAccent", "uFocal", "uNegSpace",
      "uSymmetry", "uDepthLayers", "uContrast", "uTempBias", "uLightDir",
      "uLightColor", "uLightIntensity", "uAmbient", "uRoughness", "uMetalness",
      "uWear", "uFov", "uUseToneMap",
    ];
    const uniformLocations = {};
    for (const name of uniformNames) {
      const loc = gl.getUniformLocation(program, name);
      uniformLocations[name] = loc === null ? "NULL (optimized out or not found)" : "VALID (location=" + loc + ")";
    }

    // === Upload uniforms (same as tier-a-render.js) ===
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

    // === FORENSIC: Read back uploaded values ===
    const uploadedValues = {};
    for (const name of uniformNames) {
      const loc = gl.getUniformLocation(program, name);
      if (loc !== null) {
        const val = gl.getUniform(program, loc);
        uploadedValues[name] = val instanceof Float32Array ? Array.from(val) : (val instanceof Int32Array ? Array.from(val) : val);
      } else {
        uploadedValues[name] = "UNREADABLE (location null)";
      }
    }

    // === Render (same as tier-a-render.js) ===
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

    // === FORENSIC: Shader source analysis ===
    // Extract the specular line to verify NDF/Geometry
    const fsSource = fs;
    const hasGGX = fsSource.includes("GGX") || fsSource.includes("Trowbridge") || fsSource.includes("D_ggx");
    const hasSmithG = fsSource.includes("Smith") || fsSource.includes("G_Smith") || fsSource.includes("geometrySmith");
    const hasFresnel = fsSource.includes("F0") || fsSource.includes("fresnel") || fsSource.includes("F_schlick");
    const hasPhongPow = fsSource.includes("pow(ndotl") || fsSource.includes("pow(NdotL");
    const hasCookTorrance = fsSource.includes("cookTorrance") || fsSource.includes("CookTorrance");
    const hasEnergyConservation = fsSource.includes("k_d") || fsSource.includes("(1.0 - F)") || fsSource.includes("energyConservation");

    // uMetalness binary threshold analysis
    const metalnessThreshold = 0.5;
    const metalnessValue = ${params.metalness};
    const metalnessBranch = metalnessValue > metalnessThreshold ? "uLightColor (metallic branch)" : "vec3(1.0) (non-metallic branch)";
    const metalnessEffectiveImpact = metalnessValue > metalnessThreshold
      ? "AFFECTS output (uses light color for specular)"
      : "NO EFFECT on current output (0.3605 <= 0.5, same as metalness=0.0)";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

    window.__forensicResult = {
      success: true,
      probe: "P3-B Shader-Level Forensic Corroboration",
      pipelineParams: {
        roughness: ${params.roughness},
        metalness: ${params.metalness},
        wear: ${params.wear},
      },
      shaderCompilation: {
        vertexShaderOK: vsResult.ok,
        vertexShaderLog: vsResult.log,
        fragmentShaderOK: fsResult.ok,
        fragmentShaderLog: fsResult.log,
        linkOK: linkOk,
        linkLog: linkLog,
      },
      uniformLocations: uniformLocations,
      uploadedValues: uploadedValues,
      render: {
        drawError: drawError === gl.NO_ERROR ? "NO_ERROR" : "0x" + drawError.toString(16),
        readError: readError === gl.NO_ERROR ? "NO_ERROR" : "0x" + readError.toString(16),
        pixelBufferByteLength: pixels.length,
      },
      shaderSourceAnalysis: {
        hasGGX_NDF: hasGGX,
        hasSmith_Geometry: hasSmithG,
        hasFresnel: hasFresnel,
        hasPhongPowSpecular: hasPhongPow,
        hasCookTorrance: hasCookTorrance,
        hasEnergyConservation: hasEnergyConservation,
        actualSpecularModel: hasPhongPow ? "Phong/Blinn-Phong style (pow(ndotl, exponent))" : "UNKNOWN",
        actualNDF: "NONE (no microfacet NDF in source)",
        actualGeometryTerm: "NONE (no Smith/GGX geometry term in source)",
        actualFresnel: "NONE (no Fresnel-Schlick in source)",
      },
      metalnessBinaryThresholdAnalysis: {
        uniformValue: metalnessValue,
        threshold: metalnessThreshold,
        branchTaken: metalnessBranch,
        effectiveImpactOnCurrentOutput: metalnessEffectiveImpact,
      },
      renderer: {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
      },
    };

    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
  } catch (e) {
    window.__forensicResult = { success: false, error: e.message };
  }
})();
</script>
</body></html>
`;
}

async function main() {
  console.log("=== STEP 7-B P3-B · Shader-Level Forensic Corroboration ===\n");

  const result = await runDetailed();
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
    fov: validated.camera.fov.value,
    shotSize: validated.camera.shotSize.value,
    angle: validated.camera.angle.value,
    keyAzimuth: validated.lighting.keyLight.azimuth.value,
    keyElevation: validated.lighting.keyLight.elevation.value,
    keyColorTemp: validated.lighting.keyLight.colorTemp.value,
    keyIntensity: validated.lighting.keyLight.intensity.value,
    ambientRatio: validated.lighting.ambientRatio.value,
    rimLightPresent: validated.lighting.rimLightPresent.value,
    roughness: validated.materials[0].roughness.value,
    metalness: validated.materials[0].metalness.value,
    wear: validated.materials[0].wear.value,
    toneMapping: plan.runtimePlan.pipeline.toneMapping,
    postProcessing: plan.runtimePlan.pipeline.postprocessing,
    selectedTier: plan.negotiation.selectedTier,
  };

  console.log(`Pipeline params: roughness=${params.roughness}, metalness=${params.metalness}, wear=${params.wear}`);
  console.log(`Tier: ${params.selectedTier}, ToneMapping: ${params.toneMapping}\n`);

  const browser = await chromium.launch({
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
  await page.setContent(buildForensicHTML(params), { waitUntil: "load" });
  await page.waitForFunction(() => window.__forensicResult !== null, { timeout: 30000 });
  const forensic = await page.evaluate(() => window.__forensicResult);
  await ctx.close();
  await browser.close();

  if (!forensic.success) {
    console.error("FORENSIC PROBE FAILED:", forensic.error);
    process.exit(1);
  }

  // Output structured report
  console.log("=== SHADER COMPILATION ===");
  console.log(`  VS compile: ${forensic.shaderCompilation.vertexShaderOK ? "PASS" : "FAIL"}`);
  console.log(`  FS compile: ${forensic.shaderCompilation.fragmentShaderOK ? "PASS" : "FAIL"}`);
  console.log(`  Link: ${forensic.shaderCompilation.linkOK ? "PASS" : "FAIL"}`);

  console.log("\n=== UNIFORM LOCATIONS (key materials) ===");
  console.log(`  uRoughness: ${forensic.uniformLocations.uRoughness}`);
  console.log(`  uMetalness: ${forensic.uniformLocations.uMetalness}`);
  console.log(`  uWear: ${forensic.uniformLocations.uWear}`);

  console.log("\n=== UPLOADED VALUES (readback via gl.getUniform) ===");
  console.log(`  uRoughness: ${forensic.uploadedValues.uRoughness}`);
  console.log(`  uMetalness: ${forensic.uploadedValues.uMetalness}`);
  console.log(`  uWear: ${forensic.uploadedValues.uWear}`);

  console.log("\n=== SHADER SOURCE ANALYSIS ===");
  console.log(`  GGX NDF present: ${forensic.shaderSourceAnalysis.hasGGX_NDF}`);
  console.log(`  Smith Geometry present: ${forensic.shaderSourceAnalysis.hasSmith_Geometry}`);
  console.log(`  Fresnel present: ${forensic.shaderSourceAnalysis.hasFresnel}`);
  console.log(`  Phong pow(ndotl) present: ${forensic.shaderSourceAnalysis.hasPhongPowSpecular}`);
  console.log(`  Cook-Torrance present: ${forensic.shaderSourceAnalysis.hasCookTorrance}`);
  console.log(`  Energy conservation present: ${forensic.shaderSourceAnalysis.hasEnergyConservation}`);
  console.log(`  ACTUAL specular model: ${forensic.shaderSourceAnalysis.actualSpecularModel}`);
  console.log(`  ACTUAL NDF: ${forensic.shaderSourceAnalysis.actualNDF}`);
  console.log(`  ACTUAL Geometry term: ${forensic.shaderSourceAnalysis.actualGeometryTerm}`);

  console.log("\n=== METALNESS BINARY THRESHOLD ANALYSIS ===");
  console.log(`  uniform value: ${forensic.metalnessBinaryThresholdAnalysis.uniformValue}`);
  console.log(`  threshold: ${forensic.metalnessBinaryThresholdAnalysis.threshold}`);
  console.log(`  branch taken: ${forensic.metalnessBinaryThresholdAnalysis.branchTaken}`);
  console.log(`  effective impact: ${forensic.metalnessBinaryThresholdAnalysis.effectiveImpactOnCurrentOutput}`);

  console.log("\n=== RENDER ===");
  console.log(`  drawError: ${forensic.render.drawError}`);
  console.log(`  readError: ${forensic.render.readError}`);
  console.log(`  pixelBuffer: ${forensic.render.pixelBufferByteLength} bytes`);

  console.log("\n=== RENDERER ===");
  console.log(`  vendor: ${forensic.renderer.vendor}`);
  console.log(`  renderer: ${forensic.renderer.renderer}`);
  console.log(`  version: ${forensic.renderer.version}`);

  // Save forensic evidence
  const evidenceDir = path.join(__dirname, "../evidence/forensic");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "p3b-shader-forensic.json"),
    JSON.stringify(forensic, null, 2)
  );
  console.log(`\nForensic evidence saved to ${evidenceDir}/p3b-shader-forensic.json`);
}

main().catch((e) => { console.error("Forensic probe crashed:", e); process.exit(1); });
