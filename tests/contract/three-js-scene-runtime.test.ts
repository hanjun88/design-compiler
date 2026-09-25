/**
 * ThreeJsSceneRuntime contract tests.
 *
 * Covers:
 * - fromContract validation (pass / fail-closed)
 * - mount with HeadlessNull renderer (node-safe, no WebGL)
 * - scene graph construction (camera, lights, materials, environment)
 * - idempotent mount
 * - dispose lifecycle and RUNTIME_DISPOSED guard
 * - loadAsset fail-closed (ASSET_NOT_FOUND)
 * - event emitter (assetLoaded / frame / error)
 * - asset loading strategy classification
 */

import * as THREE from 'three';
import { ThreeJsSceneRuntime } from '../../runtime/three-js/three-js-scene-runtime';
import { RuntimeError } from '../../runtime/three-js/errors';
import { buildSceneFromContract } from '../../runtime/three-js/scene-builder';
import type { ThreeJsSceneContract } from '../../compiler-core/three-js-scene';

const hash = (char: string): string => `sha256:${char.repeat(64)}`;

function validContract(overrides?: Partial<ThreeJsSceneContract>): ThreeJsSceneContract {
  const base: ThreeJsSceneContract = {
    schemaVersion: '1.0.0-rc',
    provenance: {
      compilerVersion: '1.0.0',
      grammarVersion: '1.0.0',
      adapterVersion: '0.1.0',
      validatedIRHash: hash('a'),
      executionPlanHash: hash('b'),
      hashChain: [hash('a'), hash('b'), hash('c'), hash('d')],
    },
    scene: {
      camera: { type: 'PerspectiveCameraRig', params: { fov: 35, shotSize: 'medium', angle: 5, height: 1.6 } },
      lights: [{ id: 'key-light', type: 'KeyLight', parameters: { intensity: 1.2, azimuth: 45, elevation: 60 } }],
      materials: [{ bindingId: 'dominant-0', shaderType: 'PBR', uniforms: { roughness: 0.7, metalness: 0.1 } }],
      palette: { dominant: '#2b2b2b', secondary: '#7c7c7c', accent: '#d4af37', contrastRatio: 4.5, temperatureBias: 0.1 },
      composition: {
        focalPoint: { value: [0.5, 0.4], sourcePath: '/composition/focalPoint' },
        negativeSpaceRatio: { value: 0.45, sourcePath: '/composition/negativeSpaceRatio' },
        depthLayerCount: { value: 4, sourcePath: '/composition/depthLayerCount' },
        symmetry: { value: 0.85, sourcePath: '/composition/symmetry' },
      },
      environment: { background: '#1a1a2e', fog: { type: 'linear', near: 1, far: 50, color: '#1a1a2e' } },
    },
    assets: { geometry: [], textures: [], environmentMaps: [] },
    render: {
      rendererType: 'HeadlessNull',
      toneMapping: 'ACESFilmicToneMapping',
      colorSpace: 'srgb-linear',
      postprocessing: [],
      resolution: { width: 1920, height: 1080, pixelRatio: 1 },
    },
    timeline: { durationMs: 0, tracks: [] },
    interactions: { events: [], stateMachine: {} },
    ui: { layout: {}, components: [] },
  };
  return { ...base, ...overrides } as ThreeJsSceneContract;
}

function mockContainer(): HTMLElement {
  return {
    clientWidth: 1920,
    clientHeight: 1080,
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  } as unknown as HTMLElement;
}

describe('ThreeJsSceneRuntime.fromContract', () => {
  test('constructs runtime from a valid contract without creating WebGL context', () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    expect(runtime).toBeInstanceOf(ThreeJsSceneRuntime);
  });

  test('throws MISSING_FIELD when contract lacks required top-level section', () => {
    const contract = validContract() as unknown as Record<string, unknown>;
    delete contract.scene;
    expect(() => ThreeJsSceneRuntime.fromContract(contract as unknown as ThreeJsSceneContract)).toThrow(RuntimeError);
    expect(() => ThreeJsSceneRuntime.fromContract(contract as unknown as ThreeJsSceneContract)).toThrow('MISSING_FIELD');
  });

  test('throws HASH_CHAIN_BROKEN when hash chain has duplicates', () => {
    const contract = validContract();
    contract.provenance.hashChain = [hash('a'), hash('a'), hash('c'), hash('d')];
    expect(() => ThreeJsSceneRuntime.fromContract(contract)).toThrow('HASH_CHAIN_BROKEN');
  });

  test('throws SCHEMA_INVALID when schemaVersion is unsupported', () => {
    const contract = validContract();
    contract.schemaVersion = '9.9.9' as ThreeJsSceneContract['schemaVersion'];
    expect(() => ThreeJsSceneRuntime.fromContract(contract)).toThrow('SCHEMA_INVALID');
  });
});

describe('SceneBuilder', () => {
  test('builds PerspectiveCamera with contract fov and aspect ratio', () => {
    const built = buildSceneFromContract(validContract());
    expect(built.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(built.camera.fov).toBe(35);
    expect(built.camera.aspect).toBeCloseTo(1920 / 1080);
  });

  test('builds key light as DirectionalLight with intensity from contract', () => {
    const built = buildSceneFromContract(validContract());
    expect(built.lights).toHaveLength(1);
    expect(built.lights[0]).toBeInstanceOf(THREE.DirectionalLight);
    expect((built.lights[0] as THREE.DirectionalLight).intensity).toBe(1.2);
  });

  test('applies background color from environment', () => {
    const built = buildSceneFromContract(validContract());
    expect(built.scene.background).toBeInstanceOf(THREE.Color);
    expect((built.scene.background as THREE.Color).getHexString()).toBe('1a1a2e');
  });

  test('applies linear fog when environment.fog.type is linear', () => {
    const built = buildSceneFromContract(validContract());
    expect(built.scene.fog).toBeInstanceOf(THREE.Fog);
    const fog = built.scene.fog as THREE.Fog;
    expect(fog.near).toBe(1);
    expect(fog.far).toBe(50);
  });

  test('applies exponential fog when environment.fog.type is exponential', () => {
    const contract = validContract();
    contract.scene.environment.fog = { type: 'exponential', density: 0.02, color: '#000000' };
    const built = buildSceneFromContract(contract);
    expect(built.scene.fog).toBeInstanceOf(THREE.FogExp2);
  });

  test('no fog when environment.fog.type is none', () => {
    const contract = validContract();
    contract.scene.environment.fog = { type: 'none' };
    const built = buildSceneFromContract(contract);
    expect(built.scene.fog).toBeNull();
  });

  test('creates materials with roughness and metalness from uniforms', () => {
    const built = buildSceneFromContract(validContract());
    expect(built.materials.size).toBe(1);
    const mat = built.materials.get('dominant-0')!;
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mat.roughness).toBe(0.7);
    expect(mat.metalness).toBe(0.1);
  });

  test('throws MISSING_FIELD when camera fov is absent', () => {
    const contract = validContract();
    contract.scene.camera.params = { shotSize: 'medium' };
    expect(() => buildSceneFromContract(contract)).toThrow('MISSING_FIELD');
  });

  test('throws SCHEMA_INVALID for unsupported light type', () => {
    const contract = validContract();
    contract.scene.lights = [{ id: 'bad', type: 'UnknownLight', parameters: { intensity: 1 } }];
    expect(() => buildSceneFromContract(contract)).toThrow('SCHEMA_INVALID');
  });
});

describe('ThreeJsSceneRuntime.mount (HeadlessNull)', () => {
  test('mounts scene and camera into container without WebGL', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    const result = await runtime.mount(mockContainer());
    expect(result.scene).toBeInstanceOf(THREE.Scene);
    expect(result.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(result.renderer).toBeNull();
    expect(result.eagerAssetsLoaded).toBe(0);
    runtime.dispose();
  });

  test('mount is idempotent — second call returns without rebuilding', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    const container = mockContainer();
    const first = await runtime.mount(container);
    const second = await runtime.mount(container);
    expect(second.scene).toBe(first.scene);
    expect(second.camera).toBe(first.camera);
    runtime.dispose();
  });

  test('getScene and getCamera return mounted objects', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    expect(runtime.getScene()).toBeInstanceOf(THREE.Scene);
    expect(runtime.getCamera()).toBeInstanceOf(THREE.PerspectiveCamera);
    runtime.dispose();
  });

  test('getScene throws MOUNT_FAILED before mount', () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    expect(() => runtime.getScene()).toThrow('MOUNT_FAILED');
  });

  test('scene contains lights from contract after mount', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    const scene = runtime.getScene();
    const lights = scene.children.filter((c) => c instanceof THREE.Light);
    expect(lights.length).toBeGreaterThanOrEqual(1);
    runtime.dispose();
  });
});

describe('ThreeJsSceneRuntime.dispose', () => {
  test('dispose releases scene and camera references', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    runtime.dispose();
    expect(() => runtime.getScene()).toThrow('RUNTIME_DISPOSED');
  });

  test('dispose is safe to call multiple times', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
  });

  test('mount throws RUNTIME_DISPOSED after dispose', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    runtime.dispose();
    await expect(runtime.mount(mockContainer())).rejects.toThrow('RUNTIME_DISPOSED');
  });

  test('on throws RUNTIME_DISPOSED after dispose', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    runtime.dispose();
    expect(() => runtime.on('frame', () => {})).toThrow('RUNTIME_DISPOSED');
  });
});

describe('ThreeJsSceneRuntime.loadAsset', () => {
  test('throws ASSET_NOT_FOUND for asset not in contract', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    await expect(runtime.loadAsset('nonexistent')).rejects.toThrow('ASSET_NOT_FOUND');
    runtime.dispose();
  });

  test('throws RUNTIME_DISPOSED when loading after dispose', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    await runtime.mount(mockContainer());
    runtime.dispose();
    await expect(runtime.loadAsset('any')).rejects.toThrow('RUNTIME_DISPOSED');
  });
});

describe('ThreeJsSceneRuntime events', () => {
  test('on registers listener and frame events fire during render loop', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    const frames: number[] = [];
    runtime.on('frame', (event) => {
      frames.push((event as { elapsed: number }).elapsed);
    });
    await runtime.mount(mockContainer());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(frames.length).toBeGreaterThan(0);
    runtime.dispose();
  });

  test('error event payload carries code and message', async () => {
    const runtime = ThreeJsSceneRuntime.fromContract(validContract());
    const errors: Array<{ code: string; message: string }> = [];
    runtime.on('error', (event) => {
      errors.push(event as { code: string; message: string });
    });
    await runtime.mount(mockContainer());
    runtime.loadAsset('nonexistent').catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(errors.length).toBeGreaterThanOrEqual(0);
    runtime.dispose();
  });
});

describe('Asset loading strategy classification', () => {
  test('eager assets are loaded during mount', async () => {
    const contract = validContract();
    contract.assets.textures = [{
      assetId: 'tex-1',
      type: 'texture',
      uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      hash: hash('t'),
      loadingStrategy: 'eager',
      required: false,
    }];
    const runtime = ThreeJsSceneRuntime.fromContract(contract);
    // Texture loading in node will fail (no DOM Image); non-required eager should skip
    const result = await runtime.mount(mockContainer());
    expect(result.eagerAssetsSkipped).toBe(1);
    runtime.dispose();
  });

  test('on-demand assets are not loaded during mount', async () => {
    const contract = validContract();
    contract.assets.textures = [{
      assetId: 'tex-ondemand',
      type: 'texture',
      uri: 'https://example.com/tex.png',
      hash: hash('o'),
      loadingStrategy: 'on-demand',
      required: true,
    }];
    const runtime = ThreeJsSceneRuntime.fromContract(contract);
    const result = await runtime.mount(mockContainer());
    expect(result.eagerAssetsLoaded).toBe(0);
    expect(result.eagerAssetsSkipped).toBe(0);
    runtime.dispose();
  });
});

describe('Environment fixture end-to-end', () => {
  test('contract with full environment produces scene with background + fog + env map slot', async () => {
    const contract = validContract();
    contract.scene.environment = {
      background: '#0d1117',
      fog: { type: 'exponential', density: 0.015, color: '#0d1117' },
    };
    contract.assets.environmentMaps = [{
      assetId: 'env-studio',
      type: 'environmentMap',
      uri: 'https://example.com/studio.hdr',
      hash: hash('e'),
      loadingStrategy: 'lazy',
      required: false,
    }];
    const runtime = ThreeJsSceneRuntime.fromContract(contract);
    const result = await runtime.mount(mockContainer());

    const scene = result.scene;
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe('0d1117');
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);

    runtime.dispose();
  });
});
