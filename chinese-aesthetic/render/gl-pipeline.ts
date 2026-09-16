/**
 * Phase 5 Step 5.2 - WebGL Rendering Pipeline Orchestrator
 * Integrates PowerManager, RafDispatcher, DegradationLadder, CameraEvaluator,
 * GlContextTracker, ShaderSource & GeometryBuilder.
 *
 * renderFrame() upgraded (PLAN-02 COMPLETE_REAL_SHADER_AND_DRAW_PIPELINE):
 *   1. Compile/cache shader program (NDC-encode or standard)
 *   2. Create/update VAO + VBO (+ IBO) from current mesh
 *   3. Bind program, inject uViewProjection uniform
 *   4. Bind VAO, execute drawArrays/drawElements
 *   5. readPixels available via readFramePixels() after renderFrame()
 *
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07
 * and CHINESE-AESTHETIC-P5-S5.2-PLAN-02
 */

import { DegradationLadder, CapabilityTier } from './degradation-ladder';
import { PowerManager, PowerInput, PowerStatusSnapshot } from './power-manager';
import { RafDispatcher, IRafDispatcher } from './raf-engine';
import { CameraInputs, CameraEvaluatedMatrices, evaluateCameraMatrices } from './camera-evaluator';
import { GlContextTracker } from './gl-context-tracker';
import {
  ShaderCompileResult,
  compileShaderProgram,
  disposeShaderProgram,
  NDC_VERTEX_SHADER,
  NDC_FRAGMENT_SHADER,
  STANDARD_VERTEX_SHADER,
  STANDARD_FRAGMENT_SHADER,
} from './shader-source';
import { TriangleMesh, buildInterleavedVertexBuffer, buildIndexBuffer } from './geometry-builder';

export type RenderMode = 'ndc-encode' | 'standard';

export interface PipelineConfig {
  readonly canvas: HTMLCanvasElement;
  readonly initialTier?: CapabilityTier;
  readonly dispatcher?: IRafDispatcher;
}

export interface ReadPixelsResult {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export class GlPipeline {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ladder: DegradationLadder;
  private readonly _power: PowerManager;
  private readonly _dispatcher: IRafDispatcher;
  private _contextTracker: GlContextTracker | null = null;
  private _gl: WebGL2RenderingContext | null = null;
  private _lastEvaluatedCamera: CameraEvaluatedMatrices | null = null;
  private _isDisposed: boolean = false;

  // ─── Shader & Geometry State (PLAN-02 upgrade) ───
  private _ndcProgram: ShaderCompileResult | null = null;
  private _standardProgram: ShaderCompileResult | null = null;
  private _currentRenderMode: RenderMode = 'standard';
  private _currentMesh: TriangleMesh | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _vbo: WebGLBuffer | null = null;
  private _ibo: WebGLBuffer | null = null;
  private _meshVertexCount: number = 0;
  private _meshIndexCount: number = 0;
  private _uViewProjectionLocation: WebGLUniformLocation | null = null;

  constructor(config: PipelineConfig) {
    this._canvas = config.canvas;
    this._ladder = new DegradationLadder(config.initialTier ?? 'WEBGL2');
    this._dispatcher = config.dispatcher ?? new RafDispatcher();
    this._power = new PowerManager(this._ladder.currentTier, this._dispatcher);

    this.initializeContext();
  }

  public get powerSnapshot(): PowerStatusSnapshot {
    return this._power.snapshot;
  }

  public get currentTier(): CapabilityTier {
    return this._ladder.currentTier;
  }

  public get lastEvaluatedCamera(): CameraEvaluatedMatrices | null {
    return this._lastEvaluatedCamera;
  }

  public get glContext(): WebGL2RenderingContext | null {
    return this._gl;
  }

  private initializeContext(): void {
    if (this._ladder.currentTier === 'DOM_NEUTRAL' || this._ladder.currentTier === 'STATIC') {
      return;
    }

    const attrs: WebGLContextAttributes = {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
    };

    if (this._ladder.currentTier === 'WEBGL2') {
      this._gl = this._canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
      if (!this._gl) {
        this._ladder.degradeSessionCap('WEBGL1');
      }
    }

    if (!this._gl && this._ladder.currentTier === 'WEBGL1') {
      this._gl = (this._canvas.getContext('webgl', attrs) ||
        this._canvas.getContext('experimental-webgl', attrs)) as unknown as WebGL2RenderingContext | null;
      if (!this._gl) {
        this._ladder.degradeSessionCap('STATIC');
      }
    }

    if (this._gl) {
      this._contextTracker = new GlContextTracker(this._gl, this._ladder.currentTier);
      this._contextTracker.applyDepthAndRasterizerDefaults();
    }
  }

  public dispatchInput(input: PowerInput): void {
    this._power.transition(input);
  }

  public updateCamera(inputs: CameraInputs): CameraEvaluatedMatrices {
    const evaluated = evaluateCameraMatrices(inputs);
    this._lastEvaluatedCamera = evaluated;
    return evaluated;
  }

  // ─── PLAN-02: Render Mode & Mesh Configuration ───

  /**
   * Set the shader render mode.
   * 'ndc-encode': outputs NDC coordinates encoded to RGBA (for camera-matrix verification).
   * 'standard': outputs interpolated vertex color (for golden frame & clipping tests).
   */
  public setRenderMode(mode: RenderMode): void {
    if (this._currentRenderMode !== mode) {
      this._currentRenderMode = mode;
      this._uViewProjectionLocation = null; // invalidate uniform location cache
    }
  }

  /**
   * Set the mesh to render. Uploads vertex data to GPU (VBO) and creates VAO.
   * Call before renderFrame() to specify what to draw.
   */
  public setRenderMesh(mesh: TriangleMesh): void {
    this._currentMesh = mesh;
    this.uploadMeshToGpu(mesh);
  }

  private uploadMeshToGpu(mesh: TriangleMesh): void {
    const gl = this._gl;
    if (!gl) return;

    // Create VAO if not exists
    if (!this._vao) {
      this._vao = gl.createVertexArray();
    }
    if (!this._vao) return;

    gl.bindVertexArray(this._vao);

    // Create/update VBO with interleaved position+color
    const vertexData = buildInterleavedVertexBuffer(mesh);
    if (!this._vbo) {
      this._vbo = gl.createBuffer();
    }
    if (!this._vbo) {
      gl.bindVertexArray(null);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
    this._meshVertexCount = mesh.vertices.length;

    // Vertex attribute layout:
    //   location 0: aPosition (vec3, offset 0)
    //   location 1: aColor (vec3, offset 12)
    // Stride: 6 floats = 24 bytes
    const stride = 6 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);

    // Create/update IBO if mesh has indices
    if (mesh.indices.length > 0) {
      const indexData = buildIndexBuffer(mesh);
      if (!this._ibo) {
        this._ibo = gl.createBuffer();
      }
      if (this._ibo) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
        this._meshIndexCount = mesh.indices.length;
      }
    } else {
      this._meshIndexCount = 0;
      if (this._ibo) {
        gl.deleteBuffer(this._ibo);
        this._ibo = null;
      }
    }

    gl.bindVertexArray(null);
  }

  private ensureShaderProgram(): ShaderCompileResult | null {
    const gl = this._gl;
    if (!gl) return null;

    if (this._currentRenderMode === 'ndc-encode') {
      if (!this._ndcProgram) {
        this._ndcProgram = compileShaderProgram(gl, NDC_VERTEX_SHADER, NDC_FRAGMENT_SHADER);
      }
      return this._ndcProgram;
    } else {
      if (!this._standardProgram) {
        this._standardProgram = compileShaderProgram(gl, STANDARD_VERTEX_SHADER, STANDARD_FRAGMENT_SHADER);
      }
      return this._standardProgram;
    }
  }

  // ─── PLAN-02: Upgraded renderFrame with real draw call ───

  public renderFrame(): void {
    if (this._power.state !== 'ACTIVE') {
      return;
    }

    const gl = this._gl;
    if (!gl || !this._contextTracker) {
      return;
    }

    // Viewport integer scaling alignment (§7.4)
    const dpr = typeof window !== 'undefined'
      ? Math.min(Math.max(window.devicePixelRatio || 1.0, 1.0), 2.0)
      : 1.0;
    const physicalWidth = Math.max(1, Math.round(this._canvas.clientWidth * dpr));
    const physicalHeight = Math.max(1, Math.round(this._canvas.clientHeight * dpr));

    if (this._canvas.width !== physicalWidth || this._canvas.height !== physicalHeight) {
      this._canvas.width = physicalWidth;
      this._canvas.height = physicalHeight;
    }
    gl.viewport(0, 0, physicalWidth, physicalHeight);

    // Clear framebuffer
    gl.clearColor(0.05, 0.1, 0.15, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // If no mesh set, perform cleanup only (backward compatible behavior)
    if (!this._currentMesh || !this._vao) {
      this._contextTracker.unbindAllResources();
      return;
    }

    // Compile/cache shader program
    const programResult = this.ensureShaderProgram();
    if (!programResult) {
      this._contextTracker.unbindAllResources();
      return;
    }

    // Bind program
    gl.useProgram(programResult.program);

    // Get and cache uniform location
    if (!this._uViewProjectionLocation) {
      this._uViewProjectionLocation = gl.getUniformLocation(programResult.program, 'uViewProjection');
    }

    // Inject viewProjection matrix uniform
    if (this._uViewProjectionLocation && this._lastEvaluatedCamera) {
      gl.uniformMatrix4fv(
        this._uViewProjectionLocation,
        false,
        this._lastEvaluatedCamera.viewProjectionMatrix
      );
    }

    // Bind VAO (contains VBO + attribute layout + IBO)
    gl.bindVertexArray(this._vao);

    // Execute draw call
    if (this._meshIndexCount > 0) {
      gl.drawElements(gl.TRIANGLES, this._meshIndexCount, gl.UNSIGNED_SHORT, 0);
    } else {
      const primitive = this._currentMesh.primitiveType === 'points' ? gl.POINTS : gl.TRIANGLES;
      gl.drawArrays(primitive, 0, this._meshVertexCount);
    }

    // Unbind VAO
    gl.bindVertexArray(null);

    // Frame cleanup & unbind sweep (§4.2)
    this._contextTracker.unbindAllResources();
  }

  /**
   * Read pixels from the current framebuffer.
   * Must be called after renderFrame().
   * Returns RGBA8 pixel data.
   */
  public readFramePixels(x: number = 0, y: number = 0, width?: number, height?: number): ReadPixelsResult | null {
    const gl = this._gl;
    if (!gl) return null;

    const w = width ?? this._canvas.width;
    const h = height ?? this._canvas.height;
    const data = new Uint8Array(w * h * 4);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);

    return { data, width: w, height: h };
  }

  // ─── Lifecycle ───

  public dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this._power.transition('DISPOSE');

    // Dispose shader programs
    const gl = this._gl;
    if (gl) {
      if (this._ndcProgram) {
        disposeShaderProgram(gl, this._ndcProgram);
        this._ndcProgram = null;
      }
      if (this._standardProgram) {
        disposeShaderProgram(gl, this._standardProgram);
        this._standardProgram = null;
      }
      if (this._vao) {
        gl.deleteVertexArray(this._vao);
        this._vao = null;
      }
      if (this._vbo) {
        gl.deleteBuffer(this._vbo);
        this._vbo = null;
      }
      if (this._ibo) {
        gl.deleteBuffer(this._ibo);
        this._ibo = null;
      }
    }

    if (this._contextTracker) {
      this._contextTracker.disposeAll();
      this._contextTracker = null;
    }
    this._gl = null;
  }
}
