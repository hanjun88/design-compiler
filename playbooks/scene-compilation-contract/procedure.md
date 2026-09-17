# Procedure: Scene Compilation Contract 验收

> 本 Playbook 是 Step 5.x 契约的下游消费方，而非平行规范。所有判定必须基于物理执行证据，不得以静态推断替代。
>
> 本 Playbook 针对 design-compiler 的 `DiskEmitter.emit()` 产出物（目录拓扑：`assets/`、`evidence/`、`scene.json`、`manifest.json`）执行验收。

## 路径规范声明（FAIL-03 修正）

`manifest.json` 中 `files[].path` 的规范形式为：**相对于 output directory 的 POSIX 相对路径**，使用 `/` 分隔符。实际值包括：

- 资产文件：`assets/scene.webp`、`assets/depth.webp`、`assets/water-mask.webp` 等
- 场景配置：`scene.json`（根目录，不加 `assets/` 前缀）
- 证据文件：`evidence/machine-provenance.json`、`evidence/human-audit-ledger.json`

**所有路径拼接统一使用 `<output-dir>/<manifest-path>`，不得额外拼接 `assets/` 前缀。**
此规范与 `disk-validator.ts:498` 的 `resolveSandboxedPath(outputDir, file.path)` 实现一致。

## 代码块性质声明（REV-12 修正：代码块与判定伪代码完全分离）

本文档中的所有 shell 代码块均为**可执行模板**：

- `<output-dir>`、`<scene-dir>`、`<declared-path>`、`<compile-command>` 等尖括号占位符必须替换为实际值后执行
- 代码块中的失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**
- `BLOCKED_ENV` 和 `NOT_RUN` 为状态标记，在代码块中通过 `exit 2`（BLOCKED_ENV）或特定退出码表示
- 所有命令的退出码、stdout 和 stderr 必须原始留存，不得仅记录摘要
- 判定分类部分（代码块外的文字描述）中的 `FAIL (ERROR_CODE)`、`BLOCKED_ENV`、`NOT_RUN` 为状态说明，不是可执行命令

## 前置条件（Preconditions）

执行前必须确认以下工具可用；任一缺失则报告 `BLOCKED_ENV`，不得继续：

- `jq` ≥ 1.6（JSON 结构化判定，禁止用 grep 子串匹配替代）
- `sha256sum`（资产完整性校验）
- `find`、`stat`、`realpath`（文件系统审计）
- `git`（工作树状态与 HEAD 核验）
- `mktemp`（隔离临时输出路径）
- `npx jest`（原子写入与回滚测试执行，见 Step 6）

> **平台兼容性说明（REV-11 补强）**：
> - `find -printf '%P'` 是 GNU find 扩展，在 BSD/macOS 上不可用。本 Playbook 假定 Linux/GNU 环境。
>   若在 BSD/macOS 上执行，需替换为 `find ... -exec basename {} \;` 或使用 `gfind`（GNU find）。
> - `stat -c %s` 是 GNU stat 扩展，在 BSD/macOS 上需使用 `stat -f %z`。
> - `realpath` 在部分精简 Linux 发行版上可能不可用，需安装 `coreutils` 或使用 `readlink -f` 替代。
> - 以上命令在目标环境不可用时，应报告 `BLOCKED_ENV`，不得静默降级或跳过。

## Phase 0: 编译前基线建立（FAIL-02 修正：必须在编译前执行）

> 本阶段必须在编译执行**前**运行，建立孤儿目录基线。与 Step 7（编译后扫描）对应。
>
> **状态闭环规则（REV-12 修正：EXECUTION_STATUS 与 BASELINE_STATUS 分离）**：
>
> Phase 0 的状态分为两个维度，不得混淆：
>
> **EXECUTION_STATUS（执行状态）**：
> - `SUCCESS`：find 命令退出码为 0，扫描成功完成
> - `FAILED`：find 命令退出码非 0，扫描执行失败 → `BLOCKED_ENV`
> - `NOT_RUN`：编译已完成且无法回退，Phase 0 未执行
>
> **BASELINE_STATUS（基线状态）**（仅在 EXECUTION_STATUS=SUCCESS 时有意义）：
> - `CLEAN`：扫描输出为空，编译前无孤儿目录
> - `PRE_EXISTING_ORPHAN`：扫描输出非空，编译前已有孤儿目录（需记录完整列表，但不直接 FAIL）
> - `UNKNOWN`：EXECUTION_STATUS 非 SUCCESS 时，基线状态未知
>
> 状态映射：
> - EXECUTION_STATUS=SUCCESS + BASELINE_STATUS=CLEAN → AC-3.2 = PASS
> - EXECUTION_STATUS=SUCCESS + BASELINE_STATUS=PRE_EXISTING_ORPHAN → AC-3.2 = PASS（需记录 PRE_EXISTING_ORPHAN）
> - EXECUTION_STATUS=FAILED → AC-3.2 = BLOCKED_ENV
> - EXECUTION_STATUS=NOT_RUN → AC-3.2 = NOT_RUN，AC-3.3 = NOT_RUN，AC-3.4 = NOT_RUN
> - Phase 0 = NOT_RUN 时，Step 7 的扫描结果仅作为 `REFERENCE_ONLY` 附加证据，**不得转换为 PASS**
> - Phase 0 = NOT_RUN 时，最终判定**不得为 PASS**（必须为 NOT_RUN 或 BLOCKED_ENV）

### 0.1 编译前孤儿目录扫描（第七次修正：stderr 捕获 + 扫描成功验证）

```bash
# 扫描输出目录同级的 .staging-* 和 .backup-* 目录
# 实际命名格式：<target>.staging-<16hex> 和 <target>.backup-<16hex>
find "<output-dir>/.." -maxdepth 1 -type d \( -name '*.staging-*' -o -name '*.backup-*' \) \
  -print > "$BEFORE_SCAN_FILE" 2>"$BEFORE_SCAN_ERR_FILE"
SCAN_EXIT=$?
```

- `find` 退出码非 0 → `BLOCKED_ENV`（目录不存在或权限问题），记录 `$BEFORE_SCAN_ERR_FILE` 内容
- 输出非空 → 记录为 `PRE_EXISTING_ORPHAN`，不直接 FAIL（可能是上一次运行的残留），但必须在证据中声明完整列表
- 输出为空 → 基线干净
- 结果保存到 `$BEFORE_SCAN_FILE`（使用 `mktemp` 生成隔离路径）供 Step 7 对比
- 必须同时保存 `$SCAN_EXIT`（退出码）和 `$BEFORE_SCAN_ERR_FILE`（标准错误），不得仅保存输出文件

### 0.2 确认编译前工作树状态（REV-12 修正：git 命令退出码捕获）

```bash
git status --short > "$GIT_STATE_BEFORE_FILE" 2>"$GIT_STATUS_ERR_FILE"
GIT_STATUS_EXIT=$?
if [ $GIT_STATUS_EXIT -ne 0 ]; then
  echo "GIT_ERROR: failed to execute git status --short"
  cat "$GIT_STATUS_ERR_FILE"
  exit 2
fi

git rev-parse HEAD > "$COMMIT_HASH_BEFORE_FILE" 2>"$GIT_REVPARSE_ERR_FILE"
GIT_REVPARSE_EXIT=$?
if [ $GIT_REVPARSE_EXIT -ne 0 ]; then
  echo "GIT_ERROR: failed to execute git rev-parse HEAD"
  cat "$GIT_REVPARSE_ERR_FILE"
  exit 2
fi
```

## Step 1: 执行编译并确认状态

1. 如果编译尚未执行，使用以下命令执行编译（stdout/stderr 重定向到隔离日志，见 Step 9）：
   ```bash
   <compile-command> > "$LOG_STDOUT" 2> "$LOG_STDERR"
   COMPILE_EXIT=$?
   ```
2. 若编译退出码非 0 → 标记 `FAIL (COMPILE_EXIT_NONZERO)`，进入 DC-PB-003（编译失败诊断）
3. 若编译未执行且无法执行 → 标记 `NOT_RUN`
4. 若退出码为 0 → 继续

## Step 2: 验证输出目录结构

1. 检查目标目录存在；不存在 → `FAIL (OUTPUT_DIR_MISSING)`
2. 检查必需子目录：`assets/`、`evidence/`
3. 检查必需文件：`scene.json`、`manifest.json`
4. 缺失任一 → `FAIL (STRUCTURE_MISSING)`，记录具体缺失项

## Step 3: scene.json 单一事实源验证

### 3.1 旁路配置文件检测（FAIL-01 修正：find 枚举 + 退出码分类）

禁止使用 `ls 'scene.*.json'`（单引号阻止通配符展开）。必须使用 `find` 显式枚举：

```bash
# 在 scene.json 同级目录中查找旁路配置
# ! -name 'scene.json' 排除合法的 scene.json 本身
BYPASS_FILES=$(find "<scene-dir>" -maxdepth 1 -type f \
  \( -name 'scene.local.json' -o -name 'scene.dev.json' \
     -o -name 'scene.override.json' -o -name 'scene.*.json' \) \
  ! -name 'scene.json' -print 2>"$FIND_ERR_FILE")
FIND_EXIT=$?
```

判定分类：
- `find` 退出码非 0 → `BLOCKED_ENV`（目录不存在或权限问题），记录 `$FIND_ERR_FILE` 内容
- `find` 退出码 0 且 `$BYPASS_FILES` 非空 → `FAIL (BYPASS_CONFIG_DETECTED)`，记录完整文件列表
- `find` 退出码 0 且 `$BYPASS_FILES` 为空 → PASS，继续

### 3.2 外部引用结构化检测（第七次修正：三阶段独立退出码捕获，任一失败→BLOCKED_ENV）

禁止使用 `grep -E` 子串匹配。必须使用 `jq` 遍历 JSON 语法树的所有路径，分三阶段执行，每阶段独立捕获退出码：

```bash
# Phase 0: 检查 jq 是否可用
command -v jq >/dev/null 2>&1 || { echo "JQ_NOT_AVAILABLE"; exit 2; }

# Phase 1: 输出 JSON 数组格式（机器可精确复核，无 join(".") 歧义）
# 每个元素是完整路径数组，如 ["metadata","a.b","$ref"]，保留原始键名含点号的信息
HITS_JSON=$(jq '
  [paths | select(
    .[-1] == "$ref" or .[-1] == "include" or .[-1] == "extends"
  )]
' scene.json 2>"$JQ_ERR_FILE")
JQ_MATCH_EXIT=$?

# Phase 1 失败 → 立即 BLOCKED_ENV，不继续后续阶段
if [ $JQ_MATCH_EXIT -ne 0 ]; then
  echo "JQ_MATCH_ERROR"
  exit 2
fi

# Phase 2: 生成人类可读格式（点分路径，仅用于展示，不作为机器判定依据）
HITS_READABLE=$(printf '%s' "$HITS_JSON" | jq -r '.[] | join(".")' 2>"$JQ_READABLE_ERR_FILE")
JQ_READABLE_EXIT=$?

# Phase 2 失败 → BLOCKED_ENV（可读格式生成失败必须记录，不得静默忽略）
if [ $JQ_READABLE_EXIT -ne 0 ]; then
  echo "JQ_READABLE_ERROR"
  exit 2
fi

# Phase 3: 计算 JSON 数组长度（机器判定的唯一依据）
HIT_COUNT=$(printf '%s' "$HITS_JSON" | jq -r 'length' 2>"$JQ_LENGTH_ERR_FILE")
JQ_LENGTH_EXIT=$?

# Phase 3 失败 → BLOCKED_ENV（长度计算失败不得进入判定）
if [ $JQ_LENGTH_EXIT -ne 0 ]; then
  echo "JQ_LENGTH_ERROR"
  exit 2
fi

# 三阶段全部成功后，才允许依据长度判定
if [ "$HIT_COUNT" = "0" ]; then
  echo "NO_EXTERNAL_REFERENCES"
else
  echo "EXTERNAL_REFERENCE_FOUND"
fi
```

判定分类：
- `JQ_NOT_AVAILABLE` → `BLOCKED_ENV`（jq 工具不可用）
- `JQ_MATCH_ERROR` → `BLOCKED_ENV`（JSON 解析失败或 jq 执行错误），记录 `$JQ_ERR_FILE` 内容
- `JQ_READABLE_ERROR` → `BLOCKED_ENV`（可读格式生成失败），记录 `$JQ_READABLE_ERR_FILE`
- `JQ_LENGTH_ERROR` → `BLOCKED_ENV`（长度计算失败），记录 `$JQ_LENGTH_ERR_FILE`
- `EXTERNAL_REFERENCE_FOUND` → `FAIL (EXTERNAL_REFERENCE)`，记录 `$HITS_JSON`（原始 JSON 数组）和 `$HITS_READABLE`（可读格式）
- `NO_EXTERNAL_REFERENCES` → PASS，继续

> 纪律说明：此检查与 Step 5.2 AST 防火墙"废除字符串子串匹配"原则一致。
> `jq paths` 遍历 JSON 语法树的实际键名，不会误报文本内容中的 `$ref` 字符串。
> 使用 `paths`（而非 `paths(scalars)`）确保值为对象/数组的 `$ref` 键也被捕获。
> 三阶段独立捕获退出码：Phase 1（匹配）、Phase 2（可读格式）、Phase 3（长度），
> 任一阶段失败立即 `BLOCKED_ENV`，不得进入 PASS/FAIL 判定。
> 证据留存同时包含 `$HITS_JSON`（原始 JSON 数组，机器可精确复核）和 `$HITS_READABLE`
> （点分可读格式，仅用于人类阅读），避免 `join(".")` 对含点号键名的歧义。
> 判定基于 `jq -r 'length'` 返回的数组长度，不依赖退出码 4，也不依赖字符串比较。

### 3.3 Schema 版本与必填字段

```bash
jq -e '.sceneId and .manifestVersion and .packVersion' scene.json 2>"$SCHEMA_ERR_FILE"
SCHEMA_EXIT=$?
```

判定分类：
- `SCHEMA_EXIT` = 0 → PASS（所有必填字段存在且非空）
- `SCHEMA_EXIT` = 1 → `FAIL (SCHEMA_INCOMPLETE)`（jq -e 表达式为 false/null，即字段缺失或为空）
- `SCHEMA_EXIT` 其他非 0 → `BLOCKED_ENV`（JSON 解析失败或 jq 执行错误），记录 `$SCHEMA_ERR_FILE` 内容

## Step 4: 资产路径与结构校验

### 4.0 原始路径格式校验（REV-14 修正：空路径报告 + 错误汇总文件）

禁止仅依赖 realpath 规范化后的结果，也禁止使用模糊的字符串后缀匹配。必须先由 jq 验证每个 path 为字符串类型，再使用按 / 分割的路径段检查：

```bash
# Phase 1: jq 验证 path 为字符串类型，捕获 jq 退出码
NON_STRING_PATHS=$(jq -r '.files | to_entries[] | select(.value.path | type != "string") | "index=\(.key) type=\(.value.path | type)"' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to validate path types in manifest"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 读取所有 path（包括空字符串），捕获 jq 退出码
# 注意：不使用 select(.path | type == "string") 过滤，因为空字符串也是字符串，需要被检查
PATHS=$(jq -r '.files[].path' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read paths from manifest"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 3: 初始化错误汇总文件（循环在子 shell 中执行，通过文件传递状态）
PATH_ERROR_FILE=$(mktemp -t path-errors-XXXXXX)
> "$PATH_ERROR_FILE"
# 格式：每行一个错误：ERROR_TYPE <path> <detail>

# Phase 4: 非字符串类型路径写入错误汇总
if [ -n "$NON_STRING_PATHS" ]; then
  printf '%s\n' "$NON_STRING_PATHS" | while read -r line; do
    echo "PATH_NOT_STRING $line" >> "$PATH_ERROR_FILE"
  done
fi

# Phase 5: 逐路径检查（包括空字符串路径，不跳过）
printf '%s\n' "$PATHS" | while read -r p; do
  # 不使用 [ -z "$p" ] && continue，空路径需要被报告

  # 1. 空路径检查（空字符串或仅含空白）
  if [ -z "$p" ]; then
    echo "EMPTY_PATH (empty string)" >> "$PATH_ERROR_FILE"
    continue
  fi
  case "$p" in
    *[![:space:]]*) ;;  # 含非空白字符，正常
    *) echo "EMPTY_PATH (whitespace only)" >> "$PATH_ERROR_FILE"; continue ;;
  esac

  # 2. 绝对路径检查（以 / 开头）
  case "$p" in
    /*) echo "ABSOLUTE_PATH $p" >> "$PATH_ERROR_FILE" ;;
  esac

  # 3. 按 / 分割路径段，检查每个段是否为 ..
  IFS='/' read -ra segments <<< "$p"
  for seg in "${segments[@]}"; do
    if [ "$seg" = ".." ]; then
      echo "PARENT_SEGMENT $p" >> "$PATH_ERROR_FILE"
      break
    fi
  done

  # 4. 反斜杠检查（必须使用 POSIX / 分隔符）
  case "$p" in
    *\\*) echo "BACKSLASH_DETECTED $p" >> "$PATH_ERROR_FILE" ;;
  esac
done

# Phase 6: 汇总错误
PATH_ERROR_COUNT=$(wc -l < "$PATH_ERROR_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count path errors (exit=$WC_EXIT)"
  exit 2
fi
if [ "$PATH_ERROR_COUNT" -gt 0 ]; then
  echo "=== Path Format Errors ($PATH_ERROR_COUNT) ==="
  cat "$PATH_ERROR_FILE"
fi
# 错误文件不删除，纳入证据清单
```

判定分类（基于错误汇总文件）：
- `PATH_ERROR_COUNT > 0` → `FAIL (PATH_FORMAT_INVALID)`，记录具体违规路径和违规类型（`$PATH_ERROR_FILE` 纳入证据清单）
- `JQ_ERROR`（jq 执行失败）→ `BLOCKED_ENV`，记录 `$JQ_ERR_FILE`
- `PATH_ERROR_COUNT == 0` → PASS，继续

> 说明：realpath 会规范化路径，`a/../b` 可能规范化后位于合法目录内，
> 但原始 manifest 路径仍然违反"不含 .."约束。因此必须在 realpath 之前先做原始字符串检查。
> 使用 `IFS='/' read -ra segments` 按路径段分割，而非模糊的 `*../*` 后缀匹配，
> 可以精确识别 `../x`（开头）、`x/../y`（中间）、`x/..`（结尾）三种形式的 `..` 段。

### 4.1 路径逃逸检测（REVIEW-05 修正：realpath 失败分类）

遍历 `manifest.json` 中 `files[].path` 声明的所有资产路径，对每个路径执行：

```bash
# 1. 先检查文件是否存在
if [ ! -e "<output-dir>/<declared-path>" ]; then
  echo "ASSET_MISSING"
else
  # 2. 文件存在时才做 realpath 规范化，捕获每个 realpath 的退出码
  SRC_REAL=$(realpath "<output-dir>" 2>"$REALPATH_ERR_FILE")
  SRC_EXIT=$?
  if [ $SRC_EXIT -ne 0 ]; then
    echo "REALPATH_ERROR: output-dir"
    cat "$REALPATH_ERR_FILE"
    exit 2
  fi
  TGT_REAL=$(realpath "<output-dir>/<declared-path>" 2>"$REALPATH_ERR_FILE")
  TGT_EXIT=$?
  if [ $TGT_EXIT -ne 0 ]; then
    echo "REALPATH_ERROR: <declared-path>"
    cat "$REALPATH_ERR_FILE"
    exit 2
  fi
  # 3. 使用目录边界感知的前缀匹配（case 语句正确处理边界）
  case "$TGT_REAL" in
    "$SRC_REAL"/*) echo "IN_SOURCE" ;;
    *) echo "PATH_ESCAPE" ;;
  esac
fi
```

判定分类：
- `ASSET_MISSING` → `FAIL (ASSET_INVALID)`（文件不存在，不进入路径逃逸判定）
- `REALPATH_ERROR`（任一 realpath 退出码非 0）→ `BLOCKED_ENV`，记录 `$REALPATH_ERR_FILE`
- `PATH_ESCAPE` → `FAIL (PATH_ESCAPE)`，记录具体路径
- `IN_SOURCE` → PASS

### 4.2 相对路径与物理存在（REV-14 修正：循环错误汇总文件）

每个声明路径必须：
- 为相对路径，不含 `..` 或绝对路径前缀（已在 Step 4.0 验证）
- 物理存在于输出目录下
- 文件大小 > 0（`stat -c %s` 验证）

执行逐项检查：

```bash
# Phase 1: 读取 manifest 路径列表，捕获 jq 退出码
PATHS=$(jq -r '.files[].path' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read manifest paths for physical existence check"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 初始化错误汇总文件（循环在子 shell 中执行，通过文件传递状态）
ASSET_ERROR_FILE=$(mktemp -t asset-errors-XXXXXX)
> "$ASSET_ERROR_FILE"
# 格式：每行一个错误：ERROR_TYPE <path> <detail>

# Phase 3: 逐项检查文件存在和大小
printf '%s\n' "$PATHS" | while read -r p; do
  # REV-15: 此处跳过的是 printf 输出的 shell 空行（PATHS 为空时产生），
  # 真实空路径已在 Step 4.0 被拦截并写入 PATH_ERROR_FILE
  [ -z "$p" ] && continue

  # 检查文件存在（区分不存在与权限错误）
  if [ ! -e "<output-dir>/$p" ]; then
    echo "ASSET_MISSING $p" >> "$ASSET_ERROR_FILE"
    continue
  fi

  # 检查是普通文件（不是目录或设备）
  if [ ! -f "<output-dir>/$p" ]; then
    echo "ASSET_NOT_REGULAR_FILE $p" >> "$ASSET_ERROR_FILE"
    continue
  fi

  # 检查文件大小 > 0，捕获 stat 退出码
  STAT_ERR_FILE=$(mktemp -t stat-err-XXXXXX)
  file_size=$(stat -c %s "<output-dir>/$p" 2>"$STAT_ERR_FILE")
  STAT_EXIT=$?
  if [ $STAT_EXIT -ne 0 ]; then
    echo "STAT_ERROR $p (exit=$STAT_EXIT)" >> "$ASSET_ERROR_FILE"
    cat "$STAT_ERR_FILE" >> "$ASSET_ERROR_FILE"
    rm -f "$STAT_ERR_FILE"
    continue
  fi
  rm -f "$STAT_ERR_FILE"

  if [ "$file_size" -eq 0 ]; then
    echo "ASSET_EMPTY $p (size=0)" >> "$ASSET_ERROR_FILE"
  fi
done

# Phase 4: 汇总错误
ASSET_ERROR_COUNT=$(wc -l < "$ASSET_ERROR_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count asset errors (exit=$WC_EXIT)"
  exit 2
fi
if [ "$ASSET_ERROR_COUNT" -gt 0 ]; then
  echo "=== Asset Existence Errors ($ASSET_ERROR_COUNT) ==="
  cat "$ASSET_ERROR_FILE"
fi
# 错误文件不删除，纳入证据清单
```

判定分类（基于错误汇总文件）：
- 含 `STAT_ERROR` → `BLOCKED_ENV`（stat 命令执行失败），记录 `$ASSET_ERROR_FILE`
- 含 `ASSET_MISSING` / `ASSET_NOT_REGULAR_FILE` / `ASSET_EMPTY` → `FAIL (ASSET_INVALID)`，记录具体文件和违规类型
- `ASSET_ERROR_COUNT == 0` → PASS，继续

### 4.3 重复资产去重（realpath 物理路径去重）（REV-14 修正：错误汇总文件 + grep/sort 独立退出码）

```bash
# Phase 1: 读取 manifest 路径列表，捕获 jq 退出码
PATHS=$(jq -r '.files[].path' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read manifest.files[].path"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 初始化错误汇总文件和 realpath 结果文件
REALPATH_ERROR_FILE=$(mktemp -t realpath-errors-XXXXXX)
> "$REALPATH_ERROR_FILE"
REALPATH_RESULT_FILE=$(mktemp -t realpath-results-XXXXXX)
> "$REALPATH_RESULT_FILE"

# Phase 3: 逐项 realpath，捕获每个的退出码
printf '%s\n' "$PATHS" | while read -r p; do
  # REV-15: 跳过 printf 输出的 shell 空行，真实空路径已在 Step 4.0 拦截
  [ -z "$p" ] && continue
  REALPATH_ERR_PER_ITEM=$(mktemp -t realpath-err-XXXXXX)
  rp=$(realpath "<output-dir>/$p" 2>"$REALPATH_ERR_PER_ITEM")
  rp_exit=$?
  if [ $rp_exit -ne 0 ]; then
    echo "REALPATH_ERROR $p (exit=$rp_exit)" >> "$REALPATH_ERROR_FILE"
    cat "$REALPATH_ERR_PER_ITEM" >> "$REALPATH_ERROR_FILE"
  else
    echo "$rp" >> "$REALPATH_RESULT_FILE"
  fi
  rm -f "$REALPATH_ERR_PER_ITEM"
done

# Phase 4: 检查 realpath 错误汇总文件
REALPATH_ERROR_COUNT=$(wc -l < "$REALPATH_ERROR_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count realpath errors (exit=$WC_EXIT)"
  exit 2
fi
if [ "$REALPATH_ERROR_COUNT" -gt 0 ]; then
  echo "REALPATH_ERRORS_DETECTED ($REALPATH_ERROR_COUNT)"
  cat "$REALPATH_ERROR_FILE"
  # 错误文件不删除，纳入证据清单
  exit 2
fi

# Phase 5: 排序 realpath 结果，独立捕获 sort 退出码
# 注意：不使用 grep -v | sort 管道，因为 $? 会取得 sort 的退出码而非 grep
# 此处 REALPATH_RESULT_FILE 已经只包含成功的 realpath 结果，无需过滤
sort "$REALPATH_RESULT_FILE" > "$SORTED_REALPATHS_FILE"
SORT_EXIT=$?
if [ $SORT_EXIT -ne 0 ]; then
  echo "SORT_ERROR (exit=$SORT_EXIT)"
  exit 2
fi

# Phase 6: 检测重复物理路径，捕获 uniq 退出码
DUPLICATES=$(uniq -d "$SORTED_REALPATHS_FILE")
UNIQ_EXIT=$?
if [ $UNIQ_EXIT -ne 0 ]; then
  echo "UNIQ_ERROR (exit=$UNIQ_EXIT)"
  exit 2
fi
```

判定分类：
- `JQ_ERROR`（jq 退出码非 0）→ `BLOCKED_ENV`，记录 `$JQ_ERR_FILE`
- `REALPATH_ERROR_COUNT > 0` → `BLOCKED_ENV`，记录 `$REALPATH_ERROR_FILE`（纳入证据清单）
- `SORT_ERROR` / `UNIQ_ERROR` → `BLOCKED_ENV`
- `$DUPLICATES` 非空 → `FAIL (DUPLICATE_PHYSICAL_ASSET)`，记录重复的 realpath
- `$DUPLICATES` 为空 → PASS

> 说明：SHA-256 冲突只能检测内容相同的文件，但两个不同声明路径指向同一物理文件
> （如硬链接）不会触发哈希冲突，仍属于路径逃逸的一种形式，必须用 realpath 检测。
> realpath 失败（文件不存在或路径解析失败）必须报告为 BLOCKED_ENV，不得静默跳过
> 后误判为"无重复资产"。

### 4.4 fileCount 一致性（FAIL-03 修正：比较声明数与磁盘数，排除 manifest.json）

> **fileCount 语义证据（已审查源代码确认）**：
> - `disk-emitter.ts:384`：`fileCount: manifestFiles.length`
> - `manifestFiles` 包含：所有编译资产（`assets/*.webp`）+ `scene.json` + `evidence/machine-provenance.json` + `evidence/human-audit-ledger.json`
> - `manifestFiles` **不包含** `manifest.json` 本身
> - `disk-validator.ts:272`：校验 `fileCount === files.length`
> - `disk-emitter.test.ts:232`：断言 `diskFiles.length === fileCount + 1`（+1 for manifest.json）
> - `disk-emitter.test.ts:73-84`：`listFilesRecursive` 递归遍历 output-dir 下**所有文件**（含隐藏文件），不排除任何文件
> - `disk-validator.ts:397-412`：`collectFilesRecursive` 同样递归遍历所有文件，并通过 `extraFiles` 检测未声明的额外文件
>
> 因此：磁盘上除根目录 manifest.json 外的文件数必须等于 fileCount。
> `find` 统计范围与 `listFilesRecursive` 一致（递归遍历所有文件）。
> **排除层级（方案 A）**：仅排除 output directory 根目录下的 `manifest.json`，
> 其他层级的同名文件（如 `assets/manifest.json`）不排除，应被报告为未声明文件（Step 8.2）。
> 若 output-dir 中存在未纳入 manifest.files[] 的额外文件（临时文件、调试日志等），
> 本步骤的 fileCount 一致性检查会失败（DISK_COUNT > MANIFEST_COUNT），
> 同时 Step 8.2（Manifest 双向验证）会精确列出未声明的文件名。

```bash
# Phase 1: 检查 .files 是数组，捕获 jq 退出码
FILES_TYPE=$(jq -r '.files | type' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read manifest"
  cat "$JQ_ERR_FILE"
  exit 2
fi
if [ "$FILES_TYPE" != "array" ]; then
  echo "FILES_NOT_ARRAY: type=$FILES_TYPE"
  exit 2
fi

# Phase 2: 读取 fileCount，检查是整数，捕获 jq 退出码
MANIFEST_COUNT=$(jq -r '.fileCount' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read .fileCount"
  cat "$JQ_ERR_FILE"
  exit 2
fi
case "$MANIFEST_COUNT" in
  ''|*[!0-9]*)
    echo "FILECOUNT_NOT_INTEGER: value=$MANIFEST_COUNT"
    exit 2
    ;;
esac

# Phase 3: 读取 files 数组长度，捕获 jq 退出码
DECLARED_COUNT=$(jq '.files | length' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read .files | length"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 4: manifest 内部一致性
if [ "$MANIFEST_COUNT" -ne "$DECLARED_COUNT" ]; then
  echo "FILE_COUNT_MISMATCH: manifest.fileCount=$MANIFEST_COUNT != files.length=$DECLARED_COUNT"
  exit 1
fi

# Phase 5: 磁盘文件枚举，捕获 find 退出码（find 失败不得产生不完整计数）
DISK_FILES=$(find "<output-dir>" -type f ! -path "<output-dir>/manifest.json" 2>"$FIND_ERR_FILE")
FIND_EXIT=$?
if [ $FIND_EXIT -ne 0 ]; then
  echo "FIND_ERROR: failed to enumerate output-dir files"
  cat "$FIND_ERR_FILE"
  exit 2
fi
DISK_COUNT=$(printf '%s\n' "$DISK_FILES" | wc -l)
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count disk files (exit=$WC_EXIT)"
  exit 2
fi
# 当 DISK_FILES 为空时，printf 输出一个空行，wc -l 返回 1
# 需要减去这个空行
if [ -z "$DISK_FILES" ]; then
  DISK_COUNT=0
fi

# Phase 6: 磁盘一致性
if [ "$MANIFEST_COUNT" -ne "$DISK_COUNT" ]; then
  echo "FILE_COUNT_MISMATCH: manifest.fileCount=$MANIFEST_COUNT != disk_count=$DISK_COUNT"
  exit 1
fi
```

判定分类：
- `JQ_ERROR`（任一 jq 退出码非 0）→ `BLOCKED_ENV`，记录 `$JQ_ERR_FILE`
- `FILES_NOT_ARRAY`（.files 不是数组）→ `BLOCKED_ENV`
- `FILECOUNT_NOT_INTEGER`（.fileCount 不是非负整数）→ `BLOCKED_ENV`
- `FIND_ERROR`（find 退出码非 0）→ `BLOCKED_ENV`，记录 `$FIND_ERR_FILE`
- `MANIFEST_COUNT != DECLARED_COUNT` 或 `MANIFEST_COUNT != DISK_COUNT` → `FAIL (FILE_COUNT_MISMATCH)`，记录三个数值
- 三者一致 → PASS

## Step 5: 编译输出完整性（SHA-256）（FAIL-03 修正：统一路径拼接 + REV-10 补强：逐项比对闭环）

### 5.1 manifest 哈希字段存在性检查（REV-14 修正：结果持久化 + 明确终止）

在计算 SHA-256 之前，先确认每个 manifest 项都有预期哈希字段：

```bash
# Phase 1: 检查缺失哈希字段，捕获 jq 退出码
MISSING_HASH_PATHS=$(jq -r '.files[] | select(.sha256 == null or .sha256 == "") | .path' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to check hash field existence in manifest"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 将结果持久化到证据文件
MISSING_HASH_FILE=$(mktemp -t missing-hash-XXXXXX)
printf '%s\n' "$MISSING_HASH_PATHS" > "$MISSING_HASH_FILE"

# Phase 3: 统计缺失数量
MISSING_HASH_COUNT=$(wc -l < "$MISSING_HASH_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count missing hash entries (exit=$WC_EXIT)"
  exit 2
fi
# 当 MISSING_HASH_PATHS 为空时，printf 输出一个空行，wc -l 返回 1
if [ -z "$MISSING_HASH_PATHS" ]; then
  MISSING_HASH_COUNT=0
fi

# Phase 4: 明确判定和终止
if [ "$MISSING_HASH_COUNT" -gt 0 ]; then
  echo "MISSING_HASH_FIELD: $MISSING_HASH_COUNT items missing sha256 field"
  cat "$MISSING_HASH_FILE"
  # 证据文件不删除，纳入证据清单
  echo "MISSING_HASH_FILE=$MISSING_HASH_FILE"
  exit 1
fi
```

- `MISSING_HASH_COUNT > 0` → `FAIL (MISSING_HASH_FIELD)`，记录 `$MISSING_HASH_FILE`（纳入证据清单），明确终止后续 SHA-256 计算
- `JQ_ERROR` → `BLOCKED_ENV`（JSON 损坏或 jq 执行失败）
- `MISSING_HASH_COUNT == 0` → PASS，继续 Step 5.2

### 5.2 逐项 SHA-256 计算与比对（REV-13 修正：文件汇总闭环 + 哈希格式验证）

对每个有哈希字段的 manifest 项，执行逐项计算与比对（路径直接拼接，不加 assets/ 前缀）：

```bash
# Phase 1: 读取 manifest 项列表，捕获 jq 退出码
MANIFEST_ITEMS=$(jq -c '.files[] | {path: .path, expected: .sha256}' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read manifest files for SHA-256 verification"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 初始化结果汇总文件和 stderr 汇总文件（循环在子 shell 中执行，通过文件传递状态）
# 格式：每行一个结果：MATCH <path> 或 MISMATCH <path> <expected> <actual> 或 ERROR <path> <reason>
SHA_RESULT_FILE=$(mktemp -t sha256-results-XXXXXX)
> "$SHA_RESULT_FILE"
# REV-15: 所有 per-item stderr 内容汇总到此文件，避免 rm -f 后丢失审计证据
SHA_STDERR_FILE=$(mktemp -t sha256-stderr-XXXXXX)
> "$SHA_STDERR_FILE"

# Phase 3: 逐项验证
printf '%s\n' "$MANIFEST_ITEMS" | while read -r item; do
  [ -z "$item" ] && continue

  # 3a: 读取 path，捕获 jq 退出码
  JQ_ERR_PER_ITEM=$(mktemp -t jq-err-XXXXXX)
  p=$(printf '%s' "$item" | jq -r '.path' 2>"$JQ_ERR_PER_ITEM")
  JQ_PATH_EXIT=$?
  if [ $JQ_PATH_EXIT -ne 0 ]; then
    echo "ERROR <unknown_path> jq_path_read_failed (exit=$JQ_PATH_EXIT)" >> "$SHA_RESULT_FILE"
    echo "--- jq stderr for unknown_path ---" >> "$SHA_STDERR_FILE"
    cat "$JQ_ERR_PER_ITEM" >> "$SHA_STDERR_FILE"
    rm -f "$JQ_ERR_PER_ITEM"
    continue
  fi

  # 3b: 读取 expected，捕获 jq 退出码
  expected=$(printf '%s' "$item" | jq -r '.expected' 2>"$JQ_ERR_PER_ITEM")
  JQ_EXPECTED_EXIT=$?
  if [ $JQ_EXPECTED_EXIT -ne 0 ]; then
    echo "ERROR $p jq_expected_read_failed (exit=$JQ_EXPECTED_EXIT)" >> "$SHA_RESULT_FILE"
    echo "--- jq stderr for $p (expected read) ---" >> "$SHA_STDERR_FILE"
    cat "$JQ_ERR_PER_ITEM" >> "$SHA_STDERR_FILE"
    rm -f "$JQ_ERR_PER_ITEM"
    continue
  fi
  rm -f "$JQ_ERR_PER_ITEM"

  # 3c: 验证 expected 哈希格式（64 位小写十六进制）
  if ! printf '%s' "$expected" | grep -qE '^[0-9a-f]{64}$'; then
    echo "ERROR $p invalid_expected_hash_format (len=${#expected})" >> "$SHA_RESULT_FILE"
    continue
  fi

  # 3d: 执行 sha256sum，捕获退出码（不通过管道，避免 $? 取得 awk 退出码）
  SHA_ERR_PER_ITEM=$(mktemp -t sha256-err-XXXXXX)
  SHA256_OUTPUT=$(sha256sum "<output-dir>/$p" 2>"$SHA_ERR_PER_ITEM")
  SHA256_EXIT=$?

  if [ $SHA256_EXIT -ne 0 ]; then
    echo "ERROR $p sha256sum_exec_failed (exit=$SHA256_EXIT)" >> "$SHA_RESULT_FILE"
    echo "--- sha256sum stderr for $p ---" >> "$SHA_STDERR_FILE"
    cat "$SHA_ERR_PER_ITEM" >> "$SHA_STDERR_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 3e: 解析哈希值，捕获退出码（独立于 sha256sum 执行）
  actual=$(printf '%s' "$SHA256_OUTPUT" | awk '{print $1}')
  PARSE_EXIT=$?

  if [ $PARSE_EXIT -ne 0 ]; then
    echo "ERROR $p hash_parse_failed (awk exit=$PARSE_EXIT)" >> "$SHA_RESULT_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 3f: 验证 actual 哈希格式（64 位小写十六进制）
  if ! printf '%s' "$actual" | grep -qE '^[0-9a-f]{64}$'; then
    echo "ERROR $p invalid_actual_hash_format (len=${#actual}, value=$actual)" >> "$SHA_RESULT_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 3g: 比较哈希值
  if [ "$actual" != "$expected" ]; then
    echo "MISMATCH $p $expected $actual" >> "$SHA_RESULT_FILE"
  else
    echo "MATCH $p" >> "$SHA_RESULT_FILE"
  fi

  rm -f "$SHA_ERR_PER_ITEM"
done

# Phase 4: 汇总结果（循环在子 shell 中执行，从结果文件统计）
# 注意：不使用 || true，因为那会掩盖 grep 执行错误（退出码 >1）
# grep -c 在无匹配时返回退出码 1，这是正常的；退出码 >1 才是执行错误
MATCH_COUNT=$(grep -c '^MATCH ' "$SHA_RESULT_FILE")
GREP_MATCH_EXIT=$?
if [ $GREP_MATCH_EXIT -eq 1 ]; then MATCH_COUNT=0; fi
if [ $GREP_MATCH_EXIT -gt 1 ]; then
  echo "GREP_ERROR: failed to count MATCH results (exit=$GREP_MATCH_EXIT)"
  exit 2
fi

MISMATCH_COUNT=$(grep -c '^MISMATCH ' "$SHA_RESULT_FILE")
GREP_MISMATCH_EXIT=$?
if [ $GREP_MISMATCH_EXIT -eq 1 ]; then MISMATCH_COUNT=0; fi
if [ $GREP_MISMATCH_EXIT -gt 1 ]; then
  echo "GREP_ERROR: failed to count MISMATCH results (exit=$GREP_MISMATCH_EXIT)"
  exit 2
fi

ERROR_COUNT=$(grep -c '^ERROR ' "$SHA_RESULT_FILE")
GREP_ERROR_EXIT=$?
if [ $GREP_ERROR_EXIT -eq 1 ]; then ERROR_COUNT=0; fi
if [ $GREP_ERROR_EXIT -gt 1 ]; then
  echo "GREP_ERROR: failed to count ERROR results (exit=$GREP_ERROR_EXIT)"
  exit 2
fi

TOTAL_COUNT=$(wc -l < "$SHA_RESULT_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count total results (exit=$WC_EXIT)"
  exit 2
fi

# 输出逐项结果（原始留存）
echo "=== SHA-256 Verification Results ==="
cat "$SHA_RESULT_FILE"
echo "=== Summary: MATCH=$MATCH_COUNT MISMATCH=$MISMATCH_COUNT ERROR=$ERROR_COUNT TOTAL=$TOTAL_COUNT ==="

# 输出 stderr 汇总（REV-15: 所有命令 stderr 必须持久化）
if [ -s "$SHA_STDERR_FILE" ]; then
  echo "=== SHA-256 Stderr (errors only) ==="
  cat "$SHA_STDERR_FILE"
fi

# 结果文件和 stderr 文件不删除，纳入证据清单
echo "SHA_RESULT_FILE=$SHA_RESULT_FILE"
echo "SHA_STDERR_FILE=$SHA_STDERR_FILE"
```

判定分类（基于汇总统计）：
- `ERROR_COUNT > 0` → `BLOCKED_ENV`（sha256sum 执行失败、解析失败、格式验证失败、jq 读取失败），记录 `$SHA_RESULT_FILE`（纳入证据清单，包含逐项错误详情）
- `MISMATCH_COUNT > 0` → `FAIL (HASH_MISMATCH)`，记录 `$SHA_RESULT_FILE`（包含具体文件和期望/实际哈希值）
- `MATCH_COUNT == TOTAL_COUNT` 且 `TOTAL_COUNT > 0` → Step 5.2 PASS
- `TOTAL_COUNT == 0` → `BLOCKED_ENV`（没有可验证的 manifest 项，可能是 manifest 为空或 jq 读取失败）

### 5.3 证据文件检查（REV-12 修正：区分文件不存在与权限错误）

检查 `evidence/` 目录包含 `machine-provenance.json` 和 `human-audit-ledger.json`：

```bash
for f in machine-provenance.json human-audit-ledger.json; do
  evidence_path="<output-dir>/evidence/$f"
  # 先检查路径是否存在（区分不存在与权限错误）
  if [ ! -e "$evidence_path" ]; then
    echo "EVIDENCE_FILE_MISSING: $f"
  elif [ ! -f "$evidence_path" ]; then
    echo "EVIDENCE_FILE_NOT_REGULAR: $f (not a regular file)"
  elif [ ! -r "$evidence_path" ]; then
    echo "EVIDENCE_FILE_NOT_READABLE: $f (permission denied)"
  fi
done
```

输出非空 → `FAIL (EVIDENCE_FILE_MISSING)` 或对应错误码，记录具体文件和问题类型。

### 5.4 比较结果记录

所有 `HASH_MATCH` / `HASH_MISMATCH` / `SHA256_EXEC_ERROR` 输出必须原始留存，纳入最终证据清单。不得仅记录"全部匹配"的摘要。

## Step 6: 原子写入与回滚验证（方案 C — 委托现有进程内单元/集成测试）

> **方案选择说明**：`DiskEmitter.emit()` 是 TypeScript 库方法，非独立 CLI 进程，
> 无法从 shell 精确控制 staging 阶段的时序并注入 SIGKILL。且 `crash-recovery.ts`
> 明确声明"并非严格崩溃安全的原子提交（不提供事务日志或 WAL）"。
> 因此采用方案 C：原子写入的行为验证委托给现有 Jest 单元/集成测试，
> 本 Playbook 不尝试不可执行的 SIGKILL 注入。
>
> **测试性质声明**：以下测试均为**进程内测试**——直接调用 `emitter.emit()` /
> `compileAndEmitToDisk()`，通过 `jest.mock("node:fs")` 替换 `renameSync` / `rmSync`
> 来模拟失败。它们验证两阶段提交逻辑、回滚机制、staging 清理和目标保护，
> **不验证真实进程崩溃（SIGKILL）在 rename 窗口中的行为**。

### 6.1 执行原子写入与回滚测试（三个测试文件，REV-11 修正：独立退出码捕获）

```bash
# DISK-01: 原子写入基础安全（失败不创建目标、成功结构完整、失败不破坏已有目标）
npx jest tests/chinese-aesthetic/scene-pack/disk-emitter.test.ts --runInBand --verbose 2>&1 | tee "$JEST_DISK_EMITTER_LOG"
JEST_DISK_EMITTER_EXIT=${PIPESTATUS[0]}

# DISK-SEC-02: rename(staging→target) 失败时自动回滚，原目录完好无损
# DISK-SEC-05: 原子 staging 泄漏防护（失败/成功后均无 staging/backup 残留）
npx jest tests/chinese-aesthetic/scene-pack/disk-security.test.ts --runInBand --verbose 2>&1 | tee "$JEST_DISK_SECURITY_LOG"
JEST_DISK_SECURITY_EXIT=${PIPESTATUS[0]}

# DISK-HARD-04: 崩溃状态恢复（手动构造崩溃现场后调用 recoverFromPreviousCrashSync）
npx jest tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts --runInBand --verbose 2>&1 | tee "$JEST_DISK_HARDENING_LOG"
JEST_DISK_HARDENING_EXIT=${PIPESTATUS[0]}
```

> 注意：使用 `${PIPESTATUS[0]}` 捕获管道中 npx jest 的退出码（而非 tee 的退出码）。
> 若 shell 不支持 PIPESTATUS，应先将输出重定向到文件，再检查 `$?`。

### 6.2 测试覆盖范围确认

| 测试文件 | 覆盖维度 | 关键断言 |
|---|---|---|
| disk-emitter.test.ts DISK-01 | 原子写入基础安全 | 失败时 tempDirCleaned=true、无目标目录、无 .tmp-* 残留；失败时已有目标目录哈希不变 |
| disk-security.test.ts DISK-SEC-02 | 安全替换回滚 | mock renameSync 第 2 次调用抛 EBUSY → rollbackPerformed=true、原目录哈希不变、无 backup/staging 残留 |
| disk-security.test.ts DISK-SEC-05 | staging 泄漏防护 | 资产缺失/路径穿越失败时无 .staging-* 残留；成功后无 staging/backup 残留 |
| disk-hardening.test.ts DISK-HARD-04 | 崩溃恢复逻辑 | 5 种崩溃场景（A-E）的恢复决策、symlink 攻击拦截、清理失败审计、残留状态真实性 |

### 6.3 判定（REV-14 修正：测试文件缺失 exit 终止 + 退出码确定性分类）

**测试文件存在性检查（执行前，缺失则立即终止）**：
```bash
TEST_FILES_MISSING=0
for test_file in \
  tests/chinese-aesthetic/scene-pack/disk-emitter.test.ts \
  tests/chinese-aesthetic/scene-pack/disk-security.test.ts \
  tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts; do
  if [ ! -f "$test_file" ]; then
    echo "TEST_FILE_MISSING: $test_file"
    TEST_FILES_MISSING=1
  fi
done
if [ "$TEST_FILES_MISSING" -eq 1 ]; then
  echo "BLOCKED_ENV: one or more test files missing, cannot proceed with test execution"
  exit 2
fi
```
测试文件缺失 → `BLOCKED_ENV`，**立即 exit 2 终止**，不得继续执行测试。

**Jest 退出码确定性分类（不依赖日志文本解析）**：

| 退出码 | 分类 | 状态 |
|---|---|---|
| 0 | 全部测试通过 | PASS |
| 1 | 测试断言失败（Jest 标准退出码） | FAIL (NON_ATOMIC_WRITE) |
| 2 | Jest 配置错误或内部错误 | BLOCKED_ENV |
| 124 | timeout 命令超时 | BLOCKED_ENV (TIMEOUT) |
| 126 | 命令不可执行 | BLOCKED_ENV |
| 127 | npx jest 命令未找到 | BLOCKED_ENV |
| 130 | SIGINT 终止 | BLOCKED_ENV (SIGNAL_TERMINATED) |
| 137 | SIGKILL 终止 | BLOCKED_ENV (SIGNAL_TERMINATED) |
| 143 | SIGTERM 终止 | BLOCKED_ENV (SIGNAL_TERMINATED) |
| >128 其他 | 被其他信号终止 | BLOCKED_ENV (SIGNAL_TERMINATED) |

> 说明：Jest 的退出码 1 明确表示"测试失败"，这是 Jest 的标准行为，不需要解析日志中的 "Tests:" 行来确认。
> 日志文件用于记录失败用例名称和详细错误，不作为判定 PASS/FAIL 的唯一依据。

**证据格式标准化**：
每个测试文件必须记录以下字段：
```
TEST_FILE: <path>
EXIT_CODE: <n>
STATUS: PASS | FAIL | BLOCKED_ENV | TIMEOUT | SIGNAL_TERMINATED
LOG_FILE: <path to $JEST_*_LOG>
FAILED_TESTS: <list of failed test names, if any>
DURATION: <seconds, if available>
```

**最终判定**：
- 三个测试文件退出码均为 0 → 原子写入与回滚逻辑通过进程内单元/集成验证
- 任一测试文件退出码为 1 → `FAIL (NON_ATOMIC_WRITE)`，记录失败文件名、退出码和失败用例名
- 任一测试文件退出码为其他非 0 → 按上表分类为 `BLOCKED_ENV`
- 本步骤标记为 `NOT_RUN` 时，AC-3.1 不得判定 PASS
- 三个测试日志文件（`$JEST_DISK_EMITTER_LOG`、`$JEST_DISK_SECURITY_LOG`、`$JEST_DISK_HARDENING_LOG`）必须原始留存，纳入证据清单

### 6.4 两阶段提交机制确认（静态审查）

确认 `disk-emitter.ts` 实现了两阶段提交：
1. `rename(target → backup)`（目标腾挪至备份区）— disk-emitter.ts:430
2. `rename(staging → target)`（staging 原子替换为目标）— disk-emitter.ts:435
3. 第 2 步失败时 `rename(backup → target)` 回滚（rollbackPerformed=true）— disk-emitter.ts:441-442
4. `emit()` 入口调用 `recoverFromPreviousCrashSync()` 处理前次崩溃残留 — disk-emitter.ts:251

此为静态代码审查，不替代 Step 6.1 的测试执行。

### 6.5 已知边界声明

- 当前实现**不提供**事务日志（WAL）或 fsync 屏障
- 真实进程崩溃（SIGKILL / 断电）在两次 rename 之间的行为未被测试覆盖
- `crash-recovery.ts` 的恢复逻辑假设崩溃后文件系统状态一致（无部分写入的目录项）
- 以上边界不影响本 Playbook 的 AC-3.1 判定（AC-3.1 仅要求进程内验证），但必须在交付报告中声明

## Step 7: 编译后孤儿目录扫描（after）（第七次修正：状态闭环 + find 退出码捕获）

> 本步骤在编译执行**后**运行，与 Phase 0（编译前扫描）对比。
>
> **状态闭环规则**：
> - Phase 0 = NOT_RUN → 本步骤扫描结果仅作为 `REFERENCE_ONLY` 附加证据，AC-3.3/AC-3.4 = NOT_RUN，最终不得 PASS
> - Phase 0 = PASS → 本步骤正常判定 AC-3.3/AC-3.4
> - 若 Step 2 已 FAIL（输出目录不存在），本步骤可跳过，直接进入 Step 9 最终判定
>
> **五种状态区分**：
> 1. Phase 0 无法执行（NOT_RUN）
> 2. Phase 0 执行成功但发现已有孤儿（PRE_EXISTING_ORPHAN）
> 3. Step 7 执行失败（find 退出码非 0 → BLOCKED_ENV）
> 4. Step 7 执行成功且扫描为空（PASS）
> 5. Step 7 执行成功但存在新孤儿（FAIL）

```bash
find "<output-dir>/.." -maxdepth 1 -type d \( -name '*.staging-*' -o -name '*.backup-*' \) \
  -print > "$AFTER_SCAN_FILE" 2>"$AFTER_SCAN_ERR_FILE"
AFTER_SCAN_EXIT=$?
```

若 `AFTER_SCAN_EXIT` 非 0 → 直接 `BLOCKED_ENV`，不执行后续差分。

若 `AFTER_SCAN_EXIT` = 0 且 Phase 0 ≠ NOT_RUN，执行可执行差分（REV-11 修正：sort 与 comm 拆分为独立命令阶段）：

```bash
# Phase 1: 分别排序到临时文件，独立检查 sort 退出码
# （sort 位于进程替换中时，comm 退出码不一定反映 sort 失败，因此必须先独立排序）
sort "$BEFORE_SCAN_FILE" > "$BEFORE_SORTED_FILE" 2>"$BEFORE_SORT_ERR_FILE"
BEFORE_SORT_EXIT=$?
if [ $BEFORE_SORT_EXIT -ne 0 ]; then
  echo "SORT_ERROR: before scan file"
  cat "$BEFORE_SORT_ERR_FILE"
  exit 2
fi

sort "$AFTER_SCAN_FILE" > "$AFTER_SORTED_FILE" 2>"$AFTER_SORT_ERR_FILE"
AFTER_SORT_EXIT=$?
if [ $AFTER_SORT_EXIT -ne 0 ]; then
  echo "SORT_ERROR: after scan file"
  cat "$AFTER_SORT_ERR_FILE"
  exit 2
fi

# Phase 2: 运行 comm，使用已排序的临时文件（输入文件不存在或不可读时 comm 会报错）
# REV-14 修正：两次 comm 使用独立错误文件，错误来源可区分
# comm -13：只在 AFTER 中出现的行 = 编译后新出现的孤儿目录
comm -13 "$BEFORE_SORTED_FILE" "$AFTER_SORTED_FILE" > "$NEW_ORPHAN_FILE" 2>"$COMM_NEW_ERR_FILE"
NEW_ORPHAN_EXIT=$?
if [ $NEW_ORPHAN_EXIT -ne 0 ]; then
  echo "COMM_ERROR: new orphan detection failed (exit=$NEW_ORPHAN_EXIT)"
  cat "$COMM_NEW_ERR_FILE"
  exit 2
fi

# comm -12：两者都出现的行 = 编译前存在且编译后仍存在的孤儿目录（未清理）
comm -12 "$BEFORE_SORTED_FILE" "$AFTER_SORTED_FILE" > "$UNCLEANED_ORPHAN_FILE" 2>"$COMM_UNCLEANED_ERR_FILE"
UNCLEANED_ORPHAN_EXIT=$?
if [ $UNCLEANED_ORPHAN_EXIT -ne 0 ]; then
  echo "COMM_ERROR: uncleaned orphan detection failed (exit=$UNCLEANED_ORPHAN_EXIT)"
  cat "$COMM_UNCLEANED_ERR_FILE"
  exit 2
fi
```

判定分类：
- `AFTER_SCAN_EXIT` 非 0 → `BLOCKED_ENV`（目录不存在或权限问题），记录 `$AFTER_SCAN_ERR_FILE` 内容
- `NEW_ORPHAN_EXIT` 非 0 → `BLOCKED_ENV`，记录 `$COMM_NEW_ERR_FILE`
- `UNCLEANED_ORPHAN_EXIT` 非 0 → `BLOCKED_ENV`，记录 `$COMM_UNCLEANED_ERR_FILE`
- `AFTER_SCAN_EXIT` = 0 且 Phase 0 = NOT_RUN → `REFERENCE_ONLY`（仅记录，不转换为 PASS 或 FAIL）
- `AFTER_SCAN_EXIT` = 0 且 `$NEW_ORPHAN_FILE` 非空 → `FAIL (ORPHAN_DIR_AFTER_COMPILE)`，记录新孤儿目录列表
- `AFTER_SCAN_EXIT` = 0 且 `$UNCLEANED_ORPHAN_FILE` 非空 → `FAIL (ORPHAN_DIR_NOT_CLEANED)`，记录未清理孤儿目录列表
- `AFTER_SCAN_EXIT` = 0 且两个差分文件均为空 → PASS

- 检查目标目录不是符号链接（Step 2 已验证目录存在；test 命令退出码只有 0=是符号链接、1=不是符号链接或路径不存在，由于目录已存在，非 0 即为不是符号链接；显式捕获并记录退出码）：
  ```bash
  test -L "<output-dir>"
  TEST_L_EXIT=$?
  echo "test -L exit code: $TEST_L_EXIT"
  if [ $TEST_L_EXIT -eq 0 ]; then
    echo "SYMLINK_DETECTED"
  fi
  ```
  输出 `SYMLINK_DETECTED` → `FAIL (OUTPUT_DIR_IS_SYMLINK)`
  `TEST_L_EXIT` = 1 → PASS（不是符号链接）
  `TEST_L_EXIT` 其他值 → `BLOCKED_ENV`（test 命令异常，理论上不应发生）

## Step 8: Manifest 双向验证

> 本步骤在 Step 7 PASS 后执行；若 Step 7 已 FAIL，本步骤可跳过并直接进入 Step 9。

### 8.1 每条 manifest 项都有对应文件（REV-14 修正：错误汇总文件）

```bash
# Phase 1: 读取 manifest 路径列表，捕获 jq 退出码
PATHS=$(jq -r '.files[].path' manifest.json 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "JQ_ERROR: failed to read manifest.files[].path"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# Phase 2: 初始化错误汇总文件（循环在子 shell 中执行，通过文件传递状态）
MANIFEST_MISSING_FILE=$(mktemp -t manifest-missing-XXXXXX)
> "$MANIFEST_MISSING_FILE"

# Phase 3: 逐项检查文件存在（区分不存在、不是普通文件、权限不可访问）
printf '%s\n' "$PATHS" | while read -r p; do
  # REV-15: 跳过 printf 输出的 shell 空行，真实空路径已在 Step 4.0 拦截
  [ -z "$p" ] && continue
  file_path="<output-dir>/$p"
  if [ ! -e "$file_path" ]; then
    echo "MISSING_FILE $p (path does not exist)" >> "$MANIFEST_MISSING_FILE"
  elif [ ! -f "$file_path" ]; then
    echo "FILE_NOT_REGULAR $p (not a regular file, may be directory/device)" >> "$MANIFEST_MISSING_FILE"
  elif [ ! -r "$file_path" ]; then
    echo "FILE_NOT_READABLE $p (permission denied)" >> "$MANIFEST_MISSING_FILE"
  fi
done

# Phase 4: 汇总错误
MANIFEST_MISSING_COUNT=$(wc -l < "$MANIFEST_MISSING_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count manifest missing entries (exit=$WC_EXIT)"
  exit 2
fi
if [ "$MANIFEST_MISSING_COUNT" -gt 0 ]; then
  echo "=== Manifest Missing Files ($MANIFEST_MISSING_COUNT) ==="
  cat "$MANIFEST_MISSING_FILE"
fi
# 错误文件不删除，纳入证据清单
```

判定分类：
- `JQ_ERROR`（jq 退出码非 0）→ `BLOCKED_ENV`，记录 `$JQ_ERR_FILE`
- `MANIFEST_MISSING_COUNT > 0` → `FAIL (MANIFEST_REFERENCES_MISSING_FILE)`，记录 `$MANIFEST_MISSING_FILE`（纳入证据清单）
- `MANIFEST_MISSING_COUNT == 0` → PASS

### 8.2 每个输出文件都在 manifest 中（REV-14 修正：grep 退出码捕获 + 错误文件持久化）

```bash
# Phase 1: 枚举输出文件，捕获 find 退出码（find 失败不得产生不完整枚举）
OUTPUT_FILES=$(find "<output-dir>" -type f ! -path "<output-dir>/manifest.json" -printf '%P\n' 2>"$FIND_ERR_FILE")
FIND_EXIT=$?
if [ $FIND_EXIT -ne 0 ]; then
  echo "FIND_ERROR: failed to enumerate output-dir files"
  cat "$FIND_ERR_FILE"
  exit 2
fi

# Phase 2: 初始化结果文件和错误文件（循环在子 shell 中执行，通过文件传递状态）
UNMANIFESTED_RESULT_FILE=$(mktemp -t unmanifested-results-XXXXXX)
> "$UNMANIFESTED_RESULT_FILE"
JQ_ERROR_FILE=$(mktemp -t jq-errors-8.2-XXXXXX)
> "$JQ_ERROR_FILE"

# Phase 3: 逐项检查是否在 manifest 中，区分 jq 错误（退出码>1）和未声明（退出码=1）
# 为每个 jq 调用使用独立的错误文件，避免循环中复用导致错误证据被覆盖
printf '%s\n' "$OUTPUT_FILES" | while read -r f; do
  [ -z "$f" ] && continue
  JQ_ERR_PER_ITEM=$(mktemp -t jq-err-XXXXXX)
  jq -e --arg path "$f" '.files[] | select(.path == $path)' manifest.json >/dev/null 2>"$JQ_ERR_PER_ITEM"
  jq_exit=$?
  if [ $jq_exit -eq 1 ]; then
    # jq -e 退出码 1 = 表达式为 false/null = 文件未在 manifest 中声明
    echo "UNMANIFESTED_FILE $f" >> "$UNMANIFESTED_RESULT_FILE"
    rm -f "$JQ_ERR_PER_ITEM"
  elif [ $jq_exit -ne 0 ]; then
    # 其他非 0 = jq 执行错误（解析失败、工具不可用等）
    echo "JQ_ERROR $f (exit=$jq_exit)" >> "$JQ_ERROR_FILE"
    cat "$JQ_ERR_PER_ITEM" >> "$JQ_ERROR_FILE"
    rm -f "$JQ_ERR_PER_ITEM"
  else
    rm -f "$JQ_ERR_PER_ITEM"
  fi
done

# Phase 4: 检查 jq 错误文件，独立捕获 grep 退出码
# 注意：不使用 grep -q，因为 -q 不输出内容且退出码 1=无匹配是正常的
JQ_ERROR_COUNT=$(grep -c '^JQ_ERROR ' "$JQ_ERROR_FILE")
GREP_JQ_EXIT=$?
if [ $GREP_JQ_EXIT -eq 1 ]; then JQ_ERROR_COUNT=0; fi
if [ $GREP_JQ_EXIT -gt 1 ]; then
  echo "GREP_ERROR: failed to count JQ_ERROR entries (exit=$GREP_JQ_EXIT)"
  exit 2
fi

if [ "$JQ_ERROR_COUNT" -gt 0 ]; then
  echo "JQ_ERRORS_DETECTED ($JQ_ERROR_COUNT)"
  cat "$JQ_ERROR_FILE"
  # 错误文件不删除，纳入证据清单
  exit 2
fi

# Phase 5: 汇总未声明文件
UNMANIFESTED_COUNT=$(wc -l < "$UNMANIFESTED_RESULT_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then
  echo "WC_ERROR: failed to count unmanifested files (exit=$WC_EXIT)"
  exit 2
fi
if [ "$UNMANIFESTED_COUNT" -gt 0 ]; then
  echo "=== Unmanifested Files ($UNMANIFESTED_COUNT) ==="
  cat "$UNMANIFESTED_RESULT_FILE"
fi
# 结果文件不删除，纳入证据清单
```

判定分类：
- `FIND_ERROR`（find 退出码非 0）→ `BLOCKED_ENV`，记录 `$FIND_ERR_FILE`
- `JQ_ERROR_COUNT > 0`（任一 jq 执行错误）→ `BLOCKED_ENV`，记录 `$JQ_ERROR_FILE`
- `UNMANIFESTED_COUNT > 0` → `FAIL (UNMANIFESTED_FILE)`，记录 `$UNMANIFESTED_RESULT_FILE`（纳入证据清单）
- `UNMANIFESTED_COUNT == 0` 且 `JQ_ERROR_COUNT == 0` → PASS

> 说明（第七次修正：排除层级明确为方案 A）：
> - `find ! -path "<output-dir>/manifest.json"` 仅排除 output directory 根目录下的 `manifest.json`
> - 其他层级的同名文件（如 `assets/manifest.json`、`evidence/manifest.json`）不排除，应被报告为未声明文件
> - `find -printf '%P'` 从 output-dir 根目录开始，输出 `assets/scene.webp`、`scene.json`、
>   `evidence/machine-provenance.json` 等相对路径，与 manifest.files[].path 格式直接匹配，
>   无需额外拼接 `assets/` 前缀。

## Step 9: 证据绑定（REVIEW-06 修正：日志重定向闭环）

### 9.1 编译日志归档与非空验证

编译命令必须在 Step 1 中通过重定向写入隔离日志文件：

```bash
# 在 Step 1 执行编译前创建隔离路径
LOG_STDOUT=$(mktemp -t compile-stdout-XXXXXX.log)
LOG_STDERR=$(mktemp -t compile-stderr-XXXXXX.log)

# 编译命令重定向（示例，实际命令替换为项目编译命令）
<compile-command> > "$LOG_STDOUT" 2> "$LOG_STDERR"
COMPILE_EXIT=$?
```

验证：
- `$LOG_STDOUT` 和 `$LOG_STDERR` 必须物理存在且路径已记录在证据清单中
- stdout 允许为空（编译可能无标准输出），但 stderr 在编译失败时必须非空
- 编译成功时，两个文件均必须存在（即使内容为空）
- 日志文件缺失 → `BLOCKED_ENV (EVIDENCE_LOG_MISSING)`

### 9.2 其他证据绑定（第七次修正：编译后状态保存 + 前后差分）

1. 确认日志中的测试数字与实际重跑结果一致
2. 确认 `commit-hash.txt` 与实际 HEAD 匹配（REV-11 修正：文件位置定义 + cat/git 失败闭环）：
   ```bash
   # commit-hash.txt 由编译器在输出目录根目录生成，记录编译时的 HEAD SHA
   COMMIT_HASH_FILE="<output-dir>/commit-hash.txt"

   # 检查文件存在
   if [ ! -f "$COMMIT_HASH_FILE" ]; then
     echo "COMMIT_HASH_FILE_MISSING"
     exit 2
   fi

   # 读取 commit-hash，捕获 cat 失败
   RECORDED_HASH=$(cat "$COMMIT_HASH_FILE" 2>"$CAT_ERR_FILE")
   CAT_EXIT=$?
   if [ $CAT_EXIT -ne 0 ]; then
     echo "CAT_ERROR: failed to read commit-hash.txt"
     cat "$CAT_ERR_FILE"
     exit 2
   fi

   # 获取当前 HEAD，捕获 git 失败
   CURRENT_HEAD=$(git rev-parse HEAD 2>"$GIT_ERR_FILE")
   GIT_EXIT=$?
   if [ $GIT_EXIT -ne 0 ]; then
     echo "GIT_ERROR: failed to get HEAD"
     cat "$GIT_ERR_FILE"
     exit 2
   fi

   # 比较
   if [ "$RECORDED_HASH" != "$CURRENT_HEAD" ]; then
     echo "COMMIT_HASH_MISMATCH: recorded=$RECORDED_HASH current=$CURRENT_HEAD"
     exit 1
   fi
   ```
   判定分类：
   - `COMMIT_HASH_FILE_MISSING` → `BLOCKED_ENV`
   - `CAT_ERROR` / `GIT_ERROR` → `BLOCKED_ENV`
   - 哈希不匹配 → `FAIL (COMMIT_HASH_MISMATCH)`，记录 recorded 和 current 值
   - 匹配 → PASS
3. 保存编译后工作树状态（REV-14 修正：捕获 git status 退出码 + porcelain 格式说明）：
   ```bash
   # 使用 --porcelain=v1 确保输出格式稳定，便于机器解析
   # --porcelain=v1 对包含特殊字符的路径会用双引号包裹并转义（如 "path with spaces" -> "\"path with spaces\""）
   # 重命名格式：R  OLD_PATH -> NEW_PATH
   # 路径解析时需处理：
   #   1. 双引号包裹的路径（含空格、特殊字符）
   #   2. 重命名的 "OLD -> NEW" 格式，取 NEW 路径
   #   3. 状态码 XY（前两字符），路径从第 4 字符开始
   # 如需精确处理含换行的路径，可改用 -z 选项（NUL 分隔），但本 Playbook 假设路径不含换行
   git status --porcelain=v1 > "$GIT_STATE_AFTER_FILE" 2>"$GIT_STATUS_ERR_FILE"
   GIT_STATUS_EXIT=$?
   if [ $GIT_STATUS_EXIT -ne 0 ]; then
     echo "GIT_STATUS_ERROR: failed to get post-compile git status (exit=$GIT_STATUS_EXIT)"
     cat "$GIT_STATUS_ERR_FILE"
     exit 2
   fi
   ```
4. 执行编译前后状态差分（REV-12 修正：sort 独立退出码 + 增量提取分类失败闭环）：
   ```bash
   # Phase 1: 分别排序到临时文件，独立检查 sort 退出码
   # （sort 位于进程替换中时，diff 退出码不一定反映 sort 失败，因此必须先独立排序）
   BEFORE_SORTED_GIT_FILE=$(mktemp -t git-before-sorted-XXXXXX)
   AFTER_SORTED_GIT_FILE=$(mktemp -t git-after-sorted-XXXXXX)

   sort "$GIT_STATE_BEFORE_FILE" > "$BEFORE_SORTED_GIT_FILE" 2>"$BEFORE_GIT_SORT_ERR_FILE"
   BEFORE_GIT_SORT_EXIT=$?
   if [ $BEFORE_GIT_SORT_EXIT -ne 0 ]; then
     echo "SORT_ERROR: failed to sort before git state file"
     cat "$BEFORE_GIT_SORT_ERR_FILE"
     rm -f "$BEFORE_SORTED_GIT_FILE" "$AFTER_SORTED_GIT_FILE"
     exit 2
   fi

   sort "$GIT_STATE_AFTER_FILE" > "$AFTER_SORTED_GIT_FILE" 2>"$AFTER_GIT_SORT_ERR_FILE"
   AFTER_GIT_SORT_EXIT=$?
   if [ $AFTER_GIT_SORT_EXIT -ne 0 ]; then
     echo "SORT_ERROR: failed to sort after git state file"
     cat "$AFTER_GIT_SORT_ERR_FILE"
     rm -f "$BEFORE_SORTED_GIT_FILE" "$AFTER_SORTED_GIT_FILE"
     exit 2
   fi

   # Phase 2: 执行 diff，捕获三态退出码（0=无差异，1=有差异，>1=执行失败）
   # 禁止使用 || true 抹平退出状态
   diff "$BEFORE_SORTED_GIT_FILE" "$AFTER_SORTED_GIT_FILE" > "$GIT_DIFF_FILE" 2>"$DIFF_ERR_FILE"
   DIFF_EXIT=$?
   rm -f "$BEFORE_SORTED_GIT_FILE" "$AFTER_SORTED_GIT_FILE"

   if [ $DIFF_EXIT -gt 1 ]; then
     echo "DIFF_ERROR: diff execution failed (exit=$DIFF_EXIT)"
     cat "$DIFF_ERR_FILE"
     exit 2
   fi
   # DIFF_EXIT=0 → NO_DELTA（编译未引入任何变更）
   # DIFF_EXIT=1 → 有差异，继续分类

   # Phase 3: 从 diff 输出提取 After 新增的变更行（即编译引入的增量）
   # diff 统一格式：> 行表示 After 中有但 Before 中没有的行
   # 注意：git status --short 输出中路径可能包含空格，但不会包含换行（git 会对换行进行转义）
   # REV-13 修正：grep 与 sed 拆开，分别捕获退出码（管道末端 $? 不代表 grep 状态）

   # Phase 3a: grep 提取，独立捕获退出码
   GREP_OUTPUT=$(grep '^> ' "$GIT_DIFF_FILE" 2>"$GREP_ERR_FILE")
   GREP_EXIT=$?
   # grep 退出码 0 = 有匹配；1 = 无匹配（正常，无增量）；>1 = 执行错误
   if [ $GREP_EXIT -gt 1 ]; then
     echo "DIFF_PARSE_ERROR: grep failed to extract incremental lines from diff (exit=$GREP_EXIT)"
     cat "$GREP_ERR_FILE"
     exit 2
   fi

   # Phase 3b: sed 处理，独立捕获退出码
   INCREMENTAL_LINES=$(printf '%s\n' "$GREP_OUTPUT" | sed 's/^> //')
   SED_EXIT=$?
   if [ $SED_EXIT -ne 0 ]; then
     echo "DIFF_PARSE_ERROR: sed failed to process grep output (exit=$SED_EXIT)"
     exit 2
   fi

   # Phase 4: 初始化分类结果文件和错误汇总文件
   # REV-13 修正：分类错误使用文件汇总，不依赖管道子 shell 变量传递
   # REV-17 修正：三个分类结果文件必须先通过 mktemp 分配路径再截断，禁止未初始化变量
   # REV-17 修正：OUTPUT_DIR_REL 必须显式声明，为 <output-dir> 相对于仓库根目录的路径
   #   用于 git status --short 差分分类中的路径匹配；若输出目录位于仓库外，设为空字符串
   OUTPUT_DIR_REL="<output-dir-repo-relative>"
   EXPECTED_DELTA_FILE=$(mktemp -t expected-delta-XXXXXX)
   UNEXPECTED_DELTA_FILE=$(mktemp -t unexpected-delta-XXXXXX)
   BLOCKED_DELTA_FILE=$(mktemp -t blocked-delta-XXXXXX)
   > "$EXPECTED_DELTA_FILE"
   > "$UNEXPECTED_DELTA_FILE"
   > "$BLOCKED_DELTA_FILE"
   CLASSIFICATION_ERROR_FILE=$(mktemp -t classification-error-XXXXXX)
   > "$CLASSIFICATION_ERROR_FILE"

   # Phase 5: 逐项分类（解析 git status --short porcelain 格式）
   # 格式：XY PATH 或 XY OLD_PATH -> NEW_PATH（重命名）
   # X=索引状态(M=modified,A=added,D=deleted,R=renamed,C=copied,?=untracked)
   # Y=工作树状态
   # 注意：路径可能包含空格，使用 cut -c1-2 提取状态码，cut -c4- 提取路径部分
   printf '%s\n' "$INCREMENTAL_LINES" | while read -r line; do
     [ -z "$line" ] && continue

     # 提取状态码（前两字符）和路径部分
     status_code=$(printf '%s' "$line" | cut -c1-2)
     path_part=$(printf '%s' "$line" | cut -c4-)

     # 验证状态码格式（必须是两个字符）
     if [ ${#status_code} -ne 2 ]; then
       echo "DELTA_CLASSIFICATION_ERROR: invalid status code format (len=${#status_code}): $line" >> "$CLASSIFICATION_ERROR_FILE"
       continue
     fi

     # 处理重命名：R  OLD -> NEW，取 NEW 路径
     case "$status_code" in
       R*|C*)
         # 重命名格式：R  OLD_PATH -> NEW_PATH
         # 使用 sed 提取 -> 之后的部分
         path=$(printf '%s' "$path_part" | sed 's/.* -> //')
         ;;
       *)
         path="$path_part"
         ;;
     esac

     # 验证路径非空
     if [ -z "$path" ]; then
       echo "DELTA_CLASSIFICATION_ERROR: empty path after parsing: $line" >> "$CLASSIFICATION_ERROR_FILE"
       continue
     fi

     # 分类 1: 排除范围 → EXPECTED_DELTA
     case "$path" in
       playbooks/*|.trellis/*|node_modules/*)
         echo "$line" >> "$EXPECTED_DELTA_FILE" || echo "EVIDENCE_WRITE_ERROR: EXPECTED_DELTA_FILE" >> "$CLASSIFICATION_ERROR_FILE"
         continue
         ;;
     esac

     # 分类 2: 预期变更白名单 → EXPECTED_DELTA
     # 白名单包括：编译产物（$OUTPUT_DIR_REL 下，已在 Phase 4 声明）、证据日志（$LOG_STDOUT/$LOG_STDERR）、测试临时文件
     # OUTPUT_DIR_REL 为 <output-dir> 相对于仓库根目录的路径，执行前必须替换占位符
     # 使用变量展开匹配实际路径，而非仅依赖通配符模式
     case "$path" in
       "$OUTPUT_DIR_REL"/*|"$LOG_STDOUT"|"$LOG_STDERR"|dist/*|*.log|*.tmp|*.temp)
         echo "$line" >> "$EXPECTED_DELTA_FILE" || echo "EVIDENCE_WRITE_ERROR: EXPECTED_DELTA_FILE" >> "$CLASSIFICATION_ERROR_FILE"
         continue
         ;;
     esac

     # 分类 3: 编译目标范围且不在白名单 → UNEXPECTED_DELTA
     case "$path" in
       chinese-aesthetic/*|tests/chinese-aesthetic/*|scripts/*)
         echo "$line" >> "$UNEXPECTED_DELTA_FILE" || echo "EVIDENCE_WRITE_ERROR: UNEXPECTED_DELTA_FILE" >> "$CLASSIFICATION_ERROR_FILE"
         continue
         ;;
     esac

     # 分类 4: 编译目标范围外且不在排除范围内 → BLOCKED_DELTA（需人工判定）
     echo "$line" >> "$BLOCKED_DELTA_FILE" || echo "EVIDENCE_WRITE_ERROR: BLOCKED_DELTA_FILE" >> "$CLASSIFICATION_ERROR_FILE"
   done

   # Phase 6: 检查分类错误汇总文件（循环在子 shell 中执行，通过文件传递状态）
   # REV-15: CLASSIFICATION_ERROR_FILE 不删除，纳入最终证据清单
   if [ -s "$CLASSIFICATION_ERROR_FILE" ]; then
     echo "DELTA_CLASSIFICATION_ERROR: errors occurred during delta classification"
     cat "$CLASSIFICATION_ERROR_FILE"
     echo "CLASSIFICATION_ERROR_FILE=$CLASSIFICATION_ERROR_FILE"
     exit 2
   fi
   echo "CLASSIFICATION_ERROR_FILE=$CLASSIFICATION_ERROR_FILE (empty)"
   ```
5. 差分分类结果判定：
   - `DIFF_ERROR`（diff 退出码 >1）→ `BLOCKED_ENV`
   - `$BLOCKED_DELTA_FILE` 非空 → `BLOCKED_ENV`（编译目标范围外的未预期变更需人工判定），记录变更列表
   - `$UNEXPECTED_DELTA_FILE` 非空 → `FAIL (WORKTREE_NOT_CLEAN)`（编译引入了编译目标范围内且不在白名单内的未预期增量变更），记录变更列表
   - `$UNEXPECTED_DELTA_FILE` 为空且 `$BLOCKED_DELTA_FILE` 为空 → `NO_NEW_UNEXPECTED_DELTA` → PASS（可能有 `EXPECTED_DELTA`，也可能无任何增量）
   - `$EXPECTED_DELTA_FILE` 非空 → 记录为 `EXPECTED_DELTA`，不导致 FAIL
6. 基线-增量语义澄清：
   - 编译前基线（`$GIT_STATE_BEFORE_FILE`）可能为 Dirty，只需记录，不导致 FAIL
   - 编译后状态（`$GIT_STATE_AFTER_FILE`）可能为 Dirty，只要 Dirty 的增量全部在白名单或排除范围内
   - 只有编译引入了编译目标范围内且不在白名单内的未预期增量变更，才判定 FAIL
   - 错误码 `WORKTREE_NOT_CLEAN` 语义为"编译引入了未预期变更"，而非"工作树不 Clean"
7. 证据缺失或不一致 → `BLOCKED_ENV`，不得标记 PASS

## 决策点

- 任何 Step 标记 `FAIL` → 停止后续步骤，输出 FAIL 报告（含具体错误码）
- 证据缺失但代码可能正确 → 标记 `BLOCKED_ENV`，不标记 PASS
- 编译未执行 → 标记 `NOT_RUN`
- 全部 Step 通过且证据完整 → 标记 `PASS`
- **绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS**
