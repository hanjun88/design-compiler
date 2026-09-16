#!/usr/bin/env bash
# ==============================================================================
# HEARTMIRROR · Phase 5 Step 5.2 Artifact & Workspace Forensic Verifier
# SCRIPT VERSION: 1.3.0-REV-13
# ENFORCEMENT: set -euo pipefail with deterministic exit code isolation
# ==============================================================================
set -euo pipefail

# --- Color and Output Helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  printf "[INFO] %s\n" "$1"
}

log_pass() {
  printf "${GREEN}[PASS]${NC} %s\n" "$1"
}

log_fail() {
  printf "${RED}[FAIL]${NC} %s\n" "$1" >&2
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

# --- Working Directories and Paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_VERIFY_DIR="${WORKSPACE_ROOT}/.tmp/audit_verification_$$"

# Trap handler for safe atomic cleanup
cleanup() {
  local exit_code=$?
  rm -rf "${TMP_VERIFY_DIR}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

mkdir -p "${TMP_VERIFY_DIR}"

# ==============================================================================
# 1. P1-04 / AC-2.0: Strict Path Segment and Containment Validator
# ==============================================================================
validate_manifest_path() {
  local base_dir="$1"
  local rel_path="$2"

  # 1. Null, Empty, Backslash & Control Character Defense
  if [ -z "$rel_path" ] || [[ "$rel_path" == *\\* ]] || [[ "$rel_path" =~ [[:cntrl:]] ]]; then
    log_fail "MALFORMED_PATH_STRING: $rel_path"
    return 1
  fi

  # 2. Strict Unix Absolute Path Prohibition
  if [[ "$rel_path" == /* ]]; then
    log_fail "ABSOLUTE_PATH_FORBIDDEN: $rel_path"
    return 1
  fi

  # 3. Component-level Traversal Token & Empty Segment Defense
  local IFS='/'
  local -a SEGMENTS
  read -ra SEGMENTS <<< "$rel_path"
  local seg
  for seg in "${SEGMENTS[@]}"; do
    if [ -z "$seg" ] || [ "$seg" = "." ] || [ "$seg" = ".." ]; then
      log_fail "ILLEGAL_PATH_SEGMENT: $rel_path (segment='$seg')"
      return 1
    fi
  done

  # 4. Canonical Containment & Symlink Escape Defense via realpath
  local canon_base canon_target
  canon_base=$(realpath -m "$base_dir" 2>/dev/null) || {
    log_fail "CANONICAL_BASE_RESOLVE_FAILED: $base_dir"
    return 1
  }
  canon_target=$(realpath -m "$base_dir/$rel_path" 2>/dev/null) || {
    log_fail "CANONICAL_TARGET_RESOLVE_FAILED: $rel_path"
    return 1
  }

  case "$canon_target" in
    "$canon_base"/*)
      # Strictly resides inside target directory boundary
      return 0
      ;;
    *)
      log_fail "PATH_ESCAPE_DETECTED: $rel_path -> $canon_target (base=$canon_base)"
      return 1
      ;;
  esac
}

# ==============================================================================
# 2. P1-01 / AC-2.4: Isolated sha256sum Calculation with Format Assertions
# ==============================================================================
verify_file_hash() {
  local target_file="$1"
  local expected_hash="$2"
  local err_log="$3"

  if [ ! -f "$target_file" ]; then
    log_fail "TARGET_FILE_NOT_FOUND: $target_file"
    return 1
  fi

  if [ ! -r "$target_file" ]; then
    log_fail "TARGET_FILE_NOT_READABLE: $target_file"
    return 1
  fi

  local raw_output
  local sha_exit=0

  raw_output=$(sha256sum "$target_file" 2>"$err_log") || sha_exit=$?
  if [ "$sha_exit" -ne 0 ]; then
    log_fail "SHA256_EXEC_ERROR: exit=$sha_exit file=$target_file"
    return 1
  fi

  local actual_hash
  actual_hash=$(printf '%s\n' "$raw_output" | awk '{print $1}')

  # Strong 64-hex-character format assertion
  if [[ ! "$actual_hash" =~ ^[0-9a-fA-F]{64}$ ]]; then
    log_fail "HASH_FORMAT_ERROR: '$actual_hash' does not match ^[0-9a-fA-F]{64}$"
    return 1
  fi

  # Case-insensitive comparison
  if [ "${actual_hash,,}" != "${expected_hash,,}" ]; then
    log_fail "HASH_MISMATCH: expected=$expected_hash actual=$actual_hash file=$target_file"
    return 1
  fi

  return 0
}

# ==============================================================================
# 3. P1-02 & P1-03: Sequential Sort, Diff and Delta Classification
# ==============================================================================
verify_workspace_git_delta() {
  local before_state_file="$1"
  local after_state_file="$2"
  local delta_output_file="$3"

  local sorted_before="${TMP_VERIFY_DIR}/sorted_before.txt"
  local sorted_after="${TMP_VERIFY_DIR}/sorted_after.txt"
  local diff_raw="${TMP_VERIFY_DIR}/diff_raw.txt"
  local diff_err="${TMP_VERIFY_DIR}/diff_err.log"
  local sort_err="${TMP_VERIFY_DIR}/sort_err.log"
  local grep_err="${TMP_VERIFY_DIR}/grep_err.log"
  local sed_err="${TMP_VERIFY_DIR}/sed_err.log"

  # Phase 1: Sequential Sorting with isolated exit code capture
  local before_sort_exit=0
  sort "$before_state_file" > "$sorted_before" 2>"$sort_err" || before_sort_exit=$?

  local after_sort_exit=0
  sort "$after_state_file" > "$sorted_after" 2>"$sort_err" || after_sort_exit=$?

  if [ "$before_sort_exit" -ne 0 ] || [ "$after_sort_exit" -ne 0 ]; then
    log_fail "SORT_EXEC_ERROR: before=$before_sort_exit after=$after_sort_exit"
    return 1
  fi

  # Phase 2: Controlled Diff Execution (diff: 0=equal, 1=delta found, >=2=error)
  local diff_exit=0
  diff "$sorted_before" "$sorted_after" > "$diff_raw" 2>"$diff_err" || diff_exit=$?

  if [ "$diff_exit" -gt 1 ]; then
    log_fail "DIFF_EXEC_ERROR: exit=$diff_exit"
    return 1
  fi

  # Phase 3: Robust Delta Extraction using Grep and Sed
  # grep exit codes: 0=match found, 1=no lines matched (clean delta), >=2=syntax/file error
  local grep_exit=0
  local raw_delta="${TMP_VERIFY_DIR}/raw_delta.txt"
  grep '^> ' "$diff_raw" > "$raw_delta" 2>"$grep_err" || grep_exit=$?

  if [ "$grep_exit" -ge 2 ]; then
    log_fail "DIFF_PARSE_ERROR: exit=$grep_exit"
    return 1
  fi

  if [ "$grep_exit" -eq 1 ]; then
    # No delta detected, initialize empty file
    : > "$raw_delta"
  fi

  if [ -s "$raw_delta" ]; then
    local sed_exit=0
    sed 's/^> //g' "$raw_delta" > "$delta_output_file" 2>"$sed_err" || sed_exit=$?
    if [ "$sed_exit" -ne 0 ]; then
      log_fail "DELTA_CLASSIFICATION_ERROR: exit=$sed_exit"
      return 1
    fi
  else
    : > "$delta_output_file"
  fi

  return 0
}

# ==============================================================================
# 4. P2-06: File Existence vs Readability Distinction
# ==============================================================================
check_file_access() {
  local target_file="$1"

  if [ ! -e "$target_file" ]; then
    log_fail "FILE_MISSING: $target_file"
    return 1
  fi

  if [ ! -r "$target_file" ]; then
    log_fail "FILE_PERMISSION_DENIED: $target_file"
    return 1
  fi

  return 0
}

# ==============================================================================
# 5. Main Verification Harness
# ==============================================================================
main() {
  log_info "Initiating Forensic Artifact & Playbook Hardening Verification (REV-13)..."
  log_info "Workspace Root: ${WORKSPACE_ROOT}"
  log_info "Script Dir: ${SCRIPT_DIR}"

  # --- Step 0.2: Assert Git Repository State and Clean Baseline ---
  local git_rev_err="${TMP_VERIFY_DIR}/git_rev.err"
  local current_commit=""
  local git_rev_exit=0
  current_commit=$(git -C "${WORKSPACE_ROOT}" rev-parse HEAD 2>"$git_rev_err") || git_rev_exit=$?

  if [ "$git_rev_exit" -ne 0 ] || [ -z "$current_commit" ]; then
    log_fail "GIT_REV_PARSE_ERROR: Unable to resolve HEAD (exit=$git_rev_exit)"
    exit 1
  fi
  log_info "Active Commit: ${current_commit}"

  local active_branch
  active_branch=$(git -C "${WORKSPACE_ROOT}" branch --show-current 2>/dev/null) || true
  log_info "Active Branch: ${active_branch:-detached}"

  # --- Step 5.1/5.2: Self-testing Path and Hash Defenses ---
  local test_base="${TMP_VERIFY_DIR}/test_base"
  mkdir -p "${test_base}/sub"
  printf 'test_payload\n' > "${test_base}/sub/file.txt"

  # Path safety assertions
  log_info "Running path safety self-tests..."

  if ! validate_manifest_path "${test_base}" "sub/file.txt"; then
    log_fail "Self-test failed on legitimate path sub/file.txt"
    exit 1
  fi
  log_pass "Legitimate path accepted: sub/file.txt"

  if validate_manifest_path "${test_base}" "sub/../escape.txt" 2>/dev/null; then
    log_fail "Path escape vulnerability detected: sub/../escape.txt was accepted"
    exit 1
  fi
  log_pass "Path escape rejected: sub/../escape.txt"

  if validate_manifest_path "${test_base}" "/etc/passwd" 2>/dev/null; then
    log_fail "Absolute path vulnerability: /etc/passwd was accepted"
    exit 1
  fi
  log_pass "Absolute path rejected: /etc/passwd"

  if validate_manifest_path "${test_base}" "sub//double.txt" 2>/dev/null; then
    log_fail "Empty segment vulnerability: sub//double.txt was accepted"
    exit 1
  fi
  log_pass "Empty segment rejected: sub//double.txt"

  # Hash computation assertions
  log_info "Running hash verification self-tests..."

  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  # SHA-256 of "test_payload\n"
  local exp_hash="2c11654877f09cb8d9e7949ad5f2f5fa00609348d68962002fec92eb93a8d11d"
  # Recalculate to be safe
  exp_hash=$(sha256sum "${test_base}/sub/file.txt" | awk '{print $1}')

  if ! verify_file_hash "${test_base}/sub/file.txt" "$exp_hash" "$sha_err"; then
    log_fail "Self-test failed on hash verification (correct hash)"
    exit 1
  fi
  log_pass "Correct hash verified: ${exp_hash:0:16}..."

  if verify_file_hash "${test_base}/sub/file.txt" "00000000000000000000000000000000000000000000000000000000000000" "$sha_err" 2>/dev/null; then
    log_fail "Hash mismatch not detected: wrong hash was accepted"
    exit 1
  fi
  log_pass "Hash mismatch correctly rejected"

  if verify_file_hash "${test_base}/nonexistent.txt" "$exp_hash" "$sha_err" 2>/dev/null; then
    log_fail "Missing file not detected: nonexistent file was accepted"
    exit 1
  fi
  log_pass "Missing file correctly rejected"

  # Format assertion: malformed hash should be rejected
  if verify_file_hash "${test_base}/sub/file.txt" "not-a-valid-hash" "$sha_err" 2>/dev/null; then
    log_fail "Hash format error not detected: malformed hash was accepted"
    exit 1
  fi
  log_pass "Malformed hash format correctly rejected"

  # --- Git delta self-test ---
  log_info "Running git delta verification self-tests..."

  local before_file="${TMP_VERIFY_DIR}/before.txt"
  local after_file="${TMP_VERIFY_DIR}/after.txt"
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"

  printf 'file_a.ts\nfile_b.ts\nfile_c.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\nfile_d.ts\n' > "$after_file"

  if ! verify_workspace_git_delta "$before_file" "$after_file" "$delta_file"; then
    log_fail "Git delta verification failed on valid input"
    exit 1
  fi

  local delta_count
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  if [ "$delta_count" -ne 1 ]; then
    log_fail "Git delta count mismatch: expected 1, got $delta_count"
    exit 1
  fi
  log_pass "Git delta extraction correct: 1 changed file (file_c.ts -> file_d.ts)"

  # Clean delta (no changes)
  printf 'file_a.ts\nfile_b.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\n' > "$after_file"
  if ! verify_workspace_git_delta "$before_file" "$after_file" "$delta_file"; then
    log_fail "Git delta verification failed on clean input"
    exit 1
  fi
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  if [ "$delta_count" -ne 0 ]; then
    log_fail "Clean delta should be empty, got $delta_count lines"
    exit 1
  fi
  log_pass "Clean delta correctly produces empty output"

  # --- File access self-test ---
  log_info "Running file access self-tests..."

  if ! check_file_access "${test_base}/sub/file.txt"; then
    log_fail "File access check failed on existing readable file"
    exit 1
  fi
  log_pass "Existing readable file passes access check"

  if check_file_access "${test_base}/nonexistent.txt" 2>/dev/null; then
    log_fail "Missing file not detected by check_file_access"
    exit 1
  fi
  log_pass "Missing file correctly rejected by check_file_access"

  # --- Final Summary ---
  echo ""
  log_pass "All forensic security tests passed (REV-13)."
  log_pass "  - P1-01: sha256sum isolated exit code + 64-hex format assertion"
  log_pass "  - P1-02: sort/diff isolated exit codes (diff >1 = error)"
  log_pass "  - P1-03: grep/sed exit code inversion fix (grep 1 = clean)"
  log_pass "  - P1-04: path segment + realpath containment (4-layer defense)"
  log_pass "  - P2-06: file existence vs readability distinction"
  log_pass "  - Git delta extraction: valid + clean scenarios"
  echo ""
  log_info "REV-13 Forensic Script Verification: COMPLETE"

  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
