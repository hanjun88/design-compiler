# Design: Phase 4-D.4

## 架构边界

本任务仅修改 `chinese-aesthetic/scene-pack/` 下的三个文件：
- `crash-recovery.ts` — 断链 symlink 检测 + 清理审计
- `disk-validator.ts` — 路径语义封闭 + entry 零回填
- `tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts` — 新增 4 个负向测试

历史目录（compiler-core/、evaluation/、schemas/）保持 ZERO DIFF。

## R1: 断链符号链接拦截

### 当前缺陷
```typescript
// findStrictSiblingDirs (9df78d5)
.filter((p) => {
  try {
    return fs.statSync(p).isDirectory();  // statSync 跟随链接
  } catch {
    return false;  // 断链 symlink 抛 ENOENT → 被过滤 → 绕过 assertNotSymlink
  }
});
```

### 修复方案
```typescript
.filter((p) => {
  try {
    const stat = fs.lstatSync(p);  // lstatSync 不跟随链接
    return stat.isDirectory() || stat.isSymbolicLink();  // 真实目录 + symlink 均纳入
  } catch {
    return false;
  }
});
```

`assertNotSymlink` 已使用 `lstatSync`，断链 symlink 的 `isSymbolicLink()` 返回 true，会被正确拒绝。

## R2: 路径语义封闭

### 新增函数 `sanitizeManifestEntryPath`

```typescript
const CANONICAL_LEAF_FILE_REGEX = /^[a-zA-Z0-9_\-.]+(\/[a-zA-Z0-9_\-.]+)*\.[a-zA-Z0-9]+$/;

function sanitizeManifestEntryPath(rawPath: string): string {
  // 1. 非空字符串
  // 2. 拒绝反斜杠与绝对路径
  // 3. path.posix.normalize 规范化
  // 4. 拒绝 '.'、空串、以 '/' 结尾
  // 5. 拒绝 '..'、'.'、空段
  // 6. 必须匹配叶子文件正则（带扩展名）
  return canonical;
}
```

替换当前 entry 循环中的 `canonicalizeRelativePath` + 分段检查逻辑。

## R3: 清理失败审计

### CrashRecoveryReport 扩展
```typescript
export interface CleanupFailure {
  readonly path: string;
  readonly error: string;
}

export interface CrashRecoveryReport {
  // ... 现有字段
  cleanupFailures: CleanupFailure[];  // 新增
}
```

### removeDirAudited 替代 removeDirSafe
```typescript
interface CleanupAccumulator { failures: CleanupFailure[]; }

function removeDirAudited(dir: string, acc: CleanupAccumulator): void {
  try {
    assertNotSymlink(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    acc.failures.push({ path: dir, error: err.message });
  }
}
```

所有恢复场景（A/B/C/E）使用 `removeDirAudited`，最终 `recovered = acc.failures.length === 0`。

## R4: Entry 零回填

### 当前缺陷
```typescript
sanitizedFiles.push({
  path: canonicalPath,
  sha256,
  byteSize: entry["byteSize"],
  mimeType: typeof entry["mimeType"] === "string" ? entry["mimeType"] : "application/octet-stream",  // 回填！
  truthClass: typeof entry["truthClass"] === "string" ? entry["truthClass"] : undefined,  // 回填！
});
```

### 修复方案
在 entry 循环中增加 mimeType 和 truthClass 的必填校验：
```typescript
if (typeof entry["mimeType"] !== "string" || !entry["mimeType"]) {
  throw new ManifestSchemaError(`Entry missing mimeType at index ${i}`, "MANIFEST_ENTRY_FIELD_MISSING");
}
if (typeof entry["truthClass"] !== "string" || !entry["truthClass"]) {
  throw new ManifestSchemaError(`Entry missing truthClass at index ${i}`, "MANIFEST_ENTRY_FIELD_MISSING");
}
```

## 兼容性

- `CrashRecoveryReport` 新增 `cleanupFailures` 字段为追加式，不破坏现有消费者（disk-emitter.ts 透传整个 report）
- `sanitizeManifestEntryPath` 比现有校验更严格，可能拒绝之前被接受的畸形路径——这是预期行为
- emitter 生成的 manifest 始终包含 mimeType 和 truthClass（来自编译资产元数据），不受影响
