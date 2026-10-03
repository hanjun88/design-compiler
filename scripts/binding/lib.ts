/**
 * Shared by pin-binding.ts and verify-binding.ts. The binding (contracts/binding/binding.json) is the
 * only record of which chinese-aesthetic-skill build this compiler accepts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CONTRACT_LOCK } from "../../skill-bridge/contract";
import type { AestheticConstraintSheet } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";

export const REPO_ROOT = resolve(__dirname, "..", "..");
export const BINDING_PATH = join(REPO_ROOT, "contracts", "binding", "binding.json");

export function skillDir(arg?: string): string {
  const dir = resolve(arg ?? process.env.SKILL_DIR ?? join(REPO_ROOT, "..", "chinese-aesthetic-skill"));
  if (!existsSync(join(dir, "scripts", "emit-sheet.mjs"))) throw new Error(`no chinese-aesthetic-skill checkout at ${dir} (scripts/emit-sheet.mjs missing); set SKILL_DIR`);
  return dir;
}

const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export interface SkillCheckout {
  dir: string;
  commit: string;
  clean: boolean;
  version: string;
  repository: string;
  contractPin: { repository: string; ref: string; schema_version: string; contract_hash: string };
}

export function inspectSkill(dir: string): SkillCheckout {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const repository = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(pkg.repository?.url ?? "")?.[1];
  if (!repository) throw new Error("skill package.json repository.url is not a GitHub URL");
  return {
    dir,
    commit: git(dir, "rev-parse", "HEAD"),
    clean: git(dir, "status", "--porcelain", "--untracked-files=normal").length === 0,
    version: pkg.version,
    repository,
    contractPin: JSON.parse(readFileSync(join(dir, "contract", "dc-contract.pin.json"), "utf8")),
  };
}

/** Emit the sheet of every valid context with the skill's own generator; returns the parsed sheets. */
export function emitAllSheets(dir: string): AestheticConstraintSheet[] {
  const out = mkdtempSync(join(tmpdir(), "acs-binding-"));
  execFileSync("node", [join(dir, "scripts", "emit-sheet.mjs"), "--all", "--out-dir", out], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return readdirSync(out).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
}

export const dcContract = () => ({ schema_version: CONTRACT_LOCK.schema_version, contract_hash: CONTRACT_LOCK.contract_hash });
