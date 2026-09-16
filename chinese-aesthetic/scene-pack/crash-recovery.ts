/**
 * Phase 4-D.2: Crash Recovery for Two-Phase Directory Replacement
 *
 * DiskEmitter 使用两阶段提交：rename(target → backup) → rename(staging → target)。
 * 若进程在两次 rename 之间被 SIGKILL / 断电 / OOM 终止，将留下：
 *   - target 不存在（已被挪走）
 *   - <target>.backup-<hex> 存在（原目录的安全副本）
 *   - <target>.staging-<hex> 可能存在（未完成的新目录）
 *
 * 本模块在 emit() 入口执行前置探测与自愈：
 *   - 单个孤儿 backup + target 缺失 → 自动恢复（rename backup → target）
 *   - target 存在 + 孤儿 backup → 清理残留 backup
 *   - 多个孤儿 backup + target 缺失 → 保守不恢复，报告需人工介入
 *
 * 定性：这是"可回滚的两阶段目录替换"的崩溃自愈补充，
 * 并非严格崩溃安全的原子提交（不提供事务日志或 WAL）。
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 恢复报告
// ---------------------------------------------------------------------------

export type RecoveryAction =
  | "NO_ACTION_NEEDED"
  | "RESTORED_FROM_BACKUP"
  | "CLEANED_ORPHAN_BACKUPS"
  | "AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED"
  | "CLEANED_ORPHAN_STAGING";

export interface CrashRecoveryReport {
  /** 执行的恢复动作 */
  action: RecoveryAction;
  /** 目标目录 */
  targetDir: string;
  /** 发现的 backup 目录列表 */
  backupDirs: string[];
  /** 发现的 staging 目录列表 */
  stagingDirs: string[];
  /** 恢复是否成功（无残留问题） */
  recovered: boolean;
  /** 详细信息 */
  message: string;
}

// ---------------------------------------------------------------------------
// 扫描辅助
// ---------------------------------------------------------------------------

function findSiblingDirs(targetDir: string, prefix: string): string[] {
  const parent = path.dirname(targetDir);
  const base = path.basename(targetDir);
  if (!fs.existsSync(parent)) return [];
  try {
    return fs
      .readdirSync(parent)
      .filter((name) => name.startsWith(`${base}${prefix}`))
      .map((name) => path.join(parent, name))
      .filter((p) => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function removeDirSafe(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // 清理失败不阻断主流程，由调用方审计
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
 * @returns CrashRecoveryReport 恢复动作审计记录
 */
export function recoverFromPreviousCrashSync(targetDir: string): CrashRecoveryReport {
  const backupDirs = findSiblingDirs(targetDir, ".backup-");
  const stagingDirs = findSiblingDirs(targetDir, ".staging-");
  const targetExists = fs.existsSync(targetDir);

  // ── 场景 A：目标存在，无 backup ──
  if (targetExists && backupDirs.length === 0) {
    // 清理可能残留的 staging（上次失败但未崩溃的情况）
    for (const s of stagingDirs) {
      removeDirSafe(s);
    }
    return {
      action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
      targetDir,
      backupDirs,
      stagingDirs: [],
      recovered: true,
      message: stagingDirs.length > 0
        ? `Target exists, cleaned ${stagingDirs.length} orphan staging dir(s)`
        : "Target exists, no crash artifacts detected",
    };
  }

  // ── 场景 B：目标存在，有孤儿 backup（上次替换成功但 backup 清理中断）──
  if (targetExists && backupDirs.length > 0) {
    for (const b of backupDirs) {
      removeDirSafe(b);
    }
    for (const s of stagingDirs) {
      removeDirSafe(s);
    }
    return {
      action: "CLEANED_ORPHAN_BACKUPS",
      targetDir,
      backupDirs: [],
      stagingDirs: [],
      recovered: true,
      message: `Target exists, cleaned ${backupDirs.length} orphan backup dir(s)`,
    };
  }

  // ── 场景 C：目标不存在，恰好 1 个 backup（两次 rename 之间崩溃）──
  if (!targetExists && backupDirs.length === 1) {
    const backupPath = backupDirs[0];
    try {
      fs.renameSync(backupPath, targetDir);
      // 清理残留 staging
      for (const s of stagingDirs) {
        removeDirSafe(s);
      }
      return {
        action: "RESTORED_FROM_BACKUP",
        targetDir,
        backupDirs: [],
        stagingDirs: [],
        recovered: true,
        message: `Restored target from backup: ${backupPath}`,
      };
    } catch (err) {
      return {
        action: "AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED",
        targetDir,
        backupDirs,
        stagingDirs,
        recovered: false,
        message: `Failed to restore from backup ${backupPath}: ${err instanceof Error ? err.message : String(err)}`,
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
    };
  }

  // ── 场景 E：目标不存在，无 backup（全新输出，清理可能的 staging）──
  for (const s of stagingDirs) {
    removeDirSafe(s);
  }
  return {
    action: stagingDirs.length > 0 ? "CLEANED_ORPHAN_STAGING" : "NO_ACTION_NEEDED",
    targetDir,
    backupDirs: [],
    stagingDirs: [],
    recovered: true,
    message: "Target does not exist, no backup available",
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
