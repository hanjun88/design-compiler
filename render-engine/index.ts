/**
 * render-engine — Deterministic software rendering for design-compiler.
 *
 * Provides a real software rasterization pipeline that takes compiled
 * ValidatedDesignIR + RuntimeExecutionPlan and produces an actual pixel
 * buffer with a verifiable renderHash.
 *
 * This is NOT a mock. It performs real procedural rasterization through
 * 7 pipeline passes: clear → depth layers → focal glow → symmetry →
 * contrast → tone mapping → post-processing.
 */
export { SoftwareRenderer, type RenderResult, type RendererMountState } from "./software-renderer";
