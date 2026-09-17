# Design: REV-13 R3.13

## 1. --strict-exact 纳入 Harness

Golden Frame 阶段调用改为：
```bash
node "$GOLDEN_VERIFIER_PATH" \
  --bin "$GOLDEN_BIN_PATH" \
  --png "$GOLDEN_PNG_PATH" \
  --sha256 "$GOLDEN_SHA_PATH" \
  --strict-exact \
  > "$RUN_DIR/golden-frame-stdout.log" 2> "$RUN_DIR/golden-frame-stderr.log"
```

## 2. funnel_verdict 动态计算

在 atomic_write_binding 之前，基于所有 STATUS_* 计算：
```bash
FUNNEL_VERDICT="FAIL"
if [[ "$STATUS_BASH_N" == "PASS" && "$STATUS_SHELLCHECK" == "PASS" && \
      "$STATUS_REGISTRY" == "PASS" && "$STATUS_SELFTEST" == "PASS" && \
      "$STATUS_CLOSURE" == "PASS" && "$STATUS_GOLDEN_FRAME" == "PASS" && \
      "$STATUS_SCRIPT_BLOB" == "PASS" && "$STATUS_HARNESS_BLOB" == "PASS" && \
      "$STATUS_TEMPORAL" == "PASS" && "$STATUS_BINDING_WRITE" == "PASS" ]]; then
  FUNNEL_VERDICT="PASS"
fi
```
通过 `--arg funnel_verdict "$FUNNEL_VERDICT"` 注入 jq，替换硬编码 `"PASS"`。

## 3. 故障注入验证

在隔离 Worktree 中：
- 正常运行：确认 funnel_verdict=PASS, exit 0
- 故障运行：篡改 golden-frame.rgba.bin（1 字节），确认 golden_frame=FAIL, funnel_verdict=FAIL, exit 1
- 故障运行的 binding JSON 作为证据保留
