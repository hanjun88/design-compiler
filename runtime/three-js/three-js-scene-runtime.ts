/**
 * ThreeJsSceneRuntime — the first real consumer of ThreeJsSceneContract.
 *
 * Lifecycle:
 *   fromContract(contract)  → validate + construct (no WebGL context)
 *   mount(container)        → build scene, create renderer, load eager assets, start loop
 *   dispose()               → recursive release of every GPU/DOM/timer handle
 *
 * Fail-closed: invalid contract, missing required asset, or unavailable renderer
 * throws RuntimeError before any partial state is exposed.
 */

import * as THREE from 'three';
import { validateThreeJsSceneContract } from '../../compiler-core/three-js-scene';
import type { ThreeJsSceneAsset, ThreeJsSceneContract } from '../../compiler-core/three-js-scene';
import { AssetLoader } from './asset-loader';
import { RuntimeError } from './errors';
import { buildSceneFromContract } from './scene-builder';
import type {
  AssetLoadedEvent,
  FrameEvent,
  LoadedAsset,
  MountResult,
  RuntimeErrorEvent,
  RuntimeEventName,
  RuntimeEventListener,
} from './types';

const RUNTIME_VERSION = '0.1.0';
const MAX_DELTA = 0.1;

export class ThreeJsSceneRuntime {
  private readonly contract: ThreeJsSceneContract;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLElement | null = null;
  private materials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private assetLoader: AssetLoader;
  private eventListeners: Map<RuntimeEventName, Set<RuntimeEventListener>> = new Map();
  private animationFrameId: number | null = null;
  private startTime = 0;
  private lastFrameTime = 0;
  private mounted = false;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  private constructor(contract: ThreeJsSceneContract) {
    this.contract = contract;
    this.assetLoader = new AssetLoader();
  }

  /**
   * Validate contract and construct runtime. No WebGL context is created here,
   * so this is safe to call in any environment. Invalid contracts throw.
   */
  static fromContract(contract: ThreeJsSceneContract): ThreeJsSceneRuntime {
    const result = validateThreeJsSceneContract(contract);
    if (!result.valid) {
      const first = result.errors[0];
      throw new RuntimeError(first.code, first.path, first.message);
    }
    return new ThreeJsSceneRuntime(contract);
  }

  /**
   * Mount the scene into a DOM container. Idempotent: a second call returns
   * the existing MountResult without rebuilding.
   */
  async mount(container: HTMLElement): Promise<MountResult> {
    this.assertNotDisposed();
    if (this.mounted && this.scene && this.camera) {
      return this.buildMountResult(0, 0);
    }

    this.container = container;

    const built = buildSceneFromContract(this.contract);
    this.scene = built.scene;
    this.camera = built.camera;
    this.materials = built.materials;

    if (this.contract.render.rendererType !== 'HeadlessNull') {
      this.renderer = this.createRenderer(container);
    }

    const eagerAssets = this.getAssetsByStrategy('eager');
    let eagerLoaded = 0;
    let eagerSkipped = 0;
    for (const asset of eagerAssets) {
      try {
        const object = await this.assetLoader.load(asset);
        this.attachAssetToScene(asset, object);
        eagerLoaded++;
        this.emit('assetLoaded', { assetId: asset.assetId, type: asset.type, uri: asset.uri });
      } catch (error) {
        if (asset.required) {
          this.dispose();
          throw error instanceof RuntimeError
            ? error
            : new RuntimeError('ASSET_LOAD_FAILED', `/assets/${asset.assetId}`, `Required eager asset failed: ${asset.uri}`);
        }
        eagerSkipped++;
        this.emit('error', {
          code: 'ASSET_LOAD_FAILED',
          message: `Non-required eager asset failed, skipping: ${asset.uri}`,
          path: `/assets/${asset.assetId}`,
        });
      }
    }

    this.startRenderLoop();
    this.startLazyAssets();
    this.setupResizeHandling();

    this.mounted = true;
    return this.buildMountResult(eagerLoaded, eagerSkipped);
  }

  /**
   * Recursively release all GPU, DOM, and timer resources.
   * Safe to call multiple times; after dispose, all operations throw RUNTIME_DISPOSED.
   */
  dispose(): void {
    if (this.disposed) return;

    this.stopRenderLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      this.scene = null;
    }

    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();

    this.assetLoader.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement === this.container && this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    this.camera = null;
    this.container = null;
    this.eventListeners.clear();
    this.disposed = true;
  }

  getScene(): THREE.Scene {
    this.assertNotDisposed();
    this.assertMounted();
    return this.scene!;
  }

  getCamera(): THREE.Camera {
    this.assertNotDisposed();
    this.assertMounted();
    return this.camera!;
  }

  getRenderer(): THREE.WebGLRenderer {
    this.assertNotDisposed();
    this.assertMounted();
    if (!this.renderer) {
      throw new RuntimeError('RENDERER_UNAVAILABLE', '/renderer', 'Renderer is null (HeadlessNull mode)');
    }
    return this.renderer;
  }

  /**
   * Explicitly load an on-demand (or any) asset by ID.
   * Throws ASSET_NOT_FOUND if the asset isn't in the contract.
   */
  async loadAsset(assetId: string): Promise<void> {
    this.assertNotDisposed();
    const asset = this.findAsset(assetId);
    if (!asset) {
      throw new RuntimeError('ASSET_NOT_FOUND', `/assets/${assetId}`, `Asset not registered in contract: ${assetId}`);
    }
    const object = await this.assetLoader.load(asset);
    this.attachAssetToScene(asset, object);
    this.emit('assetLoaded', { assetId: asset.assetId, type: asset.type, uri: asset.uri });
  }

  on(event: RuntimeEventName, listener: RuntimeEventListener): void {
    this.assertNotDisposed();
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: RuntimeEventName, listener: RuntimeEventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createRenderer(container: HTMLElement): THREE.WebGLRenderer {
    const { width, height, pixelRatio } = this.contract.render.resolution;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: this.contract.scene.environment.background === null,
      });
    } catch {
      throw new RuntimeError('RENDERER_UNAVAILABLE', '/render', 'WebGL context could not be created');
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(pixelRatio, typeof window !== 'undefined' ? window.devicePixelRatio : 1));
    renderer.outputColorSpace = this.contract.render.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    renderer.toneMapping = this.mapToneMapping(this.contract.render.toneMapping);
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    return renderer;
  }

  private mapToneMapping(type: ThreeJsSceneContract['render']['toneMapping']): THREE.ToneMapping {
    switch (type) {
      case 'ACESFilmicToneMapping':
        return THREE.ACESFilmicToneMapping;
      case 'AgXToneMapping':
        return THREE.AgXToneMapping;
      case 'LinearToneMapping':
        return THREE.LinearToneMapping;
    }
  }

  private startRenderLoop(): void {
    this.startTime = this.now();
    this.lastFrameTime = this.startTime;
    const tick = (now: number): void => {
      if (this.disposed || !this.scene || !this.camera) return;
      const rawDelta = (now - this.lastFrameTime) / 1000;
      const delta = Math.min(rawDelta, MAX_DELTA);
      const elapsed = (now - this.startTime) / 1000;
      this.lastFrameTime = now;
      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
      this.emit('frame', { delta, elapsed });
      this.animationFrameId = this.scheduleFrame(tick);
    };
    this.animationFrameId = this.scheduleFrame(tick);
  }

  private stopRenderLoop(): void {
    if (this.animationFrameId !== null) {
      this.cancelFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private scheduleFrame(callback: (time: number) => void): number {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(this.now()), 16) as unknown as number;
  }

  private cancelFrame(handle: number): void {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle);
    } else {
      clearTimeout(handle);
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private setupResizeHandling(): void {
    if (typeof ResizeObserver === 'undefined' || !this.container) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container || !this.camera || !this.renderer) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width === 0 || height === 0) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
    this.resizeObserver.observe(this.container);
  }

  private startLazyAssets(): void {
    const lazyAssets = this.getAssetsByStrategy('lazy');
    for (const asset of lazyAssets) {
      this.assetLoader.load(asset)
        .then((object) => {
          if (this.disposed) return;
          this.attachAssetToScene(asset, object);
          this.emit('assetLoaded', { assetId: asset.assetId, type: asset.type, uri: asset.uri });
        })
        .catch((error) => {
          if (this.disposed) return;
          this.emit('error', {
            code: error instanceof RuntimeError ? error.code : 'ASSET_LOAD_FAILED',
            message: `Lazy asset failed: ${asset.uri}`,
            path: `/assets/${asset.assetId}`,
          });
        });
    }
  }

  private attachAssetToScene(asset: ThreeJsSceneAsset, object: LoadedAsset['object']): void {
    if (!this.scene) return;
    if (object instanceof THREE.Texture) {
      if (asset.type === 'environmentMap') {
        this.scene.environment = object;
      } else {
        const firstMaterial = this.materials.values().next().value;
        if (firstMaterial) firstMaterial.map = object;
      }
    } else if (object instanceof THREE.Group || object instanceof THREE.Mesh) {
      this.scene.add(object);
    } else if (object instanceof THREE.BufferGeometry) {
      const material = this.materials.values().next().value ?? new THREE.MeshStandardMaterial();
      const mesh = new THREE.Mesh(object, material);
      mesh.name = asset.assetId;
      this.scene.add(mesh);
    }
  }

  private getAssetsByStrategy(strategy: ThreeJsSceneAsset['loadingStrategy']): ThreeJsSceneAsset[] {
    const all = [
      ...this.contract.assets.geometry,
      ...this.contract.assets.textures,
      ...this.contract.assets.environmentMaps,
    ];
    return all.filter((a) => a.loadingStrategy === strategy);
  }

  private findAsset(assetId: string): ThreeJsSceneAsset | undefined {
    const all = [
      ...this.contract.assets.geometry,
      ...this.contract.assets.textures,
      ...this.contract.assets.environmentMaps,
    ];
    return all.find((a) => a.assetId === assetId);
  }

  private buildMountResult(eagerLoaded: number, eagerSkipped: number): MountResult {
    return {
      scene: this.scene!,
      camera: this.camera!,
      renderer: this.renderer,
      mountedAt: new Date().toISOString(),
      eagerAssetsLoaded: eagerLoaded,
      eagerAssetsSkipped: eagerSkipped,
    };
  }

  private emit(event: 'assetLoaded', payload: AssetLoadedEvent): void;
  private emit(event: 'frame', payload: FrameEvent): void;
  private emit(event: 'error', payload: RuntimeErrorEvent): void;
  private emit(event: RuntimeEventName, payload: AssetLoadedEvent | FrameEvent | RuntimeErrorEvent): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors must not crash the render loop
      }
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new RuntimeError('RUNTIME_DISPOSED', '/', 'Runtime has been disposed');
    }
  }

  private assertMounted(): void {
    if (!this.mounted) {
      throw new RuntimeError('MOUNT_FAILED', '/', 'Runtime has not been mounted; call mount() first');
    }
  }
}

export { RUNTIME_VERSION };
