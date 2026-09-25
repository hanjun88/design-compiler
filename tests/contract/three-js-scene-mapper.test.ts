import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import {
  MapperError,
  mapToThreeJsSceneContract,
} from '../../compiler-core/three-js-scene-mapper';
import type { ParameterUnit, RuntimeAssetInput, RuntimeExecutionPlan, ValidatedDesignIR } from '../../compiler-core/contracts';

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/three-js-scene.schema.json'), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}` as `sha256:${string}`;

function param<T>(value: T, unit: ParameterUnit) {
  return { value, unit, confidence: 0.95, status: 'observed' as const, evidence: ['mapper-test'], source: 'vision-estimation' as const };
}

function validatedIR(): ValidatedDesignIR {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    meta: { grammarPack: 'chinese-aesthetic', grammarVersion: '1.0.0', compiledAt: '2026-09-25T00:00:00.000Z' },
    sourceRef: { rawIRHash: hash('a'), rawSchemaVersion: '1.0.0' },
    environment: { background: '#101010', fog: { type: 'linear', near: 10, far: 100, color: '#8899aa' } },
    patches: [],
    validated: {
      composition: {
        focalPoint: param([0.5, 0.4], 'vector2'),
        negativeSpaceRatio: param(0.45, 'ratio'),
        depthLayerCount: param(4, 'scalar'),
        symmetry: param(0.85, 'normalized'),
      },
      camera: {
        fov: param(35, 'degrees'),
        shotSize: param('long-shot', 'scalar'),
        angle: param(0, 'degrees'),
        height: param(1.6, 'scalar'),
      },
      lighting: {
        keyLight: {
          azimuth: param(45, 'degrees'),
          elevation: param(30, 'degrees'),
          colorTemp: param(5500, 'kelvin'),
          intensity: param(1.2, 'scalar'),
          softness: param(0.75, 'normalized'),
        },
        ambientRatio: param(0.25, 'ratio'),
        rimLightPresent: param(true, 'scalar'),
      },
      materials: [{ role: 'dominant', baseType: param('stone', 'scalar'), roughness: param(0.7, 'normalized'), metalness: param(0.1, 'normalized'), wear: param(0.4, 'normalized') }],
      color: {
        dominant: param('#2b2b2b', 'hex'),
        secondary: param('#7c7c7c', 'hex'),
        accent: param('#d4af37', 'hex'),
        contrastRatio: param(4.5, 'ratio'),
        temperatureBias: param(0.1, 'normalized'),
      },
    },
    auditReport: {
      rulesEvaluated: 0,
      patchesEvaluated: 0,
      mutationsApplied: 0,
      testsPassed: 0,
      testsFailed: 0,
      complianceScore: 1,
      violations: [],
    },
  };
}

const asset: RuntimeAssetInput = {
  assetId: 'wood-texture',
  type: 'texture',
  uri: 'assets/wood.png',
  hash: hash('c'),
  loadingStrategy: 'lazy',
  required: true,
};

function runtimePlan(assets: RuntimeAssetInput[] = [asset]): RuntimeExecutionPlan {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    negotiation: {
      resolutionStatus: 'ACCEPTED',
      selectedTier: 'TIER_A',
      requirements: { requiredCapabilities: ['webgl2'], preferredCapabilities: [] },
      capabilities: { webgl2: true },
      downgrades: [],
      blockingFailures: [],
    },
    runtimePlan: {
      pipeline: { rendererType: 'WebGL2Renderer', toneMapping: 'AgXToneMapping', colorSpace: 'srgb-linear', postprocessing: [] },
      sceneBindings: {
        cameraRig: { type: 'PerspectiveCameraRig', params: {} },
        lights: [{ type: 'KeyLight', parameters: {} }],
        materials: [{ bindingId: 'dominant-0', shaderType: 'PBR', uniforms: {} }],
      },
    },
    renderTarget: { width: 1920, height: 1080, pixelRatio: 1 },
    assetManifest: assets,
  };
}

const meta = { compilerVersion: '1.0.0', grammarVersion: '1.0.0', hashChain: [hash('a'), hash('b'), hash('c'), hash('d')] };

describe('mapToThreeJsSceneContract', () => {
  test('maps complete dual input into a schema-valid contract', () => {
    const contract = mapToThreeJsSceneContract(validatedIR(), runtimePlan(), meta);
    expect(validateSchema(contract)).toBe(true);
    expect(contract.scene.palette.dominant).toBe('#2b2b2b');
    expect(contract.assets.textures).toEqual([asset]);
    expect(contract.render.resolution).toEqual({ width: 1920, height: 1080, pixelRatio: 1 });
    expect(contract.provenance.extra?.optionalFieldsOmitted).toEqual(['animation', 'interaction', 'ui']);
  });

  test('fails closed when environment is missing', () => {
    const ir = validatedIR();
    delete ir.environment;
    expect(() => mapToThreeJsSceneContract(ir, runtimePlan(), meta)).toThrow(MapperError);
    try {
      mapToThreeJsSceneContract(ir, runtimePlan(), meta);
    } catch (error) {
      expect((error as MapperError).code).toBe('MISSING_FIELD');
    }
  });

  test('fails closed when runtime renderTarget or assetManifest is missing', () => {
    const withoutTarget = runtimePlan();
    delete (withoutTarget as unknown as Record<string, unknown>).renderTarget;
    expect(() => mapToThreeJsSceneContract(validatedIR(), withoutTarget, meta)).toThrow(/renderTarget/);

    const withoutAssets = runtimePlan();
    delete (withoutAssets as unknown as Record<string, unknown>).assetManifest;
    expect(() => mapToThreeJsSceneContract(validatedIR(), withoutAssets, meta)).toThrow(/assetManifest/);
  });

  test('rejects duplicate asset ids', () => {
    try {
      mapToThreeJsSceneContract(validatedIR(), runtimePlan([asset, asset]), meta);
      throw new Error('expected duplicate asset failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MapperError);
      expect((error as MapperError).code).toBe('DUPLICATE_ASSET_ID');
    }
  });

  test('rejects a broken hash chain before mapping', () => {
    expect(() => mapToThreeJsSceneContract(validatedIR(), runtimePlan(), { ...meta, hashChain: [hash('a')] }))
      .toThrow(/Hash chain/);
  });

  test('preserves non-scene assets in provenance.extra instead of dropping them', () => {
    const font: RuntimeAssetInput = {
      assetId: 'display-font',
      type: 'font',
      uri: 'assets/fonts/display.woff2',
      hash: hash('d'),
      loadingStrategy: 'eager',
      required: true,
    };
    const contract = mapToThreeJsSceneContract(validatedIR(), runtimePlan([asset, font]), meta);
    expect(contract.provenance.extra?.nonSceneAssets).toEqual([font]);
    expect(contract.provenance.extra?.optionalFieldsOmitted).toContain('nonSceneAssets');
  });
});
