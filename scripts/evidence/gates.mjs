/**
 * The gate registry: the single list of what "all gates" means. run-gates.mjs executes it, collect.mjs reports
 * every entry (a gate that did not run is NOT_RUN, never absent), CI uploads the evidence it wrote.
 *
 * Status vocabulary everywhere: PASS | FAIL | BLOCKED_ENV | NOT_RUN.
 */
export const GATES = [
  { id: "typescript-zero-error", name: "typescript zero-error", cmd: "node", args: ["scripts/verify-typescript.mjs", "--json"], out: "typescript.json", json: true },
  { id: "build", name: "build", cmd: "npx", args: ["tsc", "-p", "tsconfig.json"], out: "build.txt" },
  { id: "schema-validation", name: "schema validation", cmd: "node", args: ["scripts/validate-schemas.mjs"], out: "schemas.txt" },
  { id: "contract-lock", name: "contract lock", cmd: "node", args: ["scripts/contract/lock-contract.mjs", "--check", "--json"], out: "contract.json", json: true },
  { id: "aesthetic-ssot-lint", name: "aesthetic SSOT lint", cmd: "node", args: ["scripts/lint-aesthetic-ssot.mjs", "--json"], out: "ssot-lint.json", json: true },
  { id: "docs-lint", name: "docs lint (no hand-written test counts, no restated aesthetic magnitudes)", cmd: "node", args: ["scripts/lint-docs.mjs", "--json"], out: "docs-lint.json", json: true },
  { id: "test-coverage", name: "test coverage gate", cmd: "node", args: ["scripts/verify-test-coverage.mjs"], out: "test-coverage.txt" },
  { id: "skill-binding", name: "skill binding (pin, reproduction, every context consumable)", cmd: "npx", args: ["ts-node", "--project", "tsconfig.test.json", "scripts/binding/verify-binding.ts", "--json"], out: "binding.json", json: true, passArgs: true },
  { id: "golden-manifest-current", name: "golden manifest current", cmd: "npx", args: ["ts-node", "--project", "tsconfig.test.json", "scripts/golden/reseal.ts", "--check"], out: "golden.txt" },
  { id: "abi-runner", name: "ABI runner (G0/G2)", cmd: "npx", args: ["ts-node", "--project", "tsconfig.test.json", "tests/runner.test.ts"], out: "abi.txt" },
  { id: "skill-parity", name: "skill parity (the bound skill passes its own suite)", skill: true, out: "skill-parity.txt" },
];
export const JEST_GATE = { id: "jest", name: "jest (all suites)" };
