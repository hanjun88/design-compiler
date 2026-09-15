/**
 * GOLDEN_CASE_01 — 端到端贯通测试
 *
 * 验证：东方场景概念图全流程编译 → 5 维评测 → ABI 1.0.0 合规
 *
 * 测试矩阵：
 * - TC-GC-01: Pipeline 全链路成功（SUCCESS 状态）
 * - TC-GC-02: 5 维评测全部通过（status=PASS）
 * - TC-GC-03: Hash Chain 四元完整
 * - TC-GC-04: EvaluationResult ABI 1.0.0 schema 合规
 * - TC-GC-05: ValidatedDesignIR schema 合规
 * - TC-GC-06: ExecutionPlan schema 合规
 * - TC-GC-07: RegressionResult 通过基线
 */

import * as fs from "fs";
import * as path from "path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { runDetailed } from "../golden-cases/GOLDEN_CASE_01/run";

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

describe("GOLDEN_CASE_01 — 云海单门端到端贯通", () => {
  let result: Awaited<ReturnType<typeof runDetailed>>;

  beforeAll(async () => {
    result = await runDetailed();
  });

  // TC-GC-01: Pipeline 全链路成功
  test("TC-GC-01: Pipeline Runner 全链路成功，状态为 SUCCESS", () => {
    expect(result.pipelineOutput.status).toBe("SUCCESS");
    if (result.pipelineOutput.status === "SUCCESS") {
      expect(result.pipelineOutput.validatedIR).toBeDefined();
      expect(result.pipelineOutput.executionPlan).toBeDefined();
      expect(result.pipelineOutput.hashChain).toBeDefined();
      expect(result.pipelineOutput.timing).toBeDefined();
    }
  });

  // TC-GC-02: 5 维评测全部通过
  test("TC-GC-02: 5 维评测全部通过，status=PASS", () => {
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation!.status).toBe("PASS");
    expect(result.evaluation!.tierExecuted).toBe("TIER_A");

    // 所有 gate 必须通过
    const gates = result.evaluation!.gates!;
    expect(gates.composition.passed).toBe(true);
    expect(gates.color.passed).toBe(true);
    expect(gates.depth.passed).toBe(true);
    expect(gates.material.passed).toBe(true);
    expect(gates.focalDisplacement.passed).toBe(true);

    // 5 维分数必须 >= 阈值
    const metrics = result.evaluation!.metrics!;
    expect(metrics.composition.score).toBeGreaterThanOrEqual(metrics.composition.threshold);
    expect(metrics.color.composite.score).toBeGreaterThanOrEqual(metrics.color.composite.threshold);
    expect(metrics.depth.score).toBeGreaterThanOrEqual(metrics.depth.threshold);
    expect(metrics.material.score).toBeGreaterThanOrEqual(metrics.material.threshold);
  });

  // TC-GC-03: Hash Chain 四元完整
  test("TC-GC-03: Hash Chain 四元完整，均为合法 SHA-256", () => {
    expect(result.pipelineOutput.status).toBe("SUCCESS");
    if (result.pipelineOutput.status === "SUCCESS") {
      const hc = result.pipelineOutput.hashChain;
      expect(hc.inputHash).toMatch(SHA256_PATTERN);
      expect(hc.rawIRHash).toMatch(SHA256_PATTERN);
      expect(hc.validatedIRHash).toMatch(SHA256_PATTERN);
      expect(hc.executionPlanHash).toMatch(SHA256_PATTERN);

      // 四个哈希必须互不相同
      const hashes = [hc.inputHash, hc.rawIRHash, hc.validatedIRHash, hc.executionPlanHash];
      expect(new Set(hashes).size).toBe(4);
    }

    // Evaluation provenance 中的 hashChain 也必须完整
    const evalHC = result.evaluation!.provenance.hashChain;
    expect(evalHC.inputHash).toMatch(SHA256_PATTERN);
    expect(evalHC.rawIRHash).toMatch(SHA256_PATTERN);
    expect(evalHC.validatedIRHash).toMatch(SHA256_PATTERN);
    expect(evalHC.executionPlanHash).toMatch(SHA256_PATTERN);
  });

  // TC-GC-04: EvaluationResult ABI 1.0.0 schema 合规
  test("TC-GC-04: EvaluationResult 100% 通过 ABI 1.0.0 Schema 校验", () => {
    const isValid = validateEval(result.evaluation);
    if (!isValid) {
      console.error("Evaluation schema errors:", validateEval.errors);
    }
    expect(isValid).toBe(true);
  });

  // TC-GC-05: ValidatedDesignIR schema 合规
  test("TC-GC-05: ValidatedDesignIR 100% 通过 Schema 校验", () => {
    expect(result.validatedIR).toBeDefined();
    const isValid = validateVal(result.validatedIR);
    if (!isValid) {
      console.error("ValidatedIR schema errors:", validateVal.errors);
    }
    expect(isValid).toBe(true);
  });

  // TC-GC-06: ExecutionPlan schema 合规
  test("TC-GC-06: RuntimeExecutionPlan 100% 通过 Schema 校验", () => {
    expect(result.pipelineOutput.status).toBe("SUCCESS");
    if (result.pipelineOutput.status === "SUCCESS") {
      const isValid = validateExec(result.pipelineOutput.executionPlan);
      if (!isValid) {
        console.error("ExecutionPlan schema errors:", validateExec.errors);
      }
      expect(isValid).toBe(true);
    }
  });

  // TC-GC-07: RegressionResult 通过基线
  test("TC-GC-07: RegressionResult passed=true，proposalScore >= baselineScore", () => {
    expect(result.regression.passed).toBe(true);
    expect(result.regression.proposalScore).toBeGreaterThanOrEqual(result.regression.baselineScore);
    expect(result.regression.caseId).toBe("GOLDEN_CASE_01");
    expect(result.regression.newViolations).toHaveLength(0);
    expect(result.regression.resolvedViolations.length).toBeGreaterThan(0);
  });

  // TC-GC-08: 各维度子检查项非空
  test("TC-GC-08: 5 维评测器均产出非空子检查项", () => {
    const metrics = result.evaluation!.metrics!;
    // composition 评估器有 4 个检查项
    expect(metrics.composition.score).toBeGreaterThan(0);
    // color composite 有 4 个检查项
    expect(metrics.color.composite.score).toBeGreaterThan(0);
    // depth 有 4 个检查项
    expect(metrics.depth.score).toBeGreaterThan(0);
    // material 有 4 个检查项（含存在性检查）
    expect(metrics.material.score).toBeGreaterThan(0);
    // focus 有 3 个检查项
    expect(metrics.focalPointDisplacement.score).toBeGreaterThan(0);
  });

  // TC-GC-09: 版本指纹完整
  test("TC-GC-09: Evaluation versions 五项全部非空", () => {
    const v = result.evaluation!.versions;
    expect(v.compiler.length).toBeGreaterThan(0);
    expect(v.distiller.length).toBeGreaterThan(0);
    expect(v.grammar.length).toBeGreaterThan(0);
    expect(v.adapter.length).toBeGreaterThan(0);
    expect(v.evaluator.length).toBeGreaterThan(0);
  });

  // TC-GC-10: timing 透传
  test("TC-GC-10: Evaluation timing 包含 distillationExecutionMs", () => {
    const t = result.evaluation!.provenance.timing;
    expect(t.distillationExecutionMs).toBeGreaterThanOrEqual(0);
  });
});
