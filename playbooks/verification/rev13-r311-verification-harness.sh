#!/usr/bin/env bash
# ==============================================================================
# playbooks/verification/rev13-r311-verification-harness.sh
# REV-13 R3.11 物理验证集成 Harness
# 统一退出漏斗 (Unified Exit Funnel) + 全生命周期状态账本 + Git Blob 类型验证
# ==============================================================================
# SC2015: A && B || C is intentional — prevents set -e silent crashes.
# B is always a simple assignment (cannot fail), so C only runs on A failure.
# shellcheck disable=SC2015
set -euo pipefail

export AUDIT_ENGINE_VERSION="1.7.0-REV-13-R3.11"

# ── 1. 锚定工作区与依赖项 ────────────────────────────────────────────────────
WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "[-] FATAL: Not inside a Git repository" >&2; exit 1; }

command -v jq      >/dev/null 2>&1 || { echo "[-] FATAL: 'jq' mandatory" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[-] FATAL: 'python3' mandatory" >&2; exit 1; }

SCRIPT_REL="playbooks/verification/verify-pipeline-artifacts.sh"
HARNESS_REL="playbooks/verification/rev13-r311-verification-harness.sh"
REGISTRY_REL="tests/chinese-aesthetic/render/evidence/rev13-test-registry.json"
ANALYZER_REL="playbooks/verification/rev13-closure-analyzer.py"
VALIDATOR_REL="playbooks/verification/rev13-registry-validator.py"
EVIDENCE_DIR="$WORKSPACE_ROOT/tests/chinese-aesthetic/render/evidence"

SCRIPT_PATH="$WORKSPACE_ROOT/$SCRIPT_REL"
HARNESS_PATH="$WORKSPACE_ROOT/$HARNESS_REL"
REGISTRY_PATH="$WORKSPACE_ROOT/$REGISTRY_REL"
ANALYZER_PATH="$WORKSPACE_ROOT/$ANALYZER_REL"
VALIDATOR_PATH="$WORKSPACE_ROOT/$VALIDATOR_REL"
BINDING_JSON_OUT="$EVIDENCE_DIR/rev13-r3-version-binding.json"

for p in "$SCRIPT_PATH" "$HARNESS_PATH" "$REGISTRY_PATH" "$ANALYZER_PATH" "$VALIDATOR_PATH"; do
  [[ -f "$p" ]] || { echo "[-] FATAL: Required artifact missing: $p" >&2; exit 1; }
done

# locate shellcheck binary (may be in non-standard path)
SHELLCHECK_BIN="${SHELLCHECK_BIN:-/home/user/.local/bin/shellcheck}"
command -v "$SHELLCHECK_BIN" >/dev/null 2>&1 || SHELLCHECK_BIN="shellcheck"

# ── 2. 运行沙箱与状态账本 ────────────────────────────────────────────────────
RUN_DIR="$(mktemp -d -t heartmirror-r311-XXXXXX)"
STDOUT_LOG="$RUN_DIR/raw_stdout.log"
STDERR_LOG="$RUN_DIR/raw_stderr.log"

STATUS_BASH_N="NOT_RUN"
STATUS_SHELLCHECK="NOT_RUN"
STATUS_REGISTRY="NOT_RUN"
STATUS_SELFTEST="NOT_RUN"
STATUS_CLOSURE="NOT_RUN"
STATUS_SCRIPT_BLOB="NOT_RUN"
STATUS_HARNESS_BLOB="NOT_RUN"
STATUS_TEMPORAL="NOT_RUN"
STATUS_BINDING_WRITE="NOT_RUN"

HARNESS_PASSED=0

# ── 3. 统一退出漏斗 ─────────────────────────────────────────────────────────
cleanup_and_funnel() {
  local exit_rc=$?
  trap - EXIT
  if [[ "$HARNESS_PASSED" -ne 1 || "$exit_rc" -ne 0 ]]; then
    echo "" >&2
    echo "[-] ================================================================" >&2
    echo "[-] FATAL: HARNESS FUNNEL INTERCEPTED FAILURE (rc=$exit_rc)" >&2
    echo "[-] Stage ledger:" >&2
    echo "[-]   BASH_N=$STATUS_BASH_N  SHELLCHECK=$STATUS_SHELLCHECK  REGISTRY=$STATUS_REGISTRY" >&2
    echo "[-]   SELFTEST=$STATUS_SELFTEST  CLOSURE=$STATUS_CLOSURE" >&2
    echo "[-]   SCRIPT_BLOB=$STATUS_SCRIPT_BLOB  HARNESS_BLOB=$STATUS_HARNESS_BLOB" >&2
    echo "[-]   TEMPORAL=$STATUS_TEMPORAL  BINDING_WRITE=$STATUS_BINDING_WRITE" >&2
    echo "[-] ================================================================" >&2
    rm -rf "$RUN_DIR"
    exit 1
  fi
  rm -rf "$RUN_DIR"
  echo "[+] HARNESS EXECUTION FULLY SEALED (rc=0)"
  exit 0
}
trap cleanup_and_funnel EXIT

# ── 4. 原子写入 Binding JSON ────────────────────────────────────────────────
atomic_write_binding() {
  local target="$1"
  local tmp
  tmp="$(mktemp -p "$RUN_DIR" binding-atomic-XXXXXX.json)"
  # jq 渲染
  jq -n \
    --arg engine_version "$AUDIT_ENGINE_VERSION" \
    --arg head_commit "$HEAD_COMMIT" \
    --arg script_rel "$SCRIPT_REL" \
    --arg script_sha "$SCRIPT_SHA" \
    --arg script_blob_oid "$SCRIPT_BLOB_OID" \
    --arg script_blob_type "$SCRIPT_BLOB_TYPE" \
    --arg harness_rel "$HARNESS_REL" \
    --arg harness_sha "$HARNESS_SHA" \
    --arg harness_blob_oid "$HARNESS_BLOB_OID" \
    --arg harness_blob_type "$HARNESS_BLOB_TYPE" \
    --arg status_bash_n "$STATUS_BASH_N" \
    --arg status_shellcheck "$STATUS_SHELLCHECK" \
    --arg status_registry "$STATUS_REGISTRY" \
    --arg status_selftest "$STATUS_SELFTEST" \
    --arg status_closure "$STATUS_CLOSURE" \
    --arg status_script_blob "$STATUS_SCRIPT_BLOB" \
    --arg status_harness_blob "$STATUS_HARNESS_BLOB" \
    --arg status_temporal "$STATUS_TEMPORAL" \
    --arg exec_start "$EXEC_START" \
    --arg exec_end "$EXEC_END" \
    --arg stdout_sha "$(sha256sum "$STDOUT_LOG" | awk '{print $1}')" \
    --arg stderr_sha "$(sha256sum "$STDERR_LOG" | awk '{print $1}')" \
    '{
      audit_engine_version: $engine_version,
      head_commit_at_source_freeze: $head_commit,
      identities: {
        script:  { rel_path: $script_rel,  content_sha256: $script_sha,  blob_oid: $script_blob_oid,  blob_type: $script_blob_type },
        harness: { rel_path: $harness_rel, content_sha256: $harness_sha, blob_oid: $harness_blob_oid, blob_type: $harness_blob_type }
      },
      verification_matrix: {
        bash_n: $status_bash_n, shellcheck: $status_shellcheck,
        registry_validator: $status_registry, selftest: $status_selftest,
        closure_analyzer: $status_closure, script_blob: $status_script_blob,
        harness_blob: $status_harness_blob, temporal_invariance: $status_temporal
      },
      evidence_telemetry: {
        execution_start: $exec_start, execution_end: $exec_end,
        stdout_sha256: $stdout_sha, stderr_sha256: $stderr_sha
      },
      funnel_verdict: "PASS"
    }' > "$tmp" || return 1
  # JSON 语法复核
  jq empty "$tmp" 2>/dev/null || return 1
  # 原子移动
  mv -f "$tmp" "$target" || return 1
  return 0
}

# ── 5. 阶段 A：静态语法与类型检查 ───────────────────────────────────────────
bash -n "$SCRIPT_PATH" && bash -n "$HARNESS_PATH" && STATUS_BASH_N="PASS" \
  || { STATUS_BASH_N="FAIL"; HARNESS_PASSED=0; }

"$SHELLCHECK_BIN" -x "$SCRIPT_PATH" "$HARNESS_PATH" && STATUS_SHELLCHECK="PASS" \
  || { STATUS_SHELLCHECK="FAIL"; HARNESS_PASSED=0; }

python3 "$VALIDATOR_PATH" "$REGISTRY_PATH" "$SCRIPT_PATH" && STATUS_REGISTRY="PASS" \
  || { STATUS_REGISTRY="FAIL"; HARNESS_PASSED=0; }

# ── 6. 阶段 B：Git Blob 类型 + OID 对账 ─────────────────────────────────────
HEAD_COMMIT="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
SCRIPT_SHA="$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')"
HARNESS_SHA="$(sha256sum "$HARNESS_PATH" | awk '{print $1}')"

SCRIPT_BLOB_TYPE="$(git -C "$WORKSPACE_ROOT" cat-file -t "HEAD:$SCRIPT_REL" 2>/dev/null || echo 'MISSING')"
HARNESS_BLOB_TYPE="$(git -C "$WORKSPACE_ROOT" cat-file -t "HEAD:$HARNESS_REL" 2>/dev/null || echo 'MISSING')"
SCRIPT_BLOB_OID="$(git -C "$WORKSPACE_ROOT" rev-parse "HEAD:$SCRIPT_REL" 2>/dev/null || echo 'MISSING')"
HARNESS_BLOB_OID="$(git -C "$WORKSPACE_ROOT" rev-parse "HEAD:$HARNESS_REL" 2>/dev/null || echo 'MISSING')"

[[ "$SCRIPT_BLOB_TYPE" == "blob" ]] && STATUS_SCRIPT_BLOB="PASS" \
  || { STATUS_SCRIPT_BLOB="FAIL($SCRIPT_BLOB_TYPE)"; HARNESS_PASSED=0; }
[[ "$HARNESS_BLOB_TYPE" == "blob" ]] && STATUS_HARNESS_BLOB="PASS" \
  || { STATUS_HARNESS_BLOB="FAIL($HARNESS_BLOB_TYPE)"; HARNESS_PASSED=0; }

# ── 7. 阶段 C：物理执行自测套件 ─────────────────────────────────────────────
EXEC_START="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TEST_RC=0
bash "$SCRIPT_PATH" --selftest > "$STDOUT_LOG" 2> "$STDERR_LOG" || TEST_RC=$?
EXEC_END="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
[[ "$TEST_RC" -eq 0 ]] && STATUS_SELFTEST="PASS" || { STATUS_SELFTEST="FAIL(rc=$TEST_RC)"; HARNESS_PASSED=0; }

# ── 8. 阶段 D：闭包状态机分析 ───────────────────────────────────────────────
python3 "$ANALYZER_PATH" "$STDOUT_LOG" "$STDERR_LOG" "$REGISTRY_PATH" && STATUS_CLOSURE="PASS" \
  || { STATUS_CLOSURE="FAIL"; HARNESS_PASSED=0; }

# ── 9. 阶段 E：时序不变性二次断言 ───────────────────────────────────────────
HEAD_AFTER="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
SCRIPT_SHA_AFTER="$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')"
HARNESS_SHA_AFTER="$(sha256sum "$HARNESS_PATH" | awk '{print $1}')"
if [[ "$HEAD_COMMIT" == "$HEAD_AFTER" && "$SCRIPT_SHA" == "$SCRIPT_SHA_AFTER" && "$HARNESS_SHA" == "$HARNESS_SHA_AFTER" ]]; then
  STATUS_TEMPORAL="PASS"
else
  STATUS_TEMPORAL="FAIL"; HARNESS_PASSED=0
fi

# ── 10. 阶段 F：原子化生成 Binding JSON ─────────────────────────────────────
atomic_write_binding "$BINDING_JSON_OUT" && STATUS_BINDING_WRITE="PASS" \
  || { STATUS_BINDING_WRITE="FAIL"; HARNESS_PASSED=0; }

# ── 11. 显式授予通过标记 ────────────────────────────────────────────────────
if [[ "$STATUS_BASH_N" == "PASS" && "$STATUS_SHELLCHECK" == "PASS" && \
      "$STATUS_REGISTRY" == "PASS" && "$STATUS_SELFTEST" == "PASS" && \
      "$STATUS_CLOSURE" == "PASS" && "$STATUS_SCRIPT_BLOB" == "PASS" && \
      "$STATUS_HARNESS_BLOB" == "PASS" && "$STATUS_TEMPORAL" == "PASS" && \
      "$STATUS_BINDING_WRITE" == "PASS" ]]; then
  HARNESS_PASSED=1
  echo "[+] All 9 stages PASS"
  echo "[+]   bash_n=$STATUS_BASH_N  shellcheck=$STATUS_SHELLCHECK  registry=$STATUS_REGISTRY"
  echo "[+]   selftest=$STATUS_SELFTEST  closure=$STATUS_CLOSURE"
  echo "[+]   script_blob=$STATUS_SCRIPT_BLOB (type=$SCRIPT_BLOB_TYPE oid=${SCRIPT_BLOB_OID:0:12})"
  echo "[+]   harness_blob=$STATUS_HARNESS_BLOB (type=$HARNESS_BLOB_TYPE oid=${HARNESS_BLOB_OID:0:12})"
  echo "[+]   temporal=$STATUS_TEMPORAL  binding_write=$STATUS_BINDING_WRITE"
fi

# trap EXIT 将处理最终退出
