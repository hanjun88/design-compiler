# Phase 4-D.4: Dangling Symlink, Strict Path Semantics & Cleanup Auditability

## Goal

修复 9df78d5 审查驳回的 4 项残余隐患，达成法医级磁盘发射器安全闭环。

## Requirements

### R1: 断链符号链接物理先验拦截 (Dangling Symlink Prevention)

`findStrictSiblingDirs` 必须使用 `lstatSync` 替代 `statSync` 进行候选目录过滤。`statSync` 跟随符号链接指针，断链 symlink 抛 ENOENT 被静默过滤，绕过后续 `assertNotSymlink` 防御。`lstatSync` 不跟随链接，断链 symlink 的 `isSymbolicLink()` 返回 true，被纳入候选集并由 `assertNotSymlink` 拒绝。

### R2: 规范化路径拓扑与目录形态封闭 (Canonical Path Semantics)

Manifest entry 路径必须经过严格语义校验：
- 统一为 POSIX 正斜杠分隔符
- 规范化后必须为非空字符串
- 严禁以 `/` 结尾（纯目录条目）
- 严禁包含 `..`、`.`、空段
- 必须为带合法扩展名的叶子文件

### R3: 清理故障完整审计账本化 (Cleanup Failure Auditability)

`CrashRecoveryReport` 新增 `cleanupFailures: readonly { path: string; error: string }[]` 字段。孤儿目录删除失败（EACCES/EBUSY 等）必须记录到账本，且 `recovered` 标记为 `false`，禁止静默吞掉。

### R4: 彻底拔除 Entry 默认值回填 (Entry No-Fallback)

Manifest entry 的 `path`、`sha256`、`byteSize`、`mimeType`、`truthClass` 五字段全必填。缺失任意一项触发 `MANIFEST_ENTRY_FIELD_MISSING`，禁止任何隐式默认值回填。

## Acceptance Criteria

- [ ] DANGLING-SYMLINK-01: 断链 symlink 作为 backup 目录时，崩溃恢复精确抛出 `RECOVERY_SYMLINK_EXPLOIT`
- [ ] MANIFEST-EMPTY-DIR-02: `./`、`assets/`、`assets//` 等路径被 `MANIFEST_INVALID_PATH` 拒绝
- [ ] CLEANUP-FAILURE-AUDIT-03: Mock `fs.rmSync` 抛 EACCES 时，`recovered === false` 且 `cleanupFailures` 包含失败路径
- [ ] ENTRY-NO-FALLBACK-04: 缺失 mimeType 或 truthClass 的 entry 被拒绝，无默认值回填
- [ ] chinese-aesthetic 全量测试通过（预期 464+4=468）
- [ ] TypeScript chinese-aesthetic/ 零错误
- [ ] 历史目录（compiler-core/、evaluation/）ZERO DIFF

## Non-Goals

- 不实现事务日志或 WAL（严格崩溃安全原子提交超出本阶段范围）
- 不修改 emitter 的两阶段提交流程
- 不进入 Phase 5 Runtime Integration
