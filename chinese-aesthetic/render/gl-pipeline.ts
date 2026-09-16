/**
 * Phase 5 Step 5.2 - WebGL Rendering Pipeline Orchestrator
 * Integrates PowerManager, RafDispatcher, DegradationLadder, CameraEvaluator & GlContextTracker.
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07
 */

import { DegradationLadder, CapabilityTier } from './degradation-ladder';
import { PowerManager, PowerInput, PowerStatusSnapshot } from './power-manager';
import { RafDispatcher, IRafDispatcher } from './raf-engine';
import { CameraInputs, CameraEvaluatedMatrices, evaluateCameraMatrices } from './camera-evaluator';
import { GlContextTracker } from './gl-context-tracker';

export interface PipelineConfig {
  readonly canvas: HTMLCanvasElement;
  readonly initialTier?: CapabilityTier;
  readonly dispatcher?: IRafDispatcher;
}

export class GlPipeline {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ladder: DegradationLadder;
  private readonly _power: PowerManager;
  private readonly _dispatcher: IRafDispatcher;
  private _contextTracker: GlContextTracker | null = null;
  private _gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private _lastEvaluatedCamera: CameraEvaluatedMatrices | null = null;
  private _isDisposed: boolean = false;

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

  private initializeContext(): void {
    if (this._ladder.currentTier === 'DOM_NEUTRAL' || this._ladder.currentTier === 'STATIC') {
      return;
    }

    const attrs: WebGLContextAttributes = {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true
    };

    if (this._ladder.currentTier === 'WEBGL2') {
      this._gl = this._canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
      if (!this._gl) {
        this._ladder.degradeSessionCap('WEBGL1');
      }
    }

    if (!this._gl && this._ladder.currentTier === 'WEBGL1') {
      this._gl = (this._canvas.getContext('webgl', attrs) ||
        this._canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
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
    const physicalWidth = Math.round(this._canvas.clientWidth * dpr);
    const physicalHeight = Math.round(this._canvas.clientHeight * dpr);

    if (this._canvas.width !== physicalWidth || this._canvas.height !== physicalHeight) {
      this._canvas.width = physicalWidth;
      this._canvas.height = physicalHeight;
      gl.viewport(0, 0, physicalWidth, physicalHeight);
    }

    // Frame cleanup & unbind sweep (§4.2)
    this._contextTracker.unbindAllResources();
  }

  public dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this._power.transition('DISPOSE');
    if (this._contextTracker) {
      this._contextTracker.disposeAll();
      this._contextTracker = null;
    }
    this._gl = null;
  }
}