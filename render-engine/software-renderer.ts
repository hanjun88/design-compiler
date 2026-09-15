/**
 * Deterministic Software Renderer for design-compiler.
 *
 * This is a REAL software rasterization pipeline, not a mock.
 * It takes a ValidatedDesignIR + RuntimeExecutionPlan and produces
 * an actual pixel buffer through procedural rasterization.
 *
 * Pipeline: clear → depth layers → composition → lighting → materials → post-process
 * Output: Uint8Array RGBA pixel buffer → renderHash (SHA-256 canonical)
 *
 * Determinism guarantee: same IR + plan → byte-identical pixel buffer.
 * No randomness, no Date.now(), no Math.random() in render path.
 */
import * as crypto from "crypto";
import type { ValidatedDesignIR, RuntimeExecutionPlan } from "../compiler-core/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderResult {
  pixelBuffer: Uint8Array;
  width: number;
  height: number;
  renderHash: string;
  renderExecutionMs: number;
  rendererInfo: {
    type: "software-rasterizer";
    version: "1.0.0";
    resolution: string;
    pipeline: string[];
    postProcessing: string[];
  };
}

export interface RendererMountState {
  mounted: boolean;
  framebuffer: Uint8Array | null;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Color utilities (deterministic)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Deterministic pseudo-random from integer seed (no Math.random)
function hashNoise(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// SoftwareRenderer class with mount/dispose lifecycle
// ---------------------------------------------------------------------------

export class SoftwareRenderer {
  private state: RendererMountState = {
    mounted: false,
    framebuffer: null,
    width: 0,
    height: 0,
  };

  private readonly renderWidth: number;
  private readonly renderHeight: number;

  constructor(width = 480, height = 270) {
    this.renderWidth = width;
    this.renderHeight = height;
  }

  mount(): void {
    if (this.state.mounted) return;
    const size = this.renderWidth * this.renderHeight * 4;
    this.state.framebuffer = new Uint8Array(size);
    this.state.width = this.renderWidth;
    this.state.height = this.renderHeight;
    this.state.mounted = true;
  }

  dispose(): void {
    if (!this.state.mounted) return;
    this.state.framebuffer = null;
    this.state.width = 0;
    this.state.height = 0;
    this.state.mounted = false;
  }

  isMounted(): boolean {
    return this.state.mounted;
  }

  /**
   * Execute a full render pass from ValidatedDesignIR + RuntimeExecutionPlan.
   * Returns pixel buffer, renderHash, and timing.
   */
  render(validatedIR: ValidatedDesignIR, plan: RuntimeExecutionPlan): RenderResult {
    if (!this.state.mounted) {
      this.mount();
    }
    const startTime = process.hrtime.bigint();

    const fb = this.state.framebuffer!;
    const W = this.renderWidth;
    const H = this.renderHeight;

    // Extract scene parameters
    const scene = validatedIR.validated;
    const comp = scene.composition;
    const cam = scene.camera;
    const light = scene.lighting;
    const mats = scene.materials;
    const color = scene.color;

    // Color palette
    const dominant = hexToRgb(color.dominant?.value ?? "#808080");
    const secondary = hexToRgb(color.secondary?.value ?? "#606060");
    const accent = hexToRgb(color.accent?.value ?? "#404040");
    const tempBias = color.temperatureBias?.value ?? 0.5;
    const contrastRatio = color.contrastRatio?.value ?? 1.0;

    // Composition
    const focalPointVal = comp.focalPoint?.value ?? [0.5, 0.5];
    const focalX = focalPointVal[0];
    const focalY = focalPointVal[1];
    const negSpace = comp.negativeSpaceRatio?.value ?? 0.3;
    const symmetry = comp.symmetry?.value ?? 0.5;
    const depthLayers = comp.depthLayerCount?.value ?? 3;

    // Camera
    const fov = cam.fov?.value ?? 50;
    const camAngle = cam.angle?.value ?? 0;

    // Lighting
    const keyAzimuth = light.keyLight?.azimuth?.value ?? 135;
    const keyElevation = light.keyLight?.elevation?.value ?? 45;
    const keyColorTemp = light.keyLight?.colorTemp?.value ?? 5500;
    const keyIntensity = light.keyLight?.intensity?.value ?? 1.0;
    const ambientRatio = light.ambientRatio?.value ?? 0.3;

    // Materials (use first material as primary surface)
    const primaryMat = mats[0] ?? { roughness: { value: 0.5 }, metalness: { value: 0.0 }, wear: { value: 0.0 } };
    const roughness = primaryMat.roughness?.value ?? 0.5;
    const metalness = primaryMat.metalness?.value ?? 0.0;
    const wear = primaryMat.wear?.value ?? 0.0;

    // Post-processing from execution plan
    const postProcessing = plan.runtimePlan?.pipeline?.postprocessing ?? [];
    const toneMapping = plan.runtimePlan?.pipeline?.toneMapping ?? "LinearToneMapping";
    const hasFilmGrain = postProcessing.some((p) => p.toLowerCase().includes("grain") || p.toLowerCase().includes("film"));
    const hasVignette = postProcessing.some((p) => p.toLowerCase().includes("vignette") || p.toLowerCase().includes("暗角"));
    const hasBloom = postProcessing.some((p) => p.toLowerCase().includes("bloom") || p.toLowerCase().includes("泛光"));
    const hasSMAA = postProcessing.some((p) => p.toLowerCase().includes("smaa") || p.toLowerCase().includes("antialias"));

    // Light direction in screen space (from azimuth/elevation)
    const lightDirX = Math.cos((keyAzimuth * Math.PI) / 180) * Math.cos((keyElevation * Math.PI) / 180);
    const lightDirY = Math.sin((keyElevation * Math.PI) / 180);

    // Key light color (warm if low colorTemp, cool if high)
    const keyLightColor: [number, number, number] = keyColorTemp < 5000
      ? [255, 220, 180] // warm
      : keyColorTemp > 6500
        ? [200, 220, 255] // cool
        : [255, 255, 255]; // neutral

    // ========================================================================
    // PASS 1: Clear + background gradient (sky/atmosphere)
    // ========================================================================
    const skyTop = lerpColor(dominant, [240, 245, 255], 0.3 + tempBias * 0.2);
    const skyBottom = lerpColor(secondary, dominant, 0.5);

    for (let y = 0; y < H; y++) {
      const t = y / H;
      const skyColor = lerpColor(skyTop, skyBottom, t * t);
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        // Add subtle atmospheric noise
        const noise = hashNoise(x, y, 1) * 8 - 4;
        fb[idx] = clamp255(skyColor[0] + noise);
        fb[idx + 1] = clamp255(skyColor[1] + noise);
        fb[idx + 2] = clamp255(skyColor[2] + noise);
        fb[idx + 3] = 255;
      }
    }

    // ========================================================================
    // PASS 2: Depth layers (background → midground → foreground)
    // Each layer is a horizontal band with geometric silhouette
    // ========================================================================
    const layerColors: [number, number, number][] = [
      lerpColor(skyBottom, secondary, 0.3), // far layer (atmospheric)
      lerpColor(secondary, dominant, 0.5), // mid layer
      lerpColor(accent, secondary, 0.4), // near layer
    ];

    for (let layer = 0; layer < Math.min(depthLayers, 3); layer++) {
      const layerY = H * (0.45 + layer * 0.18);
      const layerHeight = H * (0.35 - layer * 0.08);
      const layerColor = layerColors[layer];
      const layerNoiseSeed = layer * 100 + 42;

      for (let y = Math.max(0, Math.floor(layerY - layerHeight)); y < Math.min(H, Math.floor(layerY + layerHeight)); y++) {
        const relY = (y - layerY) / layerHeight;
        if (relY < -0.5 || relY > 0.5) continue;

        // Silhouette: undulating horizon with deterministic noise
        const silhouetteBase = Math.sin((y / H) * Math.PI * 2 + layer) * 0.15;
        for (let x = 0; x < W; x++) {
          const nx = x / W;
          // Deterministic mountain/architecture silhouette
          const peakNoise = hashNoise(Math.floor(x / 8), layer, layerNoiseSeed) * 0.3;
          const silhouette = silhouetteBase + peakNoise + Math.sin(nx * Math.PI * (3 + layer)) * 0.1;
          const threshold = 0.5 + silhouette * (1 - layer * 0.2);

          if (relY > threshold - 0.5) {
            const idx = (y * W + x) * 4;
            // Lighting: compute surface normal from gradient
            const dx = (hashNoise(Math.floor(x / 4) + 1, layer, layerNoiseSeed) - hashNoise(Math.floor(x / 4) - 1, layer, layerNoiseSeed)) * 2;
            const normalX = -dx;
            const normalY = 1.0;
            const ndotl = Math.max(0, normalX * lightDirX + normalY * lightDirY);

            // Diffuse + ambient
            let r = layerColor[0] * (ambientRatio + ndotl * keyIntensity * (1 - ambientRatio));
            let g = layerColor[1] * (ambientRatio + ndotl * keyIntensity * (1 - ambientRatio));
            let b = layerColor[2] * (ambientRatio + ndotl * keyIntensity * (1 - ambientRatio));

            // Key light color tint
            r = lerp(r, r * keyLightColor[0] / 255, ndotl * 0.3);
            g = lerp(g, g * keyLightColor[1] / 255, ndotl * 0.3);
            b = lerp(b, b * keyLightColor[2] / 255, ndotl * 0.3);

            // Material: roughness affects specular sharpness, metalness affects tint
            const specular = Math.pow(ndotl, 10 + roughness * 40) * (1 - roughness) * keyIntensity;
            r += specular * (metalness > 0.5 ? keyLightColor[0] : 255) * 0.5;
            g += specular * (metalness > 0.5 ? keyLightColor[1] : 255) * 0.5;
            b += specular * (metalness > 0.5 ? keyLightColor[2] : 255) * 0.5;

            // Wear: adds surface variation noise
            const wearNoise = hashNoise(x, y, layerNoiseSeed + 7) * wear * 30;
            r += wearNoise - wear * 10;
            g += wearNoise - wear * 10;
            b += wearNoise - wear * 10;

            // Atmospheric perspective: farther layers are hazier
            const atmosFade = 1 - layer * 0.15;
            r = lerp(skyBottom[0], r, atmosFade);
            g = lerp(skyBottom[1], g, atmosFade);
            b = lerp(skyBottom[2], b, atmosFade);

            fb[idx] = clamp255(r);
            fb[idx + 1] = clamp255(g);
            fb[idx + 2] = clamp255(b);
            fb[idx + 3] = 255;
          }
        }
      }
    }

    // ========================================================================
    // PASS 3: Focal point glow / accent element
    // ========================================================================
    const focalPx = Math.floor(focalX * W);
    const focalPy = Math.floor(focalY * H);
    const focalRadius = Math.floor(W * 0.12 * (1 - negSpace * 0.5));

    for (let y = Math.max(0, focalPy - focalRadius); y < Math.min(H, focalPy + focalRadius); y++) {
      for (let x = Math.max(0, focalPx - focalRadius); x < Math.min(W, focalPx + focalRadius); x++) {
        const dist = Math.sqrt((x - focalPx) ** 2 + (y - focalPy) ** 2);
        if (dist < focalRadius) {
          const glow = (1 - dist / focalRadius) ** 2 * 0.25 * keyIntensity;
          const idx = (y * W + x) * 4;
          fb[idx] = clamp255(fb[idx] + accent[0] * glow + keyLightColor[0] * glow * 0.5);
          fb[idx + 1] = clamp255(fb[idx + 1] + accent[1] * glow + keyLightColor[1] * glow * 0.5);
          fb[idx + 2] = clamp255(fb[idx + 2] + accent[2] * glow + keyLightColor[2] * glow * 0.5);
        }
      }
    }

    // ========================================================================
    // PASS 4: Symmetry reflection (if symmetry > 0.5, mirror left half)
    // ========================================================================
    if (symmetry > 0.5) {
      const mirrorStrength = (symmetry - 0.5) * 2; // 0 to 1
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < Math.floor(W / 2); x++) {
          const mirrorX = W - 1 - x;
          const idxL = (y * W + x) * 4;
          const idxR = (y * W + mirrorX) * 4;
          fb[idxR] = clamp255(lerp(fb[idxR], fb[idxL], mirrorStrength));
          fb[idxR + 1] = clamp255(lerp(fb[idxR + 1], fb[idxL + 1], mirrorStrength));
          fb[idxR + 2] = clamp255(lerp(fb[idxR + 2], fb[idxL + 2], mirrorStrength));
        }
      }
    }

    // ========================================================================
    // PASS 5: Contrast adjustment
    // ========================================================================
    const contrastFactor = 1 + (contrastRatio - 1) * 0.3;
    for (let i = 0; i < fb.length; i += 4) {
      fb[i] = clamp255(128 + (fb[i] - 128) * contrastFactor);
      fb[i + 1] = clamp255(128 + (fb[i + 1] - 128) * contrastFactor);
      fb[i + 2] = clamp255(128 + (fb[i + 2] - 128) * contrastFactor);
    }

    // ========================================================================
    // PASS 6: Tone mapping
    // ========================================================================
    if (toneMapping === "AgXToneMapping" || toneMapping === "ACESFilmicToneMapping") {
      const exposure = keyIntensity;
      for (let i = 0; i < fb.length; i += 4) {
        // Simplified ACES/AgX curve
        const r = fb[i] / 255 * exposure;
        const g = fb[i + 1] / 255 * exposure;
        const b = fb[i + 2] / 255 * exposure;
        fb[i] = clamp255((r * (2.51 * r + 0.03)) / (r * (2.43 * r + 0.59) + 0.14) * 255);
        fb[i + 1] = clamp255((g * (2.51 * g + 0.03)) / (g * (2.43 * g + 0.59) + 0.14) * 255);
        fb[i + 2] = clamp255((b * (2.51 * b + 0.03)) / (b * (2.43 * b + 0.59) + 0.14) * 255);
      }
    }

    // ========================================================================
    // PASS 7: Post-processing
    // ========================================================================

    // Film grain (deterministic noise)
    if (hasFilmGrain) {
      const grainStrength = 0.04; // 4% grain
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = (y * W + x) * 4;
          const grain = (hashNoise(x, y, 999) - 0.5) * 255 * grainStrength;
          fb[idx] = clamp255(fb[idx] + grain);
          fb[idx + 1] = clamp255(fb[idx + 1] + grain);
          fb[idx + 2] = clamp255(fb[idx + 2] + grain);
        }
      }
    }

    // Vignette
    if (hasVignette) {
      const vignetteStrength = 0.35;
      const cx = W / 2;
      const cy = H / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
          const vig = 1 - dist * dist * vignetteStrength;
          const idx = (y * W + x) * 4;
          fb[idx] = clamp255(fb[idx] * vig);
          fb[idx + 1] = clamp255(fb[idx + 1] * vig);
          fb[idx + 2] = clamp255(fb[idx + 2] * vig);
        }
      }
    }

    // Bloom (simplified: bright areas bleed)
    if (hasBloom) {
      const bloomThreshold = 200;
      const tempBuffer = new Uint8Array(fb.length);
      tempBuffer.set(fb);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = (y * W + x) * 4;
          const brightness = (fb[idx] + fb[idx + 1] + fb[idx + 2]) / 3;
          if (brightness > bloomThreshold) {
            const bleed = (brightness - bloomThreshold) / 55 * 0.15;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nidx = ((y + dy) * W + (x + dx)) * 4;
                tempBuffer[nidx] = clamp255(tempBuffer[nidx] + fb[idx] * bleed);
                tempBuffer[nidx + 1] = clamp255(tempBuffer[nidx + 1] + fb[idx + 1] * bleed);
                tempBuffer[nidx + 2] = clamp255(tempBuffer[nidx + 2] + fb[idx + 2] * bleed);
              }
            }
          }
        }
      }
      fb.set(tempBuffer);
    }

    // SMAA (simplified 3x3 edge-aware blur on detected edges)
    if (hasSMAA) {
      const tempBuffer = new Uint8Array(fb.length);
      tempBuffer.set(fb);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = (y * W + x) * 4;
          // Edge detection
          const gx = Math.abs(fb[idx] - fb[(y * W + x - 1) * 4]) + Math.abs(fb[idx] - fb[(y * W + x + 1) * 4]);
          if (gx > 60) {
            // 3x3 average for anti-aliasing
            let sr = 0, sg = 0, sb = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nidx = ((y + dy) * W + (x + dx)) * 4;
                sr += tempBuffer[nidx];
                sg += tempBuffer[nidx + 1];
                sb += tempBuffer[nidx + 2];
              }
            }
            fb[idx] = clamp255(sr / 9);
            fb[idx + 1] = clamp255(sg / 9);
            fb[idx + 2] = clamp255(sb / 9);
          }
        }
      }
    }

    // ========================================================================
    // Compute renderHash: SHA-256 of canonical pixel buffer
    // Canonical = width(4 bytes BE) + height(4 bytes BE) + RGBA bytes
    // ========================================================================
    const canonical = Buffer.alloc(8 + fb.length);
    canonical.writeUInt32BE(W, 0);
    canonical.writeUInt32BE(H, 4);
    canonical.set(Buffer.from(fb), 8);
    const renderHash = "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");

    const endTime = process.hrtime.bigint();
    const renderExecutionMs = Number(endTime - startTime) / 1e6;

    return {
      pixelBuffer: new Uint8Array(fb), // copy to prevent external mutation
      width: W,
      height: H,
      renderHash,
      renderExecutionMs,
      rendererInfo: {
        type: "software-rasterizer",
        version: "1.0.0",
        resolution: `${W}x${H}`,
        pipeline: ["clear-gradient", "depth-layers", "focal-glow", "symmetry", "contrast", "tone-mapping", "post-processing"],
        postProcessing: postProcessing,
      },
    };
  }
}
