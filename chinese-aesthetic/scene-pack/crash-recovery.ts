import * as fs from "node:fs/promises";
import * as path from "node:path";

export type CrashRecoveryAction =
  | "RESTORED_BACKUP"
  | "REMOVED_ORPHAN_BACKUPS"
  | "NO_ACTION";

export interface CrashRecoveryResult {
  action: CrashRecoveryAction;
  recoveredPath?: string;
  removedBackups: string[];
}

/**
 * Recover a target directory after interruption between target->backup and
 * staging->target. Recovery is conservative: exactly one backup is restored
 * only when the target is absent; backups are never selected arbitrarily.
 */
export async function recoverFromPreviousCrash(
  targetDir: string,
): Promise<CrashRecoveryResult> {
  const parent = path.dirname(targetDir);
  const base = path.basename(targetDir);
  const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);
  const backups = entries
    .filter((entry) => entry.name.startsWith(`${base}.backup-`))
    .map((entry) => entry.name)
    .sort();
  const targetExists = await fs
    .lstat(targetDir)
    .then(() => true)
    .catch(() => false);

  if (!targetExists && backups.length === 1) {
    const backupPath = path.join(parent, backups[0]);
    await fs.rename(backupPath, targetDir);
    return {
      action: "RESTORED_BACKUP",
      recoveredPath: targetDir,
      removedBackups: [],
    };
  }

  if (targetExists && backups.length > 0) {
    const removedBackups: string[] = [];
    for (const backup of backups) {
      await fs.rm(path.join(parent, backup), {
        recursive: true,
        force: true,
      });
      removedBackups.push(backup);
    }
    return { action: "REMOVED_ORPHAN_BACKUPS", removedBackups };
  }

  return { action: "NO_ACTION", removedBackups: [] };
}
