import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import { validateThreeJsSceneContract } from '../../compiler-core/three-js-scene';
import type { ThreeJsSceneContract } from '../../compiler-core/three-js-scene';

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/three-js-scene.schema.json'), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const hash = (char: string): string => `sha256:${char.repeat(64)}`;

function validContract(): ThreeJsSceneContract {
  return {
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
      camera: { type: 'PerspectiveCameraRig', params: { fov: 35 } },
      lights: [{ id: 'key', type: 'KeyLight', parameters: { intensity: 1.2 } }],
      materials: [{ bindingId: 'dominant-0', shaderType: 'PBR', uniforms: { roughness: 0.7 } }],
      palette: { dominant: '#2b2b2b', secondary: '#7c7c7c', accent: '#d4af37', contrastRatio: 4.5, temperatureBias: 0.1 },
      composition: {
        focalPoint: { value: [0.5, 0.4], sourcePath: '/composition/focalPoint' },
        negativeSpaceRatio: { value: 0.45, sourcePath: '/composition/negativeSpaceRatio' },
        depthLayerCount: { value: 4, sourcePath: '/composition/depthLayerCount' },
        symmetry: { value: 0.85, sourcePath: '/composition/symmetry' },
      },
      environment: { background: null, fog: {} },
    },
    assets: { geometry: [], textures: [], environmentMaps: [] },
    render: {
      rendererType: 'WebGL2Renderer',
      toneMapping: 'AgXToneMapping',
      colorSpace: 'srgb-linear',
      postprocessing: [],
      resolution: { width: 1920, height: 1080, pixelRatio: 1 },
    },
    timeline: { durationMs: 0, tracks: [] },
    interactions: { events: [], stateMachine: {} },
    ui: { layout: {}, components: [] },
  };
}

describe('ThreeJsSceneContract', () => {
  test('validates a complete contract against the JSON Schema', () => {
    const contract = validContract();
    expect(validateSchema(contract)).toBe(true);
    expect(validateThreeJsSceneContract(contract)).toEqual({ valid: true, errors: [] });
  });

  test('fails closed on missing semantic sections', () => {
    const contract = validContract() as unknown as Record<string, unknown>;
    delete contract.scene;
    const result = validateThreeJsSceneContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_FIELD', path: '/scene' }),
    ]));
  });

  test('fails closed on broken or duplicated hash chain', () => {
    const contract = validContract();
    contract.provenance.hashChain = [hash('a'), hash('a'), hash('c'), hash('d')];
    const result = validateThreeJsSceneContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HASH_CHAIN_BROKEN', path: '/provenance/hashChain' }),
    ]));
  });

  test('rejects invalid render resolution rather than filling defaults', () => {
    const contract = validContract();
    contract.render.resolution.width = 0;
    const result = validateThreeJsSceneContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SCHEMA_INVALID', path: '/render/resolution/width' }),
    ]));
  });

  test('allows explicitly declared provenance.extra metadata', () => {
    const contract = validContract();
    contract.provenance.extra = {
      optionalFieldsOmitted: ['animation', 'interaction', 'ui'],
      sourceIRVersion: '1.0.0',
    };
    expect(validateSchema(contract)).toBe(true);
    expect(validateThreeJsSceneContract(contract).valid).toBe(true);
  });
});
