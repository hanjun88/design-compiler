/**
 * tests/demo/e2e-demo.test.ts
 *
 * Integration test for the e2e-aesthetic demo.
 *
 * Runs the full demo (sheet → mock pipeline → REAL G2.5 AestheticGate → HTML →
 * audit → fidelity) and asserts:
 *   1. All 3 scenarios produce a result
 *   2. The real DC gate passes each design
 *   3. Each output/index.html exists on disk and is a complete document
 *   4. Each page contains its required semantic + interaction hooks
 *   5. Fidelity scores land in a sane range (80–100)
 *
 * Runs without jest: `ts-node --transpile-only --project tsconfig.demo.json tests/demo/e2e-demo.test.ts`
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

import { runAll } from "../../demo/e2e-aesthetic/run";

const OUTPUT_ROOT = path.join(__dirname, "..", "..", "demo", "e2e-aesthetic", "output");

// Required interaction hook per scenario kind.
const REQUIRED_HOOK: Record<string, string> = {
  "song-login": "login-form",
  "zen-portfolio": "filter-btn",
  "tang-shop": "carousel-track",
};

function main(): void {
  const results = runAll();

  assert.strictEqual(results.length, 3, "expected exactly 3 scenarios");

  for (const r of results) {
    const { scenario, html, audit, fidelity, pipelineSummary } = r;
    const kind = scenario.content.kind;

    // 1. Real G2.5 gate passed
    const gate = (pipelineSummary as { gate: { passed: boolean } }).gate;
    assert.strictEqual(gate.passed, true, `[${scenario.id}] real AestheticGate must PASS`);

    // 2. Audit passed
    assert.strictEqual(audit.passed, true, `[${scenario.id}] anti-cliché audit must PASS`);
    assert.deepStrictEqual(audit.gateViolations, [], `[${scenario.id}] no gate violations`);

    // 3. HTML is a complete document
    assert.ok(html.toLowerCase().includes("<!doctype html"), "doctype present");
    assert.ok(html.toLowerCase().includes("</html>"), "closing html tag");
    assert.ok(html.includes("<h1"), "semantic h1 present");

    // 4. Required interaction hook wired
    const hook = REQUIRED_HOOK[kind];
    assert.ok(html.includes(hook), `[${scenario.id}] missing interaction hook "${hook}"`);

    // 5. Fidelity in sane range
    assert.ok(fidelity.total >= 80 && fidelity.total <= 100, `fidelity ${fidelity.total} out of range`);

    // 6. Files written to disk
    const dir = path.join(OUTPUT_ROOT, scenario.id);
    assert.ok(fs.existsSync(path.join(dir, "index.html")), "index.html written");
    assert.ok(fs.existsSync(path.join(dir, "report.json")), "report.json written");
    const onDisk = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.strictEqual(onDisk, html, "written html matches in-memory html");

    console.log(`  ✓ ${scenario.id}  fidelity=${fidelity.total}  hook=${hook}  gate=PASS`);
  }

  console.log("\nALL E2E DEMO TESTS PASSED");
}

main();
