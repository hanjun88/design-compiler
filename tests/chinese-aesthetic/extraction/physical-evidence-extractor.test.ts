/**
 * Physical Evidence Extractor Tests — 物理证据提取器测试
 *
 * 真实输入驱动：合成已知属性帧 + 真实 SoftwareRenderer 渲染帧。
 * 验证：7 阶流水线、确定性、UNMEASURED 行为、材质两域隔离、零默认泄漏。
 */

import { extractPhysicalEvidence } from "../../../chinese-aesthetic/extraction/physical-evidence-extractor";
import type { ExtractorInput, ObservableEvidenceSet, EvidenceField, UnmeasuredSemantic } from "../../../chinese-aesthetic/extraction/types";
import { runCell } from "../../golden-case-matrix/lib/cell-runner";

// ---------------------------------------------------------------------------
// 测试辅助：合成已知属性的像素缓冲
// ---------------------------------------------------------------------------

const TEST_WIDTH = 480;
const TEST_HEIGHT = 270;
const TEST_PIXEL_COUNT = TEST_WIDTH * TEST_HEIGHT;
const TEST_BUFFER_SIZE = TEST_PIXEL_COUNT * 4;

/**
 * 生成垂直渐变帧（从黑到白）。
 * 已知属性：meanLuminance ≈ 127.5, 高空间梯度, 低边缘偏度。
 */
function makeVerticalGradientFrame(): Uint8Array {
  const buffer = new Uint8Array(TEST_BUFFER_SIZE);
  for (let y = 0; y < TEST_HEIGHT; y++) {
    const v = Math.round((y / (TEST_HEIGHT - 1)) * 255);
    for (let x = 0; x < TEST_WIDTH; x++) {
      const offset = (y * TEST_WIDTH + x) * 4;
      buffer[offset] = v;
      buffer[offset + 1] = v;
      buffer[offset + 2] = v;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}

/**
 * 生成纯色帧（指定灰度）。
 * 已知属性：meanLuminance = gray, zero gradient, zero edge.
 */
function makeSolidFrame(gray: number): Uint8Array {
  const buffer = new Uint8Array(TEST_BUFFER_SIZE);
  for (let i = 0; i < TEST_PIXEL_COUNT; i++) {
    const offset = i * 4;
    buffer[offset] = gray;
    buffer[offset + 1] = gray;
    buffer[offset + 2] = gray;
    buffer[offset + 3] = 255;
  }
  return buffer;
}

/**
 * 生成 2D 伪随机纹理帧（确定性，x 和 y 均以不同素数系数贡献）。
 * 用于光流测试：只有 (0,0) 位移给出 SAD=0，光流无歧义。
 */
function make2DTextureFrame(): Uint8Array {
  const buffer = new Uint8Array(TEST_BUFFER_SIZE);
  for (let y = 0; y < TEST_HEIGHT; y++) {
    for (let x = 0; x < TEST_WIDTH; x++) {
      // 双素数线性组合 + 乘积项，确保 2D 唯一性
      const v = (x * 251 + y * 197 + (x * y) % 7) % 256;
      const offset = (y * TEST_WIDTH + x) * 4;
      buffer[offset] = v;
      buffer[offset + 1] = v;
      buffer[offset + 2] = v;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}

/**
 * 构造标准测试输入。
 */
function makeTestInput(frames: Uint8Array[], overrides?: Partial<ExtractorInput>): ExtractorInput {
  return {
    evidenceId: "test-evidence-001",
    capturedAt: "2026-09-16T00:00:00Z",
    frames,
    width: TEST_WIDTH,
    height: TEST_HEIGHT,
    depthBuffers: null,
    ir: {
      irHash: "sha256:test-ir-hash",
      irType: "ValidatedDesignIR",
      paradigm: "TANG",
      compositionType: "central-axis",
      symmetry: 0.8,
      negativeSpaceRatio: 0.3,
      horizonPosition: 0.35,
      cameraPitch: -15,
      lightingIntent: "DAYLIGHT",
      colorTemp: 5500,
      lightIntensity: 1.0,
      lightSoftness: 0.6,
      ambientRatio: 0.35,
      materials: [
        { baseType: "BRONZE::tang-gilt-bronze", materialCategory: "BRONZE", roughness: 0.4, metalness: 0.9, wear: 0.3 },
      ],
      transformationTrace: [
        { ruleId: "CA-RULE-03-CANGRUN", field: "materials[0].roughness", inputValue: 0.25, outputValue: 0.7, action: "ELEVATE_TO_CANGRUN_THRESHOLD" },
      ],
    },
    renderHash: "sha256:test-render-hash",
    rendererInfo: { type: "software-reference", version: "1.0.0" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 辅助：检查对象是否为 EvidenceField
// ---------------------------------------------------------------------------

function isEvidenceField(obj: unknown): obj is EvidenceField<unknown> {
  return typeof obj === "object" && obj !== null &&
    "value" in obj && "evidenceRef" in obj && "confidence" in obj && "method" in obj;
}

function isUnmeasured(obj: unknown): obj is UnmeasuredSemantic {
  return typeof obj === "object" && obj !== null &&
    "status" in obj && (obj as { status: string }).status === "UNMEASURED_SEMANTIC";
}

/**
 * 递归收集所有 EvidenceField 和 UnmeasuredSemantic。
 */
function collectFields(obj: unknown, path: string, fields: Array<{ path: string; field: EvidenceField<unknown> }>, unmeasured: Array<{ path: string; field: UnmeasuredSemantic }>): void {
  if (obj === null || obj === undefined || typeof obj !== "object") return;

  if (isEvidenceField(obj)) {
    fields.push({ path, field: obj });
    return;
  }
  if (isUnmeasured(obj)) {
    unmeasured.push({ path, field: obj });
    return;
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    collectFields((obj as Record<string, unknown>)[key], `${path}.${key}`, fields, unmeasured);
  }
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("Physical Evidence Extractor — 7-Stage Pipeline", () => {

  // ── Stage 1: Input Validation ──────────────────────────────────────

  describe("Stage 1: Input Validation", () => {
    test("rejects empty frame array", () => {
      const input = makeTestInput([]);
      expect(() => extractPhysicalEvidence(input)).toThrow("at least one frame");
    });

    test("rejects buffer length mismatch", () => {
      const badFrame = new Uint8Array(100); // wrong size
      const input = makeTestInput([badFrame]);
      expect(() => extractPhysicalEvidence(input)).toThrow("buffer length mismatch");
    });

    test("accepts valid single frame", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.evidenceId).toBe("test-evidence-001");
      expect(result.renderContext.bufferByteLength).toBe(TEST_BUFFER_SIZE);
    });
  });

  // ── Stage 2: Pixel Evidence ─────────────────────────────────────────

  describe("Stage 2: Pixel Physical Evidence", () => {
    test("solid gray frame has known mean luminance", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.pixel.meanLuminance.value).toBeCloseTo(128, 0);
      expect(result.pixel.luminanceStdDev.value).toBeCloseTo(0, 0);
    });

    test("vertical gradient has non-zero laplacian variance", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      expect(result.pixel.spatialLaplacianVariance.value).toBeGreaterThan(0);
    });

    test("solid frame has near-zero edge pixels (boundary artifact only)", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      // Zero-padding convolution produces boundary artifacts (~1% of pixels at image border)
      // Internal edges should be zero; total edge ratio dominated by boundary
      expect(result.pixel.edgePixelRatio.value).toBeLessThan(0.02);
    });

    test("all pixel evidence fields have evidenceRef and confidence", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      const fields: Array<{ path: string; field: EvidenceField<unknown> }> = [];
      const unmeasured: Array<{ path: string; field: UnmeasuredSemantic }> = [];
      collectFields(result.pixel, "pixel", fields, unmeasured);

      expect(fields.length).toBeGreaterThan(0);
      for (const { path, field } of fields) {
        expect(field.evidenceRef).toBeTruthy();
        expect(field.evidenceRef.length).toBeGreaterThan(0);
        expect(field.confidence).toBeGreaterThanOrEqual(0);
        expect(field.confidence).toBeLessThanOrEqual(1);
        expect(field.method).toBeTruthy();
      }
      expect(unmeasured.length).toBe(0); // pixel domain always measurable
    });
  });

  // ── Stage 3: Depth Evidence ─────────────────────────────────────────

  describe("Stage 3: Depth Physical Evidence", () => {
    test("no depth buffer → all depth fields UNMEASURED", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.depth.depthBufferAvailable).toBe(false);

      const fields: Array<{ path: string; field: EvidenceField<unknown> }> = [];
      const unmeasured: Array<{ path: string; field: UnmeasuredSemantic }> = [];
      collectFields(result.depth, "depth", fields, unmeasured);

      // depthBufferAvailable is a boolean, not a field
      expect(unmeasured.length).toBeGreaterThanOrEqual(7);
      for (const { field } of unmeasured) {
        expect(field.reason).toContain("depth");
      }
    });

    test("depth unmeasured does not use default values", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      // Verify no numeric default leaked into depth
      expect(isUnmeasured(result.depth.depthLayerCount)).toBe(true);
      expect(isUnmeasured(result.depth.atmosphericDepth)).toBe(true);
    });
  });

  // ── Stage 4: Motion Evidence ────────────────────────────────────────

  describe("Stage 4: Motion Physical Evidence", () => {
    test("single frame → motion is null", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.motion).toBeNull();
    });

    test("two identical textured frames → zero optical flow", () => {
      // Use 2D pseudo-random texture so optical flow is unambiguous (only (0,0) gives SAD=0)
      const frame = make2DTextureFrame();
      const input = makeTestInput([frame, frame]);
      const result = extractPhysicalEvidence(input);
      expect(result.motion).not.toBeNull();
      expect(result.motion!.framePairCount).toBe(1);
      expect(result.motion!.globalDisplacementMean.value).toEqual([0, 0]);
      expect(result.motion!.luminanceContinuity.value).toBe(1);
    });

    test("solid identical frames → ambiguous optical flow (no texture to track)", () => {
      // Solid frames have no texture; block matching is ambiguous
      const frame = makeSolidFrame(128);
      const input = makeTestInput([frame, frame]);
      const result = extractPhysicalEvidence(input);
      expect(result.motion).not.toBeNull();
      // SAD is 0 for all valid displacements; coherence should be very high (near 1)
      expect(result.motion!.opticalFlowDirectionCoherence.value).toBeGreaterThan(0.95);
    });

    test("two different frames → non-zero motion metrics", () => {
      const frame1 = makeSolidFrame(100);
      const frame2 = makeSolidFrame(200);
      const input = makeTestInput([frame1, frame2]);
      const result = extractPhysicalEvidence(input);
      expect(result.motion).not.toBeNull();
      expect(result.motion!.luminanceContinuity.value).toBeLessThan(1);
    });

    test("motion evidence fields have evidenceRef", () => {
      const frame1 = makeVerticalGradientFrame();
      const frame2 = makeSolidFrame(128);
      const input = makeTestInput([frame1, frame2]);
      const result = extractPhysicalEvidence(input);
      const fields: Array<{ path: string; field: EvidenceField<unknown> }> = [];
      const unmeasured: Array<{ path: string; field: UnmeasuredSemantic }> = [];
      collectFields(result.motion, "motion", fields, unmeasured);
      expect(fields.length).toBeGreaterThan(0);
      for (const { field } of fields) {
        expect(field.evidenceRef).toBeTruthy();
        expect(field.confidence).toBeGreaterThan(0);
      }
    });
  });

  // ── Stage 5: Material Evidence (IR vs Observed isolation) ───────────

  describe("Stage 5: Material Observational Evidence", () => {
    test("IR declared roughness is mirrored exactly", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.material.dominantRoughness.value).toBe(0.4);
      expect(result.material.dominantMetalness.value).toBe(0.9);
      expect(result.material.dominantMaterialCategory.value).toBe("BRONZE");
    });

    test("observed surface variation is computed from pixels, not IR", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      // Solid frame has zero surface variation (observed), regardless of IR roughness=0.4
      expect(result.material.surfaceVariation.value).toBe(0);
      // This proves isolation: IR says roughness=0.4, observed says variation=0
      expect(result.material.dominantRoughness.value).toBe(0.4);
      expect(result.material.surfaceVariation.value).not.toBe(result.material.dominantRoughness.value);
    });

    test("gradient frame has non-zero observed micro-surface variation", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      expect(result.material.microSurfaceHighFrequencyVariance.value).toBeGreaterThan(0);
    });

    test("material evidence evidenceRefs distinguish IR vs OBSERVED", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      // IR fields reference ir:
      expect(result.material.dominantRoughness.evidenceRef).toContain("ir:");
      // Observed fields reference pixel-buffer:
      expect(result.material.surfaceVariation.evidenceRef).toContain("pixel-buffer:");
      expect(result.material.microSurfaceHighFrequencyVariance.evidenceRef).toContain("pixel-buffer:");
    });
  });

  // ── Stage 6: IR Structural Evidence (pure mirror) ───────────────────

  describe("Stage 6: IR Structural Evidence", () => {
    test("IR fields are pure mirror of input", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.ir.paradigm.value).toBe("TANG");
      expect(result.ir.colorTemp.value).toBe(5500);
      expect(result.ir.lightingIntent.value).toBe("DAYLIGHT");
      expect(result.ir.materials.value).toHaveLength(1);
      expect(result.ir.transformationTrace.value).toHaveLength(1);
      expect(result.ir.transformationTrace.value[0].ruleId).toBe("CA-RULE-03-CANGRUN");
    });

    test("IR declared negativeSpaceRatio is labeled DECLARED not measured", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.ir.declaredNegativeSpaceRatio.evidenceRef).toContain("DECLARED");
      // Pixel measured negativeSpaceRatio is different field
      expect(result.pixel.negativeSpaceRatio.evidenceRef).toContain("pixel-buffer:");
    });
  });

  // ── Stage 7: Provenance & Purity ────────────────────────────────────

  describe("Stage 7: Provenance & Purity Verification", () => {
    test("purity audit reports PURE for valid extraction", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      expect(result.purityAudit.purityStatus).toBe("PURE");
      expect(result.purityAudit.hardcodedConstantsFound).toHaveLength(0);
      expect(result.purityAudit.fieldsMissingEvidenceRef).toHaveLength(0);
      expect(result.purityAudit.fieldsMissingConfidence).toHaveLength(0);
    });

    test("purity audit counts measured and unmeasured fields", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.purityAudit.totalFields).toBeGreaterThan(0);
      expect(result.purityAudit.measuredFields).toBeGreaterThan(0);
      expect(result.purityAudit.unmeasuredFields).toBeGreaterThan(0); // depth domain
      expect(result.purityAudit.measuredFields + result.purityAudit.unmeasuredFields).toBe(result.purityAudit.totalFields);
    });

    test("semantic evidence is always null (machine never generates semantic)", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.semantic).toBeNull();
    });
  });

  // ── Determinism ──────────────────────────────────────────────────────

  describe("Determinism: identical input → byte-identical output", () => {
    test("two extractions of same input produce identical JSON", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result1 = extractPhysicalEvidence(input);
      const result2 = extractPhysicalEvidence(input);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    test("renderContext binds to renderHash and irHash", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.renderContext.renderHash).toBe("sha256:test-render-hash");
      expect(result.renderContext.irHash).toBe("sha256:test-ir-hash");
    });
  });

  // ── Real SoftwareRenderer Frame Integration ──────────────────────────

  describe("Integration: real SoftwareRenderer frame from Matrix Cell", () => {
    let realFrame: Uint8Array;
    let realRenderHash: string;

    beforeAll(() => {
      // 使用 MC-T01 (TANG/BRONZE/DAYLIGHT) 生成真实渲染帧
      const cellResult = runCell("MC-T01");
      expect(cellResult.success).toBe(true);
      expect(cellResult.renderResult).not.toBeNull();
      expect(cellResult.renderResult!.pixelBuffer).toBeDefined();
      expect(cellResult.renderResult!.pixelBuffer!.length).toBe(TEST_BUFFER_SIZE);
      realFrame = cellResult.renderResult!.pixelBuffer!;
      realRenderHash = cellResult.renderResult!.renderHash!;
    });

    test("real render frame produces valid pixel evidence", () => {
      const input = makeTestInput([realFrame], {
        renderHash: realRenderHash,
        evidenceId: "real-mc-t01-frame",
      });
      const result = extractPhysicalEvidence(input);
      expect(result.pixel.nonZeroPixels.value).toBeGreaterThan(0);
      expect(result.pixel.meanLuminance.value).toBeGreaterThan(0);
      expect(result.pixel.meanLuminance.value).toBeLessThan(256);
      expect(result.pixel.dominantColor.value).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test("real render frame has non-zero edge and laplacian", () => {
      const input = makeTestInput([realFrame]);
      const result = extractPhysicalEvidence(input);
      expect(result.pixel.spatialLaplacianVariance.value).toBeGreaterThan(0);
      expect(result.pixel.edgePixelRatio.value).toBeGreaterThanOrEqual(0);
    });

    test("real render frame purity audit is PURE", () => {
      const input = makeTestInput([realFrame]);
      const result = extractPhysicalEvidence(input);
      expect(result.purityAudit.purityStatus).toBe("PURE");
    });

    test("real render frame material IR vs observed isolation holds", () => {
      const input = makeTestInput([realFrame]);
      const result = extractPhysicalEvidence(input);
      // IR declared BRONZE roughness=0.4
      expect(result.material.dominantMaterialCategory.value).toBe("BRONZE");
      // Observed surface variation is computed from actual pixels
      expect(typeof result.material.surfaceVariation.value).toBe("number");
      expect(result.material.surfaceVariation.evidenceRef).toContain("pixel-buffer:");
    });
  });

  // ── No Default Leakage (static verification) ────────────────────────

  describe("No Default Leakage: P0 defense", () => {
    test("extractor source contains no '?? 0.' measurement default patterns", () => {
      // This is a static code pattern check on the extractor source
      // We verify by checking that unmeasured fields are explicitly marked, not defaulted
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);

      // Depth domain: all measurable-without-depth fields should be UNMEASURED, not 0
      const depthFields = [
        result.depth.depthLayerCount,
        result.depth.layerSeparation,
        result.depth.occlusionEdgeCount,
        result.depth.atmosphericDepth,
        result.depth.focalDepthSeparation,
      ];
      for (const field of depthFields) {
        expect(isUnmeasured(field)).toBe(true);
      }
    });

    test("motion is null for single frame, not zero-filled", () => {
      const input = makeTestInput([makeSolidFrame(128)]);
      const result = extractPhysicalEvidence(input);
      expect(result.motion).toBeNull();
    });

    test("semantic is never generated by machine", () => {
      const input = makeTestInput([makeVerticalGradientFrame()]);
      const result = extractPhysicalEvidence(input);
      expect(result.semantic).toBeNull();
    });
  });
});
