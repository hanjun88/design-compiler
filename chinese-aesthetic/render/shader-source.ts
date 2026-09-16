/**
 * Phase 5 Step 5.2-B - Shader Source & NDC Encoding Utilities
 *
 * Provides minimal verification-grade GLSL 300 es shader pairs and
 * deterministic NDC↔RGBA encoding/decoding pure functions for
 * camera-matrix pixel-causal verification (PLAN-02 Cond 1).
 *
 * Conforms to CHINESE-AESTHETIC-P5-S5.2-PLAN-02 §1
 */

// ─── NDC Encoding (PLAN-02 §1.2, auditor-refined) ───

/**
 * Encode a single NDC coordinate [-1, 1] to an 8-bit unsigned integer [0, 255].
 *
 * Mapping: encoded = clamp((ndc + 1.0) * 0.5, 0, 1) * 255, rounded to nearest.
 *
 * Quantization error bound: ±0.5 LSB in [0,255] → ±1/255 in NDC [-1,1].
 *
 * @param ndc - NDC coordinate in [-1, 1]. Values outside are clamped.
 * @returns integer in [0, 255]
 */
export function encodeNdcToByte(ndc: number): number {
  const clamped = Math.max(-1.0, Math.min(1.0, ndc));
  const normalized = (clamped + 1.0) * 0.5; // [0, 1]
  return Math.floor(normalized * 255 + 0.5); // round to nearest [0, 255]
}

/**
 * Decode an 8-bit unsigned integer [0, 255] back to NDC [-1, 1].
 *
 * Inverse: ndc = (byte / 255) * 2 - 1
 *
 * @param byte - integer in [0, 255]
 * @returns NDC coordinate in [-1, 1]
 */
export function decodeByteToNdc(byte: number): number {
  const clamped = Math.max(0, Math.min(255, byte));
  return (clamped / 255) * 2 - 1;
}

/**
 * Encode NDC (x, y) to RGBA 8-bit tuple.
 * R channel = ndc_x encoded, G channel = ndc_y encoded, B = 0, A = 255.
 *
 * Used in fragment shader output and CPU-side verification.
 */
export function encodeNdcToRgba(ndcX: number, ndcY: number): readonly [number, number, number, number] {
  return [encodeNdcToByte(ndcX), encodeNdcToByte(ndcY), 0, 255] as const;
}

/**
 * Decode RGBA 8-bit tuple back to NDC (x, y).
 */
export function decodeRgbaToNdc(r: number, g: number): readonly [number, number] {
  return [decodeByteToNdc(r), decodeByteToNdc(g)] as const;
}

/**
 * Error budget for NDC round-trip verification (PLAN-02 §1.2, auditor-refined).
 *
 * Sources:
 *   1. Quantization: ±0.5 LSB in [0,255] → ±1/255 in NDC ≈ ±0.00392
 *   2. Floating-point in shader: < 1e-6 (negligible)
 *   3. readPixels format conversion: UNORM8, exact for point primitives
 *
 * Total worst-case: ≈ 1.01/255
 * Assertion tolerance: 2/255 (safety margin for driver variability)
 */
export const NDC_DECODE_TOLERANCE = 2 / 255;

/**
 * Verify NDC round-trip error is within tolerance.
 * @returns true if |expected - actual| <= NDC_DECODE_TOLERANCE
 */
export function isNdcWithinTolerance(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= NDC_DECODE_TOLERANCE;
}

// ─── GLSL Shader Sources ───

/**
 * NDC-encoding vertex shader (for camera-matrix pixel-causal verification).
 *
 * Computes gl_Position = uViewProjection * vec4(aPosition, 1.0)
 * and passes vNdc = gl_Position.xy / gl_Position.w to fragment shader.
 *
 * Uses point primitives (gl.POINTS) to avoid triangle interpolation
 * masking per-vertex errors (PLAN-02 §1.1 note).
 */
export const NDC_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 uViewProjection;

out vec2 vNdc;

void main() {
  vec4 clip = uViewProjection * vec4(aPosition, 1.0);
  gl_Position = clip;
  gl_PointSize = 5.0;
  vNdc = clip.xy / clip.w;
}
`;

/**
 * NDC-encoding fragment shader.
 *
 * Encodes interpolated vNdc to RGBA:
 *   R = (vNdc.x + 1.0) * 0.5  → [0, 1] → UNORM8 [0, 255]
 *   G = (vNdc.y + 1.0) * 0.5
 *   B = 0.0
 *   A = 1.0
 *
 * CPU decodes: ndc = (byte / 255) * 2 - 1
 */
export const NDC_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vNdc;
out vec4 fragColor;

void main() {
  fragColor = vec4((vNdc.x + 1.0) * 0.5, (vNdc.y + 1.0) * 0.5, 0.0, 1.0);
}
`;

/**
 * Standard render vertex shader (for golden frame and near-plane clipping tests).
 *
 * Standard MVP transform: gl_Position = uViewProjection * vec4(aPosition, 1.0)
 * Passes vertex color to fragment shader for primitive identification.
 */
export const STANDARD_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;

uniform mat4 uViewProjection;

out vec3 vColor;

void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vColor = aColor;
}
`;

/**
 * Standard render fragment shader.
 * Outputs interpolated vertex color with full opacity.
 */
export const STANDARD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vColor;
out vec4 fragColor;

void main() {
  fragColor = vec4(vColor, 1.0);
}
`;

// ─── Shader Compilation Utility ───

export interface ShaderCompileResult {
  readonly program: WebGLProgram;
  readonly vertexShader: WebGLShader;
  readonly fragmentShader: WebGLShader;
  readonly linkStatus: boolean;
  readonly infoLog: string;
}

/**
 * Compile and link a shader program from vertex + fragment source strings.
 * Returns program and individual shader handles for proper cleanup.
 *
 * @throws Error if compilation or linking fails, with infoLog in message.
 */
export function compileShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): ShaderCompileResult {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  if (!vertexShader) {
    throw new Error('SHADER_CREATE_FAILED: Unable to create vertex shader object');
  }
  gl.shaderSource(vertexShader, vertexSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(vertexShader) ?? 'unknown';
    gl.deleteShader(vertexShader);
    throw new Error(`VERTEX_SHADER_COMPILE_FAILED: ${log}`);
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    throw new Error('SHADER_CREATE_FAILED: Unable to create fragment shader object');
  }
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(fragmentShader) ?? 'unknown';
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`FRAGMENT_SHADER_COMPILE_FAILED: ${log}`);
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('PROGRAM_CREATE_FAILED: Unable to create program object');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const linkStatus = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  const infoLog = gl.getProgramInfoLog(program) ?? '';

  if (!linkStatus) {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`PROGRAM_LINK_FAILED: ${infoLog}`);
  }

  return { program, vertexShader, fragmentShader, linkStatus, infoLog };
}

/**
 * Safely dispose a compiled shader program and its attached shaders.
 */
export function disposeShaderProgram(
  gl: WebGL2RenderingContext,
  result: ShaderCompileResult
): void {
  gl.deleteProgram(result.program);
  gl.deleteShader(result.vertexShader);
  gl.deleteShader(result.fragmentShader);
}
