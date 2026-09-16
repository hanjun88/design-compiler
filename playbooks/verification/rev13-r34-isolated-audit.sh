#!/usr/bin/env bash
# REV-13 R3.4 Isolated Clean Worktree Audit Runner
# Protocol: git worktree add --detach → verify clean → run harness → copy evidence → remove
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
AUDIT_COMMIT="${1:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
AUDIT_TEMP_DIR="/tmp/heartmirror-audit-${AUDIT_COMMIT:0:7}"
EVIDENCE_REL="tests/chinese-aesthetic/render/evidence"
HARNESS_REL="playbooks/verification/rev13-r32-verification-harness.sh"

echo "=== R3.4 ISOLATED WORKTREE AUDIT ==="
echo "AUDIT_COMMIT=$AUDIT_COMMIT"
echo "AUDIT_TEMP_DIR=$AUDIT_TEMP_DIR"
echo ""

# 1. Clean any prior worktree at this path
if [ -d "$AUDIT_TEMP_DIR" ]; then
  echo "[*] Removing prior isolated worktree..."
  git -C "$REPO_ROOT" worktree remove --force "$AUDIT_TEMP_DIR" 2>/dev/null || rm -rf "$AUDIT_TEMP_DIR"
fi

# 2. Create detached worktree at target commit
echo "[*] Creating isolated worktree at $AUDIT_COMMIT..."
git -C "$REPO_ROOT" worktree add --detach "$AUDIT_TEMP_DIR" "$AUDIT_COMMIT"

# 3. Verify absolute cleanliness
echo "[*] Verifying worktree cleanliness..."
cd "$AUDIT_TEMP_DIR"
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "[-] ISOLATION_FAILURE: Dirty state in clean worktree:" >&2
  echo "$DIRTY" >&2
  cd - >/dev/null
  git -C "$REPO_ROOT" worktree remove --force "$AUDIT_TEMP_DIR"
  exit 1
fi
echo "[+] Worktree is CLEAN"

# 4. Run harness, capture stdout/stderr separately
echo "[*] Running harness in isolated worktree..."
HARNESS_STDOUT="$AUDIT_TEMP_DIR/audit-harness-stdout.log"
HARNESS_STDERR="$AUDIT_TEMP_DIR/audit-harness-stderr.log"
set +e
bash "$AUDIT_TEMP_DIR/$HARNESS_REL" > "$HARNESS_STDOUT" 2> "$HARNESS_STDERR"
HARNESS_EXIT=$?
set -e
echo "[+] Harness exit=$HARNESS_EXIT"

# 5. Compute log hashes
echo ""
echo "=== EVIDENCE HASHES ==="
sha256sum "$HARNESS_STDOUT" "$HARNESS_STDERR"
echo ""
EVIDENCE_DIR="$AUDIT_TEMP_DIR/$EVIDENCE_REL"
for f in rev13-r3-bash-n.log rev13-r3-shellcheck.log rev13-r3-selftest.log rev13-r3-version-binding.json; do
  if [ -f "$EVIDENCE_DIR/$f" ]; then
    sha256sum "$EVIDENCE_DIR/$f"
  fi
done

# 6. Copy evidence back to main repo
echo ""
echo "[*] Copying evidence to main repo..."
cp -f "$EVIDENCE_DIR"/rev13-r3-*.log "$EVIDENCE_DIR"/rev13-r3-version-binding.json "$REPO_ROOT/$EVIDENCE_REL/"
cp -f "$HARNESS_STDOUT" "$HARNESS_STDERR" "$REPO_ROOT/$EVIDENCE_REL/"
echo "[+] Evidence copied"

# 7. Show binding JSON
echo ""
echo "=== BINDING JSON ==="
cat "$REPO_ROOT/$EVIDENCE_REL/rev13-r3-version-binding.json"

# 8. Cleanup isolated worktree
echo ""
echo "[*] Removing isolated worktree..."
cd - >/dev/null
git -C "$REPO_ROOT" worktree remove --force "$AUDIT_TEMP_DIR"
echo "[+] Isolated worktree removed"
echo ""
echo "=== AUDIT COMPLETE (exit=$HARNESS_EXIT) ==="
