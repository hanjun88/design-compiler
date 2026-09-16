/**
 * Phase 4-D.3: Crash Recovery — Strict Matching & Symlink Defense
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
 * Phase 4-D.3 加固：
 *   - 严格正则匹配（^base\.backup-[a-f0-9]{16}$），防止误删同名前缀合法目录
 *   - 符号链接诱导删除防御（Symlink Deletion Defense）：rm/rename 前 lstat 校验
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
// 严格匹配与安全辅助（Phase 4-D.3）
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
 * 严禁使用 startsWith 宽松匹配，防止误删如 <base>.backup-mydata/ 等用户合法目录。
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
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * 符号链接诱导删除防御（Symlink Deletion Defense）。
 *
 * 在执行 rmSync 或 renameSync 前，必须 lstat 校验目标自身是否为软链接。
 * 若为软链接，判定为外部对抗攻击，拒绝执行破坏性操作。
 *
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT
 */
function assertNotSymlink(dirPath: string): void {
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) {
      throw new SecurityPathError(
        `Malicious symlink detected in recovery candidate: ${dirPath}`,
        "RECOVERY_SYMLINK_EXPLOIT",
      );
    }
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    // 文件不存在时不抛错（由调用方处理）
  }
}

/**
 * 安全删除目录：先校验非 symlink，再递归删除。
 * 删除失败不阻断主流程，由调用方审计。
 */
function removeDirSafe(dir: string): void {
  try {
    assertNotSymlink(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (err instanceof SecurityPathError) throw err;
    // 其他删除失败静默处理（文件可能已被移除）
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
 * @throws SecurityPathError RECOVERY_SYMLINK_EXPLOIT 当候选目录为符号链接时
 */
export function recoverFromPreviousCrashSync(targetDir: string): CrashRecoveryReport {
  const backupDirs = findStrictSiblingDirs(targetDir, "backup");
  const stagingDirs = findStrictSiblingDirs(targetDir, "staging");
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
      // rename 前校验 backup 非 symlink（防止符号链接诱导）
      assertNotSymlink(backupPath);
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
      if (err instanceof SecurityPathError) throw err;
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
