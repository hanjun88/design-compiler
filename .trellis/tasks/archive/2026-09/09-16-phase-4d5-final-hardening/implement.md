# Implement Plan: Phase 4-D.5

## Step 1: disk-emitter.ts 类型硬化
- [ ] 新增 AssetTruthClass 类型
- [ ] ManifestFileEntry.truthClass 改为必填（去掉 ?）
- [ ] 检查所有引用点兼容性

## Step 2: disk-validator.ts 原始路径先验拒绝
- [ ] sanitizeManifestEntryPath: normalize 前增加 rawSegments 先验校验
- [ ] 拒绝 `..`、`.`、空段（`//`）

## Step 3: crash-recovery.ts 扫描异常透传 + 残留状态
- [ ] findStrictSiblingDirs: 非 ENOENT 异常向上传播
- [ ] CrashRecoveryReport 新增 cleanedBackups/cleanedStagings/remainingBackups/remainingStagings
- [ ] executeStrictCleanup 统一清理逻辑
- [ ] 所有场景返回真实残留状态

## Step 4: 新增测试
- [ ] RAW-TOKEN-REJECT-01: assets/../assets/scene.webp, assets/./scene.webp 被先验拦截
- [ ] CLEANUP-RESIDUAL-TRUTH-02: Mock rmSync EACCES，remainingStagings 准确列出

## Step 5: 验证
- [ ] 三件套测试
- [ ] 全量回归
- [ ] tsc --noEmit
- [ ] 历史 ZERO DIFF

## Step 6: 提交并推送

## 验证命令
```bash
npx jest tests/chinese-aesthetic/scene-pack/disk-emitter.test.ts tests/chinese-aesthetic/scene-pack/disk-security.test.ts tests/chinese-aesthetic/scene-pack/disk-hardening.test.ts --runInBand
npx jest tests/chinese-aesthetic/ --runInBand
npx tsc --noEmit
git diff --name-only da50bb6 -- compiler-core/ evaluation/ schemas/
```
