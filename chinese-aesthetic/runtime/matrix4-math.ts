/**
 * matrix4-math.ts — 4x4 Matrix Determinant, Projection & View Validation
 *
 * Phase 5 Step 5.1. Column-major 4x4 matrix math for camera pipeline validation.
 * All functions are pure (no I/O, no state).
 */

/** Column-major 4x4 matrix as readonly 16-tuple. */
export type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/**
 * Compute determinant of a column-major 4x4 matrix.
 *
 * Layout:
 *   [m0 m4 m8  m12]
 *   [m1 m5 m9  m13]
 *   [m2 m6 m10 m14]
 *   [m3 m7 m11 m15]
 */
export function determinant4x4(m: Matrix4): number {
  const [
    m0, m1, m2, m3,
    m4, m5, m6, m7,
    m8, m9, m10, m11,
    m12, m13, m14, m15,
  ] = m;

  const b00 = m0 * m5 - m1 * m4;
  const b01 = m0 * m6 - m2 * m4;
  const b02 = m0 * m7 - m3 * m4;
  const b03 = m1 * m6 - m2 * m5;
  const b04 = m1 * m7 - m3 * m5;
  const b05 = m2 * m7 - m3 * m6;
  const b06 = m8 * m13 - m9 * m12;
  const b07 = m8 * m14 - m10 * m12;
  const b08 = m8 * m15 - m11 * m12;
  const b09 = m9 * m14 - m10 * m13;
  const b10 = m9 * m15 - m11 * m13;
  const b11 = m10 * m15 - m11 * m14;

  return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
}

/**
 * Validate a projection matrix: all elements finite + determinant non-singular.
 *
 * Note: this is an algebraic non-degeneracy check only. It does NOT prove
 * frustum perspective geometric completeness.
 */
export function assertValidProjectionMatrix(m: Matrix4, label: string): void {
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(m[i])) {
      throw new Error(`PROJECTION_NON_FINITE: [${label}] element at index ${i} is not finite`);
    }
  }
  const det = determinant4x4(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-7) {
    throw new Error(
      `PROJECTION_SINGULAR: [${label}] determinant (${det}) is degenerate or near zero`,
    );
  }
}

/**
 * Validate a view matrix as a valid SE(3) rigid-body transform.
 *
 * V = [R  t]  where R ∈ SO(3), t ∈ ℝ³
 *     [0ᵀ 1]
 *
 * Check order (strict):
 * 1. All 16 elements finite
 * 2. Bottom row = [0, 0, 0, 1]
 * 3. Translation elements finite
 * 4. Rotation column vectors unit length (±1e-5)
 * 5. Rotation column vectors pairwise orthogonal (±1e-5)
 * 6. det(R) = +1.0 (±1e-5) — excludes reflection
 */
export function assertValidViewMatrix(m: Matrix4, label: string): void {
  // 1. Full matrix finiteness
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(m[i])) {
      throw new Error(`VIEW_NON_FINITE: [${label}] element at index ${i} is not finite`);
    }
  }

  // 2. Affine bottom row [0, 0, 0, 1]
  if (
    Math.abs(m[3]) > 1e-6 ||
    Math.abs(m[7]) > 1e-6 ||
    Math.abs(m[11]) > 1e-6 ||
    Math.abs(m[15] - 1.0) > 1e-6
  ) {
    throw new Error(`VIEW_NOT_AFFINE: [${label}] bottom row must be [0, 0, 0, 1]`);
  }

  // 3. Translation finiteness
  if (!Number.isFinite(m[12]) || !Number.isFinite(m[13]) || !Number.isFinite(m[14])) {
    throw new Error(`VIEW_TRANSLATION_NON_FINITE: [${label}] translation elements non-finite`);
  }

  // 4. Extract 3x3 rotation sub-matrix column vectors (column-major)
  const c1 = [m[0], m[1], m[2]];
  const c2 = [m[4], m[5], m[6]];
  const c3 = [m[8], m[9], m[10]];

  // 5. Column vector unit length ||c_i|| = 1.0 ± 1e-5 (rejects scale deformation)
  const l1 = Math.hypot(c1[0], c1[1], c1[2]);
  const l2 = Math.hypot(c2[0], c2[1], c2[2]);
  const l3 = Math.hypot(c3[0], c3[1], c3[2]);
  if (Math.abs(l1 - 1.0) > 1e-5 || Math.abs(l2 - 1.0) > 1e-5 || Math.abs(l3 - 1.0) > 1e-5) {
    throw new Error(
      `VIEW_ROTATION_NOT_NORMALIZED: [${label}] column lengths (${l1}, ${l2}, ${l3}) != 1.0`,
    );
  }

  // 6. Orthogonality c_i · c_j = 0 ± 1e-5 (rejects shear deformation)
  const d12 = c1[0] * c2[0] + c1[1] * c2[1] + c1[2] * c2[2];
  const d13 = c1[0] * c3[0] + c1[1] * c3[1] + c1[2] * c3[2];
  const d23 = c2[0] * c3[0] + c2[1] * c3[1] + c2[2] * c3[2];
  if (Math.abs(d12) > 1e-5 || Math.abs(d13) > 1e-5 || Math.abs(d23) > 1e-5) {
    throw new Error(
      `VIEW_ROTATION_NOT_ORTHOGONAL: [${label}] dot products non-zero (${d12}, ${d13}, ${d23})`,
    );
  }

  // 7. Chirality det(R) = +1.0 ± 1e-5 (strictly excludes reflection det(R) = -1.0)
  const detR =
    c1[0] * (c2[1] * c3[2] - c2[2] * c3[1]) -
    c1[1] * (c2[0] * c3[2] - c2[2] * c3[0]) +
    c1[2] * (c2[0] * c3[1] - c2[1] * c3[0]);
  if (Math.abs(detR - 1.0) > 1e-5) {
    throw new Error(
      `VIEW_ROTATION_CHIRALITY_INVALID: [${label}] det(R) = ${detR} (expected +1.0)`,
    );
  }
}
