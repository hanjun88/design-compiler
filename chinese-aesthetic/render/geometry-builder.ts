/**
 * Phase 5 Step 5.2-B - Geometry Builder & Test Mesh Definitions
 *
 * Provides deterministic test geometry for:
 *   1. NDC camera-matrix pixel-causal verification (PLAN-02 Cond 1)
 *   2. Near-plane clipping triangle tests (PLAN-02 Cond 2)
 *   3. Golden frame reference render
 *
 * COORDINATE SPACE CLARIFICATION (PLAN-02 Cond 2, auditor gap-1 resolution):
 *   - Near-plane clipping test triangles are defined in CAMERA SPACE.
 *   - Perspective projection: FOV 90°, Aspect 1.0, Near 1.0, Far 10.0.
 *   - OpenGL convention: camera looks along -Z.
 *   - Visible z range in camera space: [-far, -near] = [-10, -1].
 *   - Clip-space w = -z_camera (standard perspective matrix).
 *   - A vertex is culled by the near plane when z_clip < -w_clip
 *     (NOT simply when w_clip < 0 — w_clip > 0 does not guarantee visibility).
 *
 * Conforms to CHINESE-AESTHETIC-P5-S5.2-PLAN-02 §2
 */

import { CapabilityTier } from './degradation-ladder';

// ─── Types ───

export interface VertexP {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VertexPC extends VertexP {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface TriangleMesh {
  readonly id: string;
  readonly coordinateSpace: 'world' | 'camera' | 'clip';
  readonly vertices: readonly VertexPC[];
  readonly indices: readonly number[];
  readonly primitiveType: 'triangles' | 'points';
  readonly description: string;
}

// ─── Perspective Projection Parameters (PLAN-02 §2.1) ───

export const NEAR_CLIP_TEST_FOV_Y_RAD = Math.PI / 2; // 90°
export const NEAR_CLIP_TEST_ASPECT = 1.0;
export const NEAR_CLIP_TEST_NEAR = 1.0;
export const NEAR_CLIP_TEST_FAR = 10.0;

/**
 * Compute clip-space coordinates (x_c, y_c, z_c, w_c) for a camera-space vertex
 * using the standard symmetric perspective projection matrix.
 *
 * Matrix (column-major, OpenGL):
 *   [ n/r   0     0            0        ]
 *   [ 0     n/t   0            0        ]
 *   [ 0     0    -(f+n)/(f-n) -2fn/(f-n)]
 *   [ 0     0    -1             0        ]
 *
 * where t = n * tan(fovY/2), r = t * aspect.
 *
 * For FOV 90°, aspect 1.0, near 1.0, far 10.0:
 *   t = 1.0, r = 1.0
 *   Matrix = [[1,0,0,0], [0,1,0,0], [0,0,-11/9,-20/9], [0,0,-1,0]]
 */
export function cameraSpaceToClipSpace(
  x: number,
  y: number,
  z: number,
  fovYRad: number = NEAR_CLIP_TEST_FOV_Y_RAD,
  aspect: number = NEAR_CLIP_TEST_ASPECT,
  near: number = NEAR_CLIP_TEST_NEAR,
  far: number = NEAR_CLIP_TEST_FAR
): readonly [number, number, number, number] {
  const t = near * Math.tan(fovYRad / 2);
  const r = t * aspect;
  const nOverR = near / r;
  const nOverT = near / t;
  const zScale = -(far + near) / (far - near);
  const zTranslate = -2 * far * near / (far - near);

  const xc = nOverR * x;
  const yc = nOverT * y;
  const zc = zScale * z + zTranslate;
  const wc = -z;

  return [xc, yc, zc, wc] as const;
}

/**
 * Check if a clip-space vertex is inside the view frustum.
 * Visibility condition: -w <= x <= w, -w <= y <= w, -w <= z <= w.
 *
 * Returns which planes (if any) the vertex is outside.
 */
export function classifyClipVertex(
  xc: number,
  yc: number,
  zc: number,
  wc: number
): { readonly visible: boolean; readonly outsidePlanes: readonly string[] } {
  const outside: string[] = [];
  if (xc < -wc) outside.push('LEFT');
  if (xc > wc) outside.push('RIGHT');
  if (yc < -wc) outside.push('BOTTOM');
  if (yc > wc) outside.push('TOP');
  if (zc < -wc) outside.push('NEAR');
  if (zc > wc) outside.push('FAR');
  return { visible: outside.length === 0, outsidePlanes: outside } as const;
}

// ─── NDC Verification Test Vertices (PLAN-02 §1.3) ───

/**
 * Three deterministic test vertices in WORLD space for NDC camera-matrix
 * pixel-causal verification. Used with all 3 camera poses.
 *
 * These vertices are chosen to be visible from all three poses:
 *   - V1: origin (0,0,0)
 *   - V2: +X axis (1,0,0)
 *   - V3: +Y axis (0,1,0)
 *
 * Each vertex gets a unique color for identification in readPixels.
 */
export const NDC_TEST_VERTICES: readonly VertexPC[] = [
  { x: 0, y: 0, z: 0, r: 1.0, g: 0.0, b: 0.0 }, // V1: red
  { x: 1, y: 0, z: 0, r: 0.0, g: 1.0, b: 0.0 }, // V2: green
  { x: 0, y: 1, z: 0, r: 0.0, g: 0.0, b: 1.0 }, // V3: blue
] as const;

export const NDC_TEST_MESH: TriangleMesh = {
  id: 'ndc-verification-points',
  coordinateSpace: 'world',
  vertices: NDC_TEST_VERTICES,
  indices: [], // Empty → drawArrays(POINTS); PLAN-02 §1.1 requires point primitives to avoid triangle interpolation masking per-vertex errors
  primitiveType: 'points',
  description: 'Three world-space vertices rendered as POINTS for NDC per-vertex verification',
};

// ─── Near-Plane Clipping Test Geometry (PLAN-02 §2) ───

/**
 * PARTIAL-VISIBLE test triangle (PLAN-02 §2.2).
 *
 * CAMERA SPACE coordinates. Perspective: FOV 90°, Aspect 1.0, Near 1.0, Far 10.0.
 *
 * Vertex A: (-0.5, -0.5, -0.5)
 *   - z = -0.5 is between camera (z=0) and near plane (z=-1.0)
 *   - Clip space: xc=-0.5, yc=-0.5, zc≈-1.611, wc=0.5
 *   - zc < -wc (-1.611 < -0.5) → CULLED BY NEAR PLANE
 *   - NOTE: wc > 0 (0.5), but vertex is still culled because zc < -wc.
 *     This is the auditor gap-1 resolution: near-plane culling is determined
 *     by zc < -wc, NOT by wc < 0.
 *
 * Vertex B: (0.5, -0.5, -2.0)
 *   - z = -2.0 is in visible range [-10, -1]
 *   - Clip space: xc=0.5, yc=-0.5, zc≈0.222, wc=2.0
 *   - All |coords| <= wc → VISIBLE
 *
 * Vertex C: (0.0, 0.5, -2.0)
 *   - z = -2.0 is in visible range
 *   - Clip space: xc=0.0, yc=0.5, zc≈0.222, wc=2.0
 *   - All |coords| <= wc → VISIBLE
 *
 * Expected: HARDWARE CLIPPING retains visible portion (B-C edge clipped at near plane).
 * CPU PRE-CLIP: FORBIDDEN (original vertex data preserved, no CPU-side triangle cutting).
 */
export const NEAR_CLIP_PARTIAL_TRIANGLE: TriangleMesh = {
  id: 'near-clip-partial-visible',
  coordinateSpace: 'camera',
  vertices: [
    { x: -0.5, y: -0.5, z: -0.5, r: 1.0, g: 0.3, b: 0.3 }, // A: culled (near plane)
    { x: 0.5, y: -0.5, z: -2.0, r: 0.3, g: 1.0, b: 0.3 }, // B: visible
    { x: 0.0, y: 0.5, z: -2.0, r: 0.3, g: 0.3, b: 1.0 },  // C: visible
  ],
  indices: [0, 1, 2],
  primitiveType: 'triangles',
  description: 'Camera-space triangle crossing near plane: A culled (zc<-wc), B/C visible. Hardware clipping expected.',
};

/**
 * FULLY-INVISIBLE control triangle (PLAN-02 §2.3).
 *
 * CAMERA SPACE. All three vertices at z=+0.5 (behind camera, opposite view direction).
 *
 * For each vertex: wc = -z = -0.5 < 0.
 * With wc < 0, all clip inequalities flip → all vertices outside frustum.
 *
 * Expected: FULLY CLIPPED, EXPECTED_VISIBLE_FRAGMENT_COUNT = 0.
 */
export const NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE: TriangleMesh = {
  id: 'near-clip-fully-invisible',
  coordinateSpace: 'camera',
  vertices: [
    { x: -0.5, y: -0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 },
    { x: 0.5, y: -0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 },
    { x: 0.0, y: 0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 },
  ],
  indices: [0, 1, 2],
  primitiveType: 'triangles',
  description: 'Camera-space triangle entirely behind camera (z>0). Expected fully clipped, 0 fragments.',
};

// ─── Golden Frame Reference Geometry ───

/**
 * Standard reference triangle for golden frame generation.
 *
 * CAMERA SPACE. Perspective: FOV 60°, Aspect 320/240, Near 0.1, Far 100.
 * Camera at (0,0,5) looking at origin.
 *
 * Vertices form a triangle centered at origin, size ~2 units, at z=0.
 * All vertices well within visible range (z=0, near=0.1, far=100).
 *
 * Colors: red, green, blue for visual identification.
 */
export const GOLDEN_FRAME_TRIANGLE: TriangleMesh = {
  id: 'golden-frame-reference',
  coordinateSpace: 'camera',
  vertices: [
    { x: 0.0, y: 0.8, z: 0.0, r: 0.9, g: 0.2, b: 0.2 }, // top: red
    { x: -0.8, y: -0.6, z: 0.0, r: 0.2, g: 0.8, b: 0.2 }, // bottom-left: green
    { x: 0.8, y: -0.6, z: 0.0, r: 0.2, g: 0.2, b: 0.8 },  // bottom-right: blue
  ],
  indices: [0, 1, 2],
  primitiveType: 'triangles',
  description: 'Camera-space reference triangle for golden frame. Centered at origin, RGB vertices.',
};

// ─── Vertex Buffer Builders ───

/**
 * Build a Float32Array of interleaved position+color data from a TriangleMesh.
 * Layout: [x, y, z, r, g, b, x, y, z, r, g, b, ...]
 * Stride: 6 floats (24 bytes).
 */
export function buildInterleavedVertexBuffer(mesh: TriangleMesh): Float32Array {
  const buffer = new Float32Array(mesh.vertices.length * 6);
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    if (!v) continue;
    buffer[i * 6 + 0] = v.x;
    buffer[i * 6 + 1] = v.y;
    buffer[i * 6 + 2] = v.z;
    buffer[i * 6 + 3] = v.r;
    buffer[i * 6 + 4] = v.g;
    buffer[i * 6 + 5] = v.b;
  }
  return buffer;
}

/**
 * Build a Uint16Array of indices from a TriangleMesh.
 */
export function buildIndexBuffer(mesh: TriangleMesh): Uint16Array {
  return new Uint16Array(mesh.indices);
}

/**
 * Compute SHA-256 fingerprint of vertex data (for input-manifest).
 * Requires Node.js crypto or Web Crypto API.
 * In browser context, use crypto.subtle.digest('SHA-256', buffer).
 */
export async function computeVertexDataSha256(vertexBuffer: Float32Array): Promise<string> {
  const arrayBuffer = vertexBuffer.buffer.slice(
    vertexBuffer.byteOffset,
    vertexBuffer.byteOffset + vertexBuffer.byteLength
  ) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Gap-1 Verification: Manual Clip-Space Calculation ───

/**
 * Pre-computed clip-space coordinates for the partial-visible triangle,
 * used as auditor evidence for gap-1 (coordinate space clarification).
 *
 * Perspective: FOV 90°, Aspect 1.0, Near 1.0, Far 10.0.
 * Matrix: [[1,0,0,0],[0,1,0,0],[0,0,-11/9,-20/9],[0,0,-1,0]]
 */
export const PARTIAL_TRIANGLE_CLIP_SPACE: readonly {
  readonly vertex: string;
  readonly cameraSpace: readonly [number, number, number];
  readonly clipSpace: readonly [number, number, number, number];
  readonly classification: string;
}[] = [
  {
    vertex: 'A',
    cameraSpace: [-0.5, -0.5, -0.5],
    clipSpace: [-0.5, -0.5, -14.5 / 9, 0.5], // zc ≈ -1.611, wc = 0.5
    classification: 'CULLED_BY_NEAR_PLANE (zc < -wc: -1.611 < -0.5). NOTE: wc > 0.',
  },
  {
    vertex: 'B',
    cameraSpace: [0.5, -0.5, -2.0],
    clipSpace: [0.5, -0.5, 2 / 9, 2.0], // zc ≈ 0.222, wc = 2.0
    classification: 'VISIBLE (all |coords| <= wc: 0.5 <= 2.0, 0.222 <= 2.0)',
  },
  {
    vertex: 'C',
    cameraSpace: [0.0, 0.5, -2.0],
    clipSpace: [0.0, 0.5, 2 / 9, 2.0], // zc ≈ 0.222, wc = 2.0
    classification: 'VISIBLE (all |coords| <= wc: 0.5 <= 2.0, 0.222 <= 2.0)',
  },
] as const;
