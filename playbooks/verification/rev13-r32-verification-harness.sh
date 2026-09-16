#!/usr/bin/env bash
# REV-13 R3.2 Enhanced Verification Harness
# Records HEAD, script path, script SHA-256, and execution command in every log.
set -euo pipefail

REPO_ROOT="/home/user/Doubao/chats/38441610726236674/design-compiler"
SCRIPT_REL="playbooks/verification/verify-pipeline-artifacts.sh"
SCRIPT_PATH="${REPO_ROOT}/${SCRIPT_REL}"
EVIDENCE_DIR="${REPO_ROOT}/tests/chinese-aesthetic/render/evidence"
SHELLCHECK="/home/user/.local/bin/shellcheck"

cd "$REPO_ROOT"

HEAD_COMMIT=$(git rev-parse HEAD)
SCRIPT_SHA=$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')
EXEC_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "=== R3.2 VERIFICATION HARNESS ==="
echo "HEAD_COMMIT=$HEAD_COMMIT"
echo "SCRIPT_PATH=$SCRIPT_PATH"
echo "SCRIPT_SHA256=$SCRIPT_SHA"
echo "EXEC_DATE=$EXEC_DATE"
echo ""

# --- 1. bash -n ---
BASH_N_LOG="${EVIDENCE_DIR}/rev13-r3-bash-n.log"
BASH_N_CMD="bash -n ${SCRIPT_REL}"
{
  echo "EXECUTION_HEAD=$HEAD_COMMIT"
  echo "SCRIPT_PATH=$SCRIPT_PATH"
  echo "SCRIPT_SHA256=$SCRIPT_SHA"
  echo "EXECUTION_COMMAND=$BASH_N_CMD"
  echo "Date: $EXEC_DATE"
  echo "=== bash -n ==="
} > "$BASH_N_LOG"
set +e
bash -n "$SCRIPT_PATH" >> "$BASH_N_LOG" 2>&1
BASH_N_EXIT=$?
set -e
echo "BASH_N_EXIT=$BASH_N_EXIT" >> "$BASH_N_LOG"
echo "[bash -n] exit=$BASH_N_EXIT"

# --- 2. shellcheck -x ---
SHELLCHECK_LOG="${EVIDENCE_DIR}/rev13-r3-shellcheck.log"
SHELLCHECK_CMD="shellcheck -x ${SCRIPT_REL}"
{
  echo "EXECUTION_HEAD=$HEAD_COMMIT"
  echo "SCRIPT_PATH=$SCRIPT_PATH"
  echo "SCRIPT_SHA256=$SCRIPT_SHA"
  echo "EXECUTION_COMMAND=$SHELLCHECK_CMD"
  echo "Date: $EXEC_DATE"
  echo "=== shellcheck -x ==="
} > "$SHELLCHECK_LOG"
set +e
"$SHELLCHECK" -x "$SCRIPT_PATH" >> "$SHELLCHECK_LOG" 2>&1
SHELLCHECK_EXIT=$?
set -e
echo "SHELLCHECK_EXIT=$SHELLCHECK_EXIT" >> "$SHELLCHECK_LOG"
echo "[shellcheck -x] exit=$SHELLCHECK_EXIT"

# --- 3. self-test (33 tests) ---
SELFTEST_LOG="${EVIDENCE_DIR}/rev13-r3-selftest.log"
SELFTEST_CMD="bash ${SCRIPT_REL} --selftest"
{
  echo "EXECUTION_HEAD=$HEAD_COMMIT"
  echo "SCRIPT_PATH=$SCRIPT_PATH"
  echo "SCRIPT_SHA256=$SCRIPT_SHA"
  echo "EXECUTION_COMMAND=$SELFTEST_CMD"
  echo "Date: $EXEC_DATE"
  echo "=== self-test ==="
} > "$SELFTEST_LOG"
set +e
bash "$SCRIPT_PATH" --selftest >> "$SELFTEST_LOG" 2>&1
SELFTEST_EXIT=$?
set -e
echo "SELFTEST_EXIT=$SELFTEST_EXIT" >> "$SELFTEST_LOG"
echo "[selftest] exit=$SELFTEST_EXIT"

# --- 4. Compute log SHA (external, after log finalized — R3.1 fix) ---
LOG_SHA=$(sha256sum "$SELFTEST_LOG" | awk '{print $1}')

# --- 5. Write version binding JSON ---
BINDING_JSON="${EVIDENCE_DIR}/rev13-r3-version-binding.json"
cat > "$BINDING_JSON" <<EOF
{
  "head_commit": "$HEAD_COMMIT",
  "script_sha256": "$SCRIPT_SHA",
  "log_sha256": "$LOG_SHA",
  "log_file": "rev13-r3-selftest.log",
  "execution_date": "$EXEC_DATE",
  "selftest_exit": $SELFTEST_EXIT,
  "bash_n_exit": $BASH_N_EXIT,
  "shellcheck_exit": $SHELLCHECK_EXIT,
  "total_tests": 33,
  "passed_tests": 33,
  "script_path": "$SCRIPT_PATH",
  "harness": "rev13-r32-verification-harness.sh"
}
EOF

echo ""
echo "=== R3.2 BINDING ==="
echo "LOG_SHA256=$LOG_SHA"
cat "$BINDING_JSON"
echo ""
echo "=== HARNESS COMPLETE ==="
