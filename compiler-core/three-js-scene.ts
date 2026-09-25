/**
 * ThreeJsSceneContract — the shared intermediate contract between
 * ValidatedDesignIR + RuntimeExecutionPlan and the Three.js/React runtime.
 * This module only validates and transports fields; it does not invent
 * aesthetic or runtime defaults.
 */

export type Sha256Hash = string;

export interface SourcedNumber {
  value: number;
  sourcePath: string;
}

export interface ThreeJsSceneAsset {
  assetId: string;
  type: string;
  uri: string;
  hash: Sha256Hash;
  loadingStrategy: 'eager' | 'lazy' | 'on-demand';
  required: boolean;
}

export interface ThreeJsSceneContract {
  schemaVersion: '1.0.0-rc';
  provenance: {
    compilerVersion: string;
    grammarVersion: string;
    adapterVersion: string;
    validatedIRHash: Sha256Hash;
    executionPlanHash: Sha256Hash;
    hashChain: Sha256Hash[];
    extra?: Record<string, unknown>;
  };
  scene: {
    camera: { type: string; params: Record<string, unknown> };
    lights: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
    materials: Array<{ bindingId: string; shaderType: string; uniforms: Record<string, unknown> }>;
    palette: { dominant: string; secondary: string; accent: string; contrastRatio: number; temperatureBias: number };
    composition: {
      focalPoint: { value: [number, number]; sourcePath: string };
      negativeSpaceRatio: SourcedNumber;
      depthLayerCount: SourcedNumber;
      symmetry: SourcedNumber;
    };
    environment: { background: string | null; fog: Record<string, unknown> };
  };
  assets: { geometry: ThreeJsSceneAsset[]; textures: ThreeJsSceneAsset[]; environmentMaps: ThreeJsSceneAsset[] };
  render: {
    rendererType: 'WebGL2Renderer' | 'WebGL1Renderer' | 'CSS3D' | 'DOMCanvas' | 'HeadlessNull';
    toneMapping: 'AgXToneMapping' | 'ACESFilmicToneMapping' | 'LinearToneMapping';
    colorSpace: 'srgb-linear' | 'srgb';
    postprocessing: string[];
    resolution: { width: number; height: number; pixelRatio: number };
  };
  timeline: {
    durationMs: number;
    tracks: Array<{ trackId: string; target: string; startMs: number; durationMs: number; easing: string }>;
  };
  interactions: { events: Array<Record<string, unknown>>; stateMachine: Record<string, unknown> };
  ui: { layout: Record<string, unknown>; components: Array<Record<string, unknown>> };
}

export type ThreeJsSceneValidationCode = 'MISSING_FIELD' | 'SCHEMA_INVALID' | 'HASH_CHAIN_BROKEN';

export interface ThreeJsSceneValidationError {
  code: ThreeJsSceneValidationCode;
  path: string;
  message: string;
}

export interface ThreeJsSceneValidationResult {
  valid: boolean;
  errors: ThreeJsSceneValidationError[];
}

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateProvenance(value: unknown, errors: ThreeJsSceneValidationError[]): void {
  if (!isRecord(value)) {
    errors.push({ code: 'MISSING_FIELD', path: '/provenance', message: 'Provenance is required' });
    return;
  }
  for (const key of ['compilerVersion', 'grammarVersion', 'adapterVersion', 'validatedIRHash', 'executionPlanHash', 'hashChain']) {
    if (!(key in value)) errors.push({ code: 'MISSING_FIELD', path: `/provenance/${key}`, message: `Required field is missing: /provenance/${key}` });
  }
  for (const key of ['compilerVersion', 'grammarVersion', 'adapterVersion']) {
    if (key in value && (typeof value[key] !== 'string' || value[key].length === 0)) {
      errors.push({ code: 'SCHEMA_INVALID', path: `/provenance/${key}`, message: 'Version must be a non-empty string' });
    }
  }
  for (const key of ['validatedIRHash', 'executionPlanHash']) {
    if (key in value && (typeof value[key] !== 'string' || !SHA256.test(value[key] as string))) {
      errors.push({ code: 'SCHEMA_INVALID', path: `/provenance/${key}`, message: 'Hash must be a valid SHA-256 hash' });
    }
  }
  if ('hashChain' in value) {
    const chain = value.hashChain;
    if (!Array.isArray(chain) || chain.length < 4 || chain.some((item) => typeof item !== 'string' || !SHA256.test(item)) || new Set(chain).size !== chain.length) {
      errors.push({ code: 'HASH_CHAIN_BROKEN', path: '/provenance/hashChain', message: 'Hash chain must contain at least four unique SHA-256 hashes' });
    }
  }
}

export function validateThreeJsSceneContract(value: unknown): ThreeJsSceneValidationResult {
  const errors: ThreeJsSceneValidationError[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', path: '/', message: 'Scene contract must be an object' }] };
  }
  if (value.schemaVersion !== '1.0.0-rc') {
    errors.push({ code: 'SCHEMA_INVALID', path: '/schemaVersion', message: 'Unsupported scene contract version' });
  }
  for (const key of ['provenance', 'scene', 'assets', 'render', 'timeline', 'interactions', 'ui']) {
    if (!(key in value)) errors.push({ code: 'MISSING_FIELD', path: `/${key}`, message: `Required field is missing: /${key}` });
  }
  validateProvenance(value.provenance, errors);
  if ('render' in value && isRecord(value.render)) {
    const resolution = value.render.resolution;
    if (!isRecord(resolution)) errors.push({ code: 'MISSING_FIELD', path: '/render/resolution', message: 'Render resolution is required' });
    else {
      for (const key of ['width', 'height', 'pixelRatio']) {
        if (typeof resolution[key] !== 'number' || !Number.isFinite(resolution[key]) || resolution[key] <= 0) {
          errors.push({ code: 'SCHEMA_INVALID', path: `/render/resolution/${key}`, message: 'Resolution values must be positive finite numbers' });
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
