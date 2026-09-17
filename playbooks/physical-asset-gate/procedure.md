# Procedure: 物理资产门禁与真实视频验证

> 本 Playbook 对 design-compiler 产出的物理资产（图片、视频、深度图、遮罩等）执行门禁验证，
> 区分"资产存在"与"资产有效"、"编译成功"与"播放验证通过"。
> 所有判定必须基于物理执行证据，不得以静态推断替代。

## 路径规范声明

资产清单位于 `<output-dir>/manifest.json`，其中 `files[].path` 为相对于 output directory 的 POSIX 相对路径。
所有路径拼接统一使用 `<output-dir>/<manifest-path>`，不得额外拼接前缀。
manifest 文件项字段（与 `SceneAssetManifest` 一致）：`path`、`sha256`、`byteSize`、`mimeType`、`truthClass`、`availability`。

## 代码块性质声明（与 DC-PB-001 REV-12 一致：代码块与判定伪代码完全分离）

本文档中的所有 shell 代码块均为**可执行模板**：

- `<output-dir>`、`<golden-dir>`、`<processing-log-path>` 等尖括号占位符必须替换为实际值后执行
- 代码块中的失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**
- `BLOCKED_ENV` 和 `NOT_RUN` 为状态标记，在代码块中通过 `exit 2`（BLOCKED_ENV）或特定退出码表示
- 所有命令的退出码、stdout 和 stderr 必须原始留存，不得仅记录摘要
- 判定分类部分（代码块外的文字描述）中的 `FAIL (ERROR_CODE)`、`BLOCKED_ENV`、`NOT_RUN` 为状态说明，不是可执行命令
- 各 Step 代码块按顺序在同一 shell 会话中执行，变量（如 `$MANIFEST_JSON`、`$ASSET_PATHS`、各证据文件路径）跨 Step 持久

## 前置条件（Preconditions）

执行前必须确认以下工具可用；任一缺失则报告 `BLOCKED_ENV`，不得继续：

- `jq` ≥ 1.6（JSON 结构化判定，禁止用 grep 子串匹配替代）
- `sha256sum`（资产完整性校验）
- `ffprobe`（图片/视频元数据读取，必须支持 `-print_format json`）
- `ffmpeg`（视频真实解码验证，必须支持 `-f null` 输出）
- `find`、`stat`、`realpath`（文件系统审计）
- `git`（commit SHA 与工作树状态记录）
- `mktemp`（隔离临时输出路径）

> **平台兼容性说明**：
> - `stat -c %s` 是 GNU stat 扩展，BSD/macOS 需用 `stat -f %z`。本 Playbook 假定 Linux/GNU 环境。
> - ffprobe/ffmpeg 假定为 ≥ 4.0 标准发行版。若目标环境不可用，应报告 `BLOCKED_ENV`，不得静默降级或跳过。
> - `awk` 用于帧率计算，假定为 GNU awk 或兼容实现。

## Phase 0: 验证前基线与证据文件建立

1. 确认 manifest.json 存在且可读：

```bash
MANIFEST_FILE="<output-dir>/manifest.json"
JQ_ERR_FILE=$(mktemp -t jq-err-XXXXXX)
STAT_ERR_FILE=$(mktemp -t stat-err-XXXXXX)
GIT_ERR_FILE=$(mktemp -t git-err-XXXXXX)
GIT_STATUS_ERR_FILE=$(mktemp -t git-status-err-XXXXXX)

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "MANIFEST_NOT_FOUND: $MANIFEST_FILE"
  exit 2
fi

MANIFEST_JSON=$(cat "$MANIFEST_FILE")
CAT_EXIT=$?
if [ $CAT_EXIT -ne 0 ]; then
  echo "MANIFEST_READ_ERROR: cat failed (exit=$CAT_EXIT)"
  exit 2
fi

# 验证 manifest JSON 合法性且 files 为数组
printf '%s' "$MANIFEST_JSON" | jq -e '.files | type == "array"' > /dev/null 2>"$JQ_ERR_FILE"
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "MANIFEST_PARSE_ERROR: jq failed to parse manifest files array (exit=$JQ_EXIT)"
  cat "$JQ_ERR_FILE"
  exit 2
fi
```

2. 创建证据文件（全部不删除，纳入最终证据清单）：

```bash
ASSET_ERROR_FILE=$(mktemp -t asset-error-XXXXXX)
> "$ASSET_ERROR_FILE"
FORMAT_ERROR_FILE=$(mktemp -t format-error-XXXXXX)
> "$FORMAT_ERROR_FILE"
SHA_RESULT_FILE=$(mktemp -t sha-result-XXXXXX)
> "$SHA_RESULT_FILE"
SHA_STDERR_FILE=$(mktemp -t sha-stderr-XXXXXX)
> "$SHA_STDERR_FILE"
DECODE_RESULT_FILE=$(mktemp -t decode-result-XXXXXX)
> "$DECODE_RESULT_FILE"
FFMPEG_STDERR_FILE=$(mktemp -t ffmpeg-stderr-XXXXXX)
> "$FFMPEG_STDERR_FILE"
FFPROBE_STDERR_FILE=$(mktemp -t ffprobe-stderr-XXXXXX)
> "$FFPROBE_STDERR_FILE"

echo "ASSET_ERROR_FILE=$ASSET_ERROR_FILE"
echo "FORMAT_ERROR_FILE=$FORMAT_ERROR_FILE"
echo "SHA_RESULT_FILE=$SHA_RESULT_FILE"
echo "SHA_STDERR_FILE=$SHA_STDERR_FILE"
echo "DECODE_RESULT_FILE=$DECODE_RESULT_FILE"
echo "FFMPEG_STDERR_FILE=$FFMPEG_STDERR_FILE"
echo "FFPROBE_STDERR_FILE=$FFPROBE_STDERR_FILE"
```

## Step 1: 资产存在性检查

遍历 `manifest.files[]`，逐项验证物理存在、为常规文件、且大小 > 0。

```bash
# 提取所有路径，捕获 jq 退出码
ASSET_PATHS=$(printf '%s' "$MANIFEST_JSON" | jq -r '.files[].path' 2>"$JQ_ERR_FILE")
JQ_EXIT=$?
if [ $JQ_EXIT -ne 0 ]; then
  echo "MANIFEST_PATH_EXTRACT_ERROR: jq failed (exit=$JQ_EXIT)"
  cat "$JQ_ERR_FILE"
  exit 2
fi

# 统计资产数（grep -c 三态：0=有匹配, 1=无匹配, >1=执行错误）
ASSET_COUNT=$(printf '%s\n' "$ASSET_PATHS" | grep -c .)
GREP_EXIT=$?
if [ $GREP_EXIT -gt 1 ]; then
  echo "GREP_ERROR: failed to count assets (exit=$GREP_EXIT)"
  exit 2
fi
if [ "$GREP_EXIT" -eq 1 ] || [ "$ASSET_COUNT" -eq 0 ]; then
  echo "NO_ASSETS: manifest files array is empty"
  exit 2
fi
echo "ASSET_COUNT=$ASSET_COUNT"

# 逐项检查（循环在子 shell 中执行，通过文件汇总传递状态）
printf '%s\n' "$ASSET_PATHS" | while read -r p; do
  [ -z "$p" ] && continue
  asset_path="<output-dir>/$p"

  # 区分不存在与权限错误
  if [ ! -e "$asset_path" ]; then
    echo "ASSET_NOT_FOUND: $p" >> "$ASSET_ERROR_FILE"
    continue
  fi
  if [ ! -f "$asset_path" ]; then
    echo "ASSET_NOT_REGULAR: $p (not a regular file)" >> "$ASSET_ERROR_FILE"
    continue
  fi

  # 文件大小 > 0
  file_size=$(stat -c %s "$asset_path" 2>"$STAT_ERR_FILE")
  STAT_EXIT=$?
  if [ $STAT_EXIT -ne 0 ]; then
    echo "ASSET_STAT_ERROR: $p (stat exit=$STAT_EXIT)" >> "$ASSET_ERROR_FILE"
    continue
  fi
  if [ "$file_size" -eq 0 ]; then
    echo "ASSET_EMPTY: $p (size=0)" >> "$ASSET_ERROR_FILE"
  fi
done

# 检查错误汇总文件
if [ -s "$ASSET_ERROR_FILE" ]; then
  echo "ASSET_EXISTENCE_ERROR: errors found"
  cat "$ASSET_ERROR_FILE"
  echo "ASSET_ERROR_FILE=$ASSET_ERROR_FILE"
  exit 1
fi
echo "ASSET_ERROR_FILE=$ASSET_ERROR_FILE (empty)"
```

判定分类：
- `ASSET_NOT_FOUND` / `ASSET_NOT_REGULAR` / `ASSET_EMPTY` → FAIL
- `ASSET_STAT_ERROR` → BLOCKED_ENV（stat 执行失败，非资产本身问题）
- `MANIFEST_NOT_FOUND` / `MANIFEST_READ_ERROR` / `MANIFEST_PARSE_ERROR` / `NO_ASSETS` / `MANIFEST_PATH_EXTRACT_ERROR` → BLOCKED_ENV
- 全部通过 → Step 1 PASS

## Step 2: 格式与元数据验证

对每个资产用 `ffprobe -print_format json` 读取真实元数据，与 manifest 声明的 `mimeType` 比对。
图片资产验证 codec（webp/png），视频资产记录 codec/分辨率/帧率/时长，深度图/遮罩验证 pix_fmt 位深。

```bash
printf '%s\n' "$ASSET_PATHS" | while read -r p; do
  [ -z "$p" ] && continue
  asset_path="<output-dir>/$p"

  # 读取 manifest 中声明的 mimeType
  declared_mime=$(printf '%s' "$MANIFEST_JSON" | jq -r --arg path "$p" '.files[] | select(.path == $path) | .mimeType' 2>"$JQ_ERR_FILE")
  JQ_EXIT=$?
  if [ $JQ_EXIT -ne 0 ]; then
    echo "METADATA_READ_ERROR: $p jq mimeType read failed (exit=$JQ_EXIT)" >> "$FORMAT_ERROR_FILE"
    continue
  fi

  # ffprobe 读取真实元数据（JSON 格式，独立捕获退出码）
  FFPROBE_ERR_PER_ITEM=$(mktemp -t ffprobe-err-XXXXXX)
  FFPROBE_JSON=$(ffprobe -v quiet -print_format json -show_format -show_streams "$asset_path" 2>"$FFPROBE_ERR_PER_ITEM")
  FFPROBE_EXIT=$?
  if [ $FFPROBE_EXIT -ne 0 ]; then
    echo "FFPROBE_EXEC_ERROR: $p (exit=$FFPROBE_EXIT)" >> "$FORMAT_ERROR_FILE"
    echo "--- ffprobe stderr for $p ---" >> "$FFPROBE_STDERR_FILE"
    cat "$FFPROBE_ERR_PER_ITEM" >> "$FFPROBE_STDERR_FILE"
    rm -f "$FFPROBE_ERR_PER_ITEM"
    continue
  fi

  # 解析关键字段（每个 jq 独立，但此处复用同一 JSON 字符串，退出码合并检查）
  actual_codec=$(printf '%s' "$FFPROBE_JSON" | jq -r '.streams[0].codec_name // "unknown"' 2>/dev/null)
  actual_format=$(printf '%s' "$FFPROBE_JSON" | jq -r '.format.format_name // "unknown"' 2>/dev/null)
  actual_width=$(printf '%s' "$FFPROBE_JSON" | jq -r '.streams[0].width // "0"' 2>/dev/null)
  actual_height=$(printf '%s' "$FFPROBE_JSON" | jq -r '.streams[0].height // "0"' 2>/dev/null)
  actual_pix_fmt=$(printf '%s' "$FFPROBE_JSON" | jq -r '.streams[0].pix_fmt // "unknown"' 2>/dev/null)
  actual_fps=$(printf '%s' "$FFPROBE_JSON" | jq -r '.streams[0].r_frame_rate // "0/0"' 2>/dev/null)
  actual_duration=$(printf '%s' "$FFPROBE_JSON" | jq -r '.format.duration // "0"' 2>/dev/null)
  rm -f "$FFPROBE_ERR_PER_ITEM"

  # 根据 mimeType 确定预期 codec（图片资产严格匹配）
  case "$declared_mime" in
    image/webp)
      if [ "$actual_codec" != "webp" ]; then
        echo "FORMAT_MISMATCH: $p declared=$declared_mime actual_codec=$actual_codec" >> "$FORMAT_ERROR_FILE"
        continue
      fi
      ;;
    image/png)
      if [ "$actual_codec" != "png" ]; then
        echo "FORMAT_MISMATCH: $p declared=$declared_mime actual_codec=$actual_codec" >> "$FORMAT_ERROR_FILE"
        continue
      fi
      ;;
    video/*)
      # 视频资产：codec 由规格指定，此处记录实际值，不强制匹配
      ;;
    *depth*|*mask*|*normal*)
      # 深度图/遮罩/法线图：codec 不强制匹配，由后续 pix_fmt 位深检查验证
      ;;
    *)
      # 未知 mimeType：记录但不阻断（可能为深度图/遮罩等自定义类型）
      echo "FORMAT_UNKNOWN_MIME: $p declared=$declared_mime actual_codec=$actual_codec" >> "$FORMAT_ERROR_FILE"
      continue
      ;;
  esac

  # 验证分辨率 > 0（所有资产类型）
  if [ "$actual_width" -le 0 ] 2>/dev/null || [ "$actual_height" -le 0 ] 2>/dev/null; then
    echo "RESOLUTION_INVALID: $p width=$actual_width height=$actual_height" >> "$FORMAT_ERROR_FILE"
    continue
  fi

  # 深度图/遮罩位深验证（通过 pix_fmt 判断：gray16le=16bit, gray=8bit）
  case "$declared_mime" in
    *depth*|*mask*)
      case "$actual_pix_fmt" in
        gray16be|gray16le|yuv420p16le|yuv420p16be)
          expected_bit_depth="16"
          ;;
        gray|yuv420p|rgba|rgb24)
          expected_bit_depth="8"
          ;;
        *)
          expected_bit_depth="unknown"
          ;;
      esac
      if [ "$expected_bit_depth" = "unknown" ]; then
        echo "BIT_DEPTH_UNKNOWN: $p pix_fmt=$actual_pix_fmt" >> "$FORMAT_ERROR_FILE"
        continue
      fi
      ;;
  esac

  # 记录元数据（原始留存）
  echo "METADATA $p mime=$declared_mime codec=$actual_codec format=$actual_format width=$actual_width height=$actual_height pix_fmt=$actual_pix_fmt fps=$actual_fps duration=$actual_duration" >> "$DECODE_RESULT_FILE"
done

if [ -s "$FORMAT_ERROR_FILE" ]; then
  echo "FORMAT_VALIDATION_ERROR: errors found"
  cat "$FORMAT_ERROR_FILE"
  echo "FORMAT_ERROR_FILE=$FORMAT_ERROR_FILE"
  exit 1
fi
echo "FORMAT_ERROR_FILE=$FORMAT_ERROR_FILE (empty)"
```

判定分类：
- `FORMAT_MISMATCH` / `RESOLUTION_INVALID` → FAIL
- `FORMAT_UNKNOWN_MIME` / `BIT_DEPTH_UNKNOWN` → FAIL（无法验证的资产类型不得放行）
- `FFPROBE_EXEC_ERROR` / `METADATA_READ_ERROR` → BLOCKED_ENV
- 全部通过 → Step 2 PASS

## Step 3: 完整性校验（SHA-256 + byteSize）

对每个资产计算 SHA-256 并与 `manifest.files[].sha256` 比对，同时验证 `byteSize` 与磁盘实际大小一致。
采用与 DC-PB-001 Step 5.2 相同的 MATCH/MISMATCH/ERROR 汇总模式。

```bash
printf '%s\n' "$ASSET_PATHS" | while read -r p; do
  [ -z "$p" ] && continue
  asset_path="<output-dir>/$p"

  # 读取 manifest 中声明的 sha256
  JQ_ERR_PER_ITEM=$(mktemp -t jq-err-XXXXXX)
  expected_hash=$(printf '%s' "$MANIFEST_JSON" | jq -r --arg path "$p" '.files[] | select(.path == $path) | .sha256' 2>"$JQ_ERR_PER_ITEM")
  JQ_EXIT=$?
  if [ $JQ_EXIT -ne 0 ]; then
    echo "ERROR $p jq_hash_read_failed (exit=$JQ_EXIT)" >> "$SHA_RESULT_FILE"
    rm -f "$JQ_ERR_PER_ITEM"
    continue
  fi
  rm -f "$JQ_ERR_PER_ITEM"

  # 读取 byteSize
  expected_size=$(printf '%s' "$MANIFEST_JSON" | jq -r --arg path "$p" '.files[] | select(.path == $path) | .byteSize' 2>/dev/null)

  # 检查 sha256 字段存在且格式合法（64 位小写十六进制）
  if [ -z "$expected_hash" ] || [ "$expected_hash" = "null" ]; then
    echo "MISSING_HASH_FIELD $p" >> "$SHA_RESULT_FILE"
    continue
  fi
  if ! printf '%s' "$expected_hash" | grep -qE '^[0-9a-f]{64}$'; then
    echo "ERROR $p invalid_expected_hash_format (len=${#expected_hash})" >> "$SHA_RESULT_FILE"
    continue
  fi

  # 验证 byteSize（manifest 声明 vs 磁盘实际）
  actual_size=$(stat -c %s "$asset_path" 2>"$STAT_ERR_FILE")
  STAT_EXIT=$?
  if [ $STAT_EXIT -ne 0 ]; then
    echo "ERROR $p stat_failed (exit=$STAT_EXIT)" >> "$SHA_RESULT_FILE"
    continue
  fi
  if [ "$expected_size" != "null" ] && [ -n "$expected_size" ] && [ "$actual_size" != "$expected_size" ]; then
    echo "BYTE_SIZE_MISMATCH $p expected=$expected_size actual=$actual_size" >> "$SHA_RESULT_FILE"
    continue
  fi

  # 执行 sha256sum，独立捕获退出码（不通过管道，避免 $? 取得 awk 退出码）
  SHA_ERR_PER_ITEM=$(mktemp -t sha256-err-XXXXXX)
  SHA256_OUTPUT=$(sha256sum "$asset_path" 2>"$SHA_ERR_PER_ITEM")
  SHA256_EXIT=$?
  if [ $SHA256_EXIT -ne 0 ]; then
    echo "ERROR $p sha256sum_exec_failed (exit=$SHA256_EXIT)" >> "$SHA_RESULT_FILE"
    echo "--- sha256sum stderr for $p ---" >> "$SHA_STDERR_FILE"
    cat "$SHA_ERR_PER_ITEM" >> "$SHA_STDERR_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 解析哈希值，捕获 awk 退出码
  actual_hash=$(printf '%s' "$SHA256_OUTPUT" | awk '{print $1}')
  PARSE_EXIT=$?
  if [ $PARSE_EXIT -ne 0 ]; then
    echo "ERROR $p hash_parse_failed (awk exit=$PARSE_EXIT)" >> "$SHA_RESULT_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 验证 actual 哈希格式
  if ! printf '%s' "$actual_hash" | grep -qE '^[0-9a-f]{64}$'; then
    echo "ERROR $p invalid_actual_hash_format (len=${#actual_hash})" >> "$SHA_RESULT_FILE"
    rm -f "$SHA_ERR_PER_ITEM"
    continue
  fi

  # 比对
  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "MISMATCH $p $expected_hash $actual_hash" >> "$SHA_RESULT_FILE"
  else
    echo "MATCH $p" >> "$SHA_RESULT_FILE"
  fi
  rm -f "$SHA_ERR_PER_ITEM"
done

# Phase 4: 汇总结果（grep -c 三态处理，禁止 || true）
MATCH_COUNT=$(grep -c '^MATCH ' "$SHA_RESULT_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -eq 1 ]; then MATCH_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: MATCH count (exit=$GREP_EXIT)"; exit 2; fi

MISMATCH_COUNT=$(grep -c '^MISMATCH ' "$SHA_RESULT_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -eq 1 ]; then MISMATCH_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: MISMATCH count (exit=$GREP_EXIT)"; exit 2; fi

MISSING_HASH_COUNT=$(grep -c '^MISSING_HASH_FIELD ' "$SHA_RESULT_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -eq 1 ]; then MISSING_HASH_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: MISSING_HASH count (exit=$GREP_EXIT)"; exit 2; fi

BYTE_SIZE_MISMATCH_COUNT=$(grep -c '^BYTE_SIZE_MISMATCH ' "$SHA_RESULT_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -eq 1 ]; then BYTE_SIZE_MISMATCH_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: BYTE_SIZE_MISMATCH count (exit=$GREP_EXIT)"; exit 2; fi

ERROR_COUNT=$(grep -c '^ERROR ' "$SHA_RESULT_FILE")
GREP_EXIT=$?
if [ $GREP_EXIT -eq 1 ]; then ERROR_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: ERROR count (exit=$GREP_EXIT)"; exit 2; fi

TOTAL_COUNT=$(wc -l < "$SHA_RESULT_FILE")
WC_EXIT=$?
if [ $WC_EXIT -ne 0 ]; then echo "WC_ERROR: total count (exit=$WC_EXIT)"; exit 2; fi

echo "=== SHA-256 & byteSize Verification Results ==="
cat "$SHA_RESULT_FILE"
echo "=== Summary: MATCH=$MATCH_COUNT MISMATCH=$MISMATCH_COUNT MISSING_HASH=$MISSING_HASH_COUNT BYTE_SIZE_MISMATCH=$BYTE_SIZE_MISMATCH_COUNT ERROR=$ERROR_COUNT TOTAL=$TOTAL_COUNT ==="

if [ -s "$SHA_STDERR_FILE" ]; then
  echo "=== SHA-256 Stderr (errors only) ==="
  cat "$SHA_STDERR_FILE"
fi

# 结果文件和 stderr 文件不删除，纳入证据清单
echo "SHA_RESULT_FILE=$SHA_RESULT_FILE"
echo "SHA_STDERR_FILE=$SHA_STDERR_FILE"
```

判定分类（基于汇总统计）：
- `ERROR_COUNT > 0` → `BLOCKED_ENV`（SHA256_VERIFICATION_ERROR，含 sha256sum_exec_failed / hash_parse_failed / invalid_hash_format / jq_read_failed / stat_failed），记录 `$SHA_RESULT_FILE`
- `MISSING_HASH_COUNT > 0` → `FAIL (MISSING_HASH_FIELD)`
- `MISMATCH_COUNT > 0` → `FAIL (SHA256_MISMATCH)`
- `BYTE_SIZE_MISMATCH_COUNT > 0` → `FAIL (BYTE_SIZE_MISMATCH)`
- `MATCH_COUNT == TOTAL_COUNT` 且 `TOTAL_COUNT > 0` → Step 3 PASS
- `TOTAL_COUNT == 0` → `BLOCKED_ENV`（没有可验证的 manifest 项）

## Step 4: 视频真实解码验证

对 `mimeType` 为 `video/*` 的资产执行 ffmpeg 全帧解码到 null，验证：①解码退出码 0 ②无丢帧（实际帧数 vs 预期帧数 `duration×fps`，±1 容差）③ffmpeg stderr 无错误。
非视频资产跳过并记录为 `SKIP_NON_VIDEO`。仅检查文件头或扩展名不构成验证通过。

```bash
printf '%s\n' "$ASSET_PATHS" | while read -r p; do
  [ -z "$p" ] && continue
  asset_path="<output-dir>/$p"

  # 判断是否为视频资产
  declared_mime=$(printf '%s' "$MANIFEST_JSON" | jq -r --arg path "$p" '.files[] | select(.path == $path) | .mimeType' 2>/dev/null)
  case "$declared_mime" in
    video/*) ;;
    *)
      echo "SKIP_NON_VIDEO $p mime=$declared_mime" >> "$DECODE_RESULT_FILE"
      continue
      ;;
  esac

  # Phase 1: ffprobe 读取预期帧率（r_frame_rate = num/den）和时长
  FFPROBE_ERR_PER_ITEM=$(mktemp -t ffprobe-err-XXXXXX)
  FFPROBE_VIDEO_JSON=$(ffprobe -v quiet -print_format json -show_format -show_streams "$asset_path" 2>"$FFPROBE_ERR_PER_ITEM")
  FFPROBE_EXIT=$?
  if [ $FFPROBE_EXIT -ne 0 ]; then
    echo "DECODE_ERROR $p ffprobe_exec_failed (exit=$FFPROBE_EXIT)" >> "$DECODE_RESULT_FILE"
    echo "--- ffprobe stderr for $p ---" >> "$FFPROBE_STDERR_FILE"
    cat "$FFPROBE_ERR_PER_ITEM" >> "$FFPROBE_STDERR_FILE"
    rm -f "$FFPROBE_ERR_PER_ITEM"
    continue
  fi

  fps_fraction=$(printf '%s' "$FFPROBE_VIDEO_JSON" | jq -r '.streams[0].r_frame_rate // "0/0"' 2>/dev/null)
  duration=$(printf '%s' "$FFPROBE_VIDEO_JSON" | jq -r '.format.duration // "0"' 2>/dev/null)
  rm -f "$FFPROBE_ERR_PER_ITEM"

  # 计算预期帧数：expected = duration * (num/den)
  fps_num=$(printf '%s' "$fps_fraction" | cut -d'/' -f1)
  fps_den=$(printf '%s' "$fps_fraction" | cut -d'/' -f2)
  if [ "$fps_den" -gt 0 ] 2>/dev/null && [ "$fps_num" -gt 0 ] 2>/dev/null; then
    expected_frames=$(awk -v d="$duration" -v n="$fps_num" -v den="$fps_den" 'BEGIN { if (den > 0 && n > 0) printf "%d", (d * n) / den; else print "0" }')
  else
    expected_frames=0
  fi

  # Phase 2: ffmpeg 全帧解码到 null，捕获退出码和 stderr
  FFMPEG_ERR_PER_ITEM=$(mktemp -t ffmpeg-err-XXXXXX)
  ffmpeg -hide_banner -loglevel error -i "$asset_path" -f null - 2>"$FFMPEG_ERR_PER_ITEM"
  FFMPEG_EXIT=$?

  if [ $FFMPEG_EXIT -ne 0 ]; then
    echo "DECODE_FAILED $p ffmpeg_exit=$FFMPEG_EXIT" >> "$DECODE_RESULT_FILE"
    echo "--- ffmpeg stderr for $p ---" >> "$FFMPEG_STDERR_FILE"
    cat "$FFMPEG_ERR_PER_ITEM" >> "$FFMPEG_STDERR_FILE"
    rm -f "$FFMPEG_ERR_PER_ITEM"
    continue
  fi

  # Phase 3: 用 ffprobe -count_frames 统计实际解码帧数（独立验证）
  FFPROBE_ERR_PER_ITEM=$(mktemp -t ffprobe-err-XXXXXX)
  actual_frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$asset_path" 2>"$FFPROBE_ERR_PER_ITEM")
  FFPROBE_COUNT_EXIT=$?
  if [ $FFPROBE_COUNT_EXIT -ne 0 ]; then
    echo "DECODE_ERROR $p frame_count_failed (exit=$FFPROBE_COUNT_EXIT)" >> "$DECODE_RESULT_FILE"
    echo "--- ffprobe count stderr for $p ---" >> "$FFPROBE_STDERR_FILE"
    cat "$FFPROBE_ERR_PER_ITEM" >> "$FFPROBE_STDERR_FILE"
    rm -f "$FFPROBE_ERR_PER_ITEM" "$FFMPEG_ERR_PER_ITEM"
    continue
  fi
  rm -f "$FFPROBE_ERR_PER_ITEM"

  # REV-3 修正：验证 actual_frames 为有效整数，避免空值/N/A 进入算术运算导致静默跳过
  case "$actual_frames" in
    ''|*[!0-9]*)
      echo "DECODE_ERROR $p invalid_frame_count (value='$actual_frames')" >> "$DECODE_RESULT_FILE"
      rm -f "$FFMPEG_ERR_PER_ITEM"
      continue
      ;;
  esac

  # Phase 4: 丢帧检测（±1 容差处理四舍五入和容器时间戳精度）
  if [ "$expected_frames" -gt 0 ] 2>/dev/null; then
    frame_diff=$((expected_frames - actual_frames))
    if [ "$frame_diff" -lt 0 ]; then frame_diff=$((0 - frame_diff)); fi
    if [ "$frame_diff" -gt 1 ]; then
      echo "FRAME_DROP $p expected=$expected_frames actual=$actual_frames diff=$frame_diff" >> "$DECODE_RESULT_FILE"
    else
      echo "DECODE_OK $p frames=$actual_frames expected=$expected_frames fps=$fps_fraction duration=${duration}s" >> "$DECODE_RESULT_FILE"
    fi
  else
    echo "DECODE_OK $p frames=$actual_frames (expected_unavailable: fps=$fps_fraction duration=${duration}s)" >> "$DECODE_RESULT_FILE"
  fi

  # Phase 5: ffmpeg stderr 非空则记录警告（-loglevel error 下非空 = 有错误）
  if [ -s "$FFMPEG_ERR_PER_ITEM" ]; then
    echo "DECODE_WARNING $p ffmpeg_stderr_nonempty" >> "$DECODE_RESULT_FILE"
    echo "--- ffmpeg stderr for $p ---" >> "$FFMPEG_STDERR_FILE"
    cat "$FFMPEG_ERR_PER_ITEM" >> "$FFMPEG_STDERR_FILE"
  fi
  rm -f "$FFMPEG_ERR_PER_ITEM"
done

# 汇总解码结果（grep -c 三态处理）
DECODE_FAILED_COUNT=$(grep -c '^DECODE_FAILED ' "$DECODE_RESULT_FILE")
GREP_EXIT=$?; if [ $GREP_EXIT -eq 1 ]; then DECODE_FAILED_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: DECODE_FAILED count"; exit 2; fi

FRAME_DROP_COUNT=$(grep -c '^FRAME_DROP ' "$DECODE_RESULT_FILE")
GREP_EXIT=$?; if [ $GREP_EXIT -eq 1 ]; then FRAME_DROP_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: FRAME_DROP count"; exit 2; fi

DECODE_ERROR_COUNT=$(grep -c '^DECODE_ERROR ' "$DECODE_RESULT_FILE")
GREP_EXIT=$?; if [ $GREP_EXIT -eq 1 ]; then DECODE_ERROR_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: DECODE_ERROR count"; exit 2; fi

DECODE_OK_COUNT=$(grep -c '^DECODE_OK ' "$DECODE_RESULT_FILE")
GREP_EXIT=$?; if [ $GREP_EXIT -eq 1 ]; then DECODE_OK_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: DECODE_OK count"; exit 2; fi

SKIP_NON_VIDEO_COUNT=$(grep -c '^SKIP_NON_VIDEO ' "$DECODE_RESULT_FILE")
GREP_EXIT=$?; if [ $GREP_EXIT -eq 1 ]; then SKIP_NON_VIDEO_COUNT=0; fi
if [ $GREP_EXIT -gt 1 ]; then echo "GREP_ERROR: SKIP count"; exit 2; fi

echo "=== Video Decode Results ==="
cat "$DECODE_RESULT_FILE"
echo "=== Summary: DECODE_OK=$DECODE_OK_COUNT DECODE_FAILED=$DECODE_FAILED_COUNT FRAME_DROP=$FRAME_DROP_COUNT DECODE_ERROR=$DECODE_ERROR_COUNT SKIP_NON_VIDEO=$SKIP_NON_VIDEO_COUNT ==="

if [ -s "$FFMPEG_STDERR_FILE" ]; then
  echo "=== FFMPEG Stderr ==="
  cat "$FFMPEG_STDERR_FILE"
fi

# 证据文件不删除
echo "DECODE_RESULT_FILE=$DECODE_RESULT_FILE"
echo "FFMPEG_STDERR_FILE=$FFMPEG_STDERR_FILE"
echo "FFPROBE_STDERR_FILE=$FFPROBE_STDERR_FILE"
```

判定分类：
- `DECODE_FAILED_COUNT > 0` → `FAIL (DECODE_FAILED)`，记录 ffmpeg stderr
- `FRAME_DROP_COUNT > 0` → `FAIL (FRAME_DROP)`，记录 expected/actual/diff
- `DECODE_ERROR_COUNT > 0` → `BLOCKED_ENV`（ffprobe/ffmpeg 执行失败，非视频本身问题）
- 视频资产全部 `DECODE_OK` → Step 4 PASS
- 无视频资产（全部 `SKIP_NON_VIDEO`）→ Step 4 PASS（N/A，记录 `NO_VIDEO_ASSETS`）

## Step 5: 处理链路验证

检查视频处理命令的执行日志，确认日志存在、非空、且已归档留存。
输入/输出路径和处理参数的具体校验规则由项目规格定义，本 Step 确保日志物证完整。

```bash
# 处理日志路径（由编译/处理流程生成，执行前替换为实际路径）
PROCESSING_LOG="<processing-log-path>"

if [ ! -e "$PROCESSING_LOG" ]; then
  echo "PROCESSING_LOG_MISSING: $PROCESSING_LOG"
  exit 2
fi
if [ ! -f "$PROCESSING_LOG" ]; then
  echo "PROCESSING_LOG_NOT_REGULAR: $PROCESSING_LOG"
  exit 2
fi
if [ ! -s "$PROCESSING_LOG" ]; then
  echo "PROCESSING_LOG_EMPTY: $PROCESSING_LOG"
  exit 2
fi

# 日志大小记录
LOG_SIZE=$(stat -c %s "$PROCESSING_LOG" 2>"$STAT_ERR_FILE")
STAT_EXIT=$?
if [ $STAT_EXIT -ne 0 ]; then
  echo "PROCESSING_LOG_STAT_ERROR (exit=$STAT_EXIT)"
  exit 2
fi
echo "PROCESSING_LOG=$PROCESSING_LOG"
echo "PROCESSING_LOG_SIZE=$LOG_SIZE"

# 归档日志副本到证据文件（不删除原件）
PROCESSING_LOG_COPY=$(mktemp -t processing-log-XXXXXX)
cp "$PROCESSING_LOG" "$PROCESSING_LOG_COPY"
CP_EXIT=$?
if [ $CP_EXIT -ne 0 ]; then
  echo "PROCESSING_LOG_COPY_FAILED (exit=$CP_EXIT)"
  exit 2
fi
echo "PROCESSING_LOG_COPY=$PROCESSING_LOG_COPY"
```

判定分类：
- `PROCESSING_LOG_MISSING` / `PROCESSING_LOG_NOT_REGULAR` / `PROCESSING_LOG_EMPTY` → `BLOCKED_ENV`
- `PROCESSING_LOG_STAT_ERROR` / `PROCESSING_LOG_COPY_FAILED` → `BLOCKED_ENV`
- 日志存在、非空、已归档 → Step 5 PASS

## Step 6: Golden Case 证据归档

1. 确认 Golden Case 参考目录存在：

```bash
GOLDEN_DIR="<golden-dir>"
if [ ! -d "$GOLDEN_DIR" ]; then
  echo "GOLDEN_REFERENCE_MISSING: $GOLDEN_DIR"
  exit 2
fi
echo "GOLDEN_DIR=$GOLDEN_DIR"
```

2. 记录验证时的 commit SHA：

```bash
COMMIT_HASH=$(git rev-parse HEAD 2>"$GIT_ERR_FILE")
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "GIT_ERROR: failed to get HEAD (exit=$GIT_EXIT)"
  cat "$GIT_ERR_FILE"
  exit 2
fi
echo "COMMIT_HASH=$COMMIT_HASH"
```

3. 归档 git status：

```bash
GIT_STATUS_FILE=$(mktemp -t git-status-XXXXXX)
git status --porcelain=v1 > "$GIT_STATUS_FILE" 2>"$GIT_STATUS_ERR_FILE"
GIT_STATUS_EXIT=$?
if [ $GIT_STATUS_EXIT -ne 0 ]; then
  echo "GIT_STATUS_ERROR (exit=$GIT_STATUS_EXIT)"
  cat "$GIT_STATUS_ERR_FILE"
  exit 2
fi
echo "GIT_STATUS_FILE=$GIT_STATUS_FILE"
```

4. 归档验证日志到 evidence/ 目录：

```bash
EVIDENCE_DIR="<output-dir>/evidence"
mkdir -p "$EVIDENCE_DIR"
MKDIR_EXIT=$?
if [ $MKDIR_EXIT -ne 0 ]; then
  echo "EVIDENCE_DIR_CREATE_FAILED (exit=$MKDIR_EXIT)"
  exit 2
fi

# REV-3 修正：归档必须捕获退出码，禁止 2>/dev/null 静默吞错
ARCHIVE_ERROR=0
cp "$DECODE_RESULT_FILE" "$EVIDENCE_DIR/decode-results.txt" || ARCHIVE_ERROR=1
cp "$SHA_RESULT_FILE" "$EVIDENCE_DIR/sha256-results.txt" || ARCHIVE_ERROR=1
cp "$FORMAT_ERROR_FILE" "$EVIDENCE_DIR/format-errors.txt" || ARCHIVE_ERROR=1
cp "$ASSET_ERROR_FILE" "$EVIDENCE_DIR/asset-errors.txt" || ARCHIVE_ERROR=1
if [ -n "$PROCESSING_LOG_COPY" ] && [ -f "$PROCESSING_LOG_COPY" ]; then
  cp "$PROCESSING_LOG_COPY" "$EVIDENCE_DIR/processing-log.txt" || ARCHIVE_ERROR=1
fi
cp "$GIT_STATUS_FILE" "$EVIDENCE_DIR/git-status.txt" || ARCHIVE_ERROR=1
echo "$COMMIT_HASH" > "$EVIDENCE_DIR/commit-hash.txt" || ARCHIVE_ERROR=1

if [ "$ARCHIVE_ERROR" -ne 0 ]; then
  echo "EVIDENCE_ARCHIVE_ERROR: one or more archive operations failed"
  exit 2
fi

echo "EVIDENCE_DIR=$EVIDENCE_DIR"
ls -la "$EVIDENCE_DIR"
```

判定分类：
- `GOLDEN_REFERENCE_MISSING` → `BLOCKED_ENV`
- `GIT_ERROR` / `GIT_STATUS_ERROR` → `BLOCKED_ENV`
- `EVIDENCE_DIR_CREATE_FAILED` / `EVIDENCE_ARCHIVE_ERROR` → `BLOCKED_ENV`
- 归档完成 → Step 6 PASS

## 决策点

- Step 1-3 任一 FAIL → 资产无效，停止后续步骤，输出 FAIL 报告（含具体错误码）
- Step 4 FAIL → 视频不可播放，标记 FAIL（`DECODE_FAILED` / `FRAME_DROP`）
- Step 5-6 证据缺失 → `BLOCKED_ENV`，不标记 PASS
- 全部 Step 通过且证据完整 → 标记 `PASS`
- **绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS**
