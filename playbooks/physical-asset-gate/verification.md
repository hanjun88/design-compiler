# Verification: 物理资产门禁与真实视频验证

> 本 Playbook 是物理资产门禁的下游消费方，而非平行规范。所有判定必须基于物理执行证据，不得以静态推断替代。
>
> README 中的 SC-N（Success Criteria）与本表的 AC-N.x 一一对应：SC-1 → AC-1.x，SC-2 → AC-2.x，依此类推。
>
> 路径规范：`manifest.files[].path` 为相对于 output directory 的 POSIX 相对路径，所有校验直接拼接 `<output-dir>/<path>`。

## 代码块性质声明（与 procedure.md 一致）

本文档中的所有 shell 命令示例均为**可执行模板**：

- `<output-dir>`、`<golden-dir>` 等尖括号占位符必须替换为实际值后执行
- 失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**；验收标准表格中的 `FAIL (ERROR_CODE)` 为状态说明，不是可执行命令
- 所有命令的退出码、stdout 和 stderr 必须原始留存

## 验收标准（Acceptance Criteria）

### AC-1: 资产物理存在（对应 SC-1）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-1.1 | manifest 可读且合法 | `manifest.json` 存在，`jq -e '.files \| type == "array"'` 退出码 0 | 文件缺失 → BLOCKED_ENV；JSON 解析失败 → BLOCKED_ENV；files 非数组 → BLOCKED_ENV | MANIFEST_NOT_FOUND / MANIFEST_PARSE_ERROR (BLOCKED_ENV) |
| AC-1.2 | 资产文件物理存在 | 所有 `manifest.files[].path` 对应文件存在且为常规文件（`test -f`） | 任一不存在 → FAIL；任一非普通文件 → FAIL | ASSET_NOT_FOUND / ASSET_NOT_REGULAR |
| AC-1.3 | 资产文件非空 | 所有资产 `stat -c %s` > 0 | 任一文件大小为 0 → FAIL | ASSET_EMPTY |

> AC-1.2 纪律：必须使用 `test -e` 区分不存在与权限错误，再用 `test -f` 区分常规文件。
> `stat` 执行失败（非资产问题）判定 BLOCKED_ENV (`ASSET_STAT_ERROR`)，不得与"文件不存在"混淆。
> 循环在子 shell 中执行，错误必须通过 `$ASSET_ERROR_FILE` 文件汇总，禁止依赖管道变量传递。

### AC-2: 格式与元数据合规（对应 SC-2）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-2.1 | ffprobe 可执行 | `ffprobe -print_format json -show_format -show_streams` 对每个资产退出码 0 | ffprobe 执行失败 → BLOCKED_ENV | FFPROBE_EXEC_ERROR (BLOCKED_ENV) |
| AC-2.2 | 图片 codec 匹配 | `image/webp` → codec=webp；`image/png` → codec=png | codec 不匹配 → FAIL | FORMAT_MISMATCH |
| AC-2.3 | 分辨率有效 | 所有资产 `width > 0` 且 `height > 0`（从 ffprobe JSON `.streams[0]` 读取） | 分辨率 ≤ 0 或无法读取 → FAIL | RESOLUTION_INVALID |
| AC-2.4 | 视频元数据记录 | 视频资产的 codec/帧率(r_frame_rate)/时长(duration)已从 ffprobe 原始记录 | 未记录 → FAIL；未知 mimeType 无法验证 → FAIL | FORMAT_UNKNOWN_MIME |
| AC-2.5 | 深度图/遮罩位深可判定 | 深度图/遮罩资产的 `pix_fmt` 可映射为 8-bit 或 16-bit | pix_fmt 无法映射 → FAIL | BIT_DEPTH_UNKNOWN |

> AC-2.1 纪律：ffprobe 退出码必须独立捕获，禁止通过管道 `$?` 获取。
> ffprobe stderr 必须持久化到 `$FFPROBE_STDERR_FILE`，纳入证据清单。
> 元数据必须从真实文件读取，禁止信任 manifest 中的声明值。

### AC-3: 完整性校验（对应 SC-3）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-3.1 | sha256 字段存在且合法 | 所有 `manifest.files[].sha256` 非空且匹配 `^[0-9a-f]{64}$` | 字段缺失 → FAIL；格式非法 → BLOCKED_ENV | MISSING_HASH_FIELD / SHA256_VERIFICATION_ERROR (BLOCKED_ENV) |
| AC-3.2 | SHA-256 逐一匹配 | 所有资产 `sha256sum` 实际哈希与 manifest 声明一致 | 任一不匹配 → FAIL | SHA256_MISMATCH |
| AC-3.3 | byteSize 一致 | 所有资产 `stat -c %s` 与 `manifest.files[].byteSize` 相等 | 任一不一致 → FAIL | BYTE_SIZE_MISMATCH |
| AC-3.4 | sha256sum 执行无错误 | 所有 `sha256sum` 退出码 0，awk 解析退出码 0 | 执行失败/解析失败 → BLOCKED_ENV | SHA256_VERIFICATION_ERROR (BLOCKED_ENV) |

> AC-3.2 纪律（与 DC-PB-001 Step 5.2 一致）：
> - 必须使用 MATCH/MISMATCH/ERROR 逐项写入 `$SHA_RESULT_FILE`，通过 `grep -c` 汇总
> - `grep -c` 三态处理：退出码 0=有匹配，1=无匹配（count=0），>1=执行错误（→BLOCKED_ENV）
> - 禁止使用 `|| true` 抹平退出状态
> - sha256sum 与 awk 必须拆开独立捕获退出码，禁止管道末端 `$?`
> - `ERROR_COUNT > 0` 统一判定 BLOCKED_ENV (`SHA256_VERIFICATION_ERROR`)，含子类型：sha256sum_exec_failed / hash_parse_failed / invalid_hash_format / jq_read_failed / stat_failed
> - `$SHA_RESULT_FILE` 和 `$SHA_STDERR_FILE` 不删除，纳入证据清单

### AC-4: 视频真实解码（对应 SC-4）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-4.1 | ffmpeg 解码退出码 0 | 所有 `video/*` 资产 `ffmpeg -loglevel error -i input -f null -` 退出码 0 | 任一退出码非 0 → FAIL | DECODE_FAILED |
| AC-4.2 | 无丢帧 | 实际解码帧数（`ffprobe -count_frames`）与预期帧数（`duration × r_frame_rate`）差异 ≤ 1 | 差异 > 1 → FAIL | FRAME_DROP |
| AC-4.3 | ffmpeg stderr 无错误 | `-loglevel error` 下 stderr 为空 | stderr 非空 → 记录警告，不单独 FAIL 但纳入证据 | DECODE_WARNING（记录项） |
| AC-4.4 | 非视频资产正确跳过 | 非 `video/*` 资产记录为 `SKIP_NON_VIDEO`，不执行解码 | 无视频资产时 Step 4 = PASS (N/A) | — |

> AC-4.1 纪律：必须执行真实全帧解码（`-f null -`），禁止仅检查文件头、扩展名或 ffprobe 元数据。
> ffmpeg stderr 必须重定向到 per-item 文件，执行后追加到 `$FFMPEG_STDERR_FILE` 汇总。
>
> AC-4.2 纪律：预期帧数通过 `awk` 计算 `duration * (num/den)`，r_frame_rate 为分数形式（如 30000/1001）。
> ±1 容差用于处理四舍五入和容器时间戳精度，超过容差必须 FAIL。
> 实际帧数通过 `ffprobe -count_frames -select_streams v:0` 独立获取，不依赖 ffmpeg stderr 中的 `frame=` 文本。
>
> AC-4.4 纪律：无视频资产的资产集不得因此项 BLOCKED_ENV，应记录 `NO_VIDEO_ASSETS` 并 PASS (N/A)。

### AC-5: 处理链路日志（对应 SC-5）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-5.1 | 处理日志存在且非空 | `<processing-log-path>` 存在、为常规文件、大小 > 0 | 缺失/非普通文件/空 → BLOCKED_ENV | PROCESSING_LOG_MISSING (BLOCKED_ENV) |
| AC-5.2 | 日志已归档 | 日志副本已通过 `cp` 保存到 `$PROCESSING_LOG_COPY`（mktemp 隔离路径） | 复制失败 → BLOCKED_ENV | PROCESSING_LOG_COPY_FAILED (BLOCKED_ENV) |

> AC-5.1 纪律：必须区分"文件不存在"（`test -e`）、"非普通文件"（`test -f`）、"空文件"（`test -s`）三种状态。
> 日志原件不删除，仅复制归档。

### AC-6: Golden Case 证据归档（对应 SC-6）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-6.1 | Golden 参考目录存在 | `<golden-dir>` 为目录且可访问 | 缺失 → BLOCKED_ENV | GOLDEN_REFERENCE_MISSING (BLOCKED_ENV) |
| AC-6.2 | commit SHA 已记录 | `git rev-parse HEAD` 退出码 0 且值已记录 | git 执行失败 → BLOCKED_ENV | GIT_ERROR (BLOCKED_ENV) |
| AC-6.3 | git status 已归档 | `git status --porcelain=v1` 输出已保存到 `$GIT_STATUS_FILE` | 执行失败 → BLOCKED_ENV | GIT_STATUS_ERROR (BLOCKED_ENV) |
| AC-6.4 | 验证日志已归档 | decode-results / sha256-results / format-errors / asset-errors / processing-log / git-status / commit-hash 已写入 `<output-dir>/evidence/` | 目录创建失败 → BLOCKED_ENV | EVIDENCE_DIR_CREATE_FAILED (BLOCKED_ENV) |

> AC-6.4 纪律：`evidence/` 目录通过 `mkdir -p` 创建，所有证据文件通过 `cp` 归档（不移动、不删除原件）。
> commit-hash 写入 `evidence/commit-hash.txt`，与 DC-PB-001 的 commit-hash 验证机制一致。

## 证据要求（Evidence Requirements）

必须保留以下原始命令输出，不得使用摘要或截图替代：

1. **资产存在性**：`$ASSET_ERROR_FILE`（逐项错误列表）、`ASSET_COUNT` 统计
2. **格式元数据**：`$FORMAT_ERROR_FILE`、`$DECODE_RESULT_FILE` 中的 `METADATA` 行（含 codec/width/height/pix_fmt/fps/duration）、`$FFPROBE_STDERR_FILE`
3. **完整性**：`$SHA_RESULT_FILE`（逐项 MATCH/MISMATCH/ERROR/MISSING_HASH_FIELD/BYTE_SIZE_MISMATCH）、`$SHA_STDERR_FILE`、汇总统计（MATCH/MISMATCH/ERROR/TOTAL）
4. **视频解码**：`$DECODE_RESULT_FILE`（DECODE_OK/DECODE_FAILED/FRAME_DROP/DECODE_ERROR/SKIP_NON_VIDEO）、`$FFMPEG_STDERR_FILE`、预期帧数与实际帧数
5. **处理链路**：`$PROCESSING_LOG_COPY`（完整日志副本）、`PROCESSING_LOG_SIZE`
6. **Golden 归档**：`$GIT_STATUS_FILE`、`COMMIT_HASH`、`<output-dir>/evidence/` 目录完整内容清单

## 判定规则（Verdict Rules）

- **PASS**：全部 AC 项通过，视频真实解码验证通过（或无视频资产 N/A），证据完整可独立复核
- **FAIL**：任一 AC 项不通过，记录具体错误码（错误码封闭，不得新增未定义码）
- **BLOCKED_ENV**：工具不可用（jq / sha256sum / ffprobe / ffmpeg / stat / git / mktemp 缺失）、ffprobe/ffmpeg/sha256sum 执行失败、manifest 缺失或解析失败、处理日志缺失、Golden 参考目录缺失、证据目录创建失败——不得标记 PASS
- **NOT_RUN**：资产清单未生成、验证命令未执行、或 Phase 0 未完成

**绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS。**

## 错误码封闭清单（Error Code Taxonomy）

| 错误码 | 判定 | 来源 Step |
|---|---|---|
| ASSET_NOT_FOUND | FAIL | Step 1 |
| ASSET_NOT_REGULAR | FAIL | Step 1 |
| ASSET_EMPTY | FAIL | Step 1 |
| FORMAT_MISMATCH | FAIL | Step 2 |
| RESOLUTION_INVALID | FAIL | Step 2 |
| FORMAT_UNKNOWN_MIME | FAIL | Step 2 |
| BIT_DEPTH_UNKNOWN | FAIL | Step 2 |
| MISSING_HASH_FIELD | FAIL | Step 3 |
| SHA256_MISMATCH | FAIL | Step 3 |
| BYTE_SIZE_MISMATCH | FAIL | Step 3 |
| DECODE_FAILED | FAIL | Step 4 |
| FRAME_DROP | FAIL | Step 4 |
| MANIFEST_NOT_FOUND | BLOCKED_ENV | Phase 0 |
| MANIFEST_READ_ERROR | BLOCKED_ENV | Phase 0 |
| MANIFEST_PARSE_ERROR | BLOCKED_ENV | Phase 0 |
| MANIFEST_PATH_EXTRACT_ERROR | BLOCKED_ENV | Step 1 |
| NO_ASSETS | BLOCKED_ENV | Step 1 |
| ASSET_STAT_ERROR | BLOCKED_ENV | Step 1 |
| FFPROBE_EXEC_ERROR | BLOCKED_ENV | Step 2/4 |
| METADATA_READ_ERROR | BLOCKED_ENV | Step 2 |
| SHA256_VERIFICATION_ERROR | BLOCKED_ENV | Step 3 |
| DECODE_ERROR | BLOCKED_ENV | Step 4 |
| PROCESSING_LOG_MISSING | BLOCKED_ENV | Step 5 |
| PROCESSING_LOG_NOT_REGULAR | BLOCKED_ENV | Step 5 |
| PROCESSING_LOG_EMPTY | BLOCKED_ENV | Step 5 |
| PROCESSING_LOG_STAT_ERROR | BLOCKED_ENV | Step 5 |
| PROCESSING_LOG_COPY_FAILED | BLOCKED_ENV | Step 5 |
| GOLDEN_REFERENCE_MISSING | BLOCKED_ENV | Step 6 |
| GIT_ERROR | BLOCKED_ENV | Step 6 |
| GIT_STATUS_ERROR | BLOCKED_ENV | Step 6 |
| EVIDENCE_DIR_CREATE_FAILED | BLOCKED_ENV | Step 6 |
| EVIDENCE_ARCHIVE_ERROR | BLOCKED_ENV | Step 6 |

## 禁止行为（Forbidden Actions）

- 禁止仅检查文件存在就标记 PASS（必须验证格式、完整性、可解码性）
- 禁止仅检查文件头/扩展名替代真实 ffmpeg 解码
- 禁止信任 manifest 中的元数据而不验证真实文件（必须用 ffprobe 读取）
- 禁止用 mock 或 stub 替代真实文件操作
- 禁止在视频解码验证缺失时标记 PASS
- 禁止使用 `|| true` 掩盖命令失败
- 禁止管道末端 `$?` 代表前置命令状态（必须拆开独立捕获）
- 禁止子 shell 变量传递状态（循环内状态必须通过文件汇总）
- 禁止提前删除证据文件（SHA_RESULT_FILE、DECODE_RESULT_FILE、各 ERROR_FILE 必须保留到最终证据清单）
- 禁止将 ffprobe 元数据读取称为"解码验证通过"（元数据 ≠ 真实解码）
- 禁止在 BLOCKED_ENV 状态下标记 PASS
