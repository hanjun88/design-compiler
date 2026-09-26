/**
 * no-bypass.test.ts
 *
 * Architecture invariant: the G2.5 AestheticGate must NOT be bypassable.
 *
 * Two guarantees:
 *   1. `aesthetic-integration/index.ts` exposes `AestheticPipelineRunner` as the
 *      sole end-to-end execution entry — there is no exported way to run a sheet
 *      through G1→G2→G3 while skipping G2.5.
 *   2. No production module outside `aesthetic-integration/aesthetic-pipeline-runner.ts`
 *      directly instantiates the compiler-core `PipelineRunner`. The demo and any
 *      other consumer must go through `AestheticPipelineRunner` (which always runs
 *      the gate unless explicitly disabled via `aestheticGateEnabled:false`).
 *
 * Contract tests and golden-case fixtures are allowed to use the core
 * `PipelineRunner` directly — they test compiler-core itself, not the aesthetic
 * product path.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");

/** Recursively collect .ts files under a directory (excluding node_modules). */
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "output") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("architecture invariant: no bypass around the G2.5 gate", () => {
  test("aesthetic-integration/index.ts exports AestheticPipelineRunner as the execution entry", () => {
    const indexSrc = fs.readFileSync(
      path.join(ROOT, "aesthetic-integration", "index.ts"),
      "utf8",
    );
    // Collect only the actual re-export statements (ignore doc comments).
    const exportBlocks = (indexSrc.match(/export\s*\{[^}]*\}\s*from\s*"[^"]+"/g) ?? []).join("\n");
    expect(exportBlocks).toMatch(/AestheticPipelineRunner/);
    // The raw compiler-core PipelineRunner must NOT be re-exported: a bare
    // "PipelineRunner" identifier (word boundary, not the "Aesthetic" prefixed
    // variant) would give consumers a gate-free runner.
    expect(exportBlocks).not.toMatch(/\bPipelineRunner\b/);
  });

  test("no production module outside aesthetic-pipeline-runner.ts directly news up compiler-core PipelineRunner", () => {
    const productionDirs = [
      path.join(ROOT, "aesthetic-integration"),
      path.join(ROOT, "demo"),
      path.join(ROOT, "compiler-intent"),
    ];
    const offenders: string[] = [];

    for (const dir of productionDirs) {
      for (const file of walk(dir)) {
        const src = fs.readFileSync(file, "utf8");
        if (/new\s+PipelineRunner\s*\(/.test(src)) {
          const rel = path.relative(ROOT, file);
          // The single allowed integration point.
          if (rel !== path.join("aesthetic-integration", "aesthetic-pipeline-runner.ts")) {
            offenders.push(rel);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the demo's real runner delegates to AestheticPipelineRunner, not the core PipelineRunner", () => {
    const demoRunner = fs.readFileSync(
      path.join(ROOT, "demo", "e2e-aesthetic", "src", "pipeline", "real-pipeline-runner.ts"),
      "utf8",
    );
    expect(demoRunner).toMatch(/AestheticPipelineRunner/);
    expect(demoRunner).not.toMatch(/new\s+PipelineRunner\s*\(/);
  });
});
