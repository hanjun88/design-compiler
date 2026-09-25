import {
  buildStandardPipeline,
  createStep,
  planExecution,
  topologicalSort,
  validateStepDependencies,
} from '../../compiler-core/execution-planner';
import type { AppliedPatch, CompileContext, RuntimeCapability } from '../../compiler-core/types';

const capability: RuntimeCapability = {
  runtime: 'WebGL2Renderer',
  runtimeVersion: '1.0.0',
  webgl2: {
    supported: true,
    maxTextureSize: 4096,
    maxRenderBufferSize: 4096,
    maxVertexAttribs: 16,
    maxVertexUniformVectors: 256,
    maxFragmentUniformVectors: 256,
    maxVaryingVectors: 15,
    maxTextureImageUnits: 16,
    extensions: [],
  },
  capabilities: { floatTextures: true },
  fallbacks: [],
};

const context: CompileContext = {
  compileId: 'compile-test',
  status: 'PENDING',
  versionFingerprint: {
    compilerVersion: '1.0.0',
    distillerVersion: '1.0.0',
    grammarVersion: '1.0.0',
    adapterVersion: '1.0.0',
  },
  provenance: {
    inputHash: 'sha256:input',
    rawIrHash: 'sha256:raw',
    validatedIrHash: 'sha256:validated',
    executionPlanHash: 'sha256:plan',
    chain: [],
  },
  startTime: '2026-09-25T00:00:00.000Z',
  errors: [],
  warnings: [],
};

const patch: AppliedPatch = {
  patchId: 'patch-1',
  rfc6902: [{ op: 'replace', path: '/color/dominant', value: '#2b2b2b' }],
  trigger: {
    paramId: '/color/dominant',
    rangeLevel: 'warning',
    actualValue: 0,
    targetValue: 1,
  },
  dampingFactor: 0.7,
  appliedAt: '2026-09-25T00:00:00.000Z',
  appliedBy: 'test',
};

 describe('Execution Planner', () => {
  test('builds a complete deterministic plan with a non-empty hash', () => {
    const first = planExecution(context, capability, [patch]);
    const second = planExecution(context, capability, [patch]);

    expect(first.steps).toHaveLength(8);
    expect(first.steps.map((step) => step.type)).toEqual([
      'setup-context', 'load-assets', 'compile-shaders', 'apply-patches',
      'render-frame', 'post-process', 'composite', 'output',
    ]);
    expect(first.steps.find((step) => step.type === 'apply-patches')?.patches).toHaveLength(1);
    expect(first.planHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first).toEqual(second);
    expect(first.estimatedTotalDurationMs).toBeGreaterThan(0);
  });

  test('includes a sorted, validated asset manifest in the plan hash', () => {
    const asset = {
      assetId: 'wood-texture',
      type: 'texture',
      url: 'file:///assets/wood.png',
      hash: `sha256:${'a'.repeat(64)}`,
      loadingStrategy: 'lazy' as const,
    };
    const plan = planExecution(context, capability, [patch], { assets: [asset] });
    const loadStep = plan.steps.find((step) => step.type === 'load-assets');
    expect(plan.assetManifest).toEqual([asset]);
    expect(loadStep?.config).toMatchObject({ assetCount: 1, assetIds: ['wood-texture'] });
    expect(() => planExecution(context, capability, [], { assets: [asset, asset] })).toThrow(/Duplicate/);
  });

  test('rejects invalid dimensions before creating a plan', () => {
    expect(() => planExecution(context, capability, [], { targetWidth: 0 })).toThrow(RangeError);
    expect(() => planExecution(context, capability, [], { pixelRatio: Number.NaN })).toThrow(RangeError);
  });

  test('detects missing dependencies and cycles', () => {
    const a = createStep('setup-context', 0, {}, ['step-output-7']);
    const b = createStep('output', 7, {}, ['step-setup-context-0']);
    const validation = validateStepDependencies([a, b]);

    expect(validation.valid).toBe(false);
    expect(validation.cycles.length).toBeGreaterThan(0);
    expect(() => topologicalSort([a, b])).toThrow();
  });

  test('standard pipeline has explicit serial dependencies', () => {
    const steps = buildStandardPipeline({});
    expect(validateStepDependencies(steps)).toEqual({ valid: true, cycles: [] });
    expect(steps[0].dependsOn).toEqual([]);
    expect(steps[1].dependsOn).toEqual(['step-setup-context-0']);
    expect(steps[7].dependsOn).toEqual(['step-composite-6']);
  });
});
