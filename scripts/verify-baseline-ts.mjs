#!/usr/bin/env node
/**
 * Baseline TypeScript Error Fingerprint Matcher (Dual-Gate, Independent Execution)
 *
 * 双轨门禁（物理分离，各自独立执行 tsc）：
 *   GATE-A: chinese-aesthetic scoped typecheck
 *           npx tsc --project tsconfig.chinese-aesthetic.json --noEmit
 *           预期：exit 0, 0 diagnostics
 *
 *   GATE-B: repository-wide baseline matching
 *           npx tsc --noEmit（默认 tsconfig.json）
 *           预期：恰好 3 个诊断，全部命中基线指纹白名单
 *
 * 用法：node scripts/verify-baseline-ts.mjs
 * 退出码：0 = 双轨通过；1 = 任一门禁失败
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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

const SCOPED_TSCONFIG = path.join(REPO_ROOT, "tsconfig.chinese-aesthetic.json");

// ---------------------------------------------------------------------------
// 路径规范化：绝对路径 → 仓库相对路径，去除 ./ 前缀
// ---------------------------------------------------------------------------

function normalizeDiagnosticPath(filePath) {
  let p = filePath;
  // 绝对路径 → 相对仓库根
  if (path.isAbsolute(p) && p.startsWith(REPO_ROOT)) {
    p = p.slice(REPO_ROOT.length + 1);
  }
  // 去除 ./ 前缀
  if (p.startsWith("./")) {
    p = p.slice(2);
  }
  // 统一路径分隔符为 /
  p = p.split(path.sep).join("/");
  return p;
}

// ---------------------------------------------------------------------------
// 运行 tsc 并捕获输出
// ---------------------------------------------------------------------------

function runTsc(args) {
  const cmd = `npx tsc ${args}`;
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    stdout = result ?? "";
  } catch (err) {
    exitCode = err.status ?? 1;
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
  }
  // tsc 诊断输出可能在 stdout 或 stderr，合并后解析
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  return { exitCode, stdout, stderr, combined };
}

// ---------------------------------------------------------------------------
// 解析 tsc 诊断输出
// ---------------------------------------------------------------------------

function parseTscOutput(output) {
  const lines = output.split("\n");
  const diagnostics = [];
  let current = null;

  for (const line of lines) {
    // 匹配主诊断行：file(line,col): error TSxxxx: message
    const match = line.match(
      /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/,
    );
    if (match) {
      if (current) diagnostics.push(current);
      current = {
        file: normalizeDiagnosticPath(match[1]),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        errorCode: match[4],
        message: match[5],
        continuation: [],
      };
    } else if (current && line.trim().length > 0 && line.startsWith("  ")) {
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
  if (!diag.message.includes(fingerprint.messagePattern)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// GATE-A: 独立 scoped typecheck
// ---------------------------------------------------------------------------

function runGateA() {
  console.log("--- GATE-A: chinese-aesthetic Scoped Typecheck (independent) ---");

  // 1. 配置文件存在性检查
  if (!existsSync(SCOPED_TSCONFIG)) {
    console.log(`  ✗ FAIL: tsconfig.chinese-aesthetic.json not found at ${SCOPED_TSCONFIG}`);
    return { pass: false, exitCode: -1, diagnostics: [] };
  }
  console.log("  ✓ tsconfig.chinese-aesthetic.json exists");

  // 2. 独立执行 scoped tsc
  const { exitCode, combined } = runTsc("--project tsconfig.chinese-aesthetic.json --noEmit");
  const diagnostics = parseTscOutput(combined);

  console.log(`  Command: npx tsc --project tsconfig.chinese-aesthetic.json --noEmit`);
  console.log(`  Exit code: ${exitCode}`);
  console.log(`  Diagnostics: ${diagnostics.length}`);

  if (diagnostics.length > 0) {
    for (const d of diagnostics) {
      console.log(`  ✗ ${d.file}(${d.line},${d.column}): ${d.errorCode} ${d.message}`);
    }
  }

  const pass = exitCode === 0 && diagnostics.length === 0;
  console.log(`  GATE-A: ${pass ? "PASS" : "FAIL"}\n`);
  return { pass, exitCode, diagnostics };
}

// ---------------------------------------------------------------------------
// GATE-B: 全域 baseline matching
// ---------------------------------------------------------------------------

function runGateB() {
  console.log("--- GATE-B: Repository-wide Baseline Matching (independent) ---");

  // 独立执行全域 tsc（默认 tsconfig.json）
  const { exitCode, combined } = runTsc("--noEmit");
  const diagnostics = parseTscOutput(combined);

  console.log(`  Command: npx tsc --noEmit`);
  console.log(`  Exit code: ${exitCode}`);
  console.log(`  Total diagnostics: ${diagnostics.length}`);

  // 指纹匹配
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
  console.log(`  Missing baseline: ${missing.length}`);

  if (unmatched.length > 0) {
    console.log("\n  ✗ UNMATCHED DIAGNOSTICS:");
    for (const d of unmatched) {
      console.log(`    ${d.file}(${d.line},${d.column}): ${d.errorCode} ${d.message}`);
    }
  }
  if (missing.length > 0) {
    console.log("\n  ⚠ MISSING BASELINE (ledger may need update):");
    for (const f of missing) {
      console.log(`    ${f.id}: ${f.errorCode} in ${f.file}`);
    }
  }

  const pass =
    unmatched.length === 0 &&
    matchedIds.size === BASELINE_FINGERPRINTS.length &&
    diagnostics.length === BASELINE_FINGERPRINTS.length;

  console.log(`\n  GATE-B: ${pass ? "BASELINE-MATCHED PASS" : "FAIL"}\n`);
  return { pass, exitCode, diagnostics, matched: matchedIds.size, unmatched, missing };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Baseline TypeScript Verification (Dual-Gate, Independent) ===\n");
  console.log(`Repo root: ${REPO_ROOT}\n`);

  const gateA = runGateA();
  const gateB = runGateB();

  console.log("=== Summary ===");
  console.log(`  GATE-A (scoped, exit=${gateA.exitCode}):     ${gateA.pass ? "PASS" : "FAIL"}`);
  console.log(`  GATE-B (baseline, exit=${gateB.exitCode}):   ${gateB.pass ? "PASS" : "FAIL"}`);
  console.log(`  Repository-wide zero-error:  FAIL (${BASELINE_FINGERPRINTS.length} baseline legacy)`);

  const allPass = gateA.pass && gateB.pass;
  console.log(`\n  OVERALL: ${allPass ? "PASS" : "FAIL"}`);

  process.exit(allPass ? 0 : 1);
}

main();
