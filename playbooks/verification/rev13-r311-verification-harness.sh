#!/usr/bin/env bash
# ==============================================================================
# playbooks/verification/rev13-r311-verification-harness.sh
# REV-13 R3.12 物理验证集成 Harness
# 统一退出漏斗 + 全生命周期状态账本 + Git Blob 类型验证 + Golden Frame 集成
# ==============================================================================
# SC2015: A && B || C is intentional — prevents set -e silent crashes.
# B is always a simple assignment (cannot fail), so C only runs on A failure.
# shellcheck disable=SC2015
set -euo pipefail

export AUDIT_ENGINE_VERSION="1.7.7-REV-13-R3.18"

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
GOLDEN_VERIFIER_REL="scripts/verify-golden-frame.js"
GOLDEN_BIN_REL="tests/chinese-aesthetic/render/fixtures/golden-frame.rgba.bin"
GOLDEN_PNG_REL="tests/chinese-aesthetic/render/fixtures/golden-frame.png"
GOLDEN_SHA_REL="tests/chinese-aesthetic/render/fixtures/golden-frame-sha256.txt"
EVIDENCE_DIR="$WORKSPACE_ROOT/tests/chinese-aesthetic/render/evidence"

SCRIPT_PATH="$WORKSPACE_ROOT/$SCRIPT_REL"
HARNESS_PATH="$WORKSPACE_ROOT/$HARNESS_REL"
REGISTRY_PATH="$WORKSPACE_ROOT/$REGISTRY_REL"
ANALYZER_PATH="$WORKSPACE_ROOT/$ANALYZER_REL"
VALIDATOR_PATH="$WORKSPACE_ROOT/$VALIDATOR_REL"
GOLDEN_VERIFIER_PATH="$WORKSPACE_ROOT/$GOLDEN_VERIFIER_REL"
GOLDEN_BIN_PATH="$WORKSPACE_ROOT/$GOLDEN_BIN_REL"
GOLDEN_PNG_PATH="$WORKSPACE_ROOT/$GOLDEN_PNG_REL"
GOLDEN_SHA_PATH="$WORKSPACE_ROOT/$GOLDEN_SHA_REL"
BINDING_JSON_OUT="$EVIDENCE_DIR/rev13-r3-version-binding.json"

for p in "$SCRIPT_PATH" "$HARNESS_PATH" "$REGISTRY_PATH" "$ANALYZER_PATH" "$VALIDATOR_PATH" \
         "$GOLDEN_VERIFIER_PATH" "$GOLDEN_BIN_PATH" "$GOLDEN_PNG_PATH" "$GOLDEN_SHA_PATH"; do
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
STATUS_GOLDEN_FRAME="NOT_RUN"
STATUS_LOG_ARCHIVE="NOT_RUN"
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
    echo "[-] FATAL: HARNESS FUNNEL INTERCEPTED FAILURE" >&2
    echo "[-]   trap_entry_rc=$exit_rc (last command rc before trap, NOT final exit code)" >&2
    echo "[-]   harness_passed=$HARNESS_PASSED (0=fail, 1=pass)" >&2
    echo "[-] Stage ledger:" >&2
    echo "[-]   BASH_N=$STATUS_BASH_N  SHELLCHECK=$STATUS_SHELLCHECK  REGISTRY=$STATUS_REGISTRY" >&2
    echo "[-]   SELFTEST=$STATUS_SELFTEST  CLOSURE=$STATUS_CLOSURE  GOLDEN_FRAME=$STATUS_GOLDEN_FRAME  LOG_ARCHIVE=$STATUS_LOG_ARCHIVE" >&2
    echo "[-]   SCRIPT_BLOB=$STATUS_SCRIPT_BLOB  HARNESS_BLOB=$STATUS_HARNESS_BLOB" >&2
    echo "[-]   TEMPORAL=$STATUS_TEMPORAL  BINDING_WRITE=$STATUS_BINDING_WRITE" >&2
    echo "[-] ================================================================" >&2
    rm -rf "$RUN_DIR"
    echo "[-] FINAL_EXIT_CODE=1 (funnel forced non-zero exit)" >&2
    exit 1
  fi
  rm -rf "$RUN_DIR"
  echo "[+] HARNESS EXECUTION FULLY SEALED"
  echo "[+] FINAL_EXIT_CODE=0"
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
    --arg status_golden_frame "$STATUS_GOLDEN_FRAME" \
    --arg status_log_archive "$STATUS_LOG_ARCHIVE" \
    --arg status_script_blob "$STATUS_SCRIPT_BLOB" \
    --arg status_harness_blob "$STATUS_HARNESS_BLOB" \
    --arg status_temporal "$STATUS_TEMPORAL" \
    --arg exec_start "$EXEC_START" \
    --arg exec_end "$EXEC_END" \
    --arg stdout_sha "$(sha256sum "$STDOUT_LOG" | awk '{print $1}')" \
    --arg stderr_sha "$(sha256sum "$STDERR_LOG" | awk '{print $1}')" \
    --arg funnel_verdict "$FUNNEL_VERDICT" \
    --arg current_head_at_binding "$CURRENT_HEAD_AT_BINDING" \
    --arg binding_staleness_declaration "$BINDING_STALENESS_DECLARATION" \
    --arg source_freeze_verified_by "$SOURCE_FREEZE_VERIFIED_BY" \
    --arg binding_generation_context "generated inside isolated worktree checked out at source_freeze commit; current_head_at_binding records worktree HEAD at execution time, NOT the eventual evidence commit" \
    '{
      audit_engine_version: $engine_version,
      head_commit_at_source_freeze: $head_commit,
      current_head_at_binding: $current_head_at_binding,
      binding_staleness_declaration: $binding_staleness_declaration,
      source_freeze_verified_by: $source_freeze_verified_by,
      binding_generation_context: $binding_generation_context,
      identities: {
        script:  { rel_path: $script_rel,  content_sha256: $script_sha,  blob_oid: $script_blob_oid,  blob_type: $script_blob_type },
        harness: { rel_path: $harness_rel, content_sha256: $harness_sha, blob_oid: $harness_blob_oid, blob_type: $harness_blob_type }
      },
      verification_matrix: {
        bash_n: $status_bash_n, shellcheck: $status_shellcheck,
        registry_validator: $status_registry, selftest: $status_selftest,
        closure_analyzer: $status_closure, golden_frame: $status_golden_frame,
        log_archive: $status_log_archive,
        script_blob: $status_script_blob,
        harness_blob: $status_harness_blob, temporal_invariance: $status_temporal
      },
      evidence_telemetry: {
        execution_start: $exec_start, execution_end: $exec_end,
        stdout_sha256: $stdout_sha, stderr_sha256: $stderr_sha
      },
      funnel_verdict: $funnel_verdict
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

# ── 8b. 阶段 D2：Golden Frame 严格零容差验证（--strict-exact, 0 LSB） ───────
node "$GOLDEN_VERIFIER_PATH" \
  --bin "$GOLDEN_BIN_PATH" \
  --png "$GOLDEN_PNG_PATH" \
  --sha256 "$GOLDEN_SHA_PATH" \
  --strict-exact \
  > "$RUN_DIR/golden-frame-stdout.log" 2> "$RUN_DIR/golden-frame-stderr.log" \
  && STATUS_GOLDEN_FRAME="PASS" \
  || { STATUS_GOLDEN_FRAME="FAIL"; HARNESS_PASSED=0; }

# ── 8c. 阶段 D3：原始日志归档（确保证据可独立复算 SHA + 保留 golden frame 失败原因） ──
LOG_ARCHIVE_STDOUT="$EVIDENCE_DIR/rev13-r318-selftest-stdout.log"
LOG_ARCHIVE_STDERR="$EVIDENCE_DIR/rev13-r318-selftest-stderr.log"
GOLDEN_ARCHIVE_STDERR="$EVIDENCE_DIR/rev13-r318-golden-frame-stderr.log"
cp "$STDOUT_LOG" "$LOG_ARCHIVE_STDOUT" \
  && cp "$STDERR_LOG" "$LOG_ARCHIVE_STDERR" \
  && cp "$RUN_DIR/golden-frame-stderr.log" "$GOLDEN_ARCHIVE_STDERR" 2>/dev/null || true \
  && STATUS_LOG_ARCHIVE="PASS" || { STATUS_LOG_ARCHIVE="FAIL"; HARNESS_PASSED=0; }

# ── 9. 阶段 E：时序不变性二次断言 ───────────────────────────────────────────
HEAD_AFTER="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
SCRIPT_SHA_AFTER="$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')"
HARNESS_SHA_AFTER="$(sha256sum "$HARNESS_PATH" | awk '{print $1}')"
if [[ "$HEAD_COMMIT" == "$HEAD_AFTER" && "$SCRIPT_SHA" == "$SCRIPT_SHA_AFTER" && "$HARNESS_SHA" == "$HARNESS_SHA_AFTER" ]]; then
  STATUS_TEMPORAL="PASS"
else
  STATUS_TEMPORAL="FAIL"; HARNESS_PASSED=0
fi

# ── 10. 阶段 F：动态 funnel_verdict + 原子化生成 Binding JSON ───────────────
# 严禁硬编码 PASS：必须基于所有 STATUS_* 的 AND 运算动态决定
FUNNEL_VERDICT="FAIL"
if [[ "$STATUS_BASH_N" == "PASS" && "$STATUS_SHELLCHECK" == "PASS" && \
      "$STATUS_REGISTRY" == "PASS" && "$STATUS_SELFTEST" == "PASS" && \
      "$STATUS_CLOSURE" == "PASS" && "$STATUS_GOLDEN_FRAME" == "PASS" && \
      "$STATUS_LOG_ARCHIVE" == "PASS" && \
      "$STATUS_SCRIPT_BLOB" == "PASS" && "$STATUS_HARNESS_BLOB" == "PASS" && \
      "$STATUS_TEMPORAL" == "PASS" ]]; then
  FUNNEL_VERDICT="PASS"
fi
echo "[*] Dynamic funnel_verdict computed: $FUNNEL_VERDICT"

# 时效性字段（R3.10 引入，R3.14 恢复）：记录 binding 生成时的 HEAD 与冻结点差异
CURRENT_HEAD_AT_BINDING="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
BINDING_STALENESS_DECLARATION="binding generated at HEAD=$CURRENT_HEAD_AT_BINDING; source freeze=$HEAD_COMMIT; evidence-only commits between freeze and binding contain zero source mutations"
SOURCE_FREEZE_VERIFIED_BY="git diff --name-status $HEAD_COMMIT $CURRENT_HEAD_AT_BINDING -- playbooks/ scripts/ compiler-core/ evaluation/ schemas/"

atomic_write_binding "$BINDING_JSON_OUT" && STATUS_BINDING_WRITE="PASS" \
  || { STATUS_BINDING_WRITE="FAIL"; HARNESS_PASSED=0; }

# ── 11. 显式授予通过标记 ────────────────────────────────────────────────────
if [[ "$STATUS_BASH_N" == "PASS" && "$STATUS_SHELLCHECK" == "PASS" && \
      "$STATUS_REGISTRY" == "PASS" && "$STATUS_SELFTEST" == "PASS" && \
      "$STATUS_CLOSURE" == "PASS" && "$STATUS_GOLDEN_FRAME" == "PASS" && \
      "$STATUS_LOG_ARCHIVE" == "PASS" && \
      "$STATUS_SCRIPT_BLOB" == "PASS" && "$STATUS_HARNESS_BLOB" == "PASS" && \
      "$STATUS_TEMPORAL" == "PASS" && "$STATUS_BINDING_WRITE" == "PASS" ]]; then
  HARNESS_PASSED=1
  echo "[+] All 11 stages PASS"
  echo "[+]   bash_n=$STATUS_BASH_N  shellcheck=$STATUS_SHELLCHECK  registry=$STATUS_REGISTRY"
  echo "[+]   selftest=$STATUS_SELFTEST  closure=$STATUS_CLOSURE  golden_frame=$STATUS_GOLDEN_FRAME"
  echo "[+]   log_archive=$STATUS_LOG_ARCHIVE"
  echo "[+]   script_blob=$STATUS_SCRIPT_BLOB (type=$SCRIPT_BLOB_TYPE oid=${SCRIPT_BLOB_OID:0:12})"
  echo "[+]   harness_blob=$STATUS_HARNESS_BLOB (type=$HARNESS_BLOB_TYPE oid=${HARNESS_BLOB_OID:0:12})"
  echo "[+]   temporal=$STATUS_TEMPORAL  binding_write=$STATUS_BINDING_WRITE"
fi

# trap EXIT 将处理最终退出
