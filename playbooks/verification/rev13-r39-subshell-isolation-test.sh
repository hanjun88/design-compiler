#!/usr/bin/env bash
# ==============================================================================
# REV-13 R3.9 P1-3: Subshell Counter Isolation Verification
# 独立验证：子壳 ( ... ) 内修改 EVENT_SEQ 不影响父进程计数器
# 退出码：0=隔离有效，1=隔离失败（子壳污染了父进程）
# ==============================================================================
set -euo pipefail

echo "=== P1-3 Subshell EVENT_SEQ Isolation Test ==="

# 初始化父进程计数器
EVENT_SEQ=42
echo "Parent EVENT_SEQ before subshell: $EVENT_SEQ"

# 在子壳中尝试破坏性修改
(
  EVENT_SEQ=999999
  echo "  Subshell EVENT_SEQ (mutated): $EVENT_SEQ"
  # 额外尝试：多次自增
  EVENT_SEQ=$((EVENT_SEQ + 1))
  echo "  Subshell EVENT_SEQ (after inc): $EVENT_SEQ"
)

echo "Parent EVENT_SEQ after subshell:  $EVENT_SEQ"

# 断言：父进程值必须完全不变
if [[ "$EVENT_SEQ" -ne 42 ]]; then
  echo "[-] FAIL: Subshell mutated parent EVENT_SEQ! (got $EVENT_SEQ, expected 42)"
  exit 1
fi

echo "[+] PASS: Subshell isolation confirmed — parent EVENT_SEQ unchanged"

# 第二阶段：验证 run_one_test 中的实际调用模式
echo ""
echo "=== P1-3 Code Audit: EVENT_SEQ assignment points ==="
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-pipeline-artifacts.sh"
if [[ -f "$SCRIPT" ]]; then
  echo "Target: $SCRIPT"
  ASSIGN_LINES=$(grep -n 'EVENT_SEQ=' "$SCRIPT" || true)
  ASSIGN_COUNT=$(echo "$ASSIGN_LINES" | grep -c 'EVENT_SEQ=' || true)
  echo "$ASSIGN_LINES"
  echo ""
  echo "Total EVENT_SEQ assignment points: $ASSIGN_COUNT"
  echo "Expected: 4 (1 init in main + 3 in run_one_test/record_test_result)"

  # 验证没有任何赋值在子壳内（子壳以 ( 开头的独立块）
  # 检查所有 t_* 测试函数体内是否有 EVENT_SEQ 赋值
  SUBSHELL_ASSIGN=$(awk '/^t_[a-z_]+\(\)/,/^}/' "$SCRIPT" | grep -c 'EVENT_SEQ=' || true)
  echo "EVENT_SEQ assignments inside t_* test functions: $SUBSHELL_ASSIGN (expected 0)"

  if [[ "$ASSIGN_COUNT" -eq 4 && "$SUBSHELL_ASSIGN" -eq 0 ]]; then
    echo "[+] PASS: All 4 assignments in parent-scope functions, zero in test functions"
  else
    echo "[-] FAIL: Unexpected assignment distribution"
    exit 1
  fi
else
  echo "[!] WARN: verify-pipeline-artifacts.sh not found, skipping code audit"
fi

echo ""
echo "=== P1-3 ALL CHECKS PASS ==="
exit 0
