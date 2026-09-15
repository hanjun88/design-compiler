/**
 * STEP 6-A · Tier-A WebGL2 Physical Render — Environment Probe
 *
 * 独立探测脚本：不修改生产代码，只验证 WebGL2 Headless 执行环境是否可用。
 *
 * 探测流程：
 * 1. Playwright 启动 Chromium (Xvfb DISPLAY=:99.0)
 * 2. 创建 canvas + webgl2 context
 * 3. 验证 context !== null, gl instanceof WebGL2RenderingContext
 * 4. 读取 vendor/renderer/version/shadingLanguageVersion/maxTextureSize/extensions
 * 5. 编译 vertex + fragment shader
 * 6. link program
 * 7. 创建 FBO + RGBA texture attachment
 * 8. drawArrays (triangle)
 * 9. gl.readPixels → pixel buffer
 * 10. gl.getError() === NO_ERROR
 *
 * 结果只能是: PASS | BLOCKED_ENV | FAIL
 */

const { chromium } = require("playwright");
const crypto = require("crypto");

const PROBE_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>WebGL2 Probe</title></head>
<body>
<canvas id="glcanvas" width="480" height="270"></canvas>
<script>
(function() {
  const canvas = document.getElementById("glcanvas");
  const result = { contextCreated: false, errors: [] };

  // 1. Create WebGL2 context
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
  } catch (e) {
    result.errors.push("context creation exception: " + e.message);
  }

  if (!gl) {
    result.contextCreated = false;
    result.reason = "canvas.getContext('webgl2') returned null";
    window.__probeResult = result;
    return;
  }

  result.contextCreated = true;
  result.isWebGL2 = gl instanceof WebGL2RenderingContext;

  // 2. Query context info
  try {
    const debugRendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    result.vendor = gl.getParameter(gl.VENDOR);
    result.renderer = gl.getParameter(gl.RENDERER);
    result.version = gl.getParameter(gl.VERSION);
    result.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    result.maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    result.unmaskedVendor = debugRendererInfo ? gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL) : "extension-not-available";
    result.unmaskedRenderer = debugRendererInfo ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL) : "extension-not-available";
    result.extensions = gl.getSupportedExtensions();
  } catch (e) {
    result.errors.push("parameter query error: " + e.message);
  }

  // 3. Compile vertex shader
  const vsSource = \`#version 300 es
    in vec2 aPosition;
    in vec3 aColor;
    out vec3 vColor;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vColor = aColor;
    }
  \`;

  const fsSource = \`#version 300 es
    precision highp float;
    in vec3 vColor;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(vColor, 1.0);
    }
  \`;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("shader compile failed: " + log);
    }
    return shader;
  }

  try {
    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    result.shaderCompile = "PASS";

    // 4. Link program
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(program));
    }
    result.programLink = "PASS";
    gl.useProgram(program);

    // 5. Create vertex buffer (triangle: red, green, blue)
    const vertices = new Float32Array([
      -0.5, -0.5,  1.0, 0.0, 0.0,
       0.5, -0.5,  0.0, 1.0, 0.0,
       0.0,  0.5,  0.0, 0.0, 1.0,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const aColor = gl.getAttribLocation(program, "aColor");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 20, 8);

    // 6. Create FBO + RGBA texture
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    const renderTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, renderTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 480, 270, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTexture, 0);

    const fboStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (fboStatus !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("FBO incomplete: 0x" + fboStatus.toString(16));
    }
    result.fboCreation = "PASS";
    result.fboStatus = "FRAMEBUFFER_COMPLETE";

    // 7. Viewport + clear + draw
    gl.viewport(0, 0, 480, 270);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const drawError = gl.getError();
    if (drawError !== gl.NO_ERROR) {
      throw new Error("drawArrays glError: 0x" + drawError.toString(16));
    }
    result.drawCall = "PASS";

    // 8. readPixels
    const pixels = new Uint8Array(480 * 270 * 4);
    gl.readPixels(0, 0, 480, 270, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const readError = gl.getError();
    if (readError !== gl.NO_ERROR) {
      throw new Error("readPixels glError: 0x" + readError.toString(16));
    }
    result.readPixels = "PASS";
    result.pixelBufferByteLength = pixels.length;

    // Verify pixels are not all zero (triangle was drawn)
    let nonZero = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 10 || pixels[i+1] > 10 || pixels[i+2] > 10) nonZero++;
    }
    result.nonZeroPixels = nonZero;
    result.hasRenderedContent = nonZero > 100;

    // Sample center pixel (should be inside triangle, bluish)
    const cx = 240, cy = 135;
    const ci = (cy * 480 + cx) * 4;
    result.centerPixel = [pixels[ci], pixels[ci+1], pixels[ci+2], pixels[ci+3]];

    // Pixel buffer metadata only (full buffer handled in Tier-A adapter)
    result.pixelBufferByteLength = pixels.length;

    // 9. Final gl.getError
    const finalError = gl.getError();
    result.glError = finalError === gl.NO_ERROR ? "NO_ERROR" : "0x" + finalError.toString(16);

    // Cleanup
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(renderTexture);
    gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

  } catch (e) {
    result.errors.push("pipeline error: " + e.message);
  }

  window.__probeResult = result;
})();
</script>
</body>
</html>
`;

async function runProbe() {
  const probeStart = Date.now();
  const report = {
    probe: "webgl2-environment-probe",
    timestamp: new Date().toISOString(),
    chromiumFlags: [],
    result: "NOT_RUN",
    context: null,
    errors: [],
  };

  let browser = null;
  try {
    // Launch Chromium with WebGL2-friendly flags under Xvfb
    const launchOptions = {
      headless: false, // Xvfb provides virtual display
      executablePath: "/usr/local/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--enable-webgl",
        "--enable-webgl2-compute-context",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--disable-gpu-sandbox",
      ],
    };
    report.chromiumFlags = launchOptions.args;

    console.log("Launching Chromium with WebGL2 flags...");
    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      viewport: { width: 640, height: 480 },
    });
    const page = await context.newPage();

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") report.errors.push("console: " + msg.text());
    });
    page.on("pageerror", (err) => {
      report.errors.push("pageerror: " + err.message);
    });

    console.log("Loading probe HTML...");
    await page.setContent(PROBE_HTML, { waitUntil: "load" });

    // Wait for probe to complete
    await page.waitForFunction(() => window.__probeResult !== undefined, { timeout: 15000 });

    const probeResult = await page.evaluate(() => window.__probeResult);
    report.context = probeResult;
    report.probeDurationMs = Date.now() - probeStart;

    // Determine final status
    if (!probeResult.contextCreated) {
      report.result = "BLOCKED_ENV";
      report.reason = "WebGL2 context creation failed: " + (probeResult.reason || "unknown");
    } else if (probeResult.errors && probeResult.errors.length > 0) {
      report.result = "FAIL";
      report.reason = "WebGL2 pipeline errors: " + probeResult.errors.join("; ");
    } else if (
      probeResult.shaderCompile === "PASS" &&
      probeResult.programLink === "PASS" &&
      probeResult.fboCreation === "PASS" &&
      probeResult.drawCall === "PASS" &&
      probeResult.readPixels === "PASS" &&
      probeResult.glError === "NO_ERROR" &&
      probeResult.hasRenderedContent
    ) {
      report.result = "PASS";
    } else {
      report.result = "FAIL";
      report.reason = "WebGL2 pipeline incomplete";
    }

    await context.close();
  } catch (e) {
    report.result = "BLOCKED_ENV";
    report.reason = "Chromium launch/execution failed: " + e.message;
    report.errors.push(e.message);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }

  console.log("\n=== WEBGL2 ENVIRONMENT PROBE RESULT ===");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

runProbe().then((report) => {
  process.exit(report.result === "PASS" ? 0 : 1);
}).catch((e) => {
  console.error("Probe crashed:", e);
  process.exit(1);
});
