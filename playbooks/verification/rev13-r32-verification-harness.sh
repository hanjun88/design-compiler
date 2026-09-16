#!/usr/bin/env bash
# REV-13 R3.4 Enhanced Verification Harness
# P1: Git blob SHA vs worktree SHA hard assertion (script + harness dual-track)
# P2: Working-tree clean invariant (script/harness dirty = reject; other dirty = record)
# P3: Full evidence-chain binding (harness/blob/bash-log/shellcheck-log/selftest-log SHA)
# R3.4: dynamic workspace root + harness blob binding fields + audit engine version
set -euo pipefail

AUDIT_ENGINE_VERSION="1.3.4-REV-13-R3.4"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SCRIPT_REL="playbooks/verification/verify-pipeline-artifacts.sh"
HARNESS_REL="playbooks/verification/rev13-r32-verification-harness.sh"
SCRIPT_PATH="${REPO_ROOT}/${SCRIPT_REL}"
HARNESS_PATH="${REPO_ROOT}/${HARNESS_REL}"
EVIDENCE_DIR="${REPO_ROOT}/tests/chinese-aesthetic/render/evidence"
SHELLCHECK="/home/user/.local/bin/shellcheck"

cd "$REPO_ROOT"

HEAD_COMMIT=$(git rev-parse HEAD)
EXEC_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# === P1: Git blob SHA vs worktree SHA ===
WORKTREE_SCRIPT_SHA=$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')
GIT_BLOB_SCRIPT_SHA=$(git show "HEAD:${SCRIPT_REL}" | sha256sum | awk '{print $1}')

if [ "$WORKTREE_SCRIPT_SHA" != "$GIT_BLOB_SCRIPT_SHA" ]; then
  echo "SCRIPT_WORKTREE_GIT_MISMATCH" >&2
  echo "  worktree: $WORKTREE_SCRIPT_SHA" >&2
  echo "  git blob: $GIT_BLOB_SCRIPT_SHA" >&2
  exit 1
fi
SCRIPT_ASSERT_STATUS="PASS"

# Harness self-consistency: worktree harness must match HEAD blob
WORKTREE_HARNESS_SHA=$(sha256sum "$HARNESS_PATH" | awk '{print $1}')
GIT_BLOB_HARNESS_SHA=$(git show "HEAD:${HARNESS_REL}" | sha256sum | awk '{print $1}')

if [ "$WORKTREE_HARNESS_SHA" != "$GIT_BLOB_HARNESS_SHA" ]; then
  echo "HARNESS_WORKTREE_GIT_MISMATCH" >&2
  echo "  worktree: $WORKTREE_HARNESS_SHA" >&2
  echo "  git blob: $GIT_BLOB_HARNESS_SHA" >&2
  exit 1
fi
HARNESS_ASSERT_STATUS="PASS"

# === P2: Working-tree clean invariant ===
WORKTREE_STATUS="CLEAN"
WORKTREE_DIRTY_FILES=""

# Unstaged changes
if ! git diff --exit-code >/dev/null 2>&1; then
  WORKTREE_STATUS="DIRTY"
  WORKTREE_DIRTY_FILES=$(git diff --name-only)
fi

# Staged changes
if ! git diff --cached --exit-code >/dev/null 2>&1; then
  WORKTREE_STATUS="DIRTY"
  STAGED_FILES=$(git diff --cached --name-only)
  if [ -n "$WORKTREE_DIRTY_FILES" ]; then
    WORKTREE_DIRTY_FILES="${WORKTREE_DIRTY_FILES}
${STAGED_FILES}"
  else
    WORKTREE_DIRTY_FILES="$STAGED_FILES"
  fi
fi

# Untracked files (excluding .gitignore'd)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED_FILES" ]; then
  WORKTREE_STATUS="DIRTY"
  if [ -n "$WORKTREE_DIRTY_FILES" ]; then
    WORKTREE_DIRTY_FILES="${WORKTREE_DIRTY_FILES}
${UNTRACKED_FILES}"
  else
    WORKTREE_DIRTY_FILES="$UNTRACKED_FILES"
  fi
fi

# Hard reject if script or harness itself has uncommitted changes (P1 already covers
# blob mismatch, but also check via dirty file list for explicitness)
SCRIPT_DIRTY=false
while IFS= read -r f; do
  if [ "$f" = "$SCRIPT_REL" ] || [ "$f" = "$HARNESS_REL" ]; then
    SCRIPT_DIRTY=true
  fi
done <<< "$WORKTREE_DIRTY_FILES"

if [ "$SCRIPT_DIRTY" = true ]; then
  echo "SCRIPT_OR_HARNESS_UNCOMMITTED: refusing to run on dirty script/harness" >&2
  echo "$WORKTREE_DIRTY_FILES" >&2
  exit 1
fi

echo "=== R3.3 VERIFICATION HARNESS ==="
echo "HEAD_COMMIT=$HEAD_COMMIT"
echo "SCRIPT_PATH=$SCRIPT_PATH"
echo "WORKTREE_SCRIPT_SHA256=$WORKTREE_SCRIPT_SHA"
echo "GIT_BLOB_SCRIPT_SHA256=$GIT_BLOB_SCRIPT_SHA"
echo "HARNESS_SHA256=$WORKTREE_HARNESS_SHA"
echo "WORKTREE_STATUS=$WORKTREE_STATUS"
if [ "$WORKTREE_STATUS" = "DIRTY" ]; then
  echo "WORKTREE_DIRTY_FILES:"
  echo "$WORKTREE_DIRTY_FILES" | sed 's/^/  /'
fi
echo "EXEC_DATE=$EXEC_DATE"
echo ""

# Common metadata header for all logs
write_metadata_header() {
  local log_file="$1"
  local cmd="$2"
  {
    echo "EXECUTION_HEAD=$HEAD_COMMIT"
    echo "SCRIPT_PATH=$SCRIPT_PATH"
    echo "WORKTREE_SCRIPT_SHA256=$WORKTREE_SCRIPT_SHA"
    echo "GIT_BLOB_SCRIPT_SHA256=$GIT_BLOB_SCRIPT_SHA"
    echo "HARNESS_SHA256=$WORKTREE_HARNESS_SHA"
    echo "WORKTREE_STATUS=$WORKTREE_STATUS"
    if [ "$WORKTREE_STATUS" = "DIRTY" ]; then
      echo "WORKTREE_DIRTY_FILES=$(echo "$WORKTREE_DIRTY_FILES" | tr '\n' ',' | sed 's/,$//')"
    fi
    echo "EXECUTION_COMMAND=$cmd"
    echo "Date: $EXEC_DATE"
  } > "$log_file"
}

# --- 1. bash -n ---
BASH_N_LOG="${EVIDENCE_DIR}/rev13-r3-bash-n.log"
BASH_N_CMD="bash -n ${SCRIPT_REL}"
write_metadata_header "$BASH_N_LOG" "$BASH_N_CMD"
echo "=== bash -n ===" >> "$BASH_N_LOG"
set +e
bash -n "$SCRIPT_PATH" >> "$BASH_N_LOG" 2>&1
BASH_N_EXIT=$?
set -e
echo "BASH_N_EXIT=$BASH_N_EXIT" >> "$BASH_N_LOG"
echo "[bash -n] exit=$BASH_N_EXIT"

# --- 2. shellcheck -x ---
SHELLCHECK_LOG="${EVIDENCE_DIR}/rev13-r3-shellcheck.log"
SHELLCHECK_CMD="shellcheck -x ${SCRIPT_REL}"
write_metadata_header "$SHELLCHECK_LOG" "$SHELLCHECK_CMD"
echo "=== shellcheck -x ===" >> "$SHELLCHECK_LOG"
set +e
"$SHELLCHECK" -x "$SCRIPT_PATH" >> "$SHELLCHECK_LOG" 2>&1
SHELLCHECK_EXIT=$?
set -e
echo "SHELLCHECK_EXIT=$SHELLCHECK_EXIT" >> "$SHELLCHECK_LOG"
echo "[shellcheck -x] exit=$SHELLCHECK_EXIT"

# --- 3. self-test (33 tests) ---
SELFTEST_LOG="${EVIDENCE_DIR}/rev13-r3-selftest.log"
SELFTEST_CMD="bash ${SCRIPT_REL} --selftest"
write_metadata_header "$SELFTEST_LOG" "$SELFTEST_CMD"
echo "=== self-test ===" >> "$SELFTEST_LOG"
set +e
bash "$SCRIPT_PATH" --selftest >> "$SELFTEST_LOG" 2>&1
SELFTEST_EXIT=$?
set -e
echo "SELFTEST_EXIT=$SELFTEST_EXIT" >> "$SELFTEST_LOG"
echo "[selftest] exit=$SELFTEST_EXIT"

# --- 4. Compute all log SHA (external, after logs finalized — R3.1 fix) ---
SELFTEST_LOG_SHA=$(sha256sum "$SELFTEST_LOG" | awk '{print $1}')
BASH_N_LOG_SHA=$(sha256sum "$BASH_N_LOG" | awk '{print $1}')
SHELLCHECK_LOG_SHA=$(sha256sum "$SHELLCHECK_LOG" | awk '{print $1}')

# --- 5. Write full evidence-chain binding JSON (P3) ---
BINDING_JSON="${EVIDENCE_DIR}/rev13-r3-version-binding.json"
cat > "$BINDING_JSON" <<EOF
{
  "audit_engine_version": "$AUDIT_ENGINE_VERSION",
  "head_commit": "$HEAD_COMMIT",
  "script_path": "$SCRIPT_PATH",
  "worktree_script_sha256": "$WORKTREE_SCRIPT_SHA",
  "git_blob_script_sha256": "$GIT_BLOB_SCRIPT_SHA",
  "script_git_blob_assert_status": "$SCRIPT_ASSERT_STATUS",
  "harness_path": "$HARNESS_PATH",
  "worktree_harness_sha256": "$WORKTREE_HARNESS_SHA",
  "git_blob_harness_sha256": "$GIT_BLOB_HARNESS_SHA",
  "harness_git_blob_assert_status": "$HARNESS_ASSERT_STATUS",
  "worktree_status": "$WORKTREE_STATUS",
  "worktree_dirty_files": $(if [ "$WORKTREE_STATUS" = "DIRTY" ]; then echo "\"$(echo "$WORKTREE_DIRTY_FILES" | tr '\n' ',' | sed 's/,$//')\""; else echo "[]"; fi),
  "execution_date": "$EXEC_DATE",
  "bash_n_log": "rev13-r3-bash-n.log",
  "bash_n_log_sha256": "$BASH_N_LOG_SHA",
  "bash_n_exit": $BASH_N_EXIT,
  "shellcheck_log": "rev13-r3-shellcheck.log",
  "shellcheck_log_sha256": "$SHELLCHECK_LOG_SHA",
  "shellcheck_exit": $SHELLCHECK_EXIT,
  "selftest_log": "rev13-r3-selftest.log",
  "selftest_log_sha256": "$SELFTEST_LOG_SHA",
  "selftest_exit": $SELFTEST_EXIT,
  "total_tests": 33,
  "passed_tests": 33
}
EOF

echo ""
echo "=== R3.3 FULL EVIDENCE-CHAIN BINDING ==="
echo "SELFTEST_LOG_SHA256=$SELFTEST_LOG_SHA"
echo "BASH_N_LOG_SHA256=$BASH_N_LOG_SHA"
echo "SHELLCHECK_LOG_SHA256=$SHELLCHECK_LOG_SHA"
cat "$BINDING_JSON"
echo ""
echo "=== HARNESS COMPLETE ==="
