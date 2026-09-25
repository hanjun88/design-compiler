import * as path from 'path';
import { runMetaGate, checkCalibration, checkConfidence, checkSourceGrounding } from '../../toolchain/cangjie/meta-gate';
import {
  loadGoldenCases,
  runFullRegression,
  runGoldenCase,
} from '../../governance/regression-runner';
import {
  generateProposal,
  runPromotionGate,
  runShadowSimulation,
} from '../../evaluation/feedback-engine';
import type { FidelityEvaluationResult } from '../../compiler-core/contracts';

const goldenPath = path.join(__dirname, '../golden-cases');

function parameter(overrides: Record<string, unknown> = {}) {
  return {
    paramId: 'void-ratio',
    path: '/composition/negativeSpaceRatio',
    value: 0.5,
    confidence: 0.9,
    source: { type: 'literature', ref: '画筌/虚实相生' },
    calibration: { method: 'expert-calibrated', status: 'PRODUCTION' },
    ...overrides,
  };
}

describe('Meta Gate', () => {
  test('passes grounded, confident, calibrated production parameters', () => {
    const result = runMetaGate([parameter()]);
    expect(result.overallStatus).toBe('PASS');
    expect(result.sourceGrounding.passed).toBe(true);
    expect(result.confidenceRating.passed).toBe(true);
    expect(result.calibrationProof.productionCount).toBe(1);
    expect(result.rejectedParameters).toHaveLength(0);
  });

  test('blocks an empty parameter set instead of vacuously passing', () => {
    const result = runMetaGate([]);
    expect(result.overallStatus).toBe('BLOCKED');
    expect(result.sourceGrounding.passed).toBe(false);
    expect(result.confidenceRating.passed).toBe(false);
  });

  test('blocks uncalibrated and low-confidence parameters', () => {
    const result = runMetaGate([
      parameter({ paramId: 'low-confidence', confidence: 0.5 }),
      parameter({
        paramId: 'experimental',
        calibration: { method: 'uncalibrated', status: 'EXPERIMENTAL' },
      }),
    ]);
    expect(result.overallStatus).toBe('FAIL');
    expect(result.rejectedParameters.map((item) => item.paramId)).toEqual(
      expect.arrayContaining(['low-confidence', 'experimental']),
    );
    expect(checkSourceGrounding({ source: 'legacy-string' })).toBe(false);
    expect(checkConfidence(parameter(), 0.85)).toBe(true);
    expect(checkCalibration(parameter({ calibration: { method: 'uncalibrated', status: 'EXPERIMENTAL' } }))).toBe('EXPERIMENTAL');
  });

  test('allows experimental parameters only as explicit warnings', () => {
    const result = runMetaGate([
      parameter({ calibration: { method: 'uncalibrated', status: 'EXPERIMENTAL' } }),
    ], { allowExperimental: true });
    expect(result.overallStatus).toBe('PASS_WITH_WARNINGS');
    expect(result.calibrationProof.blockedParams).toHaveLength(0);

    const deprecated = runMetaGate([
      parameter({ calibration: { method: 'uncalibrated', status: 'DEPRECATED' } }),
    ], { allowExperimental: true });
    expect(deprecated.overallStatus).toBe('FAIL');
    expect(deprecated.calibrationProof.blockedParams).toEqual(['void-ratio']);
  });
});

describe('Golden Case regression', () => {
  test('loads real case files and fails closed without an executor', async () => {
    const cases = loadGoldenCases(goldenPath);
    expect(cases.length).toBeGreaterThan(0);
    const noExecutor = await runGoldenCase(cases[0], 'proposal');
    expect(noExecutor.violations).toContain('EXECUTOR_NOT_CONFIGURED');

    const report = await runFullRegression(goldenPath, 'baseline', 'proposal');
    expect(report.totalCases).toBe(cases.length);
    expect(report.passedCases).toBe(0);
    expect(report.failedCases).toBe(cases.length);
  });

  test('rejects malformed executor results', async () => {
    const cases = loadGoldenCases(goldenPath);
    await expect(runGoldenCase(cases[0], 'proposal', async () => ({
      score: Number.NaN,
      violations: [],
      durationMs: 0,
    }))).rejects.toThrow(/invalid result/);
  });

  test('evaluates required checks, forbidden violations, and regression deltas', async () => {
    const report = await runFullRegression(goldenPath, 'baseline', 'proposal', async (testCase, version) => ({
      score: version === 'baseline' ? 60 : 80,
      violations: [],
      durationMs: 1,
      checks: Object.fromEntries(testCase.expectedOutput.requiredChecks.map((check) => [check, true])),
    }));
    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.passedCases).toBe(report.totalCases);
    expect(report.regressedCases).toBe(0);
    expect(report.regressionRate).toBe(0);
  });
});

describe('Feedback promotion gate', () => {
  const evaluation: FidelityEvaluationResult = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    testCaseId: 'failure-1',
    executedAt: '2026-09-25T00:00:00.000Z',
    status: 'FAIL',
    tierExecuted: 'TIER_A',
    versions: { compiler: '1.0.0', distiller: '1.0.0', grammar: '1.0.0', adapter: '1.0.0', evaluator: '1.0.0' },
    diagnostics: ['Gate failed: composition'],
    provenance: {
      hashManifest: { algorithm: 'SHA-256', canonicalization: 'RFC8785' },
      hashChain: { inputHash: 'sha256:input' },
      timing: { distillationExecutionMs: 1 },
    },
  };

  test('does not pass promotion before a complete shadow simulation', async () => {
    const proposal = generateProposal(evaluation);
    const pending = runPromotionGate(proposal);
    expect(pending.passed).toBe(false);

    const forged = {
      ...proposal,
      shadowSimulation: { ...proposal.shadowSimulation, status: 'PASS' as const, goldenCasesRun: 1, goldenCasesPassed: 1 },
    };
    expect(runPromotionGate(forged).passed).toBe(false);

    const simulated = await runShadowSimulation(proposal, goldenPath, async (testCase) => ({
      score: 80,
      violations: [],
      durationMs: 1,
      checks: Object.fromEntries(testCase.expectedOutput.requiredChecks.map((check) => [check, true])),
    }), 'baseline');
    expect(simulated.shadowSimulation.status).toBe('PASS');
    expect(runPromotionGate(simulated).passed).toBe(true);
  });
});
