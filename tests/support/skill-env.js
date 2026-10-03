/**
 * Test-time access to the REAL chinese-aesthetic-skill (CommonJS: used by jest globalSetup and by tests).
 *
 * The compiler never fabricates aesthetic data for its tests: every sheet is emitted by the
 * skill's own generator (scripts/emit-sheet.mjs) from the skill checkout found at SKILL_DIR
 * (default: ../chinese-aesthetic-skill). A missing or unusable skill checkout fails the run:
 * there is no skip and no fallback.
 */
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const REPO_ROOT = resolve(__dirname, "..", "..");

function skillDir() {
  const dir = resolve(process.env.SKILL_DIR || join(REPO_ROOT, "..", "chinese-aesthetic-skill"));
  if (!existsSync(join(dir, "scripts", "emit-sheet.mjs"))) {
    throw new Error(
      `chinese-aesthetic-skill checkout not found at ${dir} (expected scripts/emit-sheet.mjs). ` +
        "Clone it next to this repository or set SKILL_DIR. Aesthetic tests never run against fabricated data.",
    );
  }
  return dir;
}

/** Contexts every test run needs: tests/support/contexts.*.json (one file per owner, merged). */
function requiredContexts() {
  const dir = join(REPO_ROOT, "tests", "support");
  const files = readdirSync(dir).filter((f) => /^contexts\..+\.json$/.test(f)).sort();
  const byKey = new Map();
  for (const f of files) {
    for (const c of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
      byKey.set(contextKey(c), { period: c.period, material: c.material, lighting: c.lighting, scene_type: c.scene_type });
    }
  }
  return [...byKey.values()];
}

const contextKey = (c) => `${c.period}.${c.material}.${c.lighting}.${c.scene_type}`;

function emitContext(skill, ctx, outFile) {
  execFileSync(
    "node",
    [join(skill, "scripts", "emit-sheet.mjs"), "--period", ctx.period, "--material", ctx.material, "--lighting", ctx.lighting, "--scene-type", ctx.scene_type, "--out", outFile],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** Emit every required context into `dir` (created) and return the file list. */
function emitAll(dir) {
  const skill = skillDir();
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const ctx of requiredContexts()) {
    const file = join(dir, `${contextKey(ctx)}.json`);
    emitContext(skill, ctx, file);
    written.push(file);
  }
  return written;
}

module.exports = { REPO_ROOT, skillDir, requiredContexts, contextKey, emitContext, emitAll };
