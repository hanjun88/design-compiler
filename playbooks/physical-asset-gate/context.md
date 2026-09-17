# Context: 物理资产门禁与真实视频验证

## 背景

design-compiler 处理多种资产类型（WebP 图片、深度图、水面遮罩、视频等）。历史上出现过"资产文件存在但无效"、"编译成功但播放失败"、"静态检查通过但实机验证失败"等问题。本 Playbook 建立物理门禁，确保每项资产经过真实验证。

## 核心区分

| 概念 | 含义 | 不等价于 |
|---|---|---|
| 资产存在 | 文件在磁盘上可找到（`test -f`） | 资产有效 |
| 资产有效 | 格式正确、可解码、参数合规（ffprobe 验证） | 播放验证通过 |
| 编译成功 | 编译器退出码 0 | 输出可播放 |
| 静态检查通过 | 元数据校验通过（ffprobe 元数据） | 实机验证通过 |
| 实机验证通过 | ffmpeg 真实全帧解码成功、无丢帧 | 最终交付合格 |

## 约束

- 必须使用真实文件操作，不得用 mock 替代
- 视频验证必须实际执行 `ffmpeg -f null -` 全帧解码，不得仅检查文件头或扩展名
- 分辨率/帧率/编码格式必须从 ffprobe JSON 输出读取，不得信任 manifest 声明值
- SHA-256 必须从磁盘文件通过 `sha256sum` 计算，不得使用内存中的旧值
- byteSize 必须通过 `stat -c %s` 从磁盘读取，与 `manifest.files[].byteSize` 比对

## 工具链

| 工具 | 用途 | 最低要求 |
|---|---|---|
| `ffprobe` | 图片/视频元数据读取（codec/分辨率/帧率/时长/pix_fmt） | 支持 `-print_format json` |
| `ffmpeg` | 视频真实全帧解码验证 | 支持 `-f null` 输出、`-loglevel error` |
| `sha256sum` | 资产完整性校验 | GNU coreutils |
| `jq` | manifest JSON 解析与 ffprobe JSON 字段提取 | ≥ 1.6 |
| `stat` | 文件大小读取（`-c %s`） | GNU stat |
| `awk` | 帧率计算（duration × num/den） | POSIX 兼容 |
| `git` | commit SHA 与工作树状态记录 | — |
| `mktemp` | 隔离证据文件路径 | — |

## 术语

- **物理资产门禁**：对磁盘上的真实文件执行格式、完整性、可解码性校验
- **Golden Case**：经过完整验证的参考用例，作为回归基准
- **端到端验证**：从输入资产到最终输出的完整链路验证
- **丢帧（FRAME_DROP）**：ffprobe `-count_frames` 实际帧数与预期帧数（duration × fps）差异 > 1

## 前置条件

1. 资产文件已落盘到 `<output-dir>/`
2. `manifest.json` 已生成，`files[]` 含 `path` / `sha256` / `byteSize` / `mimeType`
3. ffprobe / ffmpeg / sha256sum / jq / stat / git / mktemp 均可用
4. 视频处理日志已生成（`<processing-log-path>`）
5. Golden Case 参考目录已就绪（`<golden-dir>`）
