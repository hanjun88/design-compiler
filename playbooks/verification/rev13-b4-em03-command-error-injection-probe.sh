#!/usr/bin/env bash
# playbooks/verification/rev13-b4-em03-command-error-injection-probe.sh
# B4-EM-03P2 Full-Harness Command-Error Injection Probe
#
# Purpose: Physically inject git command errors INSIDE the full harness via
# selective fault injection (fake git shim), closing the review board's
# `full_harness_command_error_replay: NOT_PROVEN` evidence gap.
#
# Method: A fake `git` shim intercepts ONLY the target subcommands used by
# check_protected_zones() and returns rc=128. All other git calls
# (rev-parse, cat-file, diff --name-status, etc.) pass through to the real
# git binary. This breaks the P5 limitation ("global git failure is not
# feasible") because the harness boots normally and the failure is triggered
# inside check_protected_zones() itself.
#
# Scenarios:
#   S1 clean-control    no injection            → exit 0,  STATUS=PASS
#   S2 inject-diff      INJECT_DIFF=1           → exit 2,  STATUS=FAIL(BLOCKED_ENV_COMMAND_ERROR)
#   S3 inject-ls-files  INJECT_LSFILES=1        → exit 2,  STATUS=FAIL(BLOCKED_ENV_COMMAND_ERROR)

set -uo pipefail

PROBE_VERSION="1.0.0-B4-EM-03P2"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HARNESS="$REPO_ROOT/playbooks/verification/rev13-r311-verification-harness.sh"
REAL_GIT="$(command -v git)"
SHIM_DIR="$(mktemp -d /tmp/b4-em03p2-shim.XXXXXX)"
RUN_DIR="$(mktemp -d /tmp/b4-em03p2-run.XXXXXX)"
PASS_COUNT=0
FAIL_COUNT=0

echo "================================================================"
echo "B4-EM-03P2 FULL-HARNESS COMMAND-ERROR INJECTION PROBE"
echo "Probe Version: $PROBE_VERSION"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Repo Root: $REPO_ROOT"
echo "Real git: $REAL_GIT ($(git --version))"
echo "Shim Dir: $SHIM_DIR"
echo "Run Dir:  $RUN_DIR"
echo "Harness HEAD: $(git -C "$REPO_ROOT" rev-parse --short=7 HEAD)"
echo "================================================================"

# ── Build fake git shim ─────────────────────────────────────────────────────
cat > "$SHIM_DIR/git" <<EOF
#!/usr/bin/env bash
args=("\$@")
i=0
# skip -C <path> if present (harness calls: git -C <root> <subcommand> ...)
if [[ "\${args[0]}" == "-C" ]]; then i=2; fi
cmd="\${args[\$i]:-}"
sub="\${args[\$((i+1))]:-}"

if [[ "\${INJECT_DIFF:-0}" == "1" && "\$cmd" == "diff" && "\$sub" == "--quiet" ]]; then
  echo "[FAKE_GIT] INJECTED FAILURE: git diff --quiet -> rc=128" >&2
  exit 128
fi
if [[ "\${INJECT_LSFILES:-0}" == "1" && "\$cmd" == "ls-files" ]]; then
  echo "[FAKE_GIT] INJECTED FAILURE: git ls-files -> rc=128" >&2
  exit 128
fi
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM_DIR/git"
echo "[SETUP] fake git shim created: $SHIM_DIR/git"
echo "[SETUP] shim intercepts: diff --quiet (INJECT_DIFF=1) / ls-files (INJECT_LSFILES=1), else passthrough"
echo ""

# ── Run one scenario ────────────────────────────────────────────────────────
run_scenario() {
  local name="$1"
  local inject_env="$2"
  local expected_exit="$3"
  local expected_status="$4"
  local logfile="$RUN_DIR/$name.log"

  echo ""
  echo "----------------------------------------------------------------"
  echo "SCENARIO: $name"
  echo "  INJECT_ENV    = $inject_env"
  echo "  EXPECTED_EXIT = $expected_exit"
  echo "  EXPECTED_STAT = $expected_status"
  echo "----------------------------------------------------------------"

  # ensure clean working tree for protected zones before each scenario
  git -C "$REPO_ROOT" checkout -- tests/chinese-aesthetic/render/evidence/ 2>/dev/null || true

  # run harness with shim on PATH
  (
    cd "$REPO_ROOT" || exit 1
    if [[ -n "$inject_env" ]]; then
      # shellcheck disable=SC2086
      PATH="$SHIM_DIR:$PATH" env $inject_env bash "$HARNESS" > "$logfile" 2>&1
    else
      PATH="$SHIM_DIR:$PATH" bash "$HARNESS" > "$logfile" 2>&1
    fi
  )
  local rc=$?

  echo "  ACTUAL_EXIT   = $rc"
  echo "  Key output lines:"
  grep -E "FAKE_GIT|PROTECTED_ZONE|COMMAND_ERROR|FINAL_EXIT_CODE|All .* stages|protected_zone=" "$logfile" | sed 's/^/    /' | head -12

  # assertions
  local status_line
  status_line="$(grep -oiE "protected_zone=[A-Za-z()_]+" "$logfile" | tail -1)"
  local pass=1
  if [[ "$rc" -ne "$expected_exit" ]]; then
    echo "  ✗ FAIL: exit code $rc != expected $expected_exit"
    pass=0
  fi
  if [[ -n "$expected_status" && "$status_line" != *"$expected_status"* ]]; then
    echo "  ✗ FAIL: status '$status_line' does not contain '$expected_status'"
    pass=0
  fi
  if [[ "$pass" -eq 1 ]]; then
    echo "  RESULT: PASS"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  RESULT: FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════
# S1: clean control — prove the shim does not break the normal path
# ══════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════════════════"
echo "S1: CLEAN CONTROL (no injection, shim passthrough)"
echo "══════════════════════════════════════════════════════════════"
run_scenario "s1-clean-control" "" "0" "PASS"

# ══════════════════════════════════════════════════════════════════════════
# S2: inject git diff --quiet failure (rc=128)
# ══════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════════════════"
echo "S2: INJECT git diff --quiet -> rc=128"
echo "══════════════════════════════════════════════════════════════"
echo "  Requirement #1: git diff return code >1 must enter"
echo "  BLOCKED_ENV_COMMAND_ERROR (not misreported as tampering)."
run_scenario "s2-inject-diff" "INJECT_DIFF=1" "2" "BLOCKED_ENV_COMMAND_ERROR"

# ══════════════════════════════════════════════════════════════════════════
# S3: inject git ls-files failure (rc=128)
# ══════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════════════════"
echo "S3: INJECT git ls-files -> rc=128"
echo "══════════════════════════════════════════════════════════════"
echo "  Requirement #2: git ls-files non-zero must NOT be misjudged"
echo "  as clean (fail-open eliminated)."
run_scenario "s3-inject-lsfiles" "INJECT_LSFILES=1" "2" "BLOCKED_ENV_COMMAND_ERROR"

# ══════════════════════════════════════════════════════════════════════════
# Limitation statement (Requirement #4)
# ══════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════════════════"
echo "LIMITATION STATEMENT (Requirement #4)"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Scope of this probe:"
echo "    - Selectively injects git diff --quiet / git ls-files failures"
echo "      inside check_protected_zones() within the FULL harness."
echo "    - Proves: command_error -> FAIL(BLOCKED_ENV_COMMAND_ERROR)"
echo "      -> funnel -> exit 2 (fail-closed)."
echo ""
echo "  Known limitations (NOT claimed as full-chain coverage):"
echo "    - The shim models git returning rc=128. Real-world git failures"
echo "      (e.g. corrupted .git/objects, permission errors) may surface"
echo "      at different call sites; each is still routed through the same"
echo "      explicit rc-check code paths verified here."
echo "    - Global git unavailability still cannot be tested at full-harness"
echo "      level (harness boot requires git rev-parse). That scenario is"
echo "      covered by P1.4 isolated-function probe."
echo "    - Funnel mapping verified for BLOCKED_ENV_COMMAND_ERROR exit 2;"
echo "      tampering mapping (PROTECTED_ZONE_TAMPERING exit 2) was verified"
echo "      in B4-EM-03 / B4-EM-03P1 adversarial tests."
echo ""
echo "  RESULT: DOCUMENTED"

# ══════════════════════════════════════════════════════════════════════════
# Cleanup & summary
# ══════════════════════════════════════════════════════════════════════════
git -C "$REPO_ROOT" checkout -- tests/chinese-aesthetic/render/evidence/ 2>/dev/null || true
rm -rf "$SHIM_DIR"

echo ""
echo "================================================================"
echo "B4-EM-03P2 PROBE SUMMARY"
echo "================================================================"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "  TOTAL: $((PASS_COUNT + FAIL_COUNT))"
echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
  echo "  VERDICT: ALL SCENARIOS PASS"
else
  echo "  VERDICT: FAILURES DETECTED"
fi
echo "  Scenario logs preserved at: $RUN_DIR"
echo "================================================================"

exit $FAIL_COUNT
