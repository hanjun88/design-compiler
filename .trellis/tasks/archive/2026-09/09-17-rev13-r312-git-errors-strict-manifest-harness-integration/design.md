# Design: REV-13 R3.12

## 1. Git 错误传播（verify-freeze-evidence-delta.sh）

移除 `|| true`，改为：
```bash
SUMMARY_OUTPUT="$(git -C "$WORKSPACE_ROOT" diff --summary "$SOURCE_FREEZE" "$EVIDENCE_HEAD")" || {
  echo "[-] FATAL: git diff --summary failed (invalid commit or repo error)" >&2; exit 1; }
RAW_STATUS="$(git -C "$WORKSPACE_ROOT" diff --name-status "$SOURCE_FREEZE" "$EVIDENCE_HEAD")" || {
  echo "[-] FATAL: git diff --name-status failed" >&2; exit 1; }
```
空结果（零差异）是合法的 PASS，但 git 命令本身失败必须阻断。

## 2. SHA 清单严格解析（verify-golden-frame.js）

替换 `split(/\s+/)[0]` 为严格 UNIX sha256sum 格式验证：
```javascript
const SHA256_LINE = /^([0-9a-fA-F]{64})[\t ]+([\* ]?)(.+)$/;
const lines = manifestRaw.split('\n').filter(l => l.trim());
if (lines.length !== 1) fail("manifest must contain exactly one record");
const m = lines[0].match(SHA256_LINE);
if (!m) fail("manifest not in UNIX sha256sum format");
const manifestSha = m[1].toLowerCase();
const manifestFilename = path.basename(m[3].trim());
if (manifestFilename !== expectedTargetName) fail("manifest filename mismatch");
```

## 3. Harness 集成（rev13-r311-verification-harness.sh → R3.12）

新增两个阶段：
- **STATUS_GOLDEN_FRAME**：运行 `node scripts/verify-golden-frame.js --bin ... --png ... --sha256 ...`
- **STATUS_DELTA_AUDIT**：运行 `bash verify-freeze-evidence-delta.sh "$SOURCE_FREEZE" "$EVIDENCE_HEAD"`（在证据提交后由外部执行，harness 内可做 self-delta 检查）

状态账本从 9 项扩展到 11 项。Harness 版本更新为 1.7.1-REV-13-R3.12。

注意：delta audit 需要两个 commit（freeze + evidence），harness 运行时只有当前 HEAD。因此 harness 内集成 golden frame 验证，delta audit 作为 harness 后的独立步骤（已在流程中）。但审查席要求"纳入统一 Harness"，所以在 harness 中增加 golden frame 阶段，并在 binding JSON 中记录 delta audit 的预期执行命令。
