#!/usr/bin/env node
/**
 * Baseline TypeScript Error Fingerprint Matcher
 *
 * 双轨门禁：
 *   GATE-A: chinese-aesthetic scoped typecheck → 必须 0 错误
 *   GATE-B: repository-wide baseline matching → 恰好 3 个错误，全部命中白名单
 *
 * 用法：node scripts/verify-baseline-ts.mjs
 * 退出码：0 = 双轨通过；1 = 任一门禁失败
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 基线指纹（与 docs/BASELINE-TS-ERROR-LEDGER.md 保持同步）
// ---------------------------------------------------------------------------

const BASELINE_FINGERPRINTS = [
  {
    id: "BL-TS-001",
    errorCode: "TS2345",
    file: "compiler-core/execution-planner.ts",
    messagePattern:
      "Argument of type '{}' is not assignable to parameter of type 'Record<string, unknown>'",
  },
  {
    id: "BL-TS-002",
    errorCode: "TS2305",
    file: "evaluation/feedback-engine.ts",
    messagePattern: "no exported member 'EvaluationResult'",
  },
  {
    id: "BL-TS-003",
    errorCode: "TS7006",
    file: "evaluation/feedback-engine.ts",
    messagePattern: "Parameter 'v' implicitly has an 'any' type",
  },
];

// ---------------------------------------------------------------------------
// 解析 tsc 输出
// ---------------------------------------------------------------------------

/**
 * 解析 tsc --noEmit 的 stderr，提取诊断条目。
 * tsc 格式：`file(line,col): error TSxxxx: message`
 * 续行：`  续行说明`（缩进，属于上一条诊断的补充）
 */
function parseTscOutput(stderr) {
  const lines = stderr.split("\n");
  const diagnostics = [];
  let current = null;

  for (const line of lines) {
    // 匹配主诊断行
    const match = line.match(
      /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/,
    );
    if (match) {
      if (current) diagnostics.push(current);
      current = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        errorCode: match[4],
        message: match[5],
        continuation: [],
      };
    } else if (current && line.trim().length > 0 && line.startsWith("  ")) {
      // 续行（缩进的补充说明）
      current.continuation.push(line.trim());
    }
  }
  if (current) diagnostics.push(current);
  return diagnostics;
}

// ---------------------------------------------------------------------------
// 指纹匹配
// ---------------------------------------------------------------------------

function matchFingerprint(diag, fingerprint) {
  if (diag.errorCode !== fingerprint.errorCode) return false;
  if (diag.file !== fingerprint.file) return false;
  // messagePattern 子串匹配（容错 TypeScript 版本间的措辞微调）
  if (!diag.message.includes(fingerprint.messagePattern)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Baseline TypeScript Verification ===\n");

  // 1. 运行 tsc --noEmit
  let stderr = "";
  let tscExitCode = 0;
  try {
    execSync("npx tsc --noEmit", {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    tscExitCode = err.status ?? 1;
    stderr = err.stderr ?? "";
    // tsc 也可能输出到 stdout
    if (!stderr && err.stdout) stderr = err.stdout;
  }

  const diagnostics = parseTscOutput(stderr);
  console.log(`tsc --noEmit exit code: ${tscExitCode}`);
  console.log(`Total diagnostics: ${diagnostics.length}\n`);

  // 2. GATE-A: chinese-aesthetic scoped → 必须 0 错误
  const scopedErrors = diagnostics.filter((d) =>
    d.file.startsWith("chinese-aesthetic/"),
  );
  console.log("--- GATE-A: chinese-aesthetic Scoped Typecheck ---");
  console.log(`  Errors in chinese-aesthetic/: ${scopedErrors.length}`);
  if (scopedErrors.length > 0) {
    for (const e of scopedErrors) {
      console.log(`  ✗ ${e.file}(${e.line},${e.column}): ${e.errorCode} ${e.message}`);
    }
  }
  const gateAPass = scopedErrors.length === 0;
  console.log(`  GATE-A: ${gateAPass ? "PASS" : "FAIL"}\n`);

  // 3. GATE-B: baseline matching → 恰好 BASELINE 数量，全部命中
  console.log("--- GATE-B: Repository-wide Baseline Matching ---");
  const matchedIds = new Set();
  const unmatched = [];

  for (const diag of diagnostics) {
    const fp = BASELINE_FINGERPRINTS.find((f) => matchFingerprint(diag, f));
    if (fp) {
      matchedIds.add(fp.id);
    } else {
      unmatched.push(diag);
    }
  }

  const missing = BASELINE_FINGERPRINTS.filter((f) => !matchedIds.has(f.id));

  console.log(`  Baseline fingerprints: ${BASELINE_FINGERPRINTS.length}`);
  console.log(`  Matched: ${matchedIds.size}`);
  console.log(`  Unmatched (new errors): ${unmatched.length}`);
  console.log(`  Missing baseline errors: ${missing.length}`);

  if (unmatched.length > 0) {
    console.log("\n  ✗ UNMATCHED DIAGNOSTICS (must be fixed):");
    for (const e of unmatched) {
      console.log(
        `    ${e.file}(${e.line},${e.column}): ${e.errorCode} ${e.message}`,
      );
    }
  }
  if (missing.length > 0) {
    console.log("\n  ⚠ MISSING BASELINE ERRORS (ledger may need update):");
    for (const f of missing) {
      console.log(`    ${f.id}: ${f.errorCode} in ${f.file}`);
    }
  }

  const gateBPass =
    unmatched.length === 0 &&
    matchedIds.size === BASELINE_FINGERPRINTS.length &&
    diagnostics.length === BASELINE_FINGERPRINTS.length;
  console.log(`\n  GATE-B: ${gateBPass ? "BASELINE-MATCHED PASS" : "FAIL"}`);

  // 4. 汇总
  console.log("\n=== Summary ===");
  console.log(`  GATE-A (scoped 0-error):     ${gateAPass ? "PASS" : "FAIL"}`);
  console.log(
    `  GATE-B (baseline matching):  ${gateBPass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  Repository-wide zero-error:  FAIL (${BASELINE_FINGERPRINTS.length} baseline legacy)`,
  );

  const allPass = gateAPass && gateBPass;
  console.log(`\n  OVERALL: ${allPass ? "PASS" : "FAIL"}`);

  process.exit(allPass ? 0 : 1);
}

main();
