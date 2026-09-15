import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import {
  verifyEvaluationSemanticGate,
  computeRFC8785Hash,
  SemanticGateError
} from '../compiler-core/semantic-gate';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const schemaPath = path.join(__dirname, '../schemas/evaluation-result.schema.json');
const matrixPath = path.join(__dirname, 'golden/evaluation-negative-semantic-golden-matrix.json');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const validate = ajv.compile(schema);

console.log(`=== RUNNING ABI VERIFICATION: ${matrix.abiVersion} (${matrix.status}) ===\n`);

let passedG0 = 0;
let totalG0 = matrix.negativeMatrix.length;

// 1. 运行 G0 Schema 负例矩阵
for (const testCase of matrix.negativeMatrix) {
  const isValid = validate(testCase.payload);
  if (!isValid && testCase.expect === 'SCHEMA_INVALID') {
    console.log(`[\x1b[32mPASS\x1b[0m] G0 Intercepted: ${testCase.id} - ${testCase.description}`);
    passedG0++;
  } else {
    console.error(`[\x1b[31mFAIL\x1b[0m] G0 Failed to intercept: ${testCase.id} - ${testCase.description}`);
  }
}

// 2. 运行 G2 语义负例矩阵
console.log(`\n=== RUNNING G2 SEMANTIC GATE VERIFICATION ===\n`);
let passedG2 = 0;
let totalG2 = matrix.semanticMatrix.length;

const mockValidRawIR = {
  $schema: "https://heartmirror.dev/schemas/raw-design-ir.schema.json",
  meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-15T12:00:00Z" },
  provenance: {
    extractorVersion: "1.0.0",
    rawIRHash: "" // 由下方动态填入
  }
};
// 生成合法的 rawIRHash 自闭环预映像
const rawPreimage = JSON.parse(JSON.stringify(mockValidRawIR));
delete rawPreimage.provenance.rawIRHash;
mockValidRawIR.provenance.rawIRHash = computeRFC8785Hash(rawPreimage);

const mockValidValidatedIR = {
  sourceRef: { rawIRHash: mockValidRawIR.provenance.rawIRHash }
};

const baseExecutedEval = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  testCaseId: "GOLDEN_CASE_01",
  executedAt: "2026-09-15T12:00:00Z",
  status: "PASS",
  tierExecuted: "TIER_A",
  versions: { compiler: "1.0", distiller: "1.0", grammar: "1.0", adapter: "1.0", evaluator: "1.0" },
  metrics: {
    composition: { score: 0.95, threshold: 0.90, weight: 0.2, metricVersion: "1.0", evaluationMethod: "ssim" },
    color: {
      composite: { score: 0.95, threshold: 0.90, weight: 0.2, metricVersion: "1.0", evaluationMethod: "deltaE" },
      palette: { score: 0.95, threshold: 0.90, weight: 0.05, metricVersion: "1.0", evaluationMethod: "deltaE" },
      dominantArea: { score: 0.95, threshold: 0.90, weight: 0.05, metricVersion: "1.0", evaluationMethod: "deltaE" },
      temperature: { score: 0.95, threshold: 0.90, weight: 0.05, metricVersion: "1.0", evaluationMethod: "deltaE" },
      contrast: { score: 0.95, threshold: 0.90, weight: 0.05, metricVersion: "1.0", evaluationMethod: "deltaE" }
    },
    depth: { score: 0.90, threshold: 0.85, weight: 0.2, metricVersion: "1.0", evaluationMethod: "pearson" },
    material: { score: 0.85, threshold: 0.80, weight: 0.2, metricVersion: "1.0", evaluationMethod: "mse" },
    focalPointDisplacement: { score: 0.98, threshold: 0.95, displacementDistance: 0.02, weight: 0.2, metricVersion: "1.0", evaluationMethod: "euclidean" }
  },
  gates: {
    composition: { metricRef: "metrics.composition", passed: true },
    color: { metricRef: "metrics.color.composite", passed: true },
    depth: { metricRef: "metrics.depth", passed: true },
    material: { metricRef: "metrics.material", passed: true },
    focalDisplacement: { metricRef: "metrics.focalPointDisplacement", passed: true }
  },
  provenance: {
    hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
    hashChain: {
      inputHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rawIRHash: mockValidRawIR.provenance.rawIRHash,
      validatedIRHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      executionPlanHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      renderHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    timing: { distillationExecutionMs: 10, grammarExecutionMs: 5, adapterExecutionMs: 5, renderExecutionMs: 50 }
  }
};

function runSemanticTest(id: string, expectCode: string, mutator: (r: any, v: any, e: any) => void) {
  const r = JSON.parse(JSON.stringify(mockValidRawIR));
  const v = JSON.parse(JSON.stringify(mockValidValidatedIR));
  const e = JSON.parse(JSON.stringify(baseExecutedEval));
  mutator(r, v, e);

  try {
    verifyEvaluationSemanticGate(r, v, e);
    console.error(`[\x1b[31mFAIL\x1b[0m] G2 Expected error ${expectCode}, but verification PASSED: ${id}`);
  } catch (err: any) {
    if (err instanceof SemanticGateError && err.code === expectCode) {
      console.log(`[\x1b[32mPASS\x1b[0m] G2 Intercepted: ${id} [${err.code}]`);
      passedG2++;
    } else {
      console.error(`[\x1b[31mFAIL\x1b[0m] G2 Unexpected error on ${id}: ${err.message}`);
    }
  }
}

runSemanticTest('NEG-SEM-01', 'EVAL_GATE_DECISION_MISMATCH', (r, v, e) => {
  e.metrics.composition.score = 0.82;
  e.metrics.composition.threshold = 0.90;
  e.gates.composition.passed = true;
});

runSemanticTest('NEG-SEM-02', 'EVAL_METRIC_REF_NOT_FOUND', (r, v, e) => {
  e.gates.composition.metricRef = "metrics.nonexistent";
});

runSemanticTest('NEG-SEM-03', 'EVAL_METRIC_REF_TYPE_MISMATCH', (r, v, e) => {
  e.gates.color.metricRef = "metrics.color"; // 指向了对象节点而不是具体度量项
});

runSemanticTest('NEG-SEM-04', 'EVAL_GATE_DECISION_MISMATCH', (r, v, e) => {
  e.metrics.depth.score = 0.90;
  e.metrics.depth.threshold = 0.85;
  e.gates.depth.passed = false; // 应当为 true
});

runSemanticTest('NEG-SEM-05', 'HASH_INTEGRITY_MISMATCH', (r, v, e) => {
  r.provenance.rawIRHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
});

runSemanticTest('NEG-SEM-06', 'SOURCE_REF_HASH_MISMATCH', (r, v, e) => {
  v.sourceRef.rawIRHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
});

console.log(`\n=== TEST REPORT SUMMARY ===`);
console.log(`G0 Schema Structural Gate: ${passedG0}/${totalG0} Passed`);
console.log(`G2 Semantic Integrity Gate: ${passedG2}/${totalG2} Passed`);

if (passedG0 === totalG0 && passedG2 === totalG2) {
  console.log(`\n\x1b[32mALL ABI GATEWAY VERIFICATIONS PASSED.\x1b[0m Ready for PROMOTION to FROZEN.\n`);
} else {
  process.exit(1);
}
