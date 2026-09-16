/**
 * Phase 5 Step 5.2 - WebGL Context Tracker & Teardown Protocol
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §4, §7
 */

import { CapabilityTier } from './degradation-ladder';

export interface IGlResourceTracker {
  readonly isClean: boolean; // isClean === true when all GPU handles are disposed
  readonly activeBufferCount: number;
  readonly activeTextureCount: number;
  readonly activeProgramCount: number;
  disposeAll(): void;
}

export class GlContextTracker implements IGlResourceTracker {
  private _buffers: Set<WebGLBuffer> = new Set();
  private _textures: Set<WebGLTexture> = new Set();
  private _programs: Set<WebGLProgram> = new Set();
  private _gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private _tier: CapabilityTier = 'WEBGL2';

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext | null, tier: CapabilityTier) {
    this._gl = gl;
    this._tier = tier;
  }

  public get isClean(): boolean {
    return (
      this._buffers.size === 0 &&
      this._textures.size === 0 &&
      this._programs.size === 0
    );
  }

  public get activeBufferCount(): number {
    return this._buffers.size;
  }

  public get activeTextureCount(): number {
    return this._textures.size;
  }

  public get activeProgramCount(): number {
    return this._programs.size;
  }

  public trackBuffer(buf: WebGLBuffer): void {
    this._buffers.add(buf);
  }

  public trackTexture(tex: WebGLTexture): void {
    this._textures.add(tex);
  }

  public trackProgram(prog: WebGLProgram): void {
    this._programs.add(prog);
  }

  /**
   * Applies the normative depth & rasterizer state registers (§7)
   */
  public applyDepthAndRasterizerDefaults(): void {
    const gl = this._gl;
    if (!gl) return;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clearDepth(1.0);

    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  /**
   * Applies polygon offset for near-coplanar batches (§7.2)
   */
  public setPolygonOffsetEnabled(enabled: boolean): void {
    const gl = this._gl;
    if (!gl) return;

    if (enabled) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.0, 1.0);
    } else {
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
  }

  /**
   * Unbinds all texture units and dispatch vertex arrays (§4.2)
   */
  public unbindAllResources(): void {
    const gl = this._gl;
    if (!gl) return;

    // 1. VAO Unbinding Dispatch
    if (this._tier === 'WEBGL2') {
      (gl as WebGL2RenderingContext).bindVertexArray(null);
    } else if (this._tier === 'WEBGL1') {
      const ext = gl.getExtension('OES_vertex_array_object');
      if (ext) {
        ext.bindVertexArrayOES(null);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      }
    }

    // 2. Full Texture Unit Sweep
    const rawUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    const maxUnits = typeof rawUnits === 'number' && Number.isFinite(rawUnits)
      ? Math.max(8, Math.min(rawUnits, 32))
      : 8;

    for (let i = 0; i < maxUnits; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  public disposeAll(): void {
    const gl = this._gl;
    if (gl) {
      for (const b of this._buffers) {
        try { gl.deleteBuffer(b); } catch { /* safe */ }
      }
      for (const t of this._textures) {
        try { gl.deleteTexture(t); } catch { /* safe */ }
      }
      for (const p of this._programs) {
        try { gl.deleteProgram(p); } catch { /* safe */ }
      }
    }

    this._buffers.clear();
    this._textures.clear();
    this._programs.clear();
    this._gl = null;
  }
}