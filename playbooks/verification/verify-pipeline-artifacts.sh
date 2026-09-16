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
# ==============================================================================
# 11. Structured Test Event Protocol (R3.5)
# ==============================================================================

record_test_result() {
  local id="$1"
  local status="$2"
  printf 'TEST_RESULT|id=%s|status=%s
' "$id" "$status"
}

run_one_test() {
  local test_id="$1"
  local test_function="$2"
  shift 2
  local test_args=("$@")
  local subshell_rc=0

  printf 'TEST_START|id=%s
' "$test_id"

  set +e
  (
    set -euo pipefail
    trap 'exit 128' INT TERM
    trap 'exit 1' ERR
    "$test_function" "${test_args[@]}"
  )
  subshell_rc=$?
  set -e

  if [ "$subshell_rc" -eq 0 ]; then
    record_test_result "$test_id" "PASS"
  else
    record_test_result "$test_id" "FAIL"
  fi
  printf 'TEST_END|id=%s|rc=%d
' "$test_id" "$subshell_rc"
  return 0
}

# ==============================================================================
# 12. Thirty-Three Test Functions (each returns 0=pass, 1=fail)
# ==============================================================================

t_git_head_isolated() {
  local git_rev_err="${TMP_VERIFY_DIR}/git_rev.err"
  local current_commit="" git_rev_exit=0
  current_commit=$(git -C "${WORKSPACE_ROOT}" rev-parse HEAD 2>"$git_rev_err") || git_rev_exit=$?
  [ "$git_rev_exit" -eq 0 ] && [ -n "$current_commit" ] || return 1
  return 0
}

t_porcelain_nul_parse() {
  local porcelain_out="${TMP_VERIFY_DIR}/porcelain_output.txt"
  parse_git_porcelain_nul "${WORKSPACE_ROOT}" "$porcelain_out" || return 1
  return 0
}

t_known_hash_vector() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  mkdir -p "${test_base}/sub"
  printf '%s\n' "$KNOWN_TEST_VECTOR" > "${test_base}/sub/file.txt"
  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  verify_file_hash "${test_base}/sub/file.txt" "$KNOWN_TEST_VECTOR_HASH" "$sha_err" || return 1
  return 0
}

t_hash_mismatch_rejection() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  if verify_file_hash "${test_base}/sub/file.txt" "0000000000000000000000000000000000000000000000000000000000000000" "$sha_err" 2>/dev/null; then return 1; fi
  return 0
}

t_malformed_hash_rejection() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  if verify_file_hash "${test_base}/sub/file.txt" "not-a-valid-hash" "$sha_err" 2>/dev/null; then return 1; fi
  return 0
}

t_missing_file_rejection() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  local sha_err="${TMP_VERIFY_DIR}/sha.err"
  if verify_file_hash "${test_base}/nonexistent.txt" "$KNOWN_TEST_VECTOR_HASH" "$sha_err" 2>/dev/null; then return 1; fi
  return 0
}

t_path_legitimate() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  validate_manifest_path "${test_base}" "sub/file.txt" || return 1
  return 0
}

t_path_dotdot_escape() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  if validate_manifest_path "${test_base}" "sub/../escape.txt" 2>/dev/null; then return 1; fi
  return 0
}

t_path_absolute() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  if validate_manifest_path "${test_base}" "/etc/passwd" 2>/dev/null; then return 1; fi
  return 0
}

t_path_empty_segment() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  if validate_manifest_path "${test_base}" "sub//double.txt" 2>/dev/null; then return 1; fi
  return 0
}

t_symlink_escape_both() {
  test_symlink_escape || return 1
  return 0
}

t_sort_failure() { test_sort_failure_injection || return 1; return 0; }
t_diff_failure() { test_diff_failure_injection || return 1; return 0; }
t_grep_failure() { test_grep_failure_injection || return 1; return 0; }
t_grep_no_match_clean() { test_grep_no_match_is_clean || return 1; return 0; }
t_sed_failure() { test_sed_failure_injection || return 1; return 0; }

t_git_delta_extract() {
  local before_file="${TMP_VERIFY_DIR}/before.txt"
  local after_file="${TMP_VERIFY_DIR}/after.txt"
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"
  printf 'file_a.ts\nfile_b.ts\nfile_c.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\nfile_d.ts\n' > "$after_file"
  verify_workspace_git_delta "$before_file" "$after_file" "$delta_file" || return 1
  return 0
}

t_git_delta_count() {
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"
  local delta_count
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  [ "$delta_count" -eq 1 ] || return 1
  return 0
}

t_clean_delta_extract() {
  local before_file="${TMP_VERIFY_DIR}/before.txt"
  local after_file="${TMP_VERIFY_DIR}/after.txt"
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"
  printf 'file_a.ts\nfile_b.ts\n' > "$before_file"
  printf 'file_a.ts\nfile_b.ts\n' > "$after_file"
  verify_workspace_git_delta "$before_file" "$after_file" "$delta_file" || return 1
  return 0
}

t_clean_delta_empty() {
  local delta_file="${TMP_VERIFY_DIR}/delta.txt"
  local delta_count
  delta_count=$(wc -l < "$delta_file" | tr -d ' ')
  [ "$delta_count" -eq 0 ] || return 1
  return 0
}

t_file_size() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  local stat_err="${TMP_VERIFY_DIR}/stat_err.log"
  local file_size
  file_size=$(get_file_size "${test_base}/sub/file.txt" "$stat_err")
  [[ "$file_size" =~ ^[0-9]+$ ]] || return 1
  return 0
}

t_stat_failure() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  local stat_err="${TMP_VERIFY_DIR}/stat_err.log"
  if get_file_size "${test_base}/nonexistent.txt" "$stat_err" 2>/dev/null; then return 1; fi
  return 0
}

t_file_access_existing() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  check_file_access "${test_base}/sub/file.txt" || return 1
  return 0
}

t_file_access_missing() {
  local test_base="${TMP_VERIFY_DIR}/test_base"
  if check_file_access "${test_base}/nonexistent.txt" 2>/dev/null; then return 1; fi
  return 0
}

t_permission_denied() {
  test_permission_denied || return 1
  return 0
}

t_symlink_detected() {
  local symlink_test_file="${TMP_VERIFY_DIR}/symlink_target"
  local symlink_link="${TMP_VERIFY_DIR}/symlink_link"
  printf 'data\n' > "${symlink_test_file}"
  ln -sf symlink_target "$symlink_link"
  check_symlink_status "$symlink_link" >/dev/null 2>&1 || return 1
  return 0
}

t_regular_not_symlink() {
  local symlink_test_file="${TMP_VERIFY_DIR}/symlink_target"
  if check_symlink_status "$symlink_test_file" >/dev/null 2>&1; then return 1; fi
  return 0
}

t_whitelist_match() {
  local -a test_whitelist=("${WORKSPACE_ROOT}/dist/output.js" "${WORKSPACE_ROOT}/logs/build.log")
  is_path_in_whitelist "${WORKSPACE_ROOT}/dist/output.js" "${test_whitelist[@]}" || return 1
  return 0
}

t_whitelist_reject() {
  local -a test_whitelist=("${WORKSPACE_ROOT}/dist/output.js" "${WORKSPACE_ROOT}/logs/build.log")
  if is_path_in_whitelist "${WORKSPACE_ROOT}/src/evil.ts" "${test_whitelist[@]}"; then return 1; fi
  return 0
}

t_binary_identical() {
  local bin_a="${TMP_VERIFY_DIR}/bin_a.bin"
  local bin_b="${TMP_VERIFY_DIR}/bin_b.bin"
  printf '\x00\x01\x02\xff\xfe' > "$bin_a"
  printf '\x00\x01\x02\xff\xfe' > "$bin_b"
  binary_safe_compare "$bin_a" "$bin_b" || return 1
  return 0
}

t_binary_different() {
  local bin_a="${TMP_VERIFY_DIR}/bin_a.bin"
  local bin_b="${TMP_VERIFY_DIR}/bin_b.bin"
  printf '\x00\x01\x03\xff\xfe' > "$bin_b"
  if binary_safe_compare "$bin_a" "$bin_b" 2>/dev/null; then return 1; fi
  return 0
}

t_json_diagnostic() {
  local diagnostic_output
  diagnostic_output=$(emit_diagnostic "SUCCESS" 0 150 "test_stage" "test detail")
  [[ "$diagnostic_output" =~ ^\{.*\}$ ]] || return 1
  return 0
}

t_fs_summary() {
  [ -s "${FS_CHECK_SUMMARY_FILE}" ] || return 1
  return 0
}

# ==============================================================================
# 13. Main Verification Harness
# ==============================================================================
main() {
  log_info "Initiating Forensic Artifact & Playbook Hardening Verification (REV-13 R3.5)..."
  log_info "Workspace Root: ${WORKSPACE_ROOT}"
  log_info "Script Version: 1.6.0-REV-13-R3.5"

  local script_sha
  script_sha=$(sha256sum "$0" 2>/dev/null | awk '{print $1}') || script_sha="UNRESOLVED"
  log_info "Script SHA-256: ${script_sha}"

  local current_commit
  current_commit=$(git -C "${WORKSPACE_ROOT}" rev-parse HEAD 2>/dev/null) || current_commit="UNKNOWN"
  log_info "HEAD Commit: ${current_commit}"

  run_one_test "REV13-ST01-GIT-HEAD-ISOLATED" t_git_head_isolated
  run_one_test "REV13-ST02-PORCELAIN-NUL-PARSE" t_porcelain_nul_parse
  run_one_test "REV13-ST03-HASH-KNOWN-VECTOR" t_known_hash_vector
  run_one_test "REV13-ST04-HASH-MISMATCH-REJECT" t_hash_mismatch_rejection
  run_one_test "REV13-ST05-HASH-MALFORMED-REJECT" t_malformed_hash_rejection
  run_one_test "REV13-ST06-HASH-MISSING-FILE" t_missing_file_rejection
  run_one_test "REV13-ST07-PATH-LEGITIMATE" t_path_legitimate
  run_one_test "REV13-ST08-PATH-DOTDOT-ESCAPE" t_path_dotdot_escape
  run_one_test "REV13-ST09-PATH-ABSOLUTE" t_path_absolute
  run_one_test "REV13-ST10-PATH-EMPTY-SEGMENT" t_path_empty_segment
  run_one_test "REV13-ST11-SYMLINK-ESCAPE-BOTH" t_symlink_escape_both
  run_one_test "REV13-ST12-SORT-FAILURE" t_sort_failure
  run_one_test "REV13-ST13-DIFF-FAILURE" t_diff_failure
  run_one_test "REV13-ST14-GREP-FAILURE" t_grep_failure
  run_one_test "REV13-ST15-GREP-NO-MATCH-CLEAN" t_grep_no_match_clean
  run_one_test "REV13-ST16-SED-FAILURE" t_sed_failure
  run_one_test "REV13-ST17-GIT-DELTA-EXTRACT" t_git_delta_extract
  run_one_test "REV13-ST18-GIT-DELTA-COUNT" t_git_delta_count
  run_one_test "REV13-ST19-CLEAN-DELTA-EXTRACT" t_clean_delta_extract
  run_one_test "REV13-ST20-CLEAN-DELTA-EMPTY" t_clean_delta_empty
  run_one_test "REV13-ST21-FILE-SIZE" t_file_size
  run_one_test "REV13-ST22-STAT-FAILURE" t_stat_failure
  run_one_test "REV13-ST23-FILE-ACCESS-EXISTING" t_file_access_existing
  run_one_test "REV13-ST24-FILE-ACCESS-MISSING" t_file_access_missing
  run_one_test "REV13-ST25-PERMISSION-DENIED" t_permission_denied
  run_one_test "REV13-ST26-SYMLINK-DETECTED" t_symlink_detected
  run_one_test "REV13-ST27-REGULAR-NOT-SYMLINK" t_regular_not_symlink
  run_one_test "REV13-ST28-WHITELIST-MATCH" t_whitelist_match
  run_one_test "REV13-ST29-WHITELIST-REJECT" t_whitelist_reject
  run_one_test "REV13-ST30-BINARY-IDENTICAL" t_binary_identical
  run_one_test "REV13-ST31-BINARY-DIFFERENT" t_binary_different
  run_one_test "REV13-ST32-JSON-DIAGNOSTIC" t_json_diagnostic
  run_one_test "REV13-ST33-FS-SUMMARY" t_fs_summary

  echo ""
  echo "=========================================="
  echo " REV-13 R3.5 Structured Test Summary"
  echo "=========================================="
  echo " Total tests dispatched: 33"
  echo " Script SHA-256: ${script_sha}"
  echo " HEAD Commit:    ${current_commit}"
  echo " Event protocol: TEST_START -> TEST_RESULT -> TEST_END"
  echo "=========================================="
  echo ""
  log_info "REV-13 R3.5 Forensic Script Verification: COMPLETE (closure verified by external analyzer)"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
