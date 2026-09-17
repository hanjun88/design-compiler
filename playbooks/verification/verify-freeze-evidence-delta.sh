#!/usr/bin/env bash
# ==============================================================================
# playbooks/verification/verify-freeze-evidence-delta.sh
# 法医断言：Source Freeze -> Evidence Commit 差异白名单与变动类型审计
# 仅允许 A(新增)/M(修改)，拦截 D(删除)/R(重命名)/C(拷贝)/T(类型变更)
# 路径白名单：tests/chinese-aesthetic/render/evidence/ + docs/audit/
# 扩展名白名单：.json / .log
# ==============================================================================
set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "[-] FATAL: Not inside a Git repository" >&2; exit 1; }

SOURCE_FREEZE="${1:-}"
EVIDENCE_HEAD="${2:-HEAD}"

if [[ -z "$SOURCE_FREEZE" ]]; then
  echo "Usage: $0 <source-freeze-commit> [evidence-head-commit]" >&2
  exit 2
fi

echo "[*] Auditing commit range: $SOURCE_FREEZE -> $EVIDENCE_HEAD"

ALLOWED_DIR_REGEX='^(tests/chinese-aesthetic/render/evidence/|docs/audit/)'
ALLOWED_EXT_REGEX='\.(json|log)$'

# ── 1. --summary 模式变更/重命名/删除防线 ───────────────────────────────────
SUMMARY_OUTPUT="$(git -C "$WORKSPACE_ROOT" diff --summary "$SOURCE_FREEZE" "$EVIDENCE_HEAD" 2>/dev/null || true)"
if echo "$SUMMARY_OUTPUT" | grep -E -q '(mode change|rename|delete)'; then
  echo "[-] FATAL: UNAUTHORIZED_MODE_MUTATION_OR_RENAME detected in --summary" >&2
  echo "$SUMMARY_OUTPUT" >&2
  exit 1
fi

# ── 2. --name-status 逐行审计 ───────────────────────────────────────────────
RAW_STATUS="$(git -C "$WORKSPACE_ROOT" diff --name-status "$SOURCE_FREEZE" "$EVIDENCE_HEAD" 2>/dev/null || true)"

if [[ -z "$RAW_STATUS" ]]; then
  echo "[+] IDENTICAL: Zero files changed between $SOURCE_FREEZE and $EVIDENCE_HEAD"
  exit 0
fi

VIOLATIONS=()
AUDITED_COUNT=0

while IFS=$'\t' read -r status path1 path2; do
  [[ -z "$status" ]] && continue
  AUDITED_COUNT=$((AUDITED_COUNT + 1))

  # R/C 有两个路径字段，目标为 path2
  target_path="$path1"
  if [[ "$status" =~ ^[RC] ]]; then
    target_path="$path2"
  fi

  # 规则 A：仅允许 A 或 M
  if [[ ! "$status" =~ ^[AM]$ ]]; then
    VIOLATIONS+=("DISALLOWED_CHANGE_TYPE: status='$status' file='$target_path'")
    continue
  fi

  # 规则 B：路径必须在白名单目录内
  if ! [[ "$target_path" =~ $ALLOWED_DIR_REGEX ]]; then
    VIOLATIONS+=("DISALLOWED_PATH: '$target_path' outside evidence whitelist (status=$status)")
    continue
  fi

  # 规则 C：扩展名必须为 .json 或 .log
  if ! [[ "$target_path" =~ $ALLOWED_EXT_REGEX ]]; then
    VIOLATIONS+=("DISALLOWED_EXTENSION: '$target_path' (status=$status)")
    continue
  fi
done <<< "$RAW_STATUS"

# ── 3. 判定 ─────────────────────────────────────────────────────────────────
if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
  echo "[-] ================================================================" >&2
  echo "[-] FATAL: FORENSIC AUDIT FAILED — ${#VIOLATIONS[@]} violation(s):" >&2
  for v in "${VIOLATIONS[@]}"; do
    echo "[-]   * $v" >&2
  done
  echo "[-] ================================================================" >&2
  exit 1
fi

echo "[+] FORENSIC PASS: $AUDITED_COUNT change(s) strictly confined to evidence whitelist (A/M only, .json/.log only)."
exit 0
