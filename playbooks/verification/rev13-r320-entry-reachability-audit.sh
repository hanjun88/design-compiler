#!/usr/bin/env bash
# ==============================================================================
# REV-13 R3.20 Entry Reachability Audit
# Scans repository for references to archived legacy harness entries (r34/r32).
# Classifies each reference: SELF_REFERENCE / DOCUMENTATION / ACTIVE_CODE.
# Verdict is based solely on ACTIVE_CODE references.
# Exit: 0 = zero active-code references, 1 = active-code reference found
# ==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TARGETS='rev13-r34-isolated-audit\.sh|rev13-r32-verification-harness\.sh'
HEAD_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"

echo "=== R3.20 ENTRY REACHABILITY AUDIT ==="
echo "HEAD=$HEAD_COMMIT"
echo "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "TARGETS=$TARGETS"
echo ""
echo "--- Directory Exclusions (pre-grep) ---"
echo "  .git/        : version control internal data"
echo "  .trellis/    : task planning/design documents (non-executable)"
echo "  evidence/    : historical evidence logs (references to archived files expected)"
echo "  __pycache__/ : Python bytecode cache"
echo ""
echo "--- Post-grep Classification ---"
echo "  SELF_REFERENCE   : match is inside an archived file itself (guarded, unreachable)"
echo "  DOCUMENTATION     : match is in *.md or docs/ (non-executable prose)"
echo "  ACTIVE_CODE       : match is in executable code (*.sh/*.py/*.js/*.ts/Makefile/CI/etc.)"
echo ""
echo "--- Scan Results ---"

SELF_COUNT=0
DOC_COUNT=0
ACTIVE_COUNT=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  # grep -rn output format: filepath:linenum:content
  filepath="${line%%:*}"

  # Classification 1: SELF_REFERENCE — match is within the archived files themselves
  if echo "$filepath" | grep -qE '(rev13-r34-isolated-audit|rev13-r32-verification-harness)\.sh$'; then
    echo "[SELF_REFERENCE] $line"
    SELF_COUNT=$((SELF_COUNT + 1))
    continue
  fi

  # Classification 2: DOCUMENTATION — match is in markdown or docs/ directory
  if echo "$filepath" | grep -qE '\.(md|markdown|rst|txt)$' || echo "$filepath" | grep -q '/docs/'; then
    echo "[DOCUMENTATION] $line"
    DOC_COUNT=$((DOC_COUNT + 1))
    continue
  fi

  # Classification 3: ACTIVE_CODE — everything else is a potential execution entry
  echo "[ACTIVE_CODE] $line"
  ACTIVE_COUNT=$((ACTIVE_COUNT + 1))
done < <(grep -rnE "$TARGETS" "$REPO_ROOT" \
  --exclude-dir=.git \
  --exclude-dir=.trellis \
  --exclude-dir=evidence \
  --exclude-dir=__pycache__ \
  2>/dev/null || true)

echo ""
echo "=== Summary ==="
echo "SELF_REFERENCES=$SELF_COUNT (archived files' own content, guarded)"
echo "DOCUMENTATION_REFERENCES=$DOC_COUNT (non-executable prose)"
echo "ACTIVE_CODE_REFERENCES=$ACTIVE_COUNT (potential execution entry)"
echo ""
if [ "$ACTIVE_COUNT" -eq 0 ]; then
  echo "VERDICT=PASS (ZERO_ACTIVE_CODE_REFERENCES)"
  exit 0
else
  echo "VERDICT=FAIL (ACTIVE_CODE_REFERENCES_FOUND)"
  exit 1
fi
