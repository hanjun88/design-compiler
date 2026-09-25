import * as fs from 'fs';
import * as path from 'path';
import { DesignCompiler } from '../../compiler-core';
import type { GrammarRulePack } from '../../compiler-core/patch-engine';
import type { HostCapabilities } from '../../compiler-core/capability-negotiator';
import type { ParameterUnit, RawDesignIR, RenderTarget } from '../../compiler-core/contracts';
import type { TierMappingConfig } from '../../compiler-core/tier-mapping-types';

const root = path.join(__dirname, '../..');
const pipeline = {
  g1Policy: JSON.parse(fs.readFileSync(path.join(root, 'config/g1-policy.json'), 'utf8')),
  grammar: { packName: 'test-grammar', version: '1.0.0', description: 'compiler entry test', rules: [] } as GrammarRulePack,
  tierConfig: JSON.parse(fs.readFileSync(path.join(root, 'config/tier-mapping.json'), 'utf8')) as TierMappingConfig,
};
const versionFingerprint = {
  compilerVersion: '1.0.0',
  distillerVersion: '1.0.0',
  grammarVersion: '1.0.0',
  adapterVersion: '1.0.0',
};
const renderTarget: RenderTarget = { width: 1920, height: 1080, pixelRatio: 1 };
const capabilities: HostCapabilities = {
  webgl2: true,
  floatTextures: true,
  highPrecisionFragment: true,
  anisotropyExtension: true,
};

function param<T>(value: T, unit: ParameterUnit = 'normalized', confidence = 0.95) {
  return {
    value,
    unit,
    confidence,
    status: 'observed' as const,
    evidence: ['compiler-entry-test'],
    source: 'vision-estimation' as const,
  };
}

function rawIR(focalConfidence = 0.95): RawDesignIR {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    meta: { sourceType: 'image', aspectRatio: '16:9', timestamp: '2026-09-25T00:00:00Z' },
    composition: {
      focalPoint: param([0.5, 0.4], 'vector2', focalConfidence),
      negativeSpaceRatio: param(0.45, 'ratio'),
      depthLayerCount: param(4, 'scalar'),
      symmetry: param(0.85),
    },
    camera: {
      fov: param(35, 'degrees'),
      shotSize: param('long-shot'),
      angle: param(0, 'degrees'),
      height: param(1.6),
    },
    lighting: {
      keyLight: {
        azimuth: param(45, 'degrees'),
        elevation: param(30, 'degrees'),
        colorTemp: param(5500, 'kelvin'),
        intensity: param(1.2),
        softness: param(0.75),
      },
      ambientRatio: param(0.25, 'ratio'),
      rimLightPresent: param(true),
    },
    materials: [{ role: 'dominant', baseType: param('stone'), roughness: param(0.7), metalness: param(0.1), wear: param(0.4) }],
    color: {
      dominant: param('#2b2b2b', 'hex'),
      secondary: param('#7c7c7c', 'hex'),
      accent: param('#d4af37', 'hex'),
      contrastRatio: param(4.5, 'ratio'),
      temperatureBias: param(0.1),
    },
    provenance: {
      extractorVersion: '1.0.0',
      inferenceExecutionMs: 10,
      rawIntegrityStatus: 'READY',
      hashManifest: { algorithm: 'SHA-256', canonicalization: 'RFC8785' },
      inputHash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      rawIRHash: 'sha256:placeholder',
    },
  };
}

describe('DesignCompiler public entry', () => {
  test('returns COMPLETE with a real execution plan and four non-empty compile hashes', async () => {
    const compiler = new DesignCompiler(versionFingerprint, {
      pipeline,
      hostCapabilities: capabilities,
      renderTarget,
      testCaseId: 'TC-DC-01',
    });
    const result = await compiler.compile(rawIR());

    expect(result.success).toBe(true);
    expect(result.context.status).toBe('COMPLETE');
    expect(result.executionPlan).toBeDefined();
    expect(result.context.provenance.inputHash).toMatch(/^sha256:/);
    expect(result.context.provenance.rawIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.context.provenance.validatedIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.context.provenance.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.context.provenance.renderHash).toBeUndefined();
    expect(result.context.provenance.chain.map((entry) => entry.stage)).toEqual([
      'INPUT', 'G1_RAW_IR', 'G2_VALIDATED_IR', 'G3_EXECUTION_PLAN',
    ]);
  });

  test('returns BLOCKED_DATA for a low-confidence required parameter', async () => {
    const compiler = new DesignCompiler(versionFingerprint, {
      pipeline,
      hostCapabilities: capabilities,
      renderTarget,
      testCaseId: 'TC-DC-02',
    });
    const result = await compiler.compile(rawIR(0.52));

    expect(result.success).toBe(false);
    expect(result.context.status).toBe('BLOCKED_DATA');
    expect(result.context.errors[0].code).toBe('DATA_GATE_BLOCKED');
    expect(result.executionPlan).toBeUndefined();
  });

  test('returns BLOCKED_ENV when a required runtime capability is absent', async () => {
    const compiler = new DesignCompiler(versionFingerprint, {
      pipeline,
      hostCapabilities: { ...capabilities, webgl2: false },
      renderTarget,
      testCaseId: 'TC-DC-03',
    });
    const result = await compiler.compile(rawIR());

    expect(result.success).toBe(false);
    expect(result.context.status).toBe('BLOCKED_ENV');
    expect(result.context.errors[0].code).toBe('CAPABILITY_UNAVAILABLE');
    expect(result.executionPlan).toBeUndefined();
  });

  test('rejects malformed input and unconfigured compiler instances without throwing', async () => {
    const malformed = await new DesignCompiler(versionFingerprint, {
      pipeline,
      hostCapabilities: capabilities,
      renderTarget,
    }).compile({ provenance: {} });
    expect(malformed.success).toBe(false);
    expect(malformed.context.status).toBe('FAILED');
    expect(malformed.context.errors[0].code).toBe('SCHEMA_INVALID');

    const unconfigured = await new DesignCompiler(versionFingerprint).compile(rawIR());
    expect(unconfigured.success).toBe(false);
    expect(unconfigured.context.status).toBe('FAILED');
    expect(unconfigured.context.errors[0].code).toBe('SCHEMA_INVALID');

    const missingSections = await new DesignCompiler(versionFingerprint, {
      pipeline,
      hostCapabilities: capabilities,
      renderTarget,
    }).compile({ ...rawIR(), materials: undefined });
    expect(missingSections.success).toBe(false);
    expect(missingSections.context.status).toBe('FAILED');
    expect(missingSections.context.errors[0].code).toBe('SCHEMA_INVALID');
  });
});
