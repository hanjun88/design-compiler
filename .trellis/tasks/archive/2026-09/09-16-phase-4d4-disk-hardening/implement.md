# Implement Plan: Phase 4-D.4

## 执行顺序

### Step 1: crash-recovery.ts 重写（已完成）
- [x] `findStrictSiblingDirs`: `statSync` → `lstatSync`，纳入 symlink 候选
- [x] `assertNotSymlink`: 明确 ENOENT 放行，其他错误向上传播
- [x] 新增 `CleanupFailure` 接口与 `CleanupAccumulator`
- [x] `removeDirSafe` → `removeDirAudited`，失败记录到账本
- [x] `CrashRecoveryReport` 新增 `cleanupFailures` 字段
- [x] 所有恢复场景（A/B/C/E）使用审计化清理，`recovered` 与失败联动

### Step 2: disk-validator.ts 路径语义封闭 + entry 零回填
- [ ] 新增 `sanitizeManifestEntryPath` 函数（path.posix.normalize + 空/目录/叶子文件校验）
- [ ] 替换 entry 循环中的路径校验逻辑
- [ ] mimeType 必填校验（拔除 `?? 'application/octet-stream'`）
- [ ] truthClass 必填校验（拔除 `?? undefined`）
- [ ] 错误码统一为 `MANIFEST_ENTRY_FIELD_MISSING`

### Step 3: 新增负向测试（disk-hardening.test.ts）
- [ ] DANGLING-SYMLINK-01: 断链 symlink 作为 backup → RECOVERY_SYMLINK_EXPLOIT
- [ ] MANIFEST-EMPTY-DIR-02: `./`、`assets/`、`assets//` → MANIFEST_INVALID_PATH
- [ ] CLEANUP-FAILURE-AUDIT-03: Mock fs.rmSync EACCES → recovered=false + cleanupFailures
- [ ] ENTRY-NO-FALLBACK-04: 缺失 mimeType/truthClass → MANIFEST_ENTRY_FIELD_MISSING

### Step 4: 验证
- [ ] 运行 disk 三件套测试：`npx jest tests/chinese-aesthetic/scene-pack/disk-emitter.test.ts tests/chinese-aesthetic/scene-pack/disk-security.test.ts tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts --runInBand`
- [ ] 运行全量：`npx jest tests/chinese-aesthetic/ --runInBand`
- [ ] TypeScript：`npx tsc --noEmit`（chinese-aesthetic/ 零错误）
- [ ] 历史目录 ZERO DIFF：`git diff --name-only 9df78d5 -- compiler-core/ evaluation/ schemas/` 应为空

### Step 5: 提交与推送
- [ ] `git add` 变更文件（不含 .trellis/、.claude/、.cursor/、AGENTS.md、.gitattributes）
- [ ] `git commit -m "Phase 4-D.4: ..."`
- [ ] `git push origin feature/chinese-aesthetic-disk-emitter`

## 验证命令

```bash
# 磁盘发射器三件套
npx jest tests/chinese-aesthetic/scene-pack/disk-emitter.test.ts tests/chinese-aesthetic/scene-pack/disk-security.test.ts tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts --runInBand

# 全量回归
npx jest tests/chinese-aesthetic/ --runInBand

# TypeScript
npx tsc --noEmit

# 历史边界
git diff --name-only 9df78d5 -- compiler-core/ evaluation/ schemas/
```

## 回滚点

若测试失败，可 `git checkout 9df78d5 -- chinese-aesthetic/scene-pack/crash-recovery.ts chinese-aesthetic/scene-pack/disk-validator.ts` 回退代码变更，保留测试文件用于调试。
