/**
 * E2E Browser Bundle Entry — exposes production modules to window for real WebGL verification
 */
export { DegradationLadder, capTierToSession, TIER_ORDER, CapabilityTier } from '../../../../chinese-aesthetic/render/degradation-ladder';
export { PowerManager, PowerState, PowerInput, FreezeReason } from '../../../../chinese-aesthetic/render/power-manager';
export { RafDispatcher, installGlobalDispatcher, getGlobalDispatcher, RAF_DISPATCHER_KEY } from '../../../../chinese-aesthetic/render/raf-engine';
export { evaluateCameraMatrices, CameraInputs } from '../../../../chinese-aesthetic/render/camera-evaluator';
export { GlContextTracker } from '../../../../chinese-aesthetic/render/gl-context-tracker';
export {
  encodeNdcToByte, decodeByteToNdc, encodeNdcToRgba, decodeRgbaToNdc,
  NDC_DECODE_TOLERANCE, isNdcWithinTolerance,
  NDC_VERTEX_SHADER, NDC_FRAGMENT_SHADER,
  STANDARD_VERTEX_SHADER, STANDARD_FRAGMENT_SHADER,
  compileShaderProgram, disposeShaderProgram,
} from '../../../../chinese-aesthetic/render/shader-source';
export {
  TriangleMesh, VertexPC,
  NDC_TEST_VERTICES, NDC_TEST_MESH,
  NEAR_CLIP_PARTIAL_TRIANGLE, NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE,
  W_C_ZERO_BOUNDARY_TRIANGLE,
  GOLDEN_FRAME_TRIANGLE,
  cameraSpaceToClipSpace, classifyClipVertex,
  PARTIAL_TRIANGLE_CLIP_SPACE,
  buildInterleavedVertexBuffer, buildIndexBuffer,
  NEAR_CLIP_TEST_FOV_Y_RAD, NEAR_CLIP_TEST_ASPECT, NEAR_CLIP_TEST_NEAR, NEAR_CLIP_TEST_FAR,
} from '../../../../chinese-aesthetic/render/geometry-builder';
export { GlPipeline, RenderMode, ReadPixelsResult } from '../../../../chinese-aesthetic/render/gl-pipeline';
