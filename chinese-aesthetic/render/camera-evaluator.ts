/**
 * Phase 5 Step 5.2 - Rigid Camera Evaluator & Algebraic Guardrails
 * Column-Major Float32Array Output & Numerical Overflow Protections.
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §6
 */

export type CameraMatrixEvaluationKind = 'VALID' | 'ZERO_VIEWPORT';

export interface CameraEvaluatedMatrices {
  readonly kind: CameraMatrixEvaluationKind;
  readonly viewMatrix: Float32Array;           // 16 elements (column-major)
  readonly projectionMatrix: Float32Array;     // 16 elements (column-major)
  readonly viewProjectionMatrix: Float32Array; // 16 elements (column-major)
}

export interface CameraInputs {
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly fovYRad: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

const EPSILON = 1e-6;

export function evaluateCameraMatrices(inputs: CameraInputs): CameraEvaluatedMatrices {
  const { eye, target, up, fovYRad, aspect, near, far, viewportWidth, viewportHeight } = inputs;

  // Step 1: Numerical Overflow Guard
  const scalars = [
    eye[0], eye[1], eye[2],
    target[0], target[1], target[2],
    up[0], up[1], up[2],
    fovYRad, aspect, near, far
  ];
  for (let i = 0; i < scalars.length; i++) {
    const val = scalars[i];
    if (val === undefined || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error('CAMERA_NUMERICAL_OVERFLOW: Scalar parameter contains NaN or Infinity.');
    }
  }

  // Step 2: Coincidence Degeneracy Guard
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq < EPSILON * EPSILON) {
    throw new Error('CAMERA_DEGENERATE_TARGET: Eye and target positions are coincident.');
  }

  // Step 3: Collinear Up Guard
  // d = eye - target
  // cross = up x d
  const cx = up[1] * dz - up[2] * dy;
  const cy = up[2] * dx - up[0] * dz;
  const cz = up[0] * dy - up[1] * dx;
  const crossNormSq = cx * cx + cy * cy + cz * cz;
  if (crossNormSq < EPSILON * EPSILON) {
    throw new Error('CAMERA_COLLINEAR_UP: Up vector is collinear with observation ray.');
  }

  // Step 4: Zero-Area Viewport Guard
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    const identity = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    return {
      kind: 'ZERO_VIEWPORT',
      viewMatrix: identity,
      projectionMatrix: identity,
      viewProjectionMatrix: identity
    };
  }

  // Compute LookAt View Matrix (Column-Major)
  const dist = Math.sqrt(distSq);
  const zx = dx / dist;
  const zy = dy / dist;
  const zz = dz / dist;

  const crossNorm = Math.sqrt(crossNormSq);
  const xx = cx / crossNorm;
  const xy = cy / crossNorm;
  const xz = cz / crossNorm;

  // y = z x x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const tx = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  const ty = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  const tz = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);

  const viewMatrix = new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    tx, ty, tz, 1
  ]);

  // Compute Perspective Projection Matrix (Column-Major, 16 elements matching §6.2)
  const f = 1.0 / Math.tan(fovYRad / 2.0);
  const nf = 1.0 / (near - far);

  const projectionMatrix = new Float32Array([
    /* Col 0 */ f / aspect, 0, 0, 0,
    /* Col 1 */ 0, f, 0, 0,
    /* Col 2 */ 0, 0, (far + near) * nf, -1,
    /* Col 3 */ 0, 0, (2.0 * far * near) * nf, 0
  ]);

  // Multiply VP = P * V (Column-Major Matrix Multiplication)
  const viewProjectionMatrix = multiply4x4(projectionMatrix, viewMatrix);

  return {
    kind: 'VALID',
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix
  };
}

function multiply4x4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}