/**
 * STEP 6-A · Tier-A WebGL2 — Minimal Physical Render Smoke Test
 *
 * 独立于 environment-probe 的最小物理渲染验证。
 * 输出: width, height, pixelBufferByteLength, pixelBufferSHA256, drawCalls, glError
 * 连续执行两次验证确定性。
 *
 * 严禁使用 Software Render Reference 生成 pixel buffer。
 * 所有像素必须来自 gl.readPixels(...)。
 */

const { chromium } = require("playwright");
const crypto = require("crypto");

const WIDTH = 480;
const HEIGHT = 270;

const SMOKE_HTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WebGL2 Smoke</title></head>
<body>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
window.__smokeResult = null;
(function() {
  const canvas = document.getElementById("c");
  const gl = canvas.getContext("webgl2", {
    alpha: false, depth: true, antialias: false, preserveDrawingBuffer: true,
  });
  if (!gl) { window.__smokeResult = { error: "webgl2 context null" }; return; }

  // Vertex shader: fullscreen quad with UV
  const vs = \`#version 300 es
    in vec2 aPos;
    in vec2 aUV;
    out vec2 vUV;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aUV; }
  \`;

  // Fragment shader: gradient + circle pattern (deterministic, no random)
  const fs = \`#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;
    void main() {
      // Diagonal gradient: dark blue → warm orange
      vec3 c1 = vec3(0.05, 0.08, 0.15);
      vec3 c2 = vec3(0.9, 0.5, 0.2);
      vec3 col = mix(c1, c2, vUV.x * 0.6 + vUV.y * 0.4);
      // Circle in center
      float d = distance(vUV, vec2(0.5, 0.5));
      float circle = smoothstep(0.25, 0.24, d);
      col = mix(col, vec3(0.1, 0.8, 0.6), circle);
      // Horizontal scan lines
      col *= 0.95 + 0.05 * sin(vUV.y * 3.14159 * 40.0);
      fragColor = vec4(col, 1.0);
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
    const verts = new Float32Array([
      -1, -1, 0, 0,   1, -1, 1, 0,   -1, 1, 0, 1,
      -1, 1, 0, 1,    1, -1, 1, 0,   1, 1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    const aUV = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

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

    // Read pixels
    const pixels = new Uint8Array(${WIDTH * HEIGHT * 4});
    gl.readPixels(0, 0, ${WIDTH}, ${HEIGHT}, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const readError = gl.getError();

    // Verify non-zero
    let nz = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 5 || pixels[i+1] > 5 || pixels[i+2] > 5) nz++;

    window.__smokeResult = {
      success: true,
      width: ${WIDTH},
      height: ${HEIGHT},
      pixelBufferByteLength: pixels.length,
      nonZeroPixels: nz,
      drawCalls: 1,
      drawError: drawError === gl.NO_ERROR ? "NO_ERROR" : "0x" + drawError.toString(16),
      readError: readError === gl.NO_ERROR ? "NO_ERROR" : "0x" + readError.toString(16),
      glError: (drawError === gl.NO_ERROR && readError === gl.NO_ERROR) ? "NO_ERROR" : "HAS_ERROR",
      centerPixel: [pixels[(${HEIGHT}/2 * ${WIDTH} + ${WIDTH}/2) * 4], pixels[(${HEIGHT}/2 * ${WIDTH} + ${WIDTH}/2) * 4 + 1], pixels[(${HEIGHT}/2 * ${WIDTH} + ${WIDTH}/2) * 4 + 2], pixels[(${HEIGHT}/2 * ${WIDTH} + ${WIDTH}/2) * 4 + 3]],
      pixels: Array.from(pixels),
    };

    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
  } catch (e) {
    window.__smokeResult = { success: false, error: e.message };
  }
})();
</script>
</body></html>
`;

async function runSmoke(runId) {
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
    await page.setContent(SMOKE_HTML, { waitUntil: "load" });
    await page.waitForFunction(() => window.__smokeResult !== null, { timeout: 15000 });
    const result = await page.evaluate(() => window.__smokeResult);
    await ctx.close();

    if (!result.success) {
      return { runId, success: false, error: result.error, durationMs: Date.now() - start };
    }

    // Compute SHA-256 from pixel buffer (Node.js)
    const pixelBuffer = Buffer.from(result.pixels);
    const pixelBufferSHA256 = "sha256:" + crypto.createHash("sha256").update(pixelBuffer).digest("hex");

    return {
      runId,
      success: true,
      width: result.width,
      height: result.height,
      pixelBufferByteLength: result.pixelBufferByteLength,
      pixelBufferSHA256,
      nonZeroPixels: result.nonZeroPixels,
      drawCalls: result.drawCalls,
      drawError: result.drawError,
      readError: result.readError,
      glError: result.glError,
      centerPixel: result.centerPixel,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return { runId, success: false, error: e.message, durationMs: Date.now() - start };
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
}

async function main() {
  console.log("=== WebGL2 Minimal Physical Render Smoke Test ===\n");

  console.log("Run 01...");
  const r1 = await runSmoke("run-01");
  console.log(JSON.stringify(r1, null, 2));

  console.log("\nRun 02 (determinism check)...");
  const r2 = await runSmoke("run-02");
  console.log(JSON.stringify(r2, null, 2));

  const determinism = r1.success && r2.success && r1.pixelBufferSHA256 === r2.pixelBufferSHA256;
  console.log("\n=== DETERMINISM ===");
  console.log(`run-01 hash: ${r1.pixelBufferSHA256}`);
  console.log(`run-02 hash: ${r2.pixelBufferSHA256}`);
  console.log(`IDENTICAL: ${determinism}`);

  const allPass = r1.success && r2.success &&
    r1.glError === "NO_ERROR" && r2.glError === "NO_ERROR" &&
    r1.nonZeroPixels > 1000 && r2.nonZeroPixels > 1000 &&
    determinism;

  console.log(`\nSMOKE TEST RESULT: ${allPass ? "PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("Smoke test crashed:", e); process.exit(1); });
