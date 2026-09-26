/**
 * run.ts — e2e-aesthetic demo entry point.
 *
 * Usage (from repo root):
 *   npx ts-node --transpile-only --compiler-options "{\"module\":\"CommonJS\"}" demo/e2e-aesthetic/run.ts
 *
 * Flow per scenario:
 *   1. MockPipelineRunner runs sheet → scene graph → G1 → G2 → G2.5 REAL AestheticGate
 *   2. HTML/CSS/JS generated from compiler-approved tokens
 *   3. Post-generation anti-cliché audit (sheet constraints + gate violations)
 *   4. Fidelity scoring vs the original aesthetic sheet
 *   5. Write output/<id>/index.html + output/<id>/report.json
 */

import * as fs from "fs";
import * as path from "path";

import { MockPipelineRunner } from "./src/pipeline/mock-pipeline-runner";
import { ALL_SCENARIOS } from "./src/scenarios";
import { generateHtml } from "./src/generator/html-generator";
import { auditAgainstCliche } from "./src/auditor/anti-cliche-auditor";
import { evaluateFidelity } from "./src/evaluator/fidelity-evaluator";
import type { E2EScenarioResult } from "./src/types";

const OUTPUT_ROOT = path.join(__dirname, "output");

/** Run every scenario end-to-end and write outputs. */
export function runAll(): E2EScenarioResult[] {
  const runner = new MockPipelineRunner();
  const results: E2EScenarioResult[] = [];

  if (!fs.existsSync(OUTPUT_ROOT)) fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  for (const scenario of ALL_SCENARIOS) {
    console.log(`\n──▶ [${scenario.id}] ${scenario.title}`);
    console.log(`    brief: ${scenario.brief}`);

    // Stage 1: compile (mock pipeline + REAL G2.5 gate)
    const compiled = runner.run(scenario);
    const gateIds = compiled.gate.violations.map((v) => v.ruleId);
    console.log(`    pipeline: stages=${compiled.stages.length} patches=${compiled.patchesApplied}`);
    console.log(`    G2.5 gate: ${compiled.gate.passed ? "PASS" : `VETO ${gateIds.join(",")}`}`);

    // Stage 2: frontend code generation
    const html = generateHtml(scenario, compiled.theme);

    // Stage 3: post-generation anti-cliché audit
    const audit = auditAgainstCliche(scenario, compiled.theme, html, gateIds);
    console.log(`    audit: ${audit.passed ? "PASS" : "FAIL"} (contrast ${audit.contrastRatio}:1)`);

    // Stage 4: fidelity scoring
    const fidelity = evaluateFidelity(scenario, compiled.theme, html, audit);
    console.log(`    fidelity: ${fidelity.total}/100 [${fidelity.verdict}]`);

    // Stage 5: write outputs
    const dir = path.join(OUTPUT_ROOT, scenario.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

    const report: Record<string, unknown> = {
      scenario: {
        id: scenario.id, title: scenario.title, brief: scenario.brief, mood: scenario.sheet.mood,
      },
      aestheticSheet: {
        score: scenario.sheet.score,
        palette: scenario.sheet.colorSystem.palette,
        voidSolidRatio: scenario.sheet.proportion.voidSolidRatio,
        axis: scenario.sheet.spatial.axis,
      },
      pipeline: {
        mode: "mock-pipeline-runner (G2.5 = REAL AestheticGate)",
        stages: compiled.stages,
        grammarPatchesApplied: compiled.patchesApplied,
        gate: {
          passed: compiled.gate.passed,
          violations: compiled.gate.violations,
        },
      },
      theme: compiled.theme,
      antiCliche: audit,
      fidelity,
    };
    fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(`    written: output/${scenario.id}/{index.html, report.json}`);

    results.push({
      scenario,
      pipelineSummary: report.pipeline,
      theme: compiled.theme,
      html,
      audit,
      fidelity,
    });
  }

  return results;
}

// CLI entry: only when executed directly.
if (require.main === module) {
  const results = runAll();
  console.log("\n========================================");
  console.log(" e2e-aesthetic demo summary");
  console.log("========================================");
  for (const r of results) {
    console.log(
      ` ${r.scenario.id.padEnd(16)} fidelity=${String(r.fidelity.total).padStart(3)}/100 ` +
        `audit=${r.audit.passed ? "PASS" : "FAIL"} verdict=${r.fidelity.verdict}`,
    );
  }
}
