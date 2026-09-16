/**
 * E2E Browser Bundle Entry — exposes production modules to window for real WebGL verification
 */
export { DegradationLadder, capTierToSession, TIER_ORDER, CapabilityTier } from '../../../../chinese-aesthetic/render/degradation-ladder';
export { PowerManager, PowerState, PowerInput, FreezeReason } from '../../../../chinese-aesthetic/render/power-manager';
export { RafDispatcher, installGlobalDispatcher, getGlobalDispatcher, RAF_DISPATCHER_KEY } from '../../../../chinese-aesthetic/render/raf-engine';
export { evaluateCameraMatrices, CameraInputs } from '../../../../chinese-aesthetic/render/camera-evaluator';
export { GlContextTracker } from '../../../../chinese-aesthetic/render/gl-context-tracker';
