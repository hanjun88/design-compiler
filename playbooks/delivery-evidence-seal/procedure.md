# Procedure: 交付证据与版本封签

> 本 Playbook 是交付前的最终质量门禁。所有判定必须基于物理执行证据（git 命令原始输出、测试日志、TS 门禁输出、证据文件 SHA-256），不得以猜测或自我声明替代。
>
> 代码块性质声明：本文档中的所有 shell 命令均为可执行模板。`<test-log>`、`<base-commit>`、`<branch>` 等尖括号占位符必须替换为实际值后执行。失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，不再使用 `FAIL (ERROR_CODE)` 伪代码。所有命令的退出码、stdout 和 stderr 必须原始留存。

## Phase 0: 前置条件与变量初始化

```bash
# 工具链检查
for tool in git jq sha256sum stat mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "TOOL_MISSING: $tool not found"
    exit 2
  fi
done

# 输入参数（调用方必须提供）
TEST_LOG_STDOUT="${TEST_LOG_STDOUT:?TEST_LOG_STDOUT not set}"
TEST_LOG_STDERR="${TEST_LOG_STDERR:?TEST_LOG_STDERR not set}"
BASE_COMMIT="${BASE_COMMIT:?BASE_COMMIT not set (e.g. origin/main)}"
BRANCH="${BRANCH:?BRANCH not set}"
REPO_ROOT="${REPO_ROOT:?REPO_ROOT not set}"

cd "$REPO_ROOT" || { echo "REPO_ROOT_INACCESSIBLE: $REPO_ROOT"; exit 2; }

# 证据文件初始化（mktemp 隔离路径，不删除，纳入证据清单）
SEAL_REPORT=$(mktemp -t seal-report-XXXXXX.json)
GIT_STATUS_FILE=$(mktemp -t git-status-XXXXXX.txt)
GIT_LOG_FILE=$(mktemp -t git-log-XXXXXX.txt)
REMOTE_HEAD_FILE=$(mktemp -t remote-head-XXXXXX.txt)
DIFF_STAT_FILE=$(mktemp -t diff-stat-XXXXXX.txt)
DIFF_NAME_FILE=$(mktemp -t diff-name-XXXXXX.txt)
EVIDENCE_SHA_FILE=$(mktemp -t evidence-sha-XXXXXX.txt)
TS_GATE_STDOUT=$(mktemp -t ts-gate-stdout-XXXXXX.log)
TS_GATE_STDERR=$(mktemp -t ts-gate-stderr-XXXXXX.log)
GIT_ERR_FILE=$(mktemp -t git-err-XXXXXX.txt)
STAT_ERR_FILE=$(mktemp -t stat-err-XXXXXX.txt)
SEAL_LOG=$(mktemp -t seal-log-XXXXXX.txt)

# 状态变量
SEAL_STATUS="NOT_RUN"
FAIL_COUNT=0
BLOCKED_COUNT=0

echo "SEAL_REPORT=$SEAL_REPORT"
echo "TEST_LOG_STDOUT=$TEST_LOG_STDOUT"
echo "TEST_LOG_STDERR=$TEST_LOG_STDERR"
echo "BASE_COMMIT=$BASE_COMMIT"
echo "BRANCH=$BRANCH"
```

## Step 1: 确认代码提交状态

1. 记录当前 commit SHA：

```bash
COMMIT_HASH=$(git rev-parse HEAD 2>"$GIT_ERR_FILE")
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_REVPARSE_FAILED: git rev-parse HEAD failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "GIT_REVPARSE_FAILED"
  exit 2
fi
echo "COMMIT_HASH=$COMMIT_HASH" >> "$SEAL_LOG"
```

2. 记录工作树状态：

```bash
git status --porcelain=v1 > "$GIT_STATUS_FILE" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_STATUS_FAILED: git status failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "GIT_STATUS_FAILED"
  exit 2
fi

CHANGED_FILES=$(wc -l < "$GIT_STATUS_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count changed files (exit=$WC_EXIT)"
  exit 2
fi
echo "CHANGED_FILES=$CHANGED_FILES" >> "$SEAL_LOG"
if [ "$CHANGED_FILES" -gt 0 ]; then
  echo "UNCOMMITTED_CHANGES: $CHANGED_FILES files" >> "$SEAL_LOG"
  cat "$GIT_STATUS_FILE" >> "$SEAL_LOG"
fi
```

3. 记录最近提交历史：

```bash
git log --oneline -5 > "$GIT_LOG_FILE" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_LOG_FAILED: git log failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
fi
echo "GIT_LOG_FILE=$GIT_LOG_FILE" >> "$SEAL_LOG"
```

判定分类：
- `GIT_REVPARSE_FAILED` / `GIT_STATUS_FAILED` → BLOCKED_ENV
- 有未提交变更 → 记录 `UNCOMMITTED_CHANGES`，不自动提交（需用户决策），继续后续步骤
- commit SHA 已记录、工作树状态已记录 → Step 1 PASS

## Step 2: 确认远程同步状态

1. 记录远程 HEAD：

```bash
git ls-remote origin "$BRANCH" > "$REMOTE_HEAD_FILE" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "REMOTE_INACCESSIBLE: git ls-remote failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "REMOTE_INACCESSIBLE"
  exit 2
fi
REMOTE_HASH=$(awk '{print $1}' "$REMOTE_HEAD_FILE")
echo "REMOTE_HASH=$REMOTE_HASH" >> "$SEAL_LOG"
```

2. fetch 远程分支：

```bash
git fetch origin "$BRANCH" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_FETCH_FAILED: git fetch failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "GIT_FETCH_FAILED"
  exit 2
fi
```

3. 计算领先/落后提交数：

```bash
AHEAD_COUNT=$(git rev-list --count "origin/$BRANCH..HEAD" 2>"$GIT_ERR_FILE")
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "REVLIST_FAILED: ahead count failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  AHEAD_COUNT="UNKNOWN"
fi

BEHIND_COUNT=$(git rev-list --count "HEAD..origin/$BRANCH" 2>"$GIT_ERR_FILE")
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "REVLIST_FAILED: behind count failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  BEHIND_COUNT="UNKNOWN"
fi

echo "AHEAD_COUNT=$AHEAD_COUNT" >> "$SEAL_LOG"
echo "BEHIND_COUNT=$BEHIND_COUNT" >> "$SEAL_LOG"

if [ "$AHEAD_COUNT" != "UNKNOWN" ] && [ "$AHEAD_COUNT" -gt 0 ]; then
  echo "NOT_PUSHED: $AHEAD_COUNT commits ahead of origin/$BRANCH" >> "$SEAL_LOG"
fi
if [ "$BEHIND_COUNT" != "UNKNOWN" ] && [ "$BEHIND_COUNT" -gt 0 ]; then
  echo "BEHIND_REMOTE: $BEHIND_COUNT commits behind origin/$BRANCH" >> "$SEAL_LOG"
fi
```

判定分类：
- `REMOTE_INACCESSIBLE` / `GIT_FETCH_FAILED` → BLOCKED_ENV
- 本地领先远程 → 记录 `NOT_PUSHED`，不得声称"已推送"，继续后续步骤
- 远程领先本地 → 记录 `BEHIND_REMOTE`，继续后续步骤
- 本地与远程一致 → Step 2 PASS

## Step 3: 采集测试证据

1. 确认测试日志文件存在且非空：

```bash
TEST_LOG_VALID=1

for logfile in "$TEST_LOG_STDOUT" "$TEST_LOG_STDERR"; do
  if [ ! -f "$logfile" ]; then
    echo "TEST_LOG_MISSING: $logfile" >> "$SEAL_LOG"
    TEST_LOG_VALID=0
  else
    LOG_SIZE=$(stat -c %s "$logfile" 2>"$STAT_ERR_FILE")
    STAT_EXIT=$?
    if [ $STAT_EXIT -ne 0 ]; then
      echo "TEST_LOG_STAT_ERROR: stat failed for $logfile (exit=$STAT_EXIT)" >> "$SEAL_LOG"
      cat "$STAT_ERR_FILE" >> "$SEAL_LOG"
      TEST_LOG_VALID=0
    elif [ "$LOG_SIZE" -eq 0 ]; then
      echo "TEST_LOG_EMPTY: $logfile is 0 bytes" >> "$SEAL_LOG"
      TEST_LOG_VALID=0
    else
      echo "TEST_LOG_OK: $logfile (size=$LOG_SIZE)" >> "$SEAL_LOG"
    fi
  fi
done

if [ "$TEST_LOG_VALID" -eq 0 ]; then
  echo "TEST_LOG_INVALID: one or more test logs missing or empty"
  exit 2
fi
```

2. 解析测试通过/失败数（兼容常见测试输出格式）：

```bash
# 提取测试通过数（兼容 "X passed" / "X tests passed" / "passing X" 等格式）
TEST_PASSED=$(grep -oE '[0-9]+ (passed|passing|tests passed)' "$TEST_LOG_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
if [ -z "$TEST_PASSED" ]; then
  TEST_PASSED=$(grep -oE 'passing [0-9]+' "$TEST_LOG_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
fi

# 提取测试失败数
TEST_FAILED=$(grep -oE '[0-9]+ (failed|failing)' "$TEST_LOG_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
if [ -z "$TEST_FAILED" ]; then
  TEST_FAILED=0
fi

# 提取测试总数
TEST_TOTAL=$(grep -oE '[0-9]+ (tests|test)' "$TEST_LOG_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)

echo "TEST_PASSED=$TEST_PASSED" >> "$SEAL_LOG"
echo "TEST_FAILED=$TEST_FAILED" >> "$SEAL_LOG"
echo "TEST_TOTAL=$TEST_TOTAL" >> "$SEAL_LOG"

# REV-3 修正：测试日志格式无法识别时阻断，不得静默 PASS
if [ -z "$TEST_PASSED" ] && [ -z "$TEST_TOTAL" ]; then
  echo "TEST_LOG_FORMAT_UNRECOGNIZED: cannot parse test counts from stdout" >> "$SEAL_LOG"
  echo "TEST_LOG_FORMAT_UNRECOGNIZED"
  exit 2
fi

if [ "$TEST_FAILED" != "0" ] && [ -n "$TEST_FAILED" ]; then
  echo "TEST_FAILURES_DETECTED: $TEST_FAILED tests failed" >> "$SEAL_LOG"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
```

3. 确认日志捕获时的 commit SHA 与当前 HEAD 一致：

```bash
# 在测试日志中搜索 commit SHA 记录（兼容多种格式）
LOG_COMMIT_HASH=$(grep -oE '[a-f0-9]{40}' "$TEST_LOG_STDOUT" 2>/dev/null | head -1)
if [ -z "$LOG_COMMIT_HASH" ]; then
  LOG_COMMIT_HASH=$(grep -oE '[a-f0-9]{40}' "$TEST_LOG_STDERR" 2>/dev/null | head -1)
fi

if [ -n "$LOG_COMMIT_HASH" ]; then
  echo "LOG_COMMIT_HASH=$LOG_COMMIT_HASH" >> "$SEAL_LOG"
  if [ "$LOG_COMMIT_HASH" != "$COMMIT_HASH" ]; then
    echo "COMMIT_HASH_MISMATCH: log commit=$LOG_COMMIT_HASH current=$COMMIT_HASH" >> "$SEAL_LOG"
    echo "COMMIT_HASH_MISMATCH"
    exit 1
  fi
  echo "COMMIT_HASH_MATCH: log matches current HEAD" >> "$SEAL_LOG"
else
  echo "COMMIT_HASH_NOT_FOUND_IN_LOG: no commit SHA found in test logs" >> "$SEAL_LOG"
fi
```

判定分类：
- `TEST_LOG_MISSING` / `TEST_LOG_EMPTY` / `TEST_LOG_INVALID` → BLOCKED_ENV
- `COMMIT_HASH_MISMATCH` → FAIL（日志与当前 HEAD 不一致，需重跑）
- 测试失败数 > 0 → 记录 `TEST_FAILURES_DETECTED`，FAIL_COUNT+1
- 日志存在且非空、commit SHA 一致（或日志中无 SHA 记录）、测试通过 → Step 3 PASS

## Step 4: 采集 TypeScript 双轨门禁证据

1. 执行 TS 门禁脚本：

```bash
TS_GATE_SCRIPT="scripts/verify-baseline-ts.mjs"
TS_GATE_AVAILABLE=1

if [ ! -f "$TS_GATE_SCRIPT" ]; then
  echo "TS_GATE_SCRIPT_MISSING: $TS_GATE_SCRIPT not found" >> "$SEAL_LOG"
  TS_GATE_AVAILABLE=0
fi

if [ "$TS_GATE_AVAILABLE" -eq 1 ]; then
  node "$TS_GATE_SCRIPT" > "$TS_GATE_STDOUT" 2>"$TS_GATE_STDERR"
  TS_EXIT=$?
  echo "TS_GATE_EXIT=$TS_EXIT" >> "$SEAL_LOG"
  echo "TS_GATE_STDOUT=$TS_GATE_STDOUT" >> "$SEAL_LOG"
  echo "TS_GATE_STDERR=$TS_GATE_STDERR" >> "$SEAL_LOG"
  # REV-3 修正：TS 门禁退出码非零时标记失败，禁止从空输出默认 PASS
  if [ "$TS_EXIT" -ne 0 ]; then
    echo "TS_GATE_EXECUTION_FAILED: node exit=$TS_EXIT (non-zero, GATE results unreliable)" >> "$SEAL_LOG"
    cat "$TS_GATE_STDERR" >> "$SEAL_LOG"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
else
  TS_EXIT="NOT_RUN"
  echo "TS_GATE_NOT_RUN: script not available" >> "$SEAL_LOG"
fi
```

2. 解析 GATE-A（Scoped TypeScript）：

```bash
if [ "$TS_GATE_AVAILABLE" -eq 1 ]; then
  # GATE-A: scoped errors 必须为 0
  GATE_A_ERRORS=$(grep -oE 'GATE-A.*[0-9]+ (error|errors)' "$TS_GATE_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  if [ -z "$GATE_A_ERRORS" ]; then
    GATE_A_ERRORS=$(grep -oE 'scoped.*[0-9]+ (error|errors)' "$TS_GATE_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  fi
  echo "GATE_A_ERRORS=$GATE_A_ERRORS" >> "$SEAL_LOG"

  if [ -n "$GATE_A_ERRORS" ] && [ "$GATE_A_ERRORS" -ne 0 ]; then
    echo "GATE_A_FAILED: scoped TypeScript has $GATE_A_ERRORS errors" >> "$SEAL_LOG"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif [ -n "$GATE_A_ERRORS" ] && [ "$GATE_A_ERRORS" -eq 0 ]; then
    echo "GATE_A_PASS: scoped TypeScript 0 errors" >> "$SEAL_LOG"
  fi
fi
```

3. 解析 GATE-B（Baseline matching）：

```bash
if [ "$TS_GATE_AVAILABLE" -eq 1 ]; then
  # GATE-B: baseline 必须恰好 3 项，全部匹配白名单，0 新增
  GATE_B_TOTAL=$(grep -oE 'GATE-B.*[0-9]+ (item|items)' "$TS_GATE_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  GATE_B_MATCHED=$(grep -oE 'matched.*[0-9]+' "$TS_GATE_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  GATE_B_NEW=$(grep -oE 'new.*[0-9]+' "$TS_GATE_STDOUT" 2>/dev/null | grep -oE '[0-9]+' | head -1)

  echo "GATE_B_TOTAL=$GATE_B_TOTAL" >> "$SEAL_LOG"
  echo "GATE_B_MATCHED=$GATE_B_MATCHED" >> "$SEAL_LOG"
  echo "GATE_B_NEW=$GATE_B_NEW" >> "$SEAL_LOG"

  GATE_B_PASS=1
  if [ -n "$GATE_B_TOTAL" ] && [ "$GATE_B_TOTAL" -ne 3 ]; then
    echo "GATE_B_COUNT_MISMATCH: expected 3 baseline items, got $GATE_B_TOTAL" >> "$SEAL_LOG"
    GATE_B_PASS=0
  fi
  # REV-3 修正：GATE-B matched 数必须为 3，全部匹配白名单
  if [ -n "$GATE_B_MATCHED" ] && [ "$GATE_B_MATCHED" -ne 3 ]; then
    echo "GATE_B_MATCH_MISMATCH: expected 3 matched, got $GATE_B_MATCHED" >> "$SEAL_LOG"
    GATE_B_PASS=0
  fi
  if [ -n "$GATE_B_NEW" ] && [ "$GATE_B_NEW" -ne 0 ]; then
    echo "GATE_B_NEW_ERRORS: $GATE_B_NEW new baseline errors" >> "$SEAL_LOG"
    GATE_B_PASS=0
  fi
  # REV-3 修正：TS_EXIT 非零时 GATE-B 不得 PASS
  if [ "$TS_EXIT" != "NOT_RUN" ] && [ "$TS_EXIT" -ne 0 ]; then
    GATE_B_PASS=0
  fi

  if [ "$GATE_B_PASS" -eq 1 ]; then
    echo "GATE_B_PASS: baseline matching 3/3, 0 new" >> "$SEAL_LOG"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
fi
```

4. 口径分层记录：

```bash
if [ "$TS_GATE_AVAILABLE" -eq 1 ]; then
  echo "TS_VERDICT_LAYERED:" >> "$SEAL_LOG"
  echo "  Scoped TypeScript: $([ -n "$GATE_A_ERRORS" ] && [ "$GATE_A_ERRORS" -eq 0 ] && echo 'PASS' || echo 'CHECK')" >> "$SEAL_LOG"
  echo "  Baseline matching: $([ "$GATE_B_PASS" -eq 1 ] && echo 'PASS' || echo 'CHECK')" >> "$SEAL_LOG"
  echo "  Repository-wide zero-error: FAIL (baseline errors exist by design)" >> "$SEAL_LOG"
fi
```

判定分类：
- `TS_GATE_SCRIPT_MISSING` → 记录 NOT_RUN，不阻断（脚本可能不在此仓库）
- GATE-A scoped errors > 0 → FAIL
- GATE-B baseline 总数 ≠ 3 或新增 > 0 → FAIL
- TS 门禁退出码非 0 → 记录，结合 GATE-A/GATE-B 解析结果判定
- 口径必须分层：Scoped TS PASS / Baseline matching PASS / Repo-wide zero-error FAIL
- 全部通过 → Step 4 PASS

## Step 5: 变更文件清单与保护区检查

1. 生成变更文件清单：

```bash
git diff --stat "$BASE_COMMIT..HEAD" > "$DIFF_STAT_FILE" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "DIFF_STAT_FAILED: git diff --stat failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "DIFF_STAT_FAILED"
  exit 2
fi

git diff --name-only "$BASE_COMMIT..HEAD" > "$DIFF_NAME_FILE" 2>"$GIT_ERR_FILE"
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "DIFF_NAME_FAILED: git diff --name-only failed (exit=$GIT_EXIT)" >> "$SEAL_LOG"
  cat "$GIT_ERR_FILE" >> "$SEAL_LOG"
  echo "DIFF_NAME_FAILED"
  exit 2
fi

CHANGED_COUNT=$(wc -l < "$DIFF_NAME_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count changed files (exit=$WC_EXIT)"
  exit 2
fi
echo "CHANGED_COUNT=$CHANGED_COUNT" >> "$SEAL_LOG"
echo "DIFF_STAT_FILE=$DIFF_STAT_FILE" >> "$SEAL_LOG"
```

2. 保护区零变更检查：

```bash
PROTECTED_AREAS="compiler-core/ evaluation/ schemas/ chinese-aesthetic/scene-contract/"
PROTECTED_VIOLATION=0

for area in $PROTECTED_AREAS; do
  PROTECTED_CHANGES=$(grep -c "^$area" "$DIFF_NAME_FILE" 2>/dev/null)
  GREP_EXIT=$?
  if [ $GREP_EXIT -eq 1 ]; then
    PROTECTED_CHANGES=0
  elif [ $GREP_EXIT -gt 1 ]; then
    echo "GREP_ERROR: protected area scan failed for $area (exit=$GREP_EXIT)" >> "$SEAL_LOG"
    PROTECTED_CHANGES=0
  fi
  echo "PROTECTED_${area%/}_CHANGES=$PROTECTED_CHANGES" >> "$SEAL_LOG"
  if [ "$PROTECTED_CHANGES" -gt 0 ]; then
    echo "PROTECTED_AREA_VIOLATION: $area has $PROTECTED_CHANGES changed files" >> "$SEAL_LOG"
    grep "^$area" "$DIFF_NAME_FILE" >> "$SEAL_LOG"
    PROTECTED_VIOLATION=1
  fi
done

if [ "$PROTECTED_VIOLATION" -eq 1 ]; then
  echo "PROTECTED_AREA_VIOLATION"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
```

判定分类：
- `DIFF_STAT_FAILED` / `DIFF_NAME_FAILED` → BLOCKED_ENV
- 保护区（compiler-core/、evaluation/、schemas/）有变更 → FAIL (`PROTECTED_AREA_VIOLATION`)
- 变更范围符合任务边界、保护区零变更 → Step 5 PASS

## Step 6: 证据文件完整性

1. 列出 evidence/ 目录并计算 SHA-256：

```bash
EVIDENCE_DIR="${EVIDENCE_DIR:-evidence}"
EVIDENCE_VALID=1

if [ ! -d "$EVIDENCE_DIR" ]; then
  echo "EVIDENCE_DIR_MISSING: $EVIDENCE_DIR not found" >> "$SEAL_LOG"
  EVIDENCE_VALID=0
else
  # REV-3 修正：拆开 find | wc -l 管道，独立捕获 find 退出码
  EVIDENCE_FIND_FILE=$(mktemp -t evidence-find-XXXXXX.txt)
  find "$EVIDENCE_DIR" -type f > "$EVIDENCE_FIND_FILE" 2>"$STAT_ERR_FILE"
  FIND_EXIT=$?
  if [ $FIND_EXIT -ne 0 ]; then
    echo "EVIDENCE_FIND_FAILED: find failed (exit=$FIND_EXIT)" >> "$SEAL_LOG"
    cat "$STAT_ERR_FILE" >> "$SEAL_LOG"
    EVIDENCE_VALID=0
  fi

  EVIDENCE_FILE_COUNT=$(wc -l < "$EVIDENCE_FIND_FILE")
  WC_EXIT=$?
  if [ $WC_EXIT -ne 0 ]; then
    echo "WC_ERROR: failed to count evidence files (exit=$WC_EXIT)"
    exit 2
  fi
  echo "EVIDENCE_FILE_COUNT=$EVIDENCE_FILE_COUNT" >> "$SEAL_LOG"

  if [ "$EVIDENCE_FILE_COUNT" -eq 0 ]; then
    echo "EVIDENCE_DIR_EMPTY: $EVIDENCE_DIR has no files" >> "$SEAL_LOG"
    EVIDENCE_VALID=0
  else
    # 对每个证据文件计算 SHA-256
    # REV-3 修正：拆开 sha256sum | awk 管道，先捕获 sha256sum 退出码再解析
    while IFS= read -r evfile; do
      [ -z "$evfile" ] && continue
      SHA256_OUTPUT=$(sha256sum "$evfile" 2>"$STAT_ERR_FILE")
      SHA_EXIT=$?
      if [ $SHA_EXIT -ne 0 ]; then
        echo "SHA256_FAILED: $evfile (exit=$SHA_EXIT)" >> "$SEAL_LOG"
        cat "$STAT_ERR_FILE" >> "$SEAL_LOG"
        EVIDENCE_VALID=0
      else
        FILE_SHA=$(printf '%s' "$SHA256_OUTPUT" | awk '{print $1}')
        FILE_SIZE=$(stat -c %s "$evfile" 2>"$STAT_ERR_FILE")
        echo "$FILE_SHA  $FILE_SIZE  $evfile" >> "$EVIDENCE_SHA_FILE"
      fi
    done < "$EVIDENCE_FIND_FILE"
    echo "EVIDENCE_SHA_FILE=$EVIDENCE_SHA_FILE" >> "$SEAL_LOG"
  fi
fi

if [ "$EVIDENCE_VALID" -eq 0 ]; then
  echo "EVIDENCE_INCOMPLETE: evidence directory missing, empty, or corrupted"
  BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
fi
```

判定分类：
- `EVIDENCE_DIR_MISSING` / `EVIDENCE_DIR_EMPTY` → BLOCKED_ENV
- `SHA256_FAILED` → BLOCKED_ENV
- 证据文件完整、SHA-256 可核对 → Step 6 PASS

## Step 7: 生成封签报告

1. 汇总所有信息，生成 JSON 封签报告：

```bash
# 读取 seal log 原始内容
SEAL_LOG_CONTENT=$(cat "$SEAL_LOG")

# 确定最终状态
if [ "$BLOCKED_COUNT" -gt 0 ]; then
  SEAL_STATUS="BLOCKED_ENV"
elif [ "$FAIL_COUNT" -gt 0 ]; then
  SEAL_STATUS="FAIL"
elif [ "$SEAL_STATUS" = "NOT_RUN" ]; then
  SEAL_STATUS="NOT_RUN"
else
  SEAL_STATUS="PASS"
fi

# REV-3 修正：验证 SEAL_STATUS 合法性
case "$SEAL_STATUS" in
  PASS|FAIL|BLOCKED_ENV|NOT_RUN) ;;
  *)
    echo "INVALID_SEAL_STATUS: $SEAL_STATUS"
    exit 2
    ;;
esac

# REV-3 修正：将 "UNKNOWN" 归一化为 0，避免 --argjson 接非 JSON 值崩溃
AHEAD_COUNT_JSON="${AHEAD_COUNT:-0}"
[ "$AHEAD_COUNT_JSON" = "UNKNOWN" ] && AHEAD_COUNT_JSON=0
BEHIND_COUNT_JSON="${BEHIND_COUNT:-0}"
[ "$BEHIND_COUNT_JSON" = "UNKNOWN" ] && BEHIND_COUNT_JSON=0

jq -n \
  --arg commitHash "$COMMIT_HASH" \
  --arg remoteHash "${REMOTE_HASH:-UNKNOWN}" \
  --arg branch "$BRANCH" \
  --arg baseCommit "$BASE_COMMIT" \
  --arg status "$SEAL_STATUS" \
  --argjson failCount "$FAIL_COUNT" \
  --argjson blockedCount "$BLOCKED_COUNT" \
  --argjson changedFiles "${CHANGED_FILES:-0}" \
  --argjson aheadCount "$AHEAD_COUNT_JSON" \
  --argjson behindCount "$BEHIND_COUNT_JSON" \
  --arg testPassed "${TEST_PASSED:-UNKNOWN}" \
  --arg testFailed "${TEST_FAILED:-UNKNOWN}" \
  --arg testTotal "${TEST_TOTAL:-UNKNOWN}" \
  --arg gateAErrors "${GATE_A_ERRORS:-NOT_RUN}" \
  --arg gateBTotal "${GATE_B_TOTAL:-NOT_RUN}" \
  --arg gateBNew "${GATE_B_NEW:-NOT_RUN}" \
  --argjson protectedViolation "${PROTECTED_VIOLATION:-0}" \
  --argjson evidenceFileCount "${EVIDENCE_FILE_COUNT:-0}" \
  --arg sealLog "$SEAL_LOG_CONTENT" \
  --arg gitStatusFile "$GIT_STATUS_FILE" \
  --arg gitLogFile "$GIT_LOG_FILE" \
  --arg diffStatFile "$DIFF_STAT_FILE" \
  --arg diffNameFile "$DIFF_NAME_FILE" \
  --arg evidenceShaFile "$EVIDENCE_SHA_FILE" \
  --arg tsGateStdout "$TS_GATE_STDOUT" \
  --arg tsGateStderr "$TS_GATE_STDERR" \
  '{
    sealVersion: "1.0",
    status: $status,
    failCount: $failCount,
    blockedCount: $blockedCount,
    git: {
      commitHash: $commitHash,
      remoteHash: $remoteHash,
      branch: $branch,
      baseCommit: $baseCommit,
      changedFiles: $changedFiles,
      aheadCount: $aheadCount,
      behindCount: $behindCount
    },
    tests: {
      passed: $testPassed,
      failed: $testFailed,
      total: $testTotal
    },
    typescript: {
      gateAErrors: $gateAErrors,
      gateBTotal: $gateBTotal,
      gateBNew: $gateBNew,
      verdict: "Layered: Scoped TS / Baseline matching / Repo-wide zero-error FAIL"
    },
    changes: {
      protectedViolation: $protectedViolation,
      diffStatFile: $diffStatFile,
      diffNameFile: $diffNameFile
    },
    evidence: {
      fileCount: $evidenceFileCount,
      shaFile: $evidenceShaFile
    },
    evidenceFiles: {
      gitStatus: $gitStatusFile,
      gitLog: $gitLogFile,
      tsGateStdout: $tsGateStdout,
      tsGateStderr: $tsGateStderr
    },
    sealLog: $sealLog
  }' > "$SEAL_REPORT" 2>"$STAT_ERR_FILE"
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "SEAL_REPORT_GENERATION_FAILED: jq failed (exit=$JQ_EXIT)"
  cat "$STAT_ERR_FILE"
  exit 2
fi

echo "SEAL_STATUS=$SEAL_STATUS"
echo "SEAL_REPORT=$SEAL_REPORT"
echo "FAIL_COUNT=$FAIL_COUNT"
echo "BLOCKED_COUNT=$BLOCKED_COUNT"
```

2. 输出最终判定：

```bash
case "$SEAL_STATUS" in
  PASS)
    echo "SEALED: all checks passed, evidence complete"
    exit 0
    ;;
  FAIL)
    echo "NOT_SEALED: $FAIL_COUNT failure(s) detected"
    exit 1
    ;;
  BLOCKED_ENV)
    echo "BLOCKED: $BLOCKED_COUNT blocker(s) - evidence missing or environment issue"
    exit 2
    ;;
  *)
    echo "NOT_RUN: seal process did not complete"
    exit 2
    ;;
esac
```

判定分类：
- `SEAL_REPORT_GENERATION_FAILED` → BLOCKED_ENV
- 全部检查通过、证据完整可独立复核 → PASS（可签发 SEALED）
- 有 FAIL 项（测试失败、保护区越界、GATE 失败、commit-hash 不一致）→ FAIL
- 有 BLOCKED_ENV 项（证据缺失、远程不可访问、工具缺失）→ BLOCKED_ENV
- 流程未完成 → NOT_RUN

## 决策点

- 测试日志与当前 HEAD 不一致 → FAIL (`COMMIT_HASH_MISMATCH`)，需在当前 HEAD 重跑测试
- 远程未推送 → 记录 `NOT_PUSHED`，不得声称"已交付"，但不阻断封签（封签是本地状态）
- 证据缺失 → BLOCKED_ENV，不得封签
- 保护区有变更 → FAIL (`PROTECTED_AREA_VIOLATION`)
- TS 门禁 GATE-A > 0 错误 → FAIL
- TS 门禁 GATE-B 总数 ≠ 3 或新增 > 0 → FAIL
- 全部通过 → 可签发 SEALED
