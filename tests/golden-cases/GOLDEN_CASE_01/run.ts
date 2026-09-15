/**
 * GOLDEN_CASE_01 — 贯通测试运行器
 *
 * 测试目标：东方场景概念图全流程编译 → 5 维评测 → ABI 1.0.0 合规
 *
 * 场景：云海单门 — 满屏云海中央一扇中式木门
 * 验证：空间秩序、虚实关系、色彩体系、材质逻辑、光影哲学的端到端贯通
 *
 * 流程：
 * 1. 构造 RawDesignIR（云海单门场景，高置信度参数）
 * 2. G1 Data Gate 过滤
 * 3. Patch Engine 应用东方美学规则
 * 4. G3 Capability Negotiator 硬件协商
 * 5. Pipeline Runner 端到端编排
 * 6. 5 维评测（composition/color/depth/material/focus）
 * 7. 验证 ABI 1.0.0 合规 + Hash Chain 四元完整
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PipelineRunner, type PipelineOutput } from '../../../compiler-core/pipeline-runner';
import { evaluate } from '../../../evaluation/index';
import type {
  RawDesignIR,
  ValidatedDesignIR,
  FidelityEvaluationResult,
  ParameterUnit,
} from '../../../compiler-core/contracts';
import type { HostCapabilities } from '../../../compiler-core/capability-negotiator';
import type { GoldenCase, RegressionResult } from '../../../governance/regression-runner';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ========== 场景定义 ==========

/**
 * 加载 GOLDEN_CASE_01 定义。
 */
export function loadCase(): GoldenCase {
  const casePath = path.join(__dirname, 'case.json');
  const caseData = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  return caseData as GoldenCase;
}

// ========== 夹具构造 ==========

/**
 * 构造参数辅助函数。
 */
function makeParam<T>(
  value: T,
  unit: ParameterUnit = 'normalized',
  confidence = 0.95,
  evidence: string[] = ['golden-case-01']
): {
  value: T;
  unit: ParameterUnit;
  confidence: number;
  status: 'observed';
  evidence: string[];
  source: 'vision-estimation';
} {
  return { value, unit, confidence, status: 'observed', evidence, source: 'vision-estimation' };
}

/**
 * 构造"云海单门"场景的 RawDesignIR。
 *
 * 参数设计：
 * - 构图：中轴对称，留白 50%，4 层空间，焦点居中
 * - 色彩：月白/黛青/檀木红三色体系，对比度 4.8，色温微暖
 * - 相机：35mm 标准镜头，水平稳定
 * - 材质：乌木（高粗糙度/低金属/有磨损）
 * - 光影：侧逆光，柔和漫反射
 */
export function buildMysticGateRawIR(): RawDesignIR {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    meta: {
      sourceType: 'image',
      aspectRatio: '16:9',
      timestamp: '2026-09-15T12:00:00Z',
    },
    composition: {
      focalPoint: makeParam([0.5, 0.48], 'vector2', 0.95, ['saliency_peak', 'center_door']),
      negativeSpaceRatio: makeParam(0.50, 'ratio', 0.95, ['cloud_void_analysis']),
      depthLayerCount: makeParam(4, 'scalar', 0.90, ['depth_segmentation']),
      symmetry: makeParam(0.88, 'normalized', 0.92, ['bilateral_match', 'axis_door']),
    },
    camera: {
      fov: makeParam(35, 'degrees', 0.90, ['perspective_vanishing_point']),
      shotSize: makeParam('medium-shot', 'scalar', 0.92, ['scale_ratio']),
      angle: makeParam(0, 'degrees', 0.95, ['horizon_level']),
      height: makeParam(1.6, 'scalar', 0.85, ['eye_level_estimate']),
    },
    lighting: {
      keyLight: {
        azimuth: makeParam(135, 'degrees', 0.88, ['shadow_cast', 'side_back_light']),
        elevation: makeParam(25, 'degrees', 0.85, ['shadow_angle']),
        colorTemp: makeParam(5200, 'kelvin', 0.82, ['specular_white_balance']),
        intensity: makeParam(1.1, 'scalar', 0.85, ['luminance_histogram']),
        softness: makeParam(0.78, 'normalized', 0.90, ['edge_softness_analysis']),
      },
      ambientRatio: makeParam(0.30, 'ratio', 0.85, ['ambient_luminance']),
      rimLightPresent: makeParam(true, 'scalar', 0.92, ['silhouette_highlight', 'door_rim']),
    },
    materials: [
      {
        role: 'dominant',
        baseType: makeParam('ebony-wood', 'scalar', 0.92, ['texture_classifier', 'wood_grain']),
        roughness: makeParam(0.72, 'normalized', 0.88, ['specular_spread']),
        metalness: makeParam(0.08, 'normalized', 0.90, ['reflectance_ratio']),
        wear: makeParam(0.45, 'normalized', 0.85, ['edge_chipping', 'patina']),
      },
      {
        role: 'ground',
        baseType: makeParam('bluestone', 'scalar', 0.88, ['texture_classifier']),
        roughness: makeParam(0.80, 'normalized', 0.85, ['specular_spread']),
        metalness: makeParam(0.02, 'normalized', 0.90, ['reflectance_ratio']),
        wear: makeParam(0.60, 'normalized', 0.82, ['weathering']),
      },
    ],
    color: {
      dominant: makeParam('#e8e4df', 'hex', 0.95, ['palette_clustering', 'moon_white']),
      secondary: makeParam('#4a5568', 'hex', 0.92, ['palette_clustering', 'dai_qing']),
      accent: makeParam('#8b4513', 'hex', 0.90, ['palette_clustering', 'sandalwood_red']),
      contrastRatio: makeParam(4.8, 'ratio', 0.90, ['wcag_formula']),
      temperatureBias: makeParam(0.08, 'normalized', 0.85, ['color_temperature_histogram']),
    },
    provenance: {
      extractorVersion: '1.0.0',
      inferenceExecutionMs: 150,
      rawIntegrityStatus: 'READY',
      hashManifest: {
        algorithm: 'SHA-256',
        canonicalization: 'RFC8785',
      },
      inputHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      rawIRHash: 'sha256:placeholder-will-be-recomputed-by-g1',
    },
  };
}

/**
 * 构造满血 HostCapabilities（TIER_A / WebGL2）。
 */
export function buildFullHostCapabilities(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
    maxFragmentUniformVectors: 1024,
  };
}

// ========== 配置加载 ==========

/**
 * 加载 Pipeline Runner 依赖配置。
 */
function loadPipelineDependencies() {
  const g1Policy = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config/g1-policy.json'), 'utf8')
  );
  const grammar = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config/grammar-rules.json'), 'utf8')
  );
  const tierConfig = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config/tier-mapping.json'), 'utf8')
  );
  return { g1Policy, grammar, tierConfig };
}

// ========== 主执行函数 ==========

export interface GoldenCaseExecutionResult {
  pipelineOutput: PipelineOutput;
  evaluation?: FidelityEvaluationResult;
  validatedIR?: ValidatedDesignIR;
  durationMs: number;
}

/**
 * 执行 GOLDEN_CASE_01 贯通测试。
 *
 * @returns RegressionResult 包含通过状态、分数、违规列表
 */
export async function run(): Promise<RegressionResult> {
  const startTime = Date.now();
  const caseData = loadCase();

  // 1. 构造输入
  const rawIR = buildMysticGateRawIR();
  const hostCaps = buildFullHostCapabilities();
  const deps = loadPipelineDependencies();

  // 2. 执行 Pipeline Runner（G1 → Patch → G3 → 编排）
  const runner = new PipelineRunner(deps);
  const pipelineOutput = runner.execute(rawIR, hostCaps, 'GOLDEN_CASE_01');

  // 3. 检查 Pipeline 输出
  if (pipelineOutput.status === 'TERMINAL_HALT') {
    const durationMs = Date.now() - startTime;
    return {
      caseId: caseData.caseId,
      caseName: caseData.name,
      baselineScore: 0,
      proposalScore: 0,
      scoreDelta: 0,
      passed: false,
      regressed: false,
      newViolations: [`Pipeline halted at ${pipelineOutput.haltStage}`],
      resolvedViolations: [],
      durationMs,
    };
  }

  // 4. 执行 5 维评测
  const evaluation = evaluate(
    pipelineOutput.validatedIR,
    {
      inputHash: pipelineOutput.hashChain.inputHash,
      rawIRHash: pipelineOutput.hashChain.rawIRHash,
      validatedIRHash: pipelineOutput.hashChain.validatedIRHash,
      executionPlanHash: pipelineOutput.hashChain.executionPlanHash,
    },
    {
      distillationExecutionMs: pipelineOutput.timing.distillationExecutionMs,
      grammarExecutionMs: pipelineOutput.timing.grammarExecutionMs,
      adapterExecutionMs: pipelineOutput.timing.adapterExecutionMs,
    },
    'GOLDEN_CASE_01',
    'TIER_A'
  );

  // 5. 收集违规项
  const newViolations: string[] = [];
  const resolvedViolations: string[] = [];

  for (const [gateName, gate] of Object.entries(evaluation.gates ?? {}) as Array<[string, { metricRef: string; passed: boolean }]>) {
    if (!gate.passed) {
      newViolations.push(`${gateName}: ${gate.metricRef} failed`);
    } else {
      resolvedViolations.push(`${gateName}: ${gate.metricRef} passed`);
    }
  }

  // 6. 计算总分（5维加权平均）
  const metrics = evaluation.metrics!;
  const overallScore =
    (metrics.composition.score * 0.25 +
      metrics.color.composite.score * 0.25 +
      metrics.depth.score * 0.20 +
      metrics.material.score * 0.15 +
      metrics.focalPointDisplacement.score * 0.15) *
    100;

  const durationMs = Date.now() - startTime;
  const passed = evaluation.status === 'PASS';

  return {
    caseId: caseData.caseId,
    caseName: caseData.name,
    baselineScore: caseData.expectedOutput.minScore,
    proposalScore: Number(overallScore.toFixed(2)),
    scoreDelta: Number((overallScore - caseData.expectedOutput.minScore).toFixed(2)),
    passed,
    regressed: false,
    newViolations,
    resolvedViolations,
    durationMs,
  };
}

/**
 * 执行完整测试并返回详细结果（用于 Jest 测试）。
 */
export async function runDetailed(): Promise<GoldenCaseExecutionResult & { regression: RegressionResult }> {
  const startTime = Date.now();
  const rawIR = buildMysticGateRawIR();
  const hostCaps = buildFullHostCapabilities();
  const deps = loadPipelineDependencies();

  const runner = new PipelineRunner(deps);
  const pipelineOutput = runner.execute(rawIR, hostCaps, 'GOLDEN_CASE_01');

  let evaluation: FidelityEvaluationResult | undefined;
  let validatedIR: ValidatedDesignIR | undefined;

  if (pipelineOutput.status === 'SUCCESS') {
    validatedIR = pipelineOutput.validatedIR;
    evaluation = evaluate(
      pipelineOutput.validatedIR,
      {
        inputHash: pipelineOutput.hashChain.inputHash,
        rawIRHash: pipelineOutput.hashChain.rawIRHash,
        validatedIRHash: pipelineOutput.hashChain.validatedIRHash,
        executionPlanHash: pipelineOutput.hashChain.executionPlanHash,
      },
      {
        distillationExecutionMs: pipelineOutput.timing.distillationExecutionMs,
        grammarExecutionMs: pipelineOutput.timing.grammarExecutionMs,
        adapterExecutionMs: pipelineOutput.timing.adapterExecutionMs,
      },
      'GOLDEN_CASE_01',
      'TIER_A'
    );
  }

  const regression = await run();

  return {
    pipelineOutput,
    evaluation,
    validatedIR,
    durationMs: Date.now() - startTime,
    regression,
  };
}
