# Design: REV-13 R3.15

## 1. Trap 最终退出码明确打印

当前 trap 中 `rc=0` 是 trap 入口时的 `$?`（脚本最后一条命令的退出码），不是最终进程退出码。trap 失败分支执行 `exit 1`，但未打印。

修复：在 trap 失败分支的 `exit 1` 前添加：
```bash
echo "[-] FINAL_EXIT_CODE=1 (harness funnel forced non-zero exit)" >&2
```
成功分支添加：
```bash
echo "[+] FINAL_EXIT_CODE=0"
```

## 2. 故障注入日志完整化

故障注入运行时：
```bash
bash harness.sh > fail-stdout.log 2> fail-stderr.log
echo "FINAL_EXIT_CODE=$?" >> fail-stdout.log
```
同时保留 golden-frame-stderr.log（harness 归档在 RUN_DIR，但被清理。需在 harness 中也归档 golden frame 日志）。

实际上 harness 已经将 golden frame 输出重定向到 $RUN_DIR/golden-frame-stderr.log，但 RUN_DIR 被清理。需要在 log_archive 阶段也归档 golden frame 日志。

## 3. T4 Delta 原始输出

将 T4 审计输出保存为 `rev13-r315-t4-delta-audit.log` 并提交。
