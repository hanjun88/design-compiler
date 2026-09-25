/**
 * Pure mapper: ValidatedDesignIR + RuntimeExecutionPlan -> ThreeJsSceneContract.
 * No defaults are invented. Business failures throw MapperError.
 */

import { HashPolicy } from './hash-policy';
import { validateThreeJsSceneContract } from './three-js-scene';
import type {
  RuntimeAssetInput,
  RuntimeExecutionPlan,
  ValidatedDesignIR,
} from './contracts';
import type {
  ThreeJsSceneAsset,
  ThreeJsSceneContract,
} from './three-js-scene';

export const THREE_JS_SCENE_MAPPER_VERSION = '0.1.0';

export type MapperErrorCode =
  | 'MISSING_FIELD'
  | 'SCHEMA_INVALID'
  | 'HASH_CHAIN_BROKEN'
  | 'DUPLICATE_ASSET_ID';

export class MapperError extends Error {
  constructor(
    public readonly code: MapperErrorCode,
    public readonly path: string,
    message: string,
  ) {
    super(`[${code}] ${path}: ${message}`);
    this.name = 'MapperError';
  }
}

export interface ThreeJsSceneMapperMeta {
  compilerVersion: string;
  grammarVersion: string;
  hashChain: string[];
}

type OptionalSemanticFields = {
  animation?: { durationMs: number; tracks: Array<Record<string, unknown>> };
  interaction?: { events: Array<Record<string, unknown>>; stateMachine: Record<string, unknown> };
  ui?: { layout: Record<string, unknown>; components: Array<Record<string, unknown>> };
};

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new MapperError('MISSING_FIELD', path, 'Required object is missing');
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new MapperError('MISSING_FIELD', path, 'Required array is missing');
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MapperError('SCHEMA_INVALID', path, 'Expected a non-empty string');
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MapperError('SCHEMA_INVALID', path, 'Expected a finite number');
  }
  return value;
}

function mapAssets(assets: RuntimeAssetInput[]): {
  geometry: ThreeJsSceneAsset[];
  textures: ThreeJsSceneAsset[];
  environmentMaps: ThreeJsSceneAsset[];
  nonSceneAssets: RuntimeAssetInput[];
} {
  requireArray(assets, '/runtimePlan/assetManifest');
  const seen = new Set<string>();
  const geometry: ThreeJsSceneAsset[] = [];
  const textures: ThreeJsSceneAsset[] = [];
  const environmentMaps: ThreeJsSceneAsset[] = [];
  const nonSceneAssets: RuntimeAssetInput[] = [];

  for (const [index, asset] of assets.entries()) {
    const path = `/runtimePlan/assetManifest/${index}`;
    const record = requireRecord(asset, path);
    const assetId = requireString(record.assetId, `${path}/assetId`);
    if (seen.has(assetId)) throw new MapperError('DUPLICATE_ASSET_ID', `${path}/assetId`, `Duplicate asset id: ${assetId}`);
    seen.add(assetId);
    const type = requireString(record.type, `${path}/type`);
    const uri = requireString(record.uri, `${path}/uri`);
    const hash = requireString(record.hash, `${path}/hash`);
    if (!SHA256.test(hash)) throw new MapperError('SCHEMA_INVALID', `${path}/hash`, 'Expected a SHA-256 hash');
    const loadingStrategy = requireString(record.loadingStrategy, `${path}/loadingStrategy`) as ThreeJsSceneAsset['loadingStrategy'];
    if (!['eager', 'lazy', 'on-demand'].includes(loadingStrategy)) {
      throw new MapperError('SCHEMA_INVALID', `${path}/loadingStrategy`, 'Unsupported loading strategy');
    }
    if (typeof record.required !== 'boolean') {
      throw new MapperError('SCHEMA_INVALID', `${path}/required`, 'Expected a boolean');
    }
    const mapped: ThreeJsSceneAsset = { assetId, type, uri, hash, loadingStrategy, required: record.required };
    if (type === 'geometry') geometry.push(mapped);
    else if (type === 'texture') textures.push(mapped);
    else if (type === 'environmentMap') environmentMaps.push(mapped);
    else nonSceneAssets.push({ ...record } as unknown as RuntimeAssetInput);
  }
  return { geometry, textures, environmentMaps, nonSceneAssets };
}

function mapTimeline(validatedIR: ValidatedDesignIR): {
  timeline: ThreeJsSceneContract['timeline'];
  omitted: boolean;
} {
  const semantic = validatedIR as ValidatedDesignIR & OptionalSemanticFields;
  if (semantic.animation === undefined) return { timeline: { durationMs: 0, tracks: [] }, omitted: true };
  const animation = requireRecord(semantic.animation, '/validatedIR/animation');
  const durationMs = requireNumber(animation.durationMs, '/validatedIR/animation/durationMs');
  if (durationMs < 0) throw new MapperError('SCHEMA_INVALID', '/validatedIR/animation/durationMs', 'Duration cannot be negative');
  const tracks = requireArray(animation.tracks, '/validatedIR/animation/tracks').map((track, index) => {
    const path = `/validatedIR/animation/tracks/${index}`;
    const record = requireRecord(track, path);
    return {
      trackId: requireString(record.trackId, `${path}/trackId`),
      target: requireString(record.target, `${path}/target`),
      startMs: requireNumber(record.startMs, `${path}/startMs`),
      durationMs: requireNumber(record.durationMs, `${path}/durationMs`),
      easing: requireString(record.easing, `${path}/easing`),
    };
  });
  return { timeline: { durationMs, tracks }, omitted: false };
}

function mapOptionalObject<T extends Record<string, unknown>>(
  value: T | undefined,
  path: string,
): { mapped: T; omitted: boolean } {
  if (value === undefined) return { mapped: {} as T, omitted: true };
  return { mapped: requireRecord(value, path) as T, omitted: false };
}

export function mapToThreeJsSceneContract(
  validatedIR: ValidatedDesignIR,
  runtimePlan: RuntimeExecutionPlan,
  meta: ThreeJsSceneMapperMeta,
): ThreeJsSceneContract {
  const ir = requireRecord(validatedIR, '/validatedIR') as unknown as ValidatedDesignIR;
  const plan = requireRecord(runtimePlan, '/runtimePlan') as unknown as RuntimeExecutionPlan;
  const scene = requireRecord(ir.validated, '/validatedIR/validated');
  const camera = requireRecord(scene.camera, '/validatedIR/validated/camera');
  const lighting = requireRecord(scene.lighting, '/validatedIR/validated/lighting');
  const materials = requireArray(scene.materials, '/validatedIR/validated/materials');
  const color = requireRecord(scene.color, '/validatedIR/validated/color');
  const composition = requireRecord(scene.composition, '/validatedIR/validated/composition');
  if (ir.environment === undefined) {
    throw new MapperError('MISSING_FIELD', '/validatedIR/environment', 'Environment is required by ThreeJsSceneContract');
  }
  if (plan.renderTarget === undefined) {
    throw new MapperError('MISSING_FIELD', '/runtimePlan/renderTarget', 'Render target is required');
  }
  if (!Array.isArray(meta.hashChain) || meta.hashChain.length < 2 ||
    meta.hashChain.some((hash) => !SHA256.test(hash)) || new Set(meta.hashChain).size !== meta.hashChain.length) {
    throw new MapperError('HASH_CHAIN_BROKEN', '/meta/hashChain', 'Hash chain must contain at least two unique SHA-256 hashes');
  }
  const compilerVersion = requireString(meta.compilerVersion, '/meta/compilerVersion');
  const grammarVersion = requireString(meta.grammarVersion, '/meta/grammarVersion');
  if (grammarVersion !== ir.meta.grammarVersion) {
    throw new MapperError('SCHEMA_INVALID', '/meta/grammarVersion', 'Grammar version does not match ValidatedDesignIR');
  }

  const mappedMaterials = materials.map((material, index) => {
    const path = `/validatedIR/validated/materials/${index}`;
    const record = requireRecord(material, path);
    const runtimeMaterial = plan.runtimePlan.sceneBindings.materials[index];
    if (runtimeMaterial === undefined) {
      throw new MapperError('MISSING_FIELD', `/runtimePlan/runtimePlan/sceneBindings/materials/${index}`, 'Runtime material binding is missing');
    }
    return {
      bindingId: runtimeMaterial.bindingId,
      shaderType: runtimeMaterial.shaderType,
      uniforms: {
        role: record.role,
        baseType: requireRecord(record.baseType, `${path}/baseType`).value,
        roughness: requireRecord(record.roughness, `${path}/roughness`).value,
        metalness: requireRecord(record.metalness, `${path}/metalness`).value,
        wear: requireRecord(record.wear, `${path}/wear`).value,
      },
    };
  });

  const assets = mapAssets(plan.assetManifest);
  const timeline = mapTimeline(ir);
  const semantic = ir as ValidatedDesignIR & OptionalSemanticFields;
  const interaction = mapOptionalObject(semantic.interaction, '/validatedIR/interaction');
  const ui = mapOptionalObject(semantic.ui, '/validatedIR/ui');
  const optionalFieldsOmitted: string[] = [];
  if (timeline.omitted) optionalFieldsOmitted.push('animation');
  if (interaction.omitted) optionalFieldsOmitted.push('interaction');
  if (ui.omitted) optionalFieldsOmitted.push('ui');
  if (assets.nonSceneAssets.length > 0) optionalFieldsOmitted.push('nonSceneAssets');

  const contract: ThreeJsSceneContract = {
    schemaVersion: '1.0.0-rc',
    provenance: {
      compilerVersion,
      grammarVersion,
      adapterVersion: THREE_JS_SCENE_MAPPER_VERSION,
      validatedIRHash: HashPolicy.computeValidatedIRHash(ir as unknown as Record<string, unknown>),
      executionPlanHash: HashPolicy.computeExecutionPlanHash(plan as unknown as Record<string, unknown>),
      hashChain: [...meta.hashChain],
      extra: {
        optionalFieldsOmitted,
        sourceIRVersion: ir.sourceRef.rawSchemaVersion,
        ...(assets.nonSceneAssets.length > 0 ? { nonSceneAssets: assets.nonSceneAssets } : {}),
      },
    },
    scene: {
      camera: {
        type: 'PerspectiveCameraRig',
        params: {
          fov: requireRecord(camera.fov, '/validatedIR/validated/camera/fov').value,
          shotSize: requireRecord(camera.shotSize, '/validatedIR/validated/camera/shotSize').value,
          angle: requireRecord(camera.angle, '/validatedIR/validated/camera/angle').value,
          height: requireRecord(camera.height, '/validatedIR/validated/camera/height').value,
        },
      },
      lights: [{
        id: 'key-light',
        type: 'KeyLight',
        parameters: {
          azimuth: requireRecord(lighting.keyLight, '/validatedIR/validated/lighting/keyLight').azimuth,
          elevation: requireRecord(lighting.keyLight, '/validatedIR/validated/lighting/keyLight').elevation,
          colorTemp: requireRecord(lighting.keyLight, '/validatedIR/validated/lighting/keyLight').colorTemp,
          intensity: requireRecord(lighting.keyLight, '/validatedIR/validated/lighting/keyLight').intensity,
          softness: requireRecord(lighting.keyLight, '/validatedIR/validated/lighting/keyLight').softness,
        },
      }],
      materials: mappedMaterials,
      palette: {
        dominant: requireString(requireRecord(color.dominant, '/validatedIR/validated/color/dominant').value, '/validatedIR/validated/color/dominant/value'),
        secondary: requireString(requireRecord(color.secondary, '/validatedIR/validated/color/secondary').value, '/validatedIR/validated/color/secondary/value'),
        accent: requireString(requireRecord(color.accent, '/validatedIR/validated/color/accent').value, '/validatedIR/validated/color/accent/value'),
        contrastRatio: requireNumber(requireRecord(color.contrastRatio, '/validatedIR/validated/color/contrastRatio').value, '/validatedIR/validated/color/contrastRatio/value'),
        temperatureBias: requireNumber(requireRecord(color.temperatureBias, '/validatedIR/validated/color/temperatureBias').value, '/validatedIR/validated/color/temperatureBias/value'),
      },
      composition: {
        focalPoint: {
          value: requireRecord(composition.focalPoint, '/validatedIR/validated/composition/focalPoint').value as [number, number],
          sourcePath: '/composition/focalPoint',
        },
        negativeSpaceRatio: { value: requireNumber(requireRecord(composition.negativeSpaceRatio, '/validatedIR/validated/composition/negativeSpaceRatio').value, '/composition/negativeSpaceRatio/value'), sourcePath: '/composition/negativeSpaceRatio' },
        depthLayerCount: { value: requireNumber(requireRecord(composition.depthLayerCount, '/validatedIR/validated/composition/depthLayerCount').value, '/composition/depthLayerCount/value'), sourcePath: '/composition/depthLayerCount' },
        symmetry: { value: requireNumber(requireRecord(composition.symmetry, '/validatedIR/validated/composition/symmetry').value, '/composition/symmetry/value'), sourcePath: '/composition/symmetry' },
      },
      environment: {
        background: ir.environment.background,
        fog: { ...ir.environment.fog },
        ...(ir.environment.environmentMapRef ? {} : {}),
      },
    },
    assets: { geometry: assets.geometry, textures: assets.textures, environmentMaps: assets.environmentMaps },
    render: {
      rendererType: plan.runtimePlan.pipeline.rendererType,
      toneMapping: plan.runtimePlan.pipeline.toneMapping,
      colorSpace: plan.runtimePlan.pipeline.colorSpace,
      postprocessing: [...plan.runtimePlan.pipeline.postprocessing],
      resolution: { ...plan.renderTarget },
    },
    timeline: timeline.timeline,
    interactions: { events: interaction.mapped.events ?? [], stateMachine: interaction.mapped.stateMachine ?? {} },
    ui: { layout: ui.mapped.layout ?? {}, components: ui.mapped.components ?? [] },
  };

  const validation = validateThreeJsSceneContract(contract);
  if (!validation.valid) {
    const first = validation.errors[0];
    throw new MapperError(first.code, first.path, first.message);
  }
  return contract;
}
