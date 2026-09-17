# Procedure: 编译失败诊断与恢复

> 本 Playbook 在编译失败时执行根因诊断、产物保护、恢复决策与重试验证。
> 所有判定必须基于物理执行证据（原始日志、grep 匹配结果、文件系统状态），不得以猜测替代。
> 本 Playbook 是 DC-PB-001（Scene Compilation Contract 验收）的上游诊断方：重试后必须走完整 DC-PB-001 验收。

## 路径规范声明

- 编译输出目录：`<output-dir>`（包含 `manifest.json`、`assets/`、`evidence/`、`scene.json`）
- 编译日志：`<compile-log-stdout>` / `<compile-log-stderr>`（由编译流程生成，本 Playbook 读取归档）
- 临时目录命名：`.staging-*`（原子写入临时目录）、`.backup-*`（回滚备份目录）
- 诊断报告归档：`<output-dir>/evidence/failure-diagnosis.json`

## 代码块性质声明（与 DC-PB-001 REV-12 / DC-PB-002 REV-2 一致）

本文档中的所有 shell 代码块均为**可执行模板**：

- `<output-dir>`、`<compile-command>`、`<compile-log-stdout>` 等尖括号占位符必须替换为实际值后执行
- 代码块中的失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**
- `BLOCKED_ENV` 和 `NOT_RUN` 为状态标记，在代码块中通过 `exit 2`（BLOCKED_ENV）或特定退出码表示
- 所有命令的退出码、stdout 和 stderr 必须原始留存
- 判定分类部分（代码块外的文字描述）中的 `FAIL (ERROR_CODE)`、`BLOCKED_ENV`、`NOT_RUN` 为状态说明，不是可执行命令
- 各 Step 代码块按顺序在同一 shell 会话中执行，变量跨 Step 持久

## 前置条件（Preconditions）

执行前必须确认以下工具可用；任一缺失则报告 `BLOCKED_ENV`，不得继续：

- `grep`（根因定位，支持 `-E` 扩展正则和 `-c` 计数）
- `find`（临时目录扫描、输出目录枚举）
- `stat`（文件大小、权限检查）
- `git`（commit SHA 与工作树状态记录）
- `jq`（诊断报告 JSON 生成、manifest 读取）
- `mktemp`（隔离证据文件路径）
- `cat` / `cp` / `mkdir` / `rm`（基础文件操作）

> **平台兼容性说明**：`stat -c %s` 是 GNU stat 扩展，BSD/macOS 需用 `stat -f %z`。本 Playbook 假定 Linux/GNU 环境。目标环境不可用时报告 BLOCKED_ENV。

## Phase 0: 失败状态快照与证据文件建立

1. 确认编译失败已被识别（退出码非 0 或校验失败）：

```bash
# 编译退出码（由调用方传入，或从编译流程记录中读取）
COMPILE_EXIT_CODE="<compile-exit-code>"
COMPILE_COMMAND="<compile-command>"
COMPILE_START_TIME="<compile-start-time>"
COMPILE_LOG_STDOUT="<compile-log-stdout>"
COMPILE_LOG_STDERR="<compile-log-stderr>"

if [ "$COMPILE_EXIT_CODE" -eq 0 ] 2>/dev/null; then
  echo "NOT_FAILURE: compile exit code is 0, this playbook requires a failed compilation"
  exit 2
fi

# 确认编译日志存在
if [ ! -f "$COMPILE_LOG_STDOUT" ] && [ ! -f "$COMPILE_LOG_STDERR" ]; then
  echo "LOG_NOT_CAPTURED: neither stdout nor stderr log exists"
  exit 2
fi
```

2. 创建证据文件（全部不删除，纳入最终证据清单）：

```bash
DIAGNOSIS_FILE=$(mktemp -t diagnosis-XXXXXX)
> "$DIAGNOSIS_FILE"
GREP_ERR_FILE=$(mktemp -t grep-err-XXXXXX)
STAT_ERR_FILE=$(mktemp -t stat-err-XXXXXX)
GIT_ERR_FILE=$(mktemp -t git-err-XXXXXX)
GIT_STATUS_ERR_FILE=$(mktemp -t git-status-err-XXXXXX)
STAGING_SCAN_FILE=$(mktemp -t staging-scan-XXXXXX)
BACKUP_SCAN_FILE=$(mktemp -t backup-scan-XXXXXX)
RETRY_LOG_STDOUT=$(mktemp -t retry-stdout-XXXXXX.log)
RETRY_LOG_STDERR=$(mktemp -t retry-stderr-XXXXXX.log)

echo "DIAGNOSIS_FILE=$DIAGNOSIS_FILE"
echo "COMPILE_EXIT_CODE=$COMPILE_EXIT_CODE"
echo "COMPILE_COMMAND=$COMPILE_COMMAND"
```

## Step 1: 捕获失败状态

1. 归档编译日志（复制到隔离路径，不删除原件）：

```bash
ARCHIVED_STDOUT=$(mktemp -t compile-stdout-XXXXXX.log)
ARCHIVED_STDERR=$(mktemp -t compile-stderr-XXXXXX.log)

ARCHIVE_ERROR=0
if [ -f "$COMPILE_LOG_STDOUT" ]; then
  cp "$COMPILE_LOG_STDOUT" "$ARCHIVED_STDOUT" || ARCHIVE_ERROR=1
else
  echo "STDOUT_LOG_MISSING: $COMPILE_LOG_STDOUT" >> "$DIAGNOSIS_FILE"
fi
if [ -f "$COMPILE_LOG_STDERR" ]; then
  cp "$COMPILE_LOG_STDERR" "$ARCHIVED_STDERR" || ARCHIVE_ERROR=1
else
  echo "STDERR_LOG_MISSING: $COMPILE_LOG_STDERR" >> "$DIAGNOSIS_FILE"
fi

if [ "$ARCHIVE_ERROR" -ne 0 ]; then
  echo "EVIDENCE_ARCHIVE_ERROR: failed to archive compile logs"
  exit 2
fi

STDOUT_SIZE=$(stat -c %s "$ARCHIVED_STDOUT" 2>"$STAT_ERR_FILE")
STDERR_SIZE=$(stat -c %s "$ARCHIVED_STDERR" 2>"$STAT_ERR_FILE")
echo "ARCHIVED_STDOUT=$ARCHIVED_STDOUT (size=$STDOUT_SIZE)"
echo "ARCHIVED_STDERR=$ARCHIVED_STDERR (size=$STDERR_SIZE)"

# REV-3 修正：合并 stdout/stderr 为单文件，避免 grep -cE 多文件输出 file:count 格式导致整数比较失败
COMBINED_LOG=$(mktemp -t combined-log-XXXXXX)
cat "$ARCHIVED_STDERR" "$ARCHIVED_STDOUT" > "$COMBINED_LOG" 2>"$STAT_ERR_FILE"
CAT_EXIT=$?
if [ $CAT_EXIT -ne 0 ]; then
  echo "COMBINED_LOG_ERROR: failed to concatenate logs (exit=$CAT_EXIT)"
  cat "$STAT_ERR_FILE"
  exit 2
fi
echo "COMBINED_LOG=$COMBINED_LOG"
```

2. 记录 git 状态和 commit SHA：

```bash
COMMIT_HASH=$(git rev-parse HEAD 2>"$GIT_ERR_FILE")
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_STATUS_ERROR: failed to get HEAD (exit=$GIT_EXIT)" >> "$DIAGNOSIS_FILE"
  cat "$GIT_ERR_FILE" >> "$DIAGNOSIS_FILE"
else
  echo "COMMIT_HASH=$COMMIT_HASH" >> "$DIAGNOSIS_FILE"
fi

GIT_STATUS_FILE=$(mktemp -t git-status-XXXXXX)
git status --porcelain=v1 > "$GIT_STATUS_FILE" 2>"$GIT_STATUS_ERR_FILE"
GIT_STATUS_EXIT=$?
if [ $GIT_STATUS_EXIT -ne 0 ]; then
  echo "GIT_STATUS_ERROR: git status failed (exit=$GIT_STATUS_EXIT)" >> "$DIAGNOSIS_FILE"
else
  GIT_STATUS_COUNT=$(wc -l < "$GIT_STATUS_FILE")
  WC_EXIT=$?
  if [ $WC_EXIT -ne 0 ]; then
    echo "WC_ERROR: failed to count git status (exit=$WC_EXIT)"
    exit 2
  fi
  echo "GIT_STATUS_FILE=$GIT_STATUS_FILE (changed_files=$GIT_STATUS_COUNT)" >> "$DIAGNOSIS_FILE"
fi
```

3. 检查输出目录状态：

```bash
OUTPUT_DIR="<output-dir>"

if [ ! -e "$OUTPUT_DIR" ]; then
  echo "OUTPUT_DIR_MISSING: $OUTPUT_DIR does not exist" >> "$DIAGNOSIS_FILE"
  OUTPUT_DIR_STATE="MISSING"
elif [ ! -d "$OUTPUT_DIR" ]; then
  echo "OUTPUT_DIR_NOT_DIRECTORY: $OUTPUT_DIR is not a directory" >> "$DIAGNOSIS_FILE"
  OUTPUT_DIR_STATE="NOT_DIRECTORY"
elif [ ! -r "$OUTPUT_DIR" ]; then
  echo "OUTPUT_DIR_INACCESSIBLE: $OUTPUT_DIR is not readable" >> "$DIAGNOSIS_FILE"
  OUTPUT_DIR_STATE="INACCESSIBLE"
else
  OUTPUT_DIR_STATE="EXISTS"
  # 枚举输出目录内容（不递归，仅顶层）
  OUTPUT_DIR_CONTENTS=$(ls -1 "$OUTPUT_DIR" 2>/dev/null | tr '\n' ' ')
  echo "OUTPUT_DIR_CONTENTS=$OUTPUT_DIR_CONTENTS" >> "$DIAGNOSIS_FILE"
  # 检查 manifest.json 是否存在
  if [ -f "$OUTPUT_DIR/manifest.json" ]; then
    echo "MANIFEST_EXISTS=true" >> "$DIAGNOSIS_FILE"
  else
    echo "MANIFEST_EXISTS=false" >> "$DIAGNOSIS_FILE"
  fi
fi
echo "OUTPUT_DIR_STATE=$OUTPUT_DIR_STATE"
```

判定分类：
- `LOG_NOT_CAPTURED` → BLOCKED_ENV（无日志无法诊断）
- `EVIDENCE_ARCHIVE_ERROR` → BLOCKED_ENV
- 日志已归档、git 状态已记录、输出目录已检查 → Step 1 PASS

## Step 2: 保护已有有效产物

1. 检查输出目录是否包含上一次成功编译的有效产物：

```bash
HAS_VALID_ARTIFACT=false
if [ "$OUTPUT_DIR_STATE" = "EXISTS" ] && [ -f "$OUTPUT_DIR/manifest.json" ]; then
  # 检查 manifest 是否可解析
  MANIFEST_VALID=$(jq -e '.files | type == "array"' "$OUTPUT_DIR/manifest.json" > /dev/null 2>&1 && echo "true" || echo "false")
  if [ "$MANIFEST_VALID" = "true" ]; then
    # 检查 commit-hash.txt 是否存在且与当前 HEAD 不同（说明是上一次成功产物）
    if [ -f "$OUTPUT_DIR/commit-hash.txt" ]; then
      RECORDED_HASH=$(cat "$OUTPUT_DIR/commit-hash.txt" 2>/dev/null)
      if [ -n "$RECORDED_HASH" ] && [ "$RECORDED_HASH" != "$COMMIT_HASH" ]; then
        HAS_VALID_ARTIFACT=true
        echo "VALID_ARTIFACT_DETECTED: previous successful build at commit=$RECORDED_HASH" >> "$DIAGNOSIS_FILE"
      fi
    fi
  fi
fi
echo "HAS_VALID_ARTIFACT=$HAS_VALID_ARTIFACT"
```

2. 若存在有效产物，创建备份保护（不得删除或覆盖）：

```bash
if [ "$HAS_VALID_ARTIFACT" = "true" ]; then
  PROTECTED_BACKUP_DIR="<output-dir>.protected-$(date +%Y%m%d-%H%M%S)"
  cp -r "$OUTPUT_DIR" "$PROTECTED_BACKUP_DIR" 2>"$STAT_ERR_FILE"
  CP_EXIT=$?
  if [ $CP_EXIT -ne 0 ]; then
    echo "ARTIFACT_PROTECTION_FAILED: cp -r failed (exit=$CP_EXIT)" >> "$DIAGNOSIS_FILE"
    cat "$STAT_ERR_FILE" >> "$DIAGNOSIS_FILE"
    echo "ARTIFACT_PROTECTION_FAILED"
    exit 2
  fi
  echo "PROTECTED_BACKUP_DIR=$PROTECTED_BACKUP_DIR" >> "$DIAGNOSIS_FILE"
  echo "PROTECTED_BACKUP_DIR=$PROTECTED_BACKUP_DIR"
fi
```

3. 扫描 .staging-* 和 .backup-* 临时目录（记录但不自动删除）：

```bash
# 扫描 .staging-* 目录
find "$OUTPUT_DIR" -maxdepth 1 -type d -name '.staging-*' > "$STAGING_SCAN_FILE" 2>"$STAT_ERR_FILE"
FIND_EXIT=$?
if [ $FIND_EXIT -ne 0 ]; then
  echo "STAGING_DIR_NOT_SCANNED: find failed (exit=$FIND_EXIT)" >> "$DIAGNOSIS_FILE"
  cat "$STAT_ERR_FILE" >> "$DIAGNOSIS_FILE"
fi
STAGING_COUNT=$(wc -l < "$STAGING_SCAN_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count staging dirs (exit=$WC_EXIT)"
  exit 2
fi
echo "STAGING_DIR_COUNT=$STAGING_COUNT" >> "$DIAGNOSIS_FILE"
if [ "$STAGING_COUNT" -gt 0 ]; then
  echo "STAGING_DIRS:" >> "$DIAGNOSIS_FILE"
  cat "$STAGING_SCAN_FILE" >> "$DIAGNOSIS_FILE"
fi

# 扫描 .backup-* 目录
find "$OUTPUT_DIR" -maxdepth 1 -type d -name '.backup-*' > "$BACKUP_SCAN_FILE" 2>"$STAT_ERR_FILE"
FIND_EXIT=$?
if [ $FIND_EXIT -ne 0 ]; then
  echo "BACKUP_DIR_NOT_SCANNED: find failed (exit=$FIND_EXIT)" >> "$DIAGNOSIS_FILE"
  cat "$STAT_ERR_FILE" >> "$DIAGNOSIS_FILE"
fi
BACKUP_COUNT=$(wc -l < "$BACKUP_SCAN_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count backup dirs (exit=$WC_EXIT)"
  exit 2
fi
echo "BACKUP_DIR_COUNT=$BACKUP_COUNT" >> "$DIAGNOSIS_FILE"
if [ "$BACKUP_COUNT" -gt 0 ]; then
  echo "BACKUP_DIRS:" >> "$DIAGNOSIS_FILE"
  cat "$BACKUP_SCAN_FILE" >> "$DIAGNOSIS_FILE"
fi

echo "STAGING_COUNT=$STAGING_COUNT BACKUP_COUNT=$BACKUP_COUNT"
```

判定分类：
- `ARTIFACT_PROTECTION_FAILED` → BLOCKED_ENV
- 有效产物已备份保护、临时目录已扫描记录 → Step 2 PASS
- 无有效产物 → Step 2 PASS（N/A，记录 `NO_VALID_ARTIFACT`）

## Step 3: 根因定位

按 6 类顺序排查，每类使用 grep 在归档日志中搜索错误模式。grep 退出码三态处理：0=有匹配，1=无匹配，>1=执行错误。

```bash
ROOT_CAUSE="UNKNOWN"
ROOT_CAUSE_CONFIDENCE=0

# 诊断 1: 输入校验失败（SCHEMA_* / schema / missing field / invalid）
DIAG1_MATCH=$(grep -cE 'SCHEMA_|schema.*(mismatch|invalid|error)|missing.*field|required.*field' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -gt 1 ]; then
  echo "DIAGNOSIS_GREP_ERROR: diag1 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  cat "$GREP_ERR_FILE" >> "$DIAGNOSIS_FILE"
elif [ "$DIAG1_MATCH" -gt 0 ]; then
  ROOT_CAUSE="INPUT_VALIDATION_FAILURE"
  ROOT_CAUSE_CONFIDENCE=80
  echo "ROOT_CAUSE=INPUT_VALIDATION_FAILURE (matches=$DIAG1_MATCH)" >> "$DIAGNOSIS_FILE"
fi

# 诊断 2: 资源缺失（MISSING_* / file not found / ENOENT / no such file）
if [ "$ROOT_CAUSE" = "UNKNOWN" ]; then
  DIAG2_MATCH=$(grep -cE 'MISSING_|file not found|ENOENT|no such file|cannot find|does not exist' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
  GREP_EXIT=$?
  if [ $GREP_EXIT -gt 1 ]; then
    echo "DIAGNOSIS_GREP_ERROR: diag2 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  elif [ "$DIAG2_MATCH" -gt 0 ]; then
    ROOT_CAUSE="RESOURCE_MISSING"
    ROOT_CAUSE_CONFIDENCE=80
    echo "ROOT_CAUSE=RESOURCE_MISSING (matches=$DIAG2_MATCH)" >> "$DIAGNOSIS_FILE"
  fi
fi

# 诊断 3: 资产格式错误（FORMAT_* / codec / unsupported / invalid format / corrupt）
if [ "$ROOT_CAUSE" = "UNKNOWN" ]; then
  DIAG3_MATCH=$(grep -cE 'FORMAT_|unsupported.*(codec|format)|invalid.*(format|image|video)|corrupt|decode error|cannot decode' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
  GREP_EXIT=$?
  if [ $GREP_EXIT -gt 1 ]; then
    echo "DIAGNOSIS_GREP_ERROR: diag3 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  elif [ "$DIAG3_MATCH" -gt 0 ]; then
    ROOT_CAUSE="ASSET_FORMAT_ERROR"
    ROOT_CAUSE_CONFIDENCE=75
    echo "ROOT_CAUSE=ASSET_FORMAT_ERROR (matches=$DIAG3_MATCH)" >> "$DIAGNOSIS_FILE"
  fi
fi

# 诊断 4: 输出目录异常（EACCES / ENOSPC / EXDEV / permission denied / no space / disk full）
if [ "$ROOT_CAUSE" = "UNKNOWN" ]; then
  DIAG4_MATCH=$(grep -cE 'EACCES|ENOSPC|EXDEV|permission denied|no space left|disk full|read-only file system|path.*conflict' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
  GREP_EXIT=$?
  if [ $GREP_EXIT -gt 1 ]; then
    echo "DIAGNOSIS_GREP_ERROR: diag4 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  elif [ "$DIAG4_MATCH" -gt 0 ]; then
    ROOT_CAUSE="OUTPUT_DIR_ANOMALY"
    ROOT_CAUSE_CONFIDENCE=85
    echo "ROOT_CAUSE=OUTPUT_DIR_ANOMALY (matches=$DIAG4_MATCH)" >> "$DIAGNOSIS_FILE"
    # 细分类：磁盘满 vs 权限
    if grep -qE 'ENOSPC|no space left|disk full' "$COMBINED_LOG" 2>/dev/null; then
      echo "SUBCAUSE=DISK_FULL" >> "$DIAGNOSIS_FILE"
    elif grep -qE 'EACCES|permission denied|read-only' "$COMBINED_LOG" 2>/dev/null; then
      echo "SUBCAUSE=PERMISSION_DENIED" >> "$DIAGNOSIS_FILE"
    fi
  fi
fi

# 诊断 5: 原子写入失败（rename / EXDEV / cross-device / file lock / EBUSY）
if [ "$ROOT_CAUSE" = "UNKNOWN" ]; then
  DIAG5_MATCH=$(grep -cE 'rename.*(failed|error)|EXDEV|cross.device|file.*lock|EBUSY|staging.*(fail|error)|atomic.*(fail|write)' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
  GREP_EXIT=$?
  if [ $GREP_EXIT -gt 1 ]; then
    echo "DIAGNOSIS_GREP_ERROR: diag5 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  elif [ "$DIAG5_MATCH" -gt 0 ]; then
    ROOT_CAUSE="ATOMIC_WRITE_FAILURE"
    ROOT_CAUSE_CONFIDENCE=80
    echo "ROOT_CAUSE=ATOMIC_WRITE_FAILURE (matches=$DIAG5_MATCH)" >> "$DIAGNOSIS_FILE"
  fi
fi

# 诊断 6: 内部错误（exception / stack trace / panic / crash / undefined / TypeError / ReferenceError）
if [ "$ROOT_CAUSE" = "UNKNOWN" ]; then
  DIAG6_MATCH=$(grep -cE 'exception|stack trace|panic|crash|undefined is not|TypeError|ReferenceError|RangeError|unhandled|fatal error|abort' "$COMBINED_LOG" 2>"$GREP_ERR_FILE")
  GREP_EXIT=$?
  if [ $GREP_EXIT -gt 1 ]; then
    echo "DIAGNOSIS_GREP_ERROR: diag6 grep failed (exit=$GREP_EXIT)" >> "$DIAGNOSIS_FILE"
  elif [ "$DIAG6_MATCH" -gt 0 ]; then
    ROOT_CAUSE="INTERNAL_ERROR"
    ROOT_CAUSE_CONFIDENCE=90
    echo "ROOT_CAUSE=INTERNAL_ERROR (matches=$DIAG6_MATCH)" >> "$DIAGNOSIS_FILE"
  fi
fi

echo "ROOT_CAUSE=$ROOT_CAUSE CONFIDENCE=$ROOT_CAUSE_CONFIDENCE"
```

判定分类：
- `DIAGNOSIS_GREP_ERROR` → BLOCKED_ENV（grep 执行失败，非根因本身问题）
- 6 类全部无匹配 → `ROOT_CAUSE_UNCLEAR` → BLOCKED_ENV（不得猜测根因）
- 匹配到某一类 → 根因已定位，进入 Step 4

## Step 4: 分类与恢复决策

根据 Step 3 定位的根因，映射到恢复类别并确定可重试性：

```bash
case "$ROOT_CAUSE" in
  INPUT_VALIDATION_FAILURE)
    RECOVERY_CATEGORY="FC-1"
    RETRYABLE=true
    RECOVERY_ACTION="修复输入配置（scene.json/schema）后重新编译"
    ;;
  RESOURCE_MISSING)
    RECOVERY_CATEGORY="FC-2"
    RETRYABLE=true
    RECOVERY_ACTION="补充缺失资产后重新编译"
    ;;
  ASSET_FORMAT_ERROR)
    RECOVERY_CATEGORY="FC-3"
    RETRYABLE=true
    RECOVERY_ACTION="转换资产格式或替换损坏资产后重新编译"
    ;;
  OUTPUT_DIR_ANOMALY)
    RECOVERY_CATEGORY="FC-4"
    RETRYABLE=true
    RECOVERY_ACTION="解决权限/磁盘空间/路径冲突后重新编译"
    ;;
  ATOMIC_WRITE_FAILURE)
    RECOVERY_CATEGORY="FC-5"
    RETRYABLE=true
    RECOVERY_ACTION="清理临时目录、检查目标目录后重试"
    ;;
  INTERNAL_ERROR)
    RECOVERY_CATEGORY="FC-6"
    RETRYABLE=false
    RECOVERY_ACTION="记录完整堆栈，标记 BLOCKED_ENV，需人工介入排查"
    ;;
  *)
    RECOVERY_CATEGORY="UNKNOWN"
    RETRYABLE=false
    RECOVERY_ACTION="根因不明确，需人工介入"
    ;;
esac

echo "RECOVERY_CATEGORY=$RECOVERY_CATEGORY" >> "$DIAGNOSIS_FILE"
echo "RETRYABLE=$RETRYABLE" >> "$DIAGNOSIS_FILE"
echo "RECOVERY_ACTION=$RECOVERY_ACTION" >> "$DIAGNOSIS_FILE"
echo "RECOVERY_CATEGORY=$RECOVERY_CATEGORY RETRYABLE=$RETRYABLE"

# 内部错误不可自动重试
if [ "$RETRYABLE" = "false" ]; then
  echo "INTERNAL_ERROR: non-retryable failure, manual intervention required"
  echo "DIAGNOSIS_FILE=$DIAGNOSIS_FILE"
  exit 2
fi
```

判定分类：
- `INTERNAL_ERROR`（FC-6）→ BLOCKED_ENV，不得自动重试
- 根因 `UNKNOWN` → `ROOT_CAUSE_UNCLEAR` → BLOCKED_ENV
- FC-1~FC-5 → 可重试，进入 Step 5

## Step 5: 清理与记录

1. 临时目录安全性检查与清理（仅清理确认安全的 .staging-* 目录）：

```bash
CLEANED_STAGING=0
if [ "$STAGING_COUNT" -gt 0 ] 2>/dev/null; then
  while read -r staging_dir; do
    [ -z "$staging_dir" ] && continue
    # 安全性检查：目录必须存在且为 .staging-* 命名
    if [ -d "$staging_dir" ]; then
      # 检查目录内容（非空则记录，不自动删除）
      STAGING_CONTENT_COUNT=$(find "$staging_dir" -type f 2>/dev/null | wc -l)
      WC_EXIT=$?
      if [ $WC_EXIT -ne 0 ]; then
        echo "WC_ERROR: failed to count staging content (exit=$WC_EXIT)" >> "$DIAGNOSIS_FILE"
        continue
      fi
      if [ "$STAGING_CONTENT_COUNT" -eq 0 ] 2>/dev/null; then
        # 空目录可安全删除
        rmdir "$staging_dir" 2>/dev/null
        RMDIR_EXIT=$?
        if [ $RMDIR_EXIT -eq 0 ]; then
          echo "CLEANED_STAGING: $staging_dir (empty)" >> "$DIAGNOSIS_FILE"
          CLEANED_STAGING=$((CLEANED_STAGING + 1))
        else
          echo "STAGING_CLEAN_FAILED: $staging_dir (rmdir exit=$RMDIR_EXIT)" >> "$DIAGNOSIS_FILE"
        fi
      else
        # 非空目录记录但不删除（需人工确认内容）
        echo "STAGING_NOT_EMPTY: $staging_dir (files=$STAGING_CONTENT_COUNT), not auto-deleted" >> "$DIAGNOSIS_FILE"
      fi
    fi
  done < "$STAGING_SCAN_FILE"
fi

# .backup-* 目录：记录保留，不自动删除（可能包含有效回滚数据）
if [ "$BACKUP_COUNT" -gt 0 ] 2>/dev/null; then
  echo "BACKUP_DIRS_PRESERVED: $BACKUP_COUNT backup directories kept for rollback" >> "$DIAGNOSIS_FILE"
fi

echo "CLEANED_STAGING=$CLEANED_STAGING"
```

2. 生成诊断报告并归档到 evidence/ 目录：

```bash
EVIDENCE_DIR="<output-dir>/evidence"
mkdir -p "$EVIDENCE_DIR" 2>/dev/null
MKDIR_EXIT=$?
if [ $MKDIR_EXIT -ne 0 ]; then
  echo "EVIDENCE_DIR_CREATE_FAILED (exit=$MKDIR_EXIT)"
  exit 2
fi

# 生成 JSON 诊断报告
DIAGNOSIS_REPORT="$EVIDENCE_DIR/failure-diagnosis.json"
jq -n \
  --arg compileExit "$COMPILE_EXIT_CODE" \
  --arg compileCommand "$COMPILE_COMMAND" \
  --arg commitHash "$COMMIT_HASH" \
  --arg rootCause "$ROOT_CAUSE" \
  --arg confidence "$ROOT_CAUSE_CONFIDENCE" \
  --arg recoveryCategory "$RECOVERY_CATEGORY" \
  --arg retryable "$RETRYABLE" \
  --arg recoveryAction "$RECOVERY_ACTION" \
  --arg outputDirState "$OUTPUT_DIR_STATE" \
  --arg hasValidArtifact "$HAS_VALID_ARTIFACT" \
  --arg stagingCount "$STAGING_COUNT" \
  --arg backupCount "$BACKUP_COUNT" \
  --arg cleanedStaging "$CLEANED_STAGING" \
  --rawfile diagnosisLog "$DIAGNOSIS_FILE" \
  '{
    compileExitCode: ($compileExit | tonumber),
    compileCommand: $compileCommand,
    commitHash: $commitHash,
    rootCause: $rootCause,
    rootCauseConfidence: ($confidence | tonumber),
    recoveryCategory: $recoveryCategory,
    retryable: ($retryable == "true"),
    recoveryAction: $recoveryAction,
    outputDirState: $outputDirState,
    hasValidArtifact: ($hasValidArtifact == "true"),
    stagingDirCount: ($stagingCount | tonumber),
    backupDirCount: ($backupCount | tonumber),
    cleanedStagingCount: ($cleanedStaging | tonumber),
    diagnosisLog: $diagnosisLog
  }' > "$DIAGNOSIS_REPORT" 2>"$GREP_ERR_FILE"
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "DIAGNOSTIC_REPORT_GENERATION_FAILED (jq exit=$JQ_EXIT)"
  cat "$GREP_ERR_FILE"
  exit 2
fi

# 归档编译日志到 evidence/
ARCHIVE_ERROR=0
cp "$ARCHIVED_STDOUT" "$EVIDENCE_DIR/compile-stdout.log" || ARCHIVE_ERROR=1
cp "$ARCHIVED_STDERR" "$EVIDENCE_DIR/compile-stderr.log" || ARCHIVE_ERROR=1
cp "$GIT_STATUS_FILE" "$EVIDENCE_DIR/git-status.txt" || ARCHIVE_ERROR=1
if [ "$ARCHIVE_ERROR" -ne 0 ]; then
  echo "EVIDENCE_ARCHIVE_ERROR: failed to archive logs to evidence/"
  exit 2
fi

echo "DIAGNOSIS_REPORT=$DIAGNOSIS_REPORT"
echo "EVIDENCE_DIR=$EVIDENCE_DIR"
ls -la "$EVIDENCE_DIR"
```

判定分类：
- `EVIDENCE_DIR_CREATE_FAILED` / `EVIDENCE_ARCHIVE_ERROR` → BLOCKED_ENV
- `DIAGNOSTIC_REPORT_GENERATION_FAILED` → BLOCKED_ENV
- 诊断报告已生成、日志已归档 → Step 5 PASS

## Step 6: 重试验证

仅当 Step 4 判定为可重试（RETRYABLE=true）时执行。重试后必须走完整 DC-PB-001 验收。

```bash
if [ "$RETRYABLE" != "true" ]; then
  echo "NON_RETRYABLE: skipping retry, manual intervention required"
  echo "DIAGNOSIS_REPORT=$DIAGNOSIS_REPORT"
  exit 2
fi

# 1. 重新执行编译（调用方需先修复根因）
echo "=== Retry compilation ==="
echo "RETRY_COMMAND=$COMPILE_COMMAND"
$COMPILE_COMMAND > "$RETRY_LOG_STDOUT" 2>"$RETRY_LOG_STDERR"
RETRY_EXIT=$?
echo "RETRY_EXIT=$RETRY_EXIT"

# 归档重试日志
ARCHIVE_ERROR=0
cp "$RETRY_LOG_STDOUT" "$EVIDENCE_DIR/retry-stdout.log" || ARCHIVE_ERROR=1
cp "$RETRY_LOG_STDERR" "$EVIDENCE_DIR/retry-stderr.log" || ARCHIVE_ERROR=1
if [ "$ARCHIVE_ERROR" -ne 0 ]; then
  echo "EVIDENCE_ARCHIVE_ERROR: failed to archive retry logs"
  exit 2
fi

if [ $RETRY_EXIT -ne 0 ]; then
  echo "RETRY_COMPILE_FAILED: retry compilation exit=$RETRY_EXIT"
  echo "RETRY_LOG_STDOUT=$RETRY_LOG_STDOUT"
  echo "RETRY_LOG_STDERR=$RETRY_LOG_STDERR"
  exit 1
fi

# 2. 重试后必须走完整 DC-PB-001（Scene Compilation Contract 验收）
# 不得因"上次差不多成功"跳过验证
echo "=== DC-PB-001 verification required after retry ==="
echo "OUTPUT_DIR=$OUTPUT_DIR"
echo "Run: playbooks/scene-compilation-contract/procedure.md with output-dir=$OUTPUT_DIR"
echo "RETRY_VALIDATION_REQUIRED=true" >> "$DIAGNOSIS_FILE"

# 3. 更新诊断报告为重试成功状态
jq --arg retryExit "$RETRY_EXIT" \
   --arg retryValidation "REQUIRED" \
   '. + {retryExitCode: ($retryExit | tonumber), retryValidationStatus: $retryValidation}' \
   "$DIAGNOSIS_REPORT" > "${DIAGNOSIS_REPORT}.tmp" 2>"$GREP_ERR_FILE"
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "DIAGNOSTIC_REPORT_UPDATE_FAILED: jq update failed (exit=$JQ_EXIT)"
  cat "$GREP_ERR_FILE"
  exit 2
fi
mv "${DIAGNOSIS_REPORT}.tmp" "$DIAGNOSIS_REPORT"
MV_EXIT=$?
if [ $MV_EXIT -ne 0 ]; then
  echo "DIAGNOSTIC_REPORT_UPDATE_FAILED: mv failed (exit=$MV_EXIT)"
  exit 2
fi

echo "RETRY_SUCCESS: compilation retry exited 0"
echo "NEXT: Run DC-PB-001 verification on $OUTPUT_DIR"
```

判定分类：
- `RETRY_COMPILE_FAILED` → FAIL（重试编译仍失败）
- 重试退出码 0 → Step 6 PASS，但必须标注 `RETRY_VALIDATION_REQUIRED=true`，后续需执行 DC-PB-001
- 不可重试失败 → Step 6 不执行（Step 4 已 exit 2）

## 决策点

- 根因不明确（6 类 grep 全部无匹配）→ 标记 `BLOCKED_ENV (ROOT_CAUSE_UNCLEAR)`，不得猜测
- 内部错误/未捕获异常（FC-6）→ 不得自动重试，标记 `BLOCKED_ENV (INTERNAL_ERROR)`，需人工介入
- 有效产物可能被覆盖 → 立即停止，先执行 Step 2 保护（创建 `.protected-*` 备份）
- 重试编译成功 → 不得直接 PASS，必须走完整 DC-PB-001 验收
- **绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS**
