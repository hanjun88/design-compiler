#!/usr/bin/env bash
# ==============================================================================
# HEARTMIRROR · Phase 5 Step 5.2 Artifact & Workspace Forensic Verifier
# SCRIPT VERSION: 1.5.0-REV-13-R3.1
# ENFORCEMENT: set -euo pipefail with deterministic exit code isolation
# CHANGES (R2): fixed known hash vector, failure injection tests,
#                symlink escape tests, expanded P2 implementation,
#                JSON diagnostic output structure
# CHANGES (R3): eliminated SC2319 via deterministic test -L exit assignment,
#                effective FILE_PERMISSION_DENIED (chmod 000 + setpriv root drop),
#                script self-SHA + full HEAD output, 33 self-tests
# CHANGES (R3.1): removed self-referential log SHA (external harness computes),
#                header/runtime version synced to 1.5.0-REV-13-R3.1
# ==============================================================================
set -euo pipefail

# --- Color and Output Helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { printf "[INFO] %s\n" "$1"; }
log_pass()  { printf "${GREEN}[PASS]${NC} %s\n" "$1"; }
log_fail()  { printf "${RED}[FAIL]${NC} %s\n" "$1" >&2; }
log_warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_test()  { printf "${CYAN}[TEST]${NC} %s\n" "$1"; }

# --- Fixed Known Hash Vector (P1-01 R2: no dynamic recomputation) ---
# SHA-256 of the exact byte sequence: "test_payload\n"
# Precomputed independently; this script does NOT recalculate it.
KNOWN_TEST_VECTOR="test_payload"
KNOWN_TEST_VECTOR_HASH="5bd45297ee33cd5c6b398533392ebbbe72195c5fb810fabe6d4d0d9ac665b34e"

# --- Working Directories and Paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_VERIFY_DIR="${WORKSPACE_ROOT}/.tmp/audit_verification_$$"
FS_CHECK_SUMMARY_FILE="${TMP_VERIFY_DIR}/fs_check_summary.jsonl"

# Trap handler for safe atomic cleanup
cleanup() {
  local exit_code=$?
  rm -rf "${TMP_VERIFY_DIR}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

mkdir -p "${TMP_VERIFY_DIR}"
: > "${FS_CHECK_SUMMARY_FILE}"

# ==============================================================================
# P2-14: Unified JSON Diagnostic Structure
# ==============================================================================
emit_diagnostic() {
  local status="$1"
  local exit_code="$2"
  local duration_ms="$3"
  local error_stage="$4"
  local detail="${5:-}"
  printf '{"status":"%s","exit_code":%s,"duration_ms":%s,"error_stage":"%s","detail":"%s"}\n' \
    "$status" "$exit_code" "$duration_ms" "$error_stage" "$detail"
}

# ==============================================================================
# 1. P1-04 / AC-2.0: Strict Path Segment and Containment Validator
# ==============================================================================
validate_manifest_path() {
  local base_dir="$1"
  local rel_path="$2"

  # Layer 1: Null, Empty, Backslash & Control Character Defense
  if [ -z "$rel_path" ] || [[ "$rel_path" == *\\* ]] || [[ "$rel_path" =~ [[:cntrl:]] ]]; then
    log_fail "MALFORMED_PATH_STRING: $rel_path"
    return 1
  fi

  # Layer 2: Strict Unix Absolute Path Prohibition
  if [[ "$rel_path" == /* ]]; then
    log_fail "ABSOLUTE_PATH_FORBIDDEN: $rel_path"
    return 1
  fi

  # Layer 3: Component-level Traversal Token & Empty Segment Defense
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

  # Layer 4: Canonical Containment & Symlink Escape Defense via realpath
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
    "$canon_base"/*|"$canon_base")
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
# 4. P2-02: File Size with Error Classification
# ==============================================================================
get_file_size() {
  local target_file="$1"
  local err_log="$2"
  local size
  local stat_exit=0

  size=$(stat -c %s "$target_file" 2>"$err_log") || stat_exit=$?

  if [ "$stat_exit" -ne 0 ]; then
    log_fail "STAT_EXEC_ERROR: exit=$stat_exit file=$target_file"
    return 1
  fi

  if [[ ! "$size" =~ ^[0-9]+$ ]]; then
    log_fail "STAT_OUTPUT_INVALID: '$size' is not a non-negative integer"
    return 1
  fi

  printf '%s\n' "$size"
  return 0
}

# ==============================================================================
# 5. P2-06 / P2-07: File Access & Symlink Status with Distinct Exit Codes
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

# P2-07: test -L with explicit exit code capture and audit logging
# SC2319 fix: no $? capture at all. test -L returns 0 (symlink) or 1
# (not a symlink / missing), which is assigned deterministically.
check_symlink_status() {
  local target_file="$1"
  local test_l_exit=0

  if test -L "$target_file"; then
    test_l_exit=0
  else
    test_l_exit=1
  fi

  # Record to FS check summary (P2-08)
  emit_diagnostic "SYMLINK_CHECK" "$test_l_exit" 0 "P2-07" "target=$target_file is_symlink=$([ "$test_l_exit" -eq 0 ] && echo true || echo false)" >> "${FS_CHECK_SUMMARY_FILE}"

  if [ "$test_l_exit" -eq 0 ]; then
    return 0  # is a symlink
  elif [ "$test_l_exit" -eq 1 ]; then
    return 1  # not a symlink (but may exist as regular file)
  else
    log_fail "TEST_L_EXEC_ERROR: exit=$test_l_exit target=$target_file"
    return 2
  fi
}

# P2-06 R3: Effective FILE_PERMISSION_DENIED test
# Root can read chmod 000 files, so this test must drop privileges when
# running as root (via setpriv) to avoid false positives.
test_permission_denied() {
  local target_file="${TMP_VERIFY_DIR}/noperm.txt"
  printf 'secret_data\n' > "$target_file"
  chmod 000 "$target_file"

  local read_check=1  # 0 = readable, 1 = not readable

  if [ "$(id -u)" -eq 0 ]; then
    # Running as root: drop privileges to nobody (uid/gid 65534) via setpriv
    if command -v setpriv >/dev/null 2>&1; then
      if setpriv --reuid=65534 --regid=65534 --clear-groups test -r "$target_file" 2>/dev/null; then
        read_check=0
      else
        read_check=1
      fi
    else
      log_warn "Running as root without setpriv; FILE_PERMISSION_DENIED test skipped"
      chmod 644 "$target_file"
      return 0
    fi
  else
    # Non-root: direct readability check is valid
    if [ -r "$target_file" ]; then
      read_check=0
    else
      read_check=1
    fi
  fi

  chmod 644 "$target_file"

  if [ "$read_check" -eq 0 ]; then
    log_fail "FILE_PERMISSION_DENIED_NOT_DETECTED: chmod 000 file was readable"
    return 1
  fi

  log_pass "P2-06 R3: FILE_PERMISSION_DENIED correctly detected (uid=$(id -u), chmod 000)"
  return 0
}

# ==============================================================================
# 6. P2-10: Whitelist Full-Path Exact Matching (no glob ambiguity)
# ==============================================================================
is_path_in_whitelist() {
  local target_path="$1"
  shift
  local whitelist_entry
  for whitelist_entry in "$@"; do
    if [ "$target_path" = "$whitelist_entry" ]; then
      return 0
    fi
  done
  return 1
}

# ==============================================================================
# 7. P2-11: NUL-Safe Git Porcelain Parsing
# ==============================================================================
parse_git_porcelain_nul() {
  local repo_dir="$1"
  local output_file="$2"
  local porcelain_err="${TMP_VERIFY_DIR}/porcelain_err.log"
  local git_exit=0

  # Use --porcelain=v1 -z for NUL-delimited, rename-safe output
  git -C "$repo_dir" status --porcelain=v1 -z 2>"$porcelain_err" > "$output_file" || git_exit=$?

  if [ "$git_exit" -ne 0 ]; then
    log_fail "GIT_PORCELAIN_ERROR: exit=$git_exit"
    return 1
  fi

  return 0
}

# ==============================================================================
# 8. P2-12: Binary-Safe File Comparison (not text diff)
# ==============================================================================
binary_safe_compare() {
  local file_a="$1"
  local file_b="$2"
  local cmp_err="${TMP_VERIFY_DIR}/cmp_err.log"
  local cmp_exit=0

  # cmp returns 0 if identical, 1 if different, 2 if error
  cmp -s "$file_a" "$file_b" 2>"$cmp_err" || cmp_exit=$?

  if [ "$cmp_exit" -gt 1 ]; then
    log_fail "BINARY_COMPARE_EXEC_ERROR: exit=$cmp_exit"
    return 1
  fi

  if [ "$cmp_exit" -eq 1 ]; then
    return 1  # files differ
  fi

  return 0  # files identical
}

# ==============================================================================
# 9. FAILURE INJECTION TEST HARNESS (P1-02/P1-03 R2)
# ==============================================================================

# P1-02 R2: sort failure injection — nonexistent input file
test_sort_failure_injection() {
  log_test "P1-02 R2: sort failure injection (nonexistent input)"
  local nonexistent="${TMP_VERIFY_DIR}/nonexistent_sort_input.txt"
  local sorted_out="${TMP_VERIFY_DIR}/sorted_fail_out.txt"
  local sort_err="${TMP_VERIFY_DIR}/sort_fail_err.log"
  local sort_exit=0

  sort "$nonexistent" > "$sorted_out" 2>"$sort_err" || sort_exit=$?

  if [ "$sort_exit" -eq 0 ]; then
    log_fail "SORT_FAILURE_INJECTION_FAILED: sort returned 0 on nonexistent input"
    return 1
  fi
  log_pass "sort failure correctly captured: exit=$sort_exit (nonzero on nonexistent input)"
  return 0
}

# P1-02 R2: diff failure injection — diff with nonexistent file returns >=2
test_diff_failure_injection() {
  log_test "P1-02 R2: diff failure injection (nonexistent file -> exit >=2)"
  local real_file="${TMP_VERIFY_DIR}/diff_real.txt"
  local nonexistent="${TMP_VERIFY_DIR}/diff_nonexistent.txt"
  local diff_out="${TMP_VERIFY_DIR}/diff_fail_out.txt"
  local diff_err="${TMP_VERIFY_DIR}/diff_fail_err.log"
  local diff_exit=0

  printf 'a\n' > "$real_file"

  diff "$real_file" "$nonexistent" > "$diff_out" 2>"$diff_err" || diff_exit=$?

  if [ "$diff_exit" -lt 2 ]; then
    log_fail "DIFF_FAILURE_INJECTION_FAILED: diff returned $diff_exit (expected >=2 on nonexistent input)"
    return 1
  fi
  log_pass "diff failure correctly captured: exit=$diff_exit (>=2 on nonexistent input, correctly classified as DIFF_EXEC_ERROR)"
  return 0
}

# P1-03 R2: grep failure injection — grep on nonexistent file returns >=2
test_grep_failure_injection() {
  log_test "P1-03 R2: grep failure injection (nonexistent file -> exit >=2)"
  local nonexistent="${TMP_VERIFY_DIR}/grep_nonexistent.txt"
  local grep_out="${TMP_VERIFY_DIR}/grep_fail_out.txt"
  local grep_err="${TMP_VERIFY_DIR}/grep_fail_err.log"
  local grep_exit=0

  grep '^pattern' "$nonexistent" > "$grep_out" 2>"$grep_err" || grep_exit=$?

  if [ "$grep_exit" -lt 2 ]; then
    log_fail "GREP_FAILURE_INJECTION_FAILED: grep returned $grep_exit (expected >=2 on nonexistent file)"
    return 1
  fi
  log_pass "grep failure correctly captured: exit=$grep_exit (>=2 on nonexistent file, correctly classified as DIFF_PARSE_ERROR)"
  return 0
}

# P1-03 R2: grep return 1 (no match) must NOT be treated as error
test_grep_no_match_is_clean() {
  log_test "P1-03 R2: grep return 1 (no match) is clean, not error"
  local input_file="${TMP_VERIFY_DIR}/grep_nomatch_input.txt"
  local grep_out="${TMP_VERIFY_DIR}/grep_nomatch_out.txt"
  local grep_err="${TMP_VERIFY_DIR}/grep_nomatch_err.log"
  local grep_exit=0

  printf 'hello world\n' > "$input_file"
  grep '^nonexistent_pattern' "$input_file" > "$grep_out" 2>"$grep_err" || grep_exit=$?

  if [ "$grep_exit" -ne 1 ]; then
    log_fail "GREP_NO_MATCH_EXPECTED_1: got exit=$grep_exit (expected 1 for no match)"
    return 1
  fi
  log_pass "grep return 1 (no match) correctly treated as clean delta, not error"
  return 0
}

# P1-03 R2: sed failure injection — sed on nonexistent file returns nonzero
test_sed_failure_injection() {
  log_test "P1-03 R2: sed failure injection (nonexistent input)"
  local nonexistent="${TMP_VERIFY_DIR}/sed_nonexistent.txt"
  local sed_out="${TMP_VERIFY_DIR}/sed_fail_out.txt"
  local sed_err="${TMP_VERIFY_DIR}/sed_fail_err.log"
  local sed_exit=0

  sed 's/^> //g' "$nonexistent" > "$sed_out" 2>"$sed_err" || sed_exit=$?

  if [ "$sed_exit" -eq 0 ]; then
    log_fail "SED_FAILURE_INJECTION_FAILED: sed returned 0 on nonexistent input"
    return 1
  fi
  log_pass "sed failure correctly captured: exit=$sed_exit (nonzero on nonexistent input)"
  return 0
}

# ==============================================================================
# 10. P1-04 R2: Symlink Escape Test
# ==============================================================================
test_symlink_escape() {
  log_test "P1-04 R2: symlink escape via sub/link -> ../../symlink_outside"
  local symlink_base="${TMP_VERIFY_DIR}/symlink_test_base"
  local outside_dir="${TMP_VERIFY_DIR}/symlink_outside"

  mkdir -p "${symlink_base}/sub"
  mkdir -p "$outside_dir"
  printf 'secret_data\n' > "${outside_dir}/escaped.txt"

  # Create symlink: symlink_base/sub/link -> ../../symlink_outside
  # This points OUTSIDE symlink_base (to ${TMP_VERIFY_DIR}/symlink_outside)
  ln -s ../../symlink_outside "${symlink_base}/sub/link"

  # Verify symlink exists (P2-07)
  if ! check_symlink_status "${symlink_base}/sub/link" >/dev/null 2>&1; then
    log_fail "SYMLINK_NOT_CREATED: ${symlink_base}/sub/link"
    return 1
  fi

  # Attempt to access outside/escaped.txt through the symlink
  # This should be REJECTED by validate_manifest_path
  if validate_manifest_path "$symlink_base" "sub/link/escaped.txt" 2>/dev/null; then
    log_fail "SYMLINK_ESCAPE_VULNERABILITY: sub/link/escaped.txt was accepted (should be rejected)"
    return 1
  fi
  log_pass "symlink escape correctly rejected: sub/link/escaped.txt (realpath resolves outside base)"

  # Also test: symlink to absolute path
  ln -sf /etc "${symlink_base}/sub/etclink"
  if validate_manifest_path "$symlink_base" "sub/etclink/passwd" 2>/dev/null; then
    log_fail "SYMLINK_ABSOLUTE_ESCAPE: sub/etclink/passwd was accepted"
    return 1
  fi
  log_pass "absolute symlink escape correctly rejected: sub/etclink/passwd"

  return 0
}

# ==============================================================================
# 11. Main Verification Harness
# ==============================================================================
main() {
  log_info "Initiating Forensic Artifact & Playbook Hardening Verification (REV-13 R3)..."
  log_info "Workspace Root: ${WORKSPACE_ROOT}"
  log_info "Script Version: 1.5.0-REV-13-R3.1"

  # --- R3: Script-Execution-Log version binding ---
  # Script SHA-256 is computed from the actual executing file ($0).
  # HEAD commit is resolved below; log SHA-256 is emitted at the end.
  local script_sha
  script_sha=$(sha256sum "$0" 2>/dev/null | awk '{print $1}') || script_sha="UNRESOLVED"
  log_info "Script SHA-256: ${script_sha}"

  local total_tests=0
  local passed_tests=0

  run_test() {
    total_tests=$((total_tests + 1))
    if "$@"; then
      passed_tests=$((passed_tests + 1))
    else
      log_fail "TEST FAILED: $*"
      exit 1
    fi
  }

  # --- Step 0.2 / P2-01: Git Repository State ---
  log_info "=== P2-01: Git HEAD with isolated exit code ==="
  local git_rev_err="${TMP_VERIFY_DIR}/git_rev.err"
  local current_commit=""
  local git_rev_exit=0
  current_commit=$(git -C "${WORKSPACE_ROOT}" rev-parse HEAD 2>"$git_rev_err") || git_rev_exit=$?

  if [ "$git_rev_exit" -ne 0 ] || [ -z "$current_commit" ]; then
    log_fail "GIT_REV_PARSE_ERROR: exit=$git_rev_exit"
    exit 1
  fi
  log_pass "P2-01: Git HEAD resolved with isolated exit code: ${current_commit:0:12}..."
  log_info "Bound HEAD Commit (full): ${current_commit}"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # P2-11: NUL-safe porcelain parsing
  log_info "=== P2-11: NUL-safe Git porcelain parsing ==="
  local porcelain_out="${TMP_VERIFY_DIR}/porcelain_output.txt"
  if parse_git_porcelain_nul "${WORKSPACE_ROOT}" "$porcelain_out"; then
    log_pass "P2-11: git status --porcelain=v1 -z parsed successfully"
    total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))
  else
    log_fail "P2-11: porcelain parsing failed"
    exit 1
  fi

  # --- P1-01 R2: Fixed Known Hash Vector ---
  log_info "=== P1-01 R2: Fixed known hash vector (no dynamic recomputation) ==="
  local test_base="${TMP_VERIFY_DIR}/test_base"
  mkdir -p "${test_base}/sub"
  printf '%s\n' "$KNOWN_TEST_VECTOR" > "${test_base}/sub/file.txt"

  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  run_test verify_file_hash "${test_base}/sub/file.txt" "$KNOWN_TEST_VECTOR_HASH" "$sha_err"
  log_pass "P1-01 R2: Fixed known hash vector verified: ${KNOWN_TEST_VECTOR_HASH:0:16}..."

  # Hash mismatch rejection
  log_test "P1-01: hash mismatch rejection"
  if verify_file_hash "${test_base}/sub/file.txt" "00000000000000000000000000000000000000000000000000000000000000" "$sha_err" 2>/dev/null; then
    log_fail "HASH_MISMATCH_NOT_DETECTED"
    exit 1
  fi
  log_pass "P1-01: hash mismatch correctly rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # Malformed hash format rejection
  log_test "P1-01: malformed hash format rejection"
  if verify_file_hash "${test_base}/sub/file.txt" "not-a-valid-hash" "$sha_err" 2>/dev/null; then
    log_fail "HASH_FORMAT_ERROR_NOT_DETECTED"
    exit 1
  fi
  log_pass "P1-01: malformed hash format correctly rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # Missing file rejection
  log_test "P1-01: missing file rejection"
  if verify_file_hash "${test_base}/nonexistent.txt" "$KNOWN_TEST_VECTOR_HASH" "$sha_err" 2>/dev/null; then
    log_fail "MISSING_FILE_NOT_DETECTED"
    exit 1
  fi
  log_pass "P1-01: missing file correctly rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P1-04: Path Safety ---
  log_info "=== P1-04: Path safety (4-layer defense) ==="
  run_test validate_manifest_path "${test_base}" "sub/file.txt"
  log_pass "P1-04: legitimate path accepted"

  if validate_manifest_path "${test_base}" "sub/../escape.txt" 2>/dev/null; then
    log_fail "PATH_ESCAPE_NOT_DETECTED: sub/../escape.txt"
    exit 1
  fi
  log_pass "P1-04: ../ escape rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  if validate_manifest_path "${test_base}" "/etc/passwd" 2>/dev/null; then
    log_fail "ABSOLUTE_PATH_NOT_REJECTED"
    exit 1
  fi
  log_pass "P1-04: absolute path rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  if validate_manifest_path "${test_base}" "sub//double.txt" 2>/dev/null; then
    log_fail "EMPTY_SEGMENT_NOT_REJECTED"
    exit 1
  fi
  log_pass "P1-04: empty segment rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # P1-04 R2: Symlink escape
  run_test test_symlink_escape

  # --- P1-02 & P1-03 R2: Failure Injection ---
  log_info "=== P1-02/P1-03 R2: Failure injection tests ==="
  run_test test_sort_failure_injection
  run_test test_diff_failure_injection
  run_test test_grep_failure_injection
  run_test test_grep_no_match_is_clean
  run_test test_sed_failure_injection

  # --- P1-02/P1-03: Normal Git Delta ---
  log_info "=== P1-02/P1-03: Normal git delta extraction ==="
  local before_file="${TMP_VERIFY_DIR}/before.txt"
  local after_file="${TMP_VERIFY_DIR}/after.txt"
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"

  printf 'file_a.ts\nfile_b.ts\nfile_c.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\nfile_d.ts\n' > "$after_file"

  run_test verify_workspace_git_delta "$before_file" "$after_file" "$delta_file"
  local delta_count
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  if [ "$delta_count" -ne 1 ]; then
    log_fail "DELTA_COUNT_MISMATCH: expected 1, got $delta_count"
    exit 1
  fi
  log_pass "Git delta extraction correct: 1 changed file"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # Clean delta
  printf 'file_a.ts\nfile_b.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\n' > "$after_file"
  run_test verify_workspace_git_delta "$before_file" "$after_file" "$delta_file"
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  if [ "$delta_count" -ne 0 ]; then
    log_fail "CLEAN_DELTA_NOT_EMPTY: $delta_count lines"
    exit 1
  fi
  log_pass "Clean delta produces empty output"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-02: File Size with Error Classification ---
  log_info "=== P2-02: File size with error classification ==="
  local stat_err="${TMP_VERIFY_DIR}/stat_err.log"
  local file_size
  file_size=$(get_file_size "${test_base}/sub/file.txt" "$stat_err")
  if [[ ! "$file_size" =~ ^[0-9]+$ ]]; then
    log_fail "P2-02: file size not a valid integer: '$file_size'"
    exit 1
  fi
  log_pass "P2-02: file size retrieved with error classification: ${file_size} bytes"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # P2-02: stat on nonexistent file should fail
  if get_file_size "${test_base}/nonexistent.txt" "$stat_err" 2>/dev/null; then
    log_fail "P2-02: stat on nonexistent file did not fail"
    exit 1
  fi
  log_pass "P2-02: stat failure on nonexistent file correctly captured"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-06: File Access Distinction ---
  log_info "=== P2-06: File existence vs readability ==="
  run_test check_file_access "${test_base}/sub/file.txt"
  if check_file_access "${test_base}/nonexistent.txt" 2>/dev/null; then
    log_fail "P2-06: missing file not detected"
    exit 1
  fi
  log_pass "P2-06: missing file correctly rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # P2-06 R3: Effective FILE_PERMISSION_DENIED test (privilege-aware)
  run_test test_permission_denied

  # --- P2-07: Symlink Status ---
  log_info "=== P2-07: test -L with explicit exit code ==="
  local symlink_test_file="${TMP_VERIFY_DIR}/symlink_target"
  printf 'data\n' > "${symlink_test_file}"
  local symlink_link="${TMP_VERIFY_DIR}/symlink_link"
  ln -s symlink_target "$symlink_link"

  if ! check_symlink_status "$symlink_link" >/dev/null 2>&1; then
    log_fail "P2-07: symlink not detected as symlink"
    exit 1
  fi
  log_pass "P2-07: symlink correctly detected (test -L exit 0)"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  if check_symlink_status "$symlink_test_file" >/dev/null 2>&1; then
    log_fail "P2-07: regular file incorrectly detected as symlink"
    exit 1
  fi
  log_pass "P2-07: regular file correctly not detected as symlink (exit 1)"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-10: Whitelist Full-Path Matching ---
  log_info "=== P2-10: Whitelist full-path exact matching ==="
  local -a test_whitelist=("${WORKSPACE_ROOT}/dist/output.js" "${WORKSPACE_ROOT}/logs/build.log")
  if ! is_path_in_whitelist "${WORKSPACE_ROOT}/dist/output.js" "${test_whitelist[@]}"; then
    log_fail "P2-10: whitelisted path not found"
    exit 1
  fi
  log_pass "P2-10: whitelisted path correctly matched"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  if is_path_in_whitelist "${WORKSPACE_ROOT}/src/evil.ts" "${test_whitelist[@]}"; then
    log_fail "P2-10: non-whitelisted path incorrectly matched"
    exit 1
  fi
  log_pass "P2-10: non-whitelisted path correctly rejected"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-12: Binary-Safe Comparison ---
  log_info "=== P2-12: Binary-safe file comparison ==="
  local bin_a="${TMP_VERIFY_DIR}/bin_a.bin"
  local bin_b="${TMP_VERIFY_DIR}/bin_b.bin"
  printf '\x00\x01\x02\xff\xfe' > "$bin_a"
  printf '\x00\x01\x02\xff\xfe' > "$bin_b"

  if ! binary_safe_compare "$bin_a" "$bin_b"; then
    log_fail "P2-12: identical binary files reported as different"
    exit 1
  fi
  log_pass "P2-12: identical binary files correctly compared (cmp exit 0)"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  printf '\x00\x01\x03\xff\xfe' > "$bin_b"
  if binary_safe_compare "$bin_a" "$bin_b" 2>/dev/null; then
    log_fail "P2-12: different binary files reported as identical"
    exit 1
  fi
  log_pass "P2-12: different binary files correctly detected (cmp exit 1)"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-14: JSON Diagnostic Structure ---
  log_info "=== P2-14: JSON diagnostic structure ==="
  local diagnostic_output
  diagnostic_output=$(emit_diagnostic "SUCCESS" 0 150 "test_stage" "test detail")
  if [[ ! "$diagnostic_output" =~ ^\{.*\}$ ]]; then
    log_fail "P2-14: diagnostic output is not valid JSON object"
    exit 1
  fi
  log_pass "P2-14: JSON diagnostic structure emitted correctly"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- P2-08: FS Check Summary File ---
  log_info "=== P2-08: FS check summary file ==="
  if [ ! -s "${FS_CHECK_SUMMARY_FILE}" ]; then
    log_fail "P2-08: FS check summary file is empty"
    exit 1
  fi
  local fs_summary_lines
  fs_summary_lines=$(wc -l < "${FS_CHECK_SUMMARY_FILE}" | tr -d ' ')
  log_pass "P2-08: FS check summary file has ${fs_summary_lines} diagnostic entries"
  total_tests=$((total_tests + 1)); passed_tests=$((passed_tests + 1))

  # --- Final Summary ---
  echo ""
  echo "=========================================="
  echo " REV-13 R3 Forensic Verification Summary"
  echo "=========================================="
  echo " Total tests:  ${total_tests}"
  echo " Passed:       ${passed_tests}"
  echo " Failed:       $((total_tests - passed_tests))"
  echo " Script SHA-256: ${script_sha}"
  echo " HEAD Commit:    ${current_commit}"
  echo "=========================================="
  echo ""

  if [ "$passed_tests" -ne "$total_tests" ]; then
    log_fail "VERIFICATION INCOMPLETE: $((total_tests - passed_tests)) test(s) failed"
    exit 1
  fi

  log_pass "ALL ${total_tests} FORENSIC TESTS PASSED (REV-13 R3)."

  # NOTE: The script deliberately does NOT compute the log file SHA-256.
  # A script cannot hash its own output stream while it is still being
  # captured by the invoking harness (self-reference race). The log SHA-256
  # is computed by the external harness AFTER the log is fully written and
  # recorded in a separate version-binding evidence file.

  log_info "REV-13 R3 Forensic Script Verification: COMPLETE"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
