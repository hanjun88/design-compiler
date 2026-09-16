/**
 * Phase 4-D.4: Crash Recovery — Dangling Symlink, Cleanup Auditability
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
 * Phase 4-D.4 加固：
 *   - 断链符号链接物理先验拦截：lstatSync 主导探测，statSync 跟随链接导致断链穿透
 *   - 清理故障完整审计账本化：cleanupFailures 记录 EACCES/EBUSY 等删除失败，recovered=false
 *   - 严格正则匹配（^base\.backup-[a-f0-9]{16}$）
 *   - 符号链接诱导删除防御（Symlink Deletion Defense）
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
  /** 发现的 backup 目录列表 */
  backupDirs: string[];
  /** 发现的 staging 目录列表 */
  stagingDirs: string[];
  /** 恢复是否成功（无残留问题、无清理失败） */
  recovered: boolean;
  /** 详细信息 */
  message: string;
  /** 清理失败审计账本（Phase 4-D.4）：EACCES/EBUSY 等删除失败项 */
  cleanupFailures: CleanupFailure[];
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
 * Phase 4-D.4：使用 lstatSync 替代 statSync，确保断链符号链接（dangling symlink）
 * 也被纳入候选集——statSync 跟随链接指针，目标不存在时抛 ENOENT 被过滤掉，
 * 导致断链 symlink 穿透安全防御。
 */
function findStrictSiblingDirs(targetDir: string, kind: "backup" | "staging"): string[] {
  const parent = path.dirname(targetDir);
  const base = path.basename(targetDir);
  if (!fs.existsSync(parent)) return [];

  const regex = new RegExp(`^${escapeRegExp(base)}\\.${kind}-[a-f0-9]{16}$`);

  try {
    return fs
      .readdirSync(parent)
      .filter((name) => regex.test(name))
      .map((name) => path.join(parent, name))
      .filter((p) => {
        try {
          // lstatSync 不跟随符号链接：真实目录 isDirectory()=true，
          // 断链/有效 symlink isSymbolicLink()=true，均纳入候选；
          // 普通文件两者均 false，被过滤。
          const stat = fs.lstatSync(p);
          return stat.isDirectory() || stat.isSymbolicLink();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
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
 * 清理失败可变累加器（供 removeDirAudited 写入）。
 */
interface CleanupAccumulator {
  failures: CleanupFailure[];
}

/**
 * 审计化目录删除（Phase 4-D.4）。
 *
 * 先校验非 symlink，再递归删除。删除失败（EACCES/EBUSY 等）不静默吞掉，
 * 而是记录到 cleanupFailures 账本，最终 recovered 标记为 false。
 *
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当目标为符号链接
 */
function removeDirAudited(dir: string, acc: CleanupAccumulator): void {
  try {
    assertNotSymlink(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    acc.failures.push({
      path: dir,
      error: err instanceof Error ? err.message : String(err),
    });
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
 * @returns CrashRecoveryReport 恢复动作审计记录（含 cleanupFailures）
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当候选目录为符号链接（含断链）
 */
export function recoverFromPreviousCrashSync(targetDir: string): CrashRecoveryReport {
  const backupDirs = findStrictSiblingDirs(targetDir, "backup");
  const stagingDirs = findStrictSiblingDirs(targetDir, "staging");
  const targetExists = fs.existsSync(targetDir);
  const acc: CleanupAccumulator = { failures: [] };

  // ── 场景 A：目标存在，无 backup ──
  if (targetExists && backupDirs.length === 0) {
    for (const s of stagingDirs) {
      removeDirAudited(s, acc);
    }
    const recovered = acc.failures.length === 0;
    return {
      action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
      targetDir,
      backupDirs,
      stagingDirs: [],
      recovered,
      message: stagingDirs.length > 0
        ? `Target exists, cleaned ${stagingDirs.length} orphan staging dir(s)`
        : "Target exists, no crash artifacts detected",
      cleanupFailures: acc.failures,
    };
  }

  // ── 场景 B：目标存在，有孤儿 backup（上次替换成功但 backup 清理中断）──
  if (targetExists && backupDirs.length > 0) {
    for (const b of backupDirs) {
      removeDirAudited(b, acc);
    }
    for (const s of stagingDirs) {
      removeDirAudited(s, acc);
    }
    const recovered = acc.failures.length === 0;
    return {
      action: "CLEANED_ORPHAN_BACKUPS",
      targetDir,
      backupDirs: [],
      stagingDirs: [],
      recovered,
      message: `Target exists, cleaned ${backupDirs.length} orphan backup dir(s)`,
      cleanupFailures: acc.failures,
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
        removeDirAudited(s, acc);
      }
      const recovered = acc.failures.length === 0;
      return {
        action: "RESTORED_FROM_BACKUP",
        targetDir,
        backupDirs: [],
        stagingDirs: [],
        recovered,
        message: `Restored target from backup: ${backupPath}`,
        cleanupFailures: acc.failures,
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
        cleanupFailures: acc.failures,
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
    };
  }

  // ── 场景 E：目标不存在，无 backup（全新输出，清理可能的 staging）──
  for (const s of stagingDirs) {
    removeDirAudited(s, acc);
  }
  const recovered = acc.failures.length === 0;
  return {
    action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
    targetDir,
    backupDirs: [],
    stagingDirs: [],
    recovered,
    message: "Target does not exist, no backup available",
    cleanupFailures: acc.failures,
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
