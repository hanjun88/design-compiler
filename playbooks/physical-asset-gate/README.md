# DC-PB-003: 物理资产门禁与真实视频验证

## Purpose

验证设计资产是否真正经过物理资产门禁和端到端验证，区分"资产存在"与"资产有效"、"编译成功"与"播放验证通过"。

## Trigger

- 新资产入库时
- 视频处理链路完成后
- Golden Case 验证阶段
- 任何声称"资产已验证"的交付节点

## Inputs

- 资产文件（图片、视频、深度图、遮罩等），位于 `<output-dir>/`
- 资产清单 `<output-dir>/manifest.json`（`files[].path` / `sha256` / `byteSize` / `mimeType`）
- 视频处理执行日志（`<processing-log-path>`）
- Golden Case 参考资产（`<golden-dir>`）

## Preconditions

- `manifest.json` 物理存在且 `files` 为非空数组
- 工具链可用：`jq` / `sha256sum` / `ffprobe` / `ffmpeg` / `stat` / `git` / `mktemp`
- 处理命令已执行或可执行（日志已生成）

## Success Criteria

| ID | 标准 | 对应 AC | 对应 Procedure Step |
|---|---|---|---|
| SC-1 | 资产物理存在且非空 | AC-1.1 ~ AC-1.3 | Step 1 |
| SC-2 | 格式与元数据合规（codec/分辨率/帧率/位深从真实文件读取） | AC-2.1 ~ AC-2.5 | Step 2 |
| SC-3 | 资产完整性（SHA-256 + byteSize）验证通过 | AC-3.1 ~ AC-3.4 | Step 3 |
| SC-4 | 视频可真实解码播放（ffmpeg 全帧解码，非仅文件存在） | AC-4.1 ~ AC-4.4 | Step 4 |
| SC-5 | 处理链路日志完整且已归档 | AC-5.1 ~ AC-5.2 | Step 5 |
| SC-6 | Golden Case 证据归档完整（commit SHA + git status + 验证日志） | AC-6.1 ~ AC-6.4 | Step 6 |

## Outcome

PASS / FAIL / BLOCKED_ENV / NOT_RUN

- BLOCKED_ENV 和 NOT_RUN 永不报告为 PASS
