/**
 * Regression Runner — Golden Cases 沙箱回归测试执行器。
 * 真实执行由调用方注入 executor；没有 executor 时明确失败，不伪造通过。
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GoldenCase {
  caseId: string;
  name: string;
  description: string;
  category: string;
  input: Record<string, unknown>;
  expectedOutput: {
    minScore: number;
    requiredChecks: string[];
    forbiddenViolations: string[];
  };
  versionFingerprint: {
    compilerVersion: string;
    distillerVersion: string;
    grammarVersion: string;
    adapterVersion: string;
  };
}

export interface GoldenCaseExecution {
  score: number;
  violations: string[];
  durationMs: number;
  checks?: Record<string, boolean>;
}

export type GoldenCaseExecutor = (
  testCase: GoldenCase,
  grammarVersion: string,
) => Promise<GoldenCaseExecution>;

export interface RegressionResult {
  caseId: string;
  caseName: string;
  baselineScore: number;
  proposalScore: number;
  scoreDelta: number;
  passed: boolean;
  regressed: boolean;
  newViolations: string[];
  resolvedViolations: string[];
  durationMs: number;
}

export interface RegressionReport {
  reportId: string;
  createdAt: string;
  baselineGrammarVersion: string;
  proposalGrammarVersion: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  regressedCases: number;
  regressionRate: number;
  averageScoreDelta: number;
  results: RegressionResult[];
  summary: string;
}

function isGoldenCase(value: unknown): value is GoldenCase {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const expected = item.expectedOutput as Record<string, unknown> | undefined;
  return typeof item.caseId === 'string' && typeof item.name === 'string' &&
    typeof item.description === 'string' && typeof item.category === 'string' &&
    typeof item.input === 'object' && item.input !== null && !!expected &&
    typeof expected.minScore === 'number' && Array.isArray(expected.requiredChecks) &&
    Array.isArray(expected.forbiddenViolations) && typeof item.versionFingerprint === 'object';
}

function jsonFiles(root: string): string[] {
  const stat = fs.statSync(root);
  if (stat.isFile()) return root.toLowerCase().endsWith('.json') ? [root] : [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(root, entry.name);
    return entry.isDirectory() ? jsonFiles(child) : child.toLowerCase().endsWith('.json') ? [child] : [];
  });
}

export function loadGoldenCases(casesPath: string): GoldenCase[] {
  const files = jsonFiles(casesPath);
  const cases: GoldenCase[] = [];
  for (const file of files.sort()) {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (isGoldenCase(parsed)) cases.push(parsed);
  }
  return cases;
}

export async function runGoldenCase(
  testCase: GoldenCase,
  grammarVersion: string,
  executor?: GoldenCaseExecutor,
): Promise<GoldenCaseExecution> {
  if (!executor) {
    return { score: 0, violations: ['EXECUTOR_NOT_CONFIGURED'], durationMs: 0 };
  }
  const result = await executor(testCase, grammarVersion);
  if (!Number.isFinite(result.score) || !Array.isArray(result.violations)) {
    throw new TypeError(`Golden Case executor returned an invalid result for ${testCase.caseId}`);
  }
  return {
    score: result.score,
    violations: [...new Set(result.violations)],
    durationMs: Number.isFinite(result.durationMs) && result.durationMs >= 0 ? result.durationMs : 0,
    ...(result.checks ? { checks: { ...result.checks } } : {}),
  };
}

export async function runFullRegression(
  goldenCasesPath: string,
  baselineVersion: string,
  proposalVersion: string,
  executor?: GoldenCaseExecutor,
): Promise<RegressionReport> {
  const cases = loadGoldenCases(goldenCasesPath);
  const results: RegressionResult[] = [];
  for (const testCase of cases) {
    const [baseline, proposal] = await Promise.all([
      runGoldenCase(testCase, baselineVersion, executor),
      runGoldenCase(testCase, proposalVersion, executor),
    ]);
    const baselineViolations = new Set(baseline.violations);
    const proposalViolations = new Set(proposal.violations);
    const newViolations = [...proposalViolations].filter((item) => !baselineViolations.has(item));
    const resolvedViolations = [...baselineViolations].filter((item) => !proposalViolations.has(item));
    const requiredChecksPassed = testCase.expectedOutput.requiredChecks.every((check) => proposal.checks?.[check] === true);
    const forbiddenAbsent = testCase.expectedOutput.forbiddenViolations.every((item) => !proposalViolations.has(item));
    const passed = proposal.score >= testCase.expectedOutput.minScore && requiredChecksPassed && forbiddenAbsent && !proposalViolations.has('EXECUTOR_NOT_CONFIGURED');
    const scoreDelta = proposal.score - baseline.score;
    results.push({
      caseId: testCase.caseId,
      caseName: testCase.name,
      baselineScore: baseline.score,
      proposalScore: proposal.score,
      scoreDelta,
      passed,
      regressed: scoreDelta < 0 || newViolations.length > 0 || !passed,
      newViolations,
      resolvedViolations,
      durationMs: baseline.durationMs + proposal.durationMs,
    });
  }
  const passedCases = results.filter((result) => result.passed).length;
  const regressedCases = results.filter((result) => result.regressed).length;
  const regressionRate = calculateRegressionRate(results);
  const averageScoreDelta = results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.scoreDelta, 0) / results.length;
  const createdAt = new Date().toISOString();
  return {
    reportId: `regression-${createdAt}`,
    createdAt,
    baselineGrammarVersion: baselineVersion,
    proposalGrammarVersion: proposalVersion,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    regressedCases,
    regressionRate,
    averageScoreDelta,
    results,
    summary: results.length === 0 ? 'NO_GOLDEN_CASES' : `${passedCases}/${results.length} cases passed; ${regressedCases} regressed`,
  };
}

export function calculateRegressionRate(results: RegressionResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((result) => result.regressed).length / results.length;
}
