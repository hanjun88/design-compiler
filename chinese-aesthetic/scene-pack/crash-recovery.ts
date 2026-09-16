/**
 * Phase 4-D.5: Crash Recovery — Scan Exception Propagation & Residual Truth
 *
 * DiskEmitter 使用两阶段提交：rename(target → backup) → rename(staging → target)。
 * 若进程在两次 rename 之间被 SIGKILL / 断电 / OOM 终止，将留下：
 *   - target 不存在（已被挪走）
 *   - <target>.backup-<16hex> 存在（原目录的安全副本）
 *   - <target>.staging-<16hex> 可能存在（未完成的新目录）
 *
 * 本模块在 emit() 入口执行前置探测与自愈：
 *   - 单个孤儿 backup + target 缺失 → 自动恢复（rename backup → target）
 *   - target 存在 + 孤儿 backup → 清理残留 backup
 *   - 多个孤儿 backup + target 缺失 → 保守不恢复，报告需人工介入
 *
 * Phase 4-D.5 加固：
 *   - 扫描异常审计透传：findStrictSiblingDirs 非 ENOENT 异常向上传播，禁止空 catch 掩盖存储故障
 *   - 清理账本状态绝对真实性：remainingBackups/remainingStagings 如实记录未删除的物理残留
 *   - 断链符号链接物理先验拦截：lstatSync 主导探测
 *   - 清理故障完整审计账本化：cleanupFailures + cleaned/remaining 可交叉验证
 *
 * TOCTOU 边界声明：当前实现不提供 Time-of-check to time-of-use 竞态防护。
 * assertNotSymlink 与 fs.rmSync 之间存在理论窗口，攻击者可在校验后替换为 symlink。
 * 本阶段仅声明此边界，不实现文件描述符级防护。
 *
 * 定性：这是"可回滚的两阶段目录替换"的崩溃自愈补充，
 * 并非严格崩溃安全的原子提交（不提供事务日志或 WAL）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { SecurityPathError } from "./safe-path";

// ---------------------------------------------------------------------------
// 恢复报告
// ---------------------------------------------------------------------------

export type RecoveryAction =
  | "NO_ACTION_NEEDED"
  | "RESTORED_FROM_BACKUP"
  | "CLEANED_ORPHAN_BACKUPS"
  | "AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED"
  | "CLEANED_ORPHAN_STAGING";

/** 清理失败审计条目 */
export interface CleanupFailure {
  readonly path: string;
  readonly error: string;
}

export interface CrashRecoveryReport {
  /** 执行的恢复动作 */
  action: RecoveryAction;
  /** 目标目录 */
  targetDir: string;
  /** 初始发现的 backup 目录列表（保留兼容） */
  backupDirs: string[];
  /** 初始发现的 staging 目录列表（保留兼容） */
  stagingDirs: string[];
  /** 恢复是否成功（无残留问题、无清理失败） */
  recovered: boolean;
  /** 详细信息 */
  message: string;
  /** 清理失败审计账本：EACCES/EBUSY 等删除失败项 */
  cleanupFailures: CleanupFailure[];
  /** Phase 4-D.5: 成功清理的 backup 目录 */
  cleanedBackups: string[];
  /** Phase 4-D.5: 成功清理的 staging 目录 */
  cleanedStagings: string[];
  /** Phase 4-D.5: 未成功清理、仍残留在磁盘上的 backup 目录 */
  remainingBackups: string[];
  /** Phase 4-D.5: 未成功清理、仍残留在磁盘上的 staging 目录 */
  remainingStagings: string[];
}

// ---------------------------------------------------------------------------
// 严格匹配与安全辅助
// ---------------------------------------------------------------------------

/** 转义正则特殊字符 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 严格匹配崩溃产物目录名。
 *
 * backup 格式：<base>.backup-<16位小写十六进制>
 * staging 格式：<base>.staging-<16位小写十六进制>
 *
 * Phase 4-D.5：非 ENOENT 异常必须向上传播，禁止空 catch 静默过滤。
 * 仅 ENOENT（已物理消除）可放行；EACCES/EPERM 等权限异常可能指示底层存储被劫持或损坏。
 */
function findStrictSiblingDirs(targetDir: string, kind: "backup" | "staging"): string[] {
  const parent = path.dirname(targetDir);
  const base = path.basename(targetDir);
  if (!fs.existsSync(parent)) return [];

  const regex = new RegExp(`^${escapeRegExp(base)}\\.${kind}-[a-f0-9]{16}$`);

  let entries: string[];
  try {
    entries = fs.readdirSync(parent);
  } catch (err) {
    // 仅 ENOENT 可放行（目录已被并发移除），其他异常向上传播
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return entries
    .filter((name) => regex.test(name))
    .map((name) => path.join(parent, name))
    .filter((p) => {
      try {
        // lstatSync 不跟随符号链接：真实目录 isDirectory()=true，
        // 断链/有效 symlink isSymbolicLink()=true，均纳入候选；
        // 普通文件两者均 false，被过滤。
        const stat = fs.lstatSync(p);
        return stat.isDirectory() || stat.isSymbolicLink();
      } catch (err) {
        // 仅 ENOENT 可放行（文件已被并发移除），其他异常向上传播
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw err;
      }
    });
}

/**
 * 符号链接诱导删除防御（Symlink Deletion Defense），含断链检测。
 *
 * 直接以 lstatSync 作为探测入口，不经过 existsSync 先验（existsSync 跟随链接，
 * 断链 symlink 返回 false 会绕过防御）。
 *
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当目标为符号链接（含断链）
 */
function assertNotSymlink(dirPath: string): void {
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) {
      throw new SecurityPathError(
        `Malicious symlink detected in recovery candidate (including dangling): ${dirPath}`,
        "RECOVERY_SYMLINK_EXPLOIT",
      );
    }
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    // ENOENT：真正不存在，放行（由调用方处理）
    // 其他错误（EACCES 等）向上传播
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

/**
 * Phase 4-D.5: 严格清理状态累加器。
 *
 * 如实记录每个候选目录的清理结果：cleaned（成功删除）、remaining（删除失败仍残留）、
 * failures（失败详情）。remaining 与 failures 必须可交叉验证。
 */
interface StrictCleanupState {
  cleaned: string[];
  remaining: string[];
  failures: CleanupFailure[];
}

/**
 * Phase 4-D.5: 审计化目录删除，如实记录残留状态。
 *
 * 先校验非 symlink，再递归删除。
 * - 成功 → cleaned.push
 * - 失败（非 SecurityPathError）→ failures.push + remaining.push（如实保留物理残留）
 * - SecurityPathError → 向上抛出（安全违规不可静默）
 *
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当目标为符号链接
 */
function executeStrictCleanup(dir: string, state: StrictCleanupState): void {
  try {
    assertNotSymlink(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    state.cleaned.push(dir);
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    state.failures.push({
      path: dir,
      error: err instanceof Error ? err.message : String(err),
    });
    state.remaining.push(dir);
  }
}

// ---------------------------------------------------------------------------
// 同步崩溃恢复（供 DiskEmitter.emit() 同步入口调用）
// ---------------------------------------------------------------------------

/**
 * 探测前次进程崩溃遗留的孤儿 backup/staging 并执行自愈（同步版本）。
 *
 * 在 DiskEmitter.emit() 建立 staging 之前调用，确保目标目录处于已知状态。
 *
 * @param targetDir 目标输出目录
 * @returns CrashRecoveryReport 恢复动作审计记录（含 cleanupFailures + remaining 状态）
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当候选目录为符号链接（含断链）
 */
export function recoverFromPreviousCrashSync(targetDir: string): CrashRecoveryReport {
  const backupDirs = findStrictSiblingDirs(targetDir, "backup");
  const stagingDirs = findStrictSiblingDirs(targetDir, "staging");
  const targetExists = fs.existsSync(targetDir);
  const state: StrictCleanupState = { cleaned: [], remaining: [], failures: [] };

  // ── 场景 A：目标存在，无 backup ──
  if (targetExists && backupDirs.length === 0) {
    for (const s of stagingDirs) {
      executeStrictCleanup(s, state);
    }
    const recovered = state.failures.length === 0;
    return {
      action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
      targetDir,
      backupDirs,
      stagingDirs: [],
      recovered,
      message: stagingDirs.length > 0
        ? `Target exists, cleaned ${state.cleaned.length}/${stagingDirs.length} orphan staging dir(s)`
        : "Target exists, no crash artifacts detected",
      cleanupFailures: state.failures,
      cleanedBackups: [],
      cleanedStagings: [...state.cleaned],
      remainingBackups: [],
      remainingStagings: [...state.remaining],
    };
  }

  // ── 场景 B：目标存在，有孤儿 backup（上次替换成功但 backup 清理中断）──
  if (targetExists && backupDirs.length > 0) {
    const backupState: StrictCleanupState = { cleaned: [], remaining: [], failures: [] };
    const stagingState: StrictCleanupState = { cleaned: [], remaining: [], failures: [] };

    for (const b of backupDirs) {
      executeStrictCleanup(b, backupState);
    }
    for (const s of stagingDirs) {
      executeStrictCleanup(s, stagingState);
    }

    const allFailures = [...backupState.failures, ...stagingState.failures];
    const recovered = allFailures.length === 0;

    return {
      action: "CLEANED_ORPHAN_BACKUPS",
      targetDir,
      backupDirs: [],
      stagingDirs: [],
      recovered,
      message: `Target exists, cleaned ${backupState.cleaned.length}/${backupDirs.length} backup(s), ${stagingState.cleaned.length}/${stagingDirs.length} staging(s)`,
      cleanupFailures: allFailures,
      cleanedBackups: [...backupState.cleaned],
      cleanedStagings: [...stagingState.cleaned],
      remainingBackups: [...backupState.remaining],
      remainingStagings: [...stagingState.remaining],
    };
  }

  // ── 场景 C：目标不存在，恰好 1 个 backup（两次 rename 之间崩溃）──
  if (!targetExists && backupDirs.length === 1) {
    const backupPath = backupDirs[0];
    try {
      // rename 前校验 backup 非 symlink（含断链检测）
      assertNotSymlink(backupPath);
      fs.renameSync(backupPath, targetDir);
      for (const s of stagingDirs) {
        executeStrictCleanup(s, state);
      }
      const recovered = state.failures.length === 0;
      return {
        action: "RESTORED_FROM_BACKUP",
        targetDir,
        backupDirs: [],
        stagingDirs: [],
        recovered,
        message: `Restored target from backup: ${backupPath}`,
        cleanupFailures: state.failures,
        cleanedBackups: [backupPath],
        cleanedStagings: [...state.cleaned],
        remainingBackups: [],
        remainingStagings: [...state.remaining],
      };
    } catch (err) {
      if (err instanceof SecurityPathError) throw err;
      return {
        action: "AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED",
        targetDir,
        backupDirs,
        stagingDirs,
        recovered: false,
        message: `Failed to restore from backup ${backupPath}: ${err instanceof Error ? err.message : String(err)}`,
        cleanupFailures: state.failures,
        cleanedBackups: [],
        cleanedStagings: [...state.cleaned],
        remainingBackups: [...backupDirs],
        remainingStagings: [...state.remaining, ...stagingDirs],
      };
    }
  }

  // ── 场景 D：目标不存在，多个 backup（歧义，保守不恢复）──
  if (!targetExists && backupDirs.length > 1) {
    return {
      action: "AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED",
      targetDir,
      backupDirs,
      stagingDirs,
      recovered: false,
      message: `Multiple (${backupDirs.length}) orphan backups found and target missing — manual intervention required. Backups: ${backupDirs.join(", ")}`,
      cleanupFailures: [],
      cleanedBackups: [],
      cleanedStagings: [],
      remainingBackups: [...backupDirs],
      remainingStagings: [...stagingDirs],
    };
  }

  // ── 场景 E：目标不存在，无 backup（全新输出，清理可能的 staging）──
  for (const s of stagingDirs) {
    executeStrictCleanup(s, state);
  }
  const recovered = state.failures.length === 0;
  return {
    action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
    targetDir,
    backupDirs: [],
    stagingDirs: [],
    recovered,
    message: "Target does not exist, no backup available",
    cleanupFailures: state.failures,
    cleanedBackups: [],
    cleanedStagings: [...state.cleaned],
    remainingBackups: [],
    remainingStagings: [...state.remaining],
  };
}

// ---------------------------------------------------------------------------
// 异步崩溃恢复（供未来 async emitter 使用）
// ---------------------------------------------------------------------------

/**
 * 异步版本的崩溃恢复。
 */
export async function recoverFromPreviousCrash(targetDir: string): Promise<CrashRecoveryReport> {
  return recoverFromPreviousCrashSync(targetDir);
}
