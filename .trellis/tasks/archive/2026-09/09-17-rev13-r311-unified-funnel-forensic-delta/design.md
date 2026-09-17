# Design: REV-13 R3.11

## 1. 统一漏斗 Harness (`rev13-r311-verification-harness.sh`)

### 1.1 状态账本
所有阶段状态显式初始化为 `NOT_RUN`，执行后设为 `PASS` 或 `FAIL`：
- STATUS_BASH_N, STATUS_SHELLCHECK, STATUS_REGISTRY, STATUS_SELFTEST
- STATUS_CLOSURE, STATUS_SCRIPT_BLOB, STATUS_HARNESS_BLOB
- STATUS_TEMPORAL, STATUS_BINDING_WRITE

### 1.2 EXIT Trap 漏斗
```bash
HARNESS_PASSED=0
cleanup_and_funnel() {
  local rc=$?
  trap - EXIT
  if [[ "$HARNESS_PASSED" -ne 1 || "$rc" -ne 0 ]]; then
    echo "[-] FATAL: HARNESS FUNNEL INTERCEPTED FAILURE (rc=$rc)" >&2
    echo "[-] Stage ledger: ..." >&2
    rm -rf "$RUN_DIR"
    exit 1
  fi
  rm -rf "$RUN_DIR"
  exit 0
}
trap cleanup_and_funnel EXIT
```

### 1.3 防 set -e 静默崩溃
所有验证命令用 `&& STATUS=PASS || { STATUS=FAIL; HARNESS_FAIL=1; }`，不依赖 set -e 自动退出。

### 1.4 Git Blob 类型 + OID 验证
```bash
BLOB_SCRIPT_TYPE=$(git cat-file -t "HEAD:$SCRIPT_REL")  # 必须 == blob
BLOB_SCRIPT_OID=$(git rev-parse "HEAD:$SCRIPT_REL")
WORKTREE_SCRIPT_SHA=$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')
# 断言 type==blob, 且 worktree content hash 可独立验证
```

### 1.5 原子写入 Binding JSON
```bash
atomic_write_binding() {
  local tmp=$(mktemp ...)
  jq -n ... > "$tmp" || return 1
  jq empty "$tmp" || return 1  # 语法复核
  mv -f "$tmp" "$TARGET" || return 1
}
```

## 2. 差异白名单审计 (`verify-freeze-evidence-delta.sh`)

### 2.1 变动类型正向白名单
- `git diff --name-status <freeze> <head>` → 逐行解析
- 仅允许 `^A$` 和 `^M$`，拦截 D/R/C/T
- 路径必须匹配 `^(tests/chinese-aesthetic/render/evidence/|docs/audit/)`
- 扩展名必须 `\.(json|log)$`

### 2.2 模式变更防线
- `git diff --summary <freeze> <head>` → 若含 `mode change|rename|delete` → exit 1

## 3. 几何探针容差隔离 (`verify-golden-frame.js`)

- **STRICT_ZERO_PROBES**（0 LSB）：4 角点清屏色 + (10,10) 越界点
- **TOLERATED_PROBES**（--tolerance，默认 2 LSB）：(160,120) 中心插值点
- `--strict-exact`：所有探针 0 LSB

## 4. 注册表单次派发断言 (`rev13-registry-validator.py`)
- `collections.Counter` 统计源码中 `run_one_test "<id>"` 出现次数
- 每个 ID 必须 == 1，>1 报 DUPLICATE_DISPATCH，==0 报 MISSING_DISPATCH

## 5. Closure Analyzer 参数修复
- `if len(sys.argv) < 4: sys.exit(2)`（原 < 3 导致 IndexError）
- 位置参数：stdout, stderr, registry
