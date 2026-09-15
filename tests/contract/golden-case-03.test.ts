/**
 * GOLDEN_CASE_03 — 真实抖音视频资产端到端贯通测试
 *
 * 验证：风铃Muse 中式巨构教程视频 → 物理提取 → Cangjie IR → Step 6-B降维 →
 *       Core Compiler全链路 → Software Render → 5维评测 → ABI 1.0.0合规
 *
 * 测试矩阵：
 * - TC-GC-01: 物理资产门禁通过
 * - TC-GC-02: Step 6-B 降维编译通过
 * - TC-GC-03: Pipeline 全链路成功（SUCCESS 状态）
 * - TC-GC-04: 5 维评测全部通过（status=PASS）
 * - TC-GC-05: Hash Chain 五元完整（含 renderHash）
 * - TC-GC-06: EvaluationResult ABI 1.0.0 schema 合规
 * - TC-GC-07: ValidatedDesignIR schema 合规
 * - TC-GC-08: ExecutionPlan schema 合规
 * - TC-GC-09: RegressionResult 通过基线（score >= 60）
 * - TC-GC-10: Evaluation versions/timing 完整
 */

import * as fs from "fs";
import * as path from "path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { runDetailed } from "../golden-cases/GOLDEN_CASE_03/run";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const evalSchemaPath = path.join(__dirname, "../../schemas/evaluation-result.schema.json");
const valSchemaPath = path.join(__dirname, "../../schemas/validated-design-ir.schema.json");
const execSchemaPath = path.join(__dirname, "../../schemas/execution-plan.schema.json");
const estSchemaPath = path.join(__dirname, "../../schemas/estimated-parameter.schema.json");

ajv.addSchema(JSON.parse(fs.readFileSync(estSchemaPath, "utf8")), "estimated-parameter.schema.json");
const validateEval = ajv.compile(JSON.parse(fs.readFileSync(evalSchemaPath, "utf8")));
const validateVal = ajv.compile(JSON.parse(fs.readFileSync(valSchemaPath, "utf8")));
const validateExec = ajv.compile(JSON.parse(fs.readFileSync(execSchemaPath, "utf8")));

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

describe("GOLDEN_CASE_03 — 万重宫阙藏云海（真实抖音视频资产）端到端贯通", () => {
  let result: Awaited<ReturnType<typeof runDetailed>>;

  beforeAll(async () => {
    result = await runDetailed();
  });

  // TC-GC-01: 物理资产门禁通过
  test("TC-GC-01: 物理资产门禁通过，视频元数据合法", () => {
    expect(result.assetGate.passed).toBe(true);
    expect(result.assetGate.blockers).toEqual([]);
    expect(result.assetGate.duration).toBeGreaterThan(0);
    expect(result.assetGate.width).toBe(1920);
    expect(result.assetGate.height).toBe(1080);
    expect(result.assetGate.keyframeCount).toBeGreaterThanOrEqual(3);
    expect(result.assetGate.opticalFlowPairs).toBeGreaterThanOrEqual(10);
  });

  // TC-GC-02: Step 6-B 降维编译通过
  test("TC-GC-02: Step 6-B Intent Normalization 通过，参数映射完整", () => {
    expect(result.normalizationResult).toBeDefined();
    expect(result.normalizationResult!.status).toBe("PASS");
    expect(result.normalizationResult!.mappedParameters).toBeGreaterThanOrEqual(20);
    expect(result.normalizationResult!.unmappedParameters).toEqual([]);
  });

  // TC-GC-03: Pipeline 全链路成功
  test("TC-GC-03: Pipeline Runner 全链路成功，状态为 SUCCESS", () => {
    expect(result.pipelineOutput).toBeDefined();
    expect(result.pipelineOutput!.status).toBe("SUCCESS");
    if (result.pipelineOutput!.status === "SUCCESS") {
      expect(result.pipelineOutput!.validatedIR).toBeDefined();
      expect(result.pipelineOutput!.executionPlan).toBeDefined();
      expect(result.pipelineOutput!.hashChain).toBeDefined();
      expect(result.pipelineOutput!.timing).toBeDefined();
    }
  });

  // TC-GC-04: 5 维评测全部通过
  test("TC-GC-04: 5 维评测全部通过，status=PASS", () => {
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation!.status).toBe("PASS");
    expect(result.evaluation!.tierExecuted).toBe("TIER_A");
    expect(result.evaluation!.metrics).toBeDefined();
    expect(result.evaluation!.gates).toBeDefined();

    const metrics = result.evaluation!.metrics!;
    expect(metrics.composition).toBeDefined();
    expect(metrics.color).toBeDefined();
    expect(metrics.depth).toBeDefined();
    expect(metrics.material).toBeDefined();
    expect(metrics.focalPointDisplacement).toBeDefined();

    const gates = result.evaluation!.gates!;
    expect(gates.composition.passed).toBe(true);
    expect(gates.color.passed).toBe(true);
    expect(gates.depth.passed).toBe(true);
    expect(gates.material.passed).toBe(true);
    expect(gates.focalDisplacement.passed).toBe(true);
  });

  // TC-GC-05: Hash Chain 五元完整
  test("TC-GC-05: Hash Chain 五元完整（input/raw/validated/execution/render），均为合法 SHA-256", () => {
    expect(result.pipelineOutput).toBeDefined();
    expect(result.pipelineOutput!.status).toBe("SUCCESS");
    if (result.pipelineOutput!.status !== "SUCCESS") return;
    const hc = result.pipelineOutput!.hashChain;
    expect(hc.inputHash).toMatch(SHA256_PATTERN);
    expect(hc.rawIRHash).toMatch(SHA256_PATTERN);
    expect(hc.validatedIRHash).toMatch(SHA256_PATTERN);
    expect(hc.executionPlanHash).toMatch(SHA256_PATTERN);
    expect(result.renderResult).toBeDefined();
    expect(result.renderResult!.renderHash).toMatch(SHA256_PATTERN);
    expect(result.renderResult!.pixelBuffer).toBeDefined();
    expect(result.renderResult!.pixelBuffer.length).toBeGreaterThan(0);
  });

  // TC-GC-06: EvaluationResult schema 合规
  test("TC-GC-06: EvaluationResult 100% 通过 ABI 1.0.0 Schema 校验", () => {
    expect(result.evaluation).toBeDefined();
    const isValid = validateEval(result.evaluation);
    if (!isValid) {
      console.error("Evaluation schema errors:", validateEval.errors);
    }
    expect(isValid).toBe(true);
  });

  // TC-GC-07: ValidatedDesignIR schema 合规
  test("TC-GC-07: ValidatedDesignIR 100% 通过 Schema 校验", () => {
    expect(result.validatedIR).toBeDefined();
    const isValid = validateVal(result.validatedIR);
    if (!isValid) {
      console.error("ValidatedIR schema errors:", validateVal.errors);
    }
    expect(isValid).toBe(true);
  });

  // TC-GC-08: ExecutionPlan schema 合规
  test("TC-GC-08: RuntimeExecutionPlan 100% 通过 Schema 校验", () => {
    expect(result.pipelineOutput).toBeDefined();
    expect(result.pipelineOutput!.status).toBe("SUCCESS");
    if (result.pipelineOutput!.status !== "SUCCESS") return;
    const isValid = validateExec(result.pipelineOutput!.executionPlan);
    if (!isValid) {
      console.error("ExecutionPlan schema errors:", validateExec.errors);
    }
    expect(isValid).toBe(true);
  });

  // TC-GC-09: RegressionResult 通过基线
  test("TC-GC-09: RegressionResult passed=true，proposalScore >= baselineScore(60)", () => {
    expect(result.regression).toBeDefined();
    expect(result.regression.passed).toBe(true);
    expect(result.regression.proposalScore).toBeGreaterThanOrEqual(result.regression.baselineScore);
    expect(result.regression.caseId).toBe("GOLDEN_CASE_03");
  });

  // TC-GC-10: Evaluation versions/timing 完整
  test("TC-GC-10: Evaluation versions 五项全部非空，timing 包含 distillationExecutionMs", () => {
    expect(result.evaluation).toBeDefined();
    const versions = result.evaluation!.versions;
    expect(versions.compiler).toBeTruthy();
    expect(versions.distiller).toBeTruthy();
    expect(versions.grammar).toBeTruthy();
    expect(versions.adapter).toBeTruthy();
    expect(versions.evaluator).toBeTruthy();

    const timing = result.evaluation!.provenance.timing;
    expect(timing.distillationExecutionMs).toBeDefined();
    expect(typeof timing.distillationExecutionMs).toBe("number");
  });
});
