# Phase 4-D.5: Raw Token Reject, Residual Truth & Type Hardening

## Goal

修复 da50bb6 审查驳回的 4 项残余隐患，达成磁盘发射器法医级安全闭环，解除 Phase 5 BLOCKED。

## Requirements

### R1 (P0): 扫描异常审计透传（No Silent Ignore on Directory Scan）

`findStrictSiblingDirs` 中 `readdirSync` 或 `lstatSync` 的非 ENOENT 异常（EACCES/EPERM 等）不得被空 catch 静默过滤。仅 ENOENT 可放行（已物理消除），权限异常必须向上传播或记录，防止底层存储被劫持或损坏被掩盖。

### R2 (P1): 原始路径段先验拒绝（Path Token Zero-Tolerance Prior to Normalization）

`sanitizeManifestEntryPath` 必须在调用 `path.posix.normalize` 之前，对原始路径执行词法切分，包含 `..`、`.` 或空段（`//`）的输入直接抛出 `MANIFEST_INVALID_PATH`。严禁借由 normalize 自动"修复"非法路径（如 `assets/../assets/scene.webp` 不得被消解为合法路径）。

### R3 (P1): 清理账本状态绝对真实性（Accurate Residual State Reporting）

`CrashRecoveryReport` 新增 `cleanedBackups`、`cleanedStagings`、`remainingBackups`、`remainingStagings` 字段。清理失败时，未成功删除的目录必须如实保留在 remaining 列表中，严禁将 backupDirs/stagingDirs 直接清空掩盖物理残留。`cleanupFailures` 必须与残留目录可交叉验证。

### R4 (P1): 类型层与运行时契约硬对齐（Type Contract Hardening）

`ManifestFileEntry.truthClass` 从可选（`truthClass?: string`）升格为强制必填（`truthClass: AssetTruthClass`），其中 `AssetTruthClass = 'SOURCE' | 'DERIVED' | 'GENERATED'`。运行时校验与 TypeScript 类型层必须一致。

## Acceptance Criteria

- [ ] RAW-TOKEN-REJECT-01: `assets/../assets/scene.webp` 与 `assets/./scene.webp` 被先验拦截，抛 `MANIFEST_INVALID_PATH: Illegal raw segment`
- [ ] CLEANUP-RESIDUAL-TRUTH-02: Mock rmSync EACCES 时，`remainingStagings` 准确列出未清除目录，`recovered === false`
- [ ] STRICT-TYPE-CHECK-03: `tsc --noEmit` 全域无 truthClass 强制必选引发的类型不兼容
- [ ] P0 扫描异常: findStrictSiblingDirs 非 ENOENT 异常向上传播
- [ ] chinese-aesthetic 全量测试通过
- [ ] 历史目录 ZERO DIFF

## Non-Goals

- 不实现 TOCTOU 竞态防护（仅在文档中说明边界）
- 不配置 GitHub Actions（P2，超出本轮范围）
- 不进入 Phase 5 Runtime Integration
