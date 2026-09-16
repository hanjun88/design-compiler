# Design: Phase 4-D.5

## 变更边界

仅修改 `chinese-aesthetic/scene-pack/` 下文件：
- `crash-recovery.ts` — 扫描异常透传 + 残留状态真实报告
- `disk-validator.ts` — 原始路径段先验拒绝
- `disk-emitter.ts` — ManifestFileEntry.truthClass 类型必填
- `tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts` — 新增 2 测试

## R1: 扫描异常透传

### 当前缺陷
```typescript
// findStrictSiblingDirs
try {
  return fs.readdirSync(parent).filter(...).filter((p) => {
    try { return fs.lstatSync(p).isDirectory() || ...; }
    catch { return false; }  // 非 ENOENT 也被静默过滤
  });
} catch {
  return [];  // readdirSync 异常被静默过滤
}
```

### 修复
- `lstatSync` catch 中：仅 ENOENT 返回 false，其他异常向上传播
- `readdirSync` catch 中：仅 ENOENT 返回 []，其他异常向上传播

## R2: 原始路径段先验拒绝

### 当前缺陷
`sanitizeManifestEntryPath` 先调用 `path.posix.normalize`，再检查段。normalize 会消解 `assets/../assets/scene.webp` → `assets/scene.webp`，绕过零宽容拦截。

### 修复
在 normalize 之前增加原始路径词法切分校验：
```typescript
const rawSegments = rawPath.split("/");
for (const seg of rawSegments) {
  if (seg === ".." || seg === "." || seg === "") {
    throw new ManifestSchemaError(`Illegal raw segment ("${seg}") in path: "${rawPath}"`, "MANIFEST_INVALID_PATH");
  }
}
```
注意：空段检查意味着 `assets//scene.webp` 也会被拒绝（之前 normalize 会合并 `//`）。

## R3: 残留状态真实报告

### CrashRecoveryReport 扩展
```typescript
export interface CrashRecoveryReport {
  action: RecoveryAction;
  targetDir: string;
  backupDirs: string[];       // 初始发现的 backup（保留兼容）
  stagingDirs: string[];      // 初始发现的 staging（保留兼容）
  recovered: boolean;
  message: string;
  cleanupFailures: CleanupFailure[];
  cleanedBackups: string[];   // 新增：成功清理的 backup
  cleanedStagings: string[];  // 新增：成功清理的 staging
  remainingBackups: string[]; // 新增：未成功清理的 backup
  remainingStagings: string[];// 新增：未成功清理的 staging
}
```

### 清理逻辑
使用统一的 `executeStrictCleanup`，每个候选目录：
- 成功 → cleaned.push
- 失败（非 SecurityPathError）→ failures.push + remaining.push
- SecurityPathError → 向上抛出

## R4: truthClass 类型必填

### disk-emitter.ts
```typescript
export type AssetTruthClass = "SOURCE" | "DERIVED" | "GENERATED";

export interface ManifestFileEntry {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly truthClass: AssetTruthClass;  // 去掉 ?
}
```

### 兼容性
- emitter 生成的 entry 始终包含 truthClass（已在 D.4 修复证据文件）
- 测试中的 makeValidManifest 已包含 truthClass
- 其他引用 ManifestFileEntry 的代码需检查

## TOCTOU 边界说明

当前实现不提供 TOCTOU（Time-of-check to time-of-use）竞态防护。`assertNotSymlink` 与 `fs.rmSync` 之间存在理论窗口，攻击者可在校验后替换为 symlink。本阶段仅在文档中声明此边界，不实现文件描述符级防护。
