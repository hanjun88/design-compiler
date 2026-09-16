/**
 * Phase 4-D.2: Cross-Platform Path, Symlink Hardening & Strict Manifest
 *
 * DISK-HARD-01: Windows / UNC / mixed separator path blocking
 * DISK-HARD-02: Ancestral directory symlink escape blocking
 * DISK-HARD-03: Strict Manifest schema rejection (zero-tolerance)
 * DISK-HARD-04: Crash-state recovery simulation
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  resolveStrictSandboxedPath,
  resolveSandboxedPath,
  SecurityPathError,
} from "../../../chinese-aesthetic/scene-pack/safe-path";
import {
  validateManifestSchema,
  ManifestSchemaError,
} from "../../../chinese-aesthetic/scene-pack/disk-validator";
import {
  recoverFromPreviousCrashSync,
  type CrashRecoveryReport,
} from "../../../chinese-aesthetic/scene-pack/crash-recovery";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function makeValidManifest() {
  return {
    manifestVersion: "1.0.0",
    packVersion: "1.0.0",
    sceneId: "hardening-test",
    generatedAt: "2026-09-16T00:00:00.000Z",
    scenePackDigest: "c".repeat(64),
    rootHash: "f".repeat(64),
    fileCount: 1,
    files: [
      {
        path: "assets/scene.webp",
        sha256: "a".repeat(64),
        byteSize: 1024,
        mimeType: "image/webp",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// DISK-HARD-01: Windows / UNC / mixed separator path blocking
// ---------------------------------------------------------------------------

describe("DISK-HARD-01 [Cross-Platform Path & UNC Blocking]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-hard-01-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("反斜杠路径穿越 ..\\..\\foo.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "..\\..\\foo.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "..\\..\\foo.webp")).toThrow(/PATH_TRAVERSAL_TOKEN/);
  });

  test("反斜杠合法路径 assets\\sub\\scene.webp 被接受（统一分隔符）", () => {
    const result = resolveStrictSandboxedPath(tempBase, "assets\\sub\\scene.webp");
    expect(result).toBe(path.resolve(tempBase, "assets/sub/scene.webp"));
  });

  test("Windows 盘符路径 C:payload.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "C:payload.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "C:payload.webp")).toThrow(/DRIVE_OR_UNC_DETECTED/);
  });

  test("Windows 完整盘符路径 C:\\Windows\\System32 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "C:\\Windows\\System32")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "C:\\Windows\\System32")).toThrow(/DRIVE_OR_UNC_DETECTED/);
  });

  test("UNC 路径 \\\\server\\share\\evil.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "\\\\server\\share\\evil.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "\\\\server\\share\\evil.webp")).toThrow(/DRIVE_OR_UNC_DETECTED/);
  });

  test("正斜杠 UNC 路径 //server/share/evil.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "//server/share/evil.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "//server/share/evil.webp")).toThrow(/DRIVE_OR_UNC_DETECTED/);
  });

  test("混合分隔符穿越 assets/../outside.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "assets/../outside.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "assets/../outside.webp")).toThrow(/PATH_TRAVERSAL_TOKEN/);
  });

  test("单段点号 assets/./scene.webp 被拦截", () => {
    expect(() => resolveStrictSandboxedPath(tempBase, "assets/./scene.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(tempBase, "assets/./scene.webp")).toThrow(/PATH_TRAVERSAL_TOKEN/);
  });

  test("resolveSandboxedPath 兼容别名委托严格版本", () => {
    expect(() => resolveSandboxedPath(tempBase, "..\\..\\escape")).toThrow(SecurityPathError);
    expect(() => resolveSandboxedPath(tempBase, "C:\\Windows")).toThrow(SecurityPathError);
  });
});

// ---------------------------------------------------------------------------
// DISK-HARD-02: Ancestral directory symlink escape blocking
// ---------------------------------------------------------------------------

describe("DISK-HARD-02 [Ancestral Symlink Escape Blocking]", () => {
  let tempBase: string;
  let sandbox: string;
  let outside: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-hard-02-");
    sandbox = path.join(tempBase, "sandbox");
    outside = path.join(tempBase, "outside-real");
    fs.mkdirSync(sandbox, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    // 在外部目录放置一个真实文件
    fs.writeFileSync(path.join(outside, "secret.txt"), "sensitive-data");
  });

  afterEach(() => {
    removeDir(tempBase);
  });

  test("祖先目录为符号链接时，叶子文件解析被拦截（ANCESTRAL_SYMLINK_DETECTED）", () => {
    // sandbox/assets -> outside（符号链接目录）
    const assetsLink = path.join(sandbox, "assets");
    fs.symlinkSync(outside, assetsLink, "dir");

    // 解析 assets/secret.txt 应检测到 assets 本身是 symlink
    expect(() => resolveStrictSandboxedPath(sandbox, "assets/secret.txt")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(sandbox, "assets/secret.txt")).toThrow(/ANCESTRAL_SYMLINK_DETECTED/);
  });

  test("多级祖先目录中任一级为 symlink 均被拦截", () => {
    // sandbox/a -> outside（symlink）
    const aLink = path.join(sandbox, "a");
    fs.symlinkSync(outside, aLink, "dir");
    // 在 outside 下创建 b/ 目录
    fs.mkdirSync(path.join(outside, "b"), { recursive: true });

    expect(() => resolveStrictSandboxedPath(sandbox, "a/b/file.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(sandbox, "a/b/file.webp")).toThrow(/ANCESTRAL_SYMLINK_DETECTED/);
  });

  test("叶子文件为符号链接时被拦截", () => {
    // 在 sandbox 下创建 assets/ 真实目录
    fs.mkdirSync(path.join(sandbox, "assets"), { recursive: true });
    // sandbox/assets/scene.webp -> outside/secret.txt（symlink 文件）
    const sceneLink = path.join(sandbox, "assets", "scene.webp");
    fs.symlinkSync(path.join(outside, "secret.txt"), sceneLink, "file");

    expect(() => resolveStrictSandboxedPath(sandbox, "assets/scene.webp")).toThrow(SecurityPathError);
    expect(() => resolveStrictSandboxedPath(sandbox, "assets/scene.webp")).toThrow(/ANCESTRAL_SYMLINK_DETECTED/);
  });

  test("真实目录结构（无 symlink）正常通过", () => {
    fs.mkdirSync(path.join(sandbox, "assets", "sub"), { recursive: true });
    fs.writeFileSync(path.join(sandbox, "assets", "sub", "scene.webp"), "data");

    const result = resolveStrictSandboxedPath(sandbox, "assets/sub/scene.webp");
    expect(result).toBe(path.resolve(sandbox, "assets/sub/scene.webp"));
  });

  test("路径中不存在的中间段不触发 symlink 检测（仅词法校验）", () => {
    // sandbox/nonexistent/ 不存在，不应抛 ANCESTRAL_SYMLINK_DETECTED
    const result = resolveStrictSandboxedPath(sandbox, "nonexistent/sub/file.webp");
    expect(result).toBe(path.resolve(sandbox, "nonexistent/sub/file.webp"));
  });
});

// ---------------------------------------------------------------------------
// DISK-HARD-03: Strict Manifest schema rejection (zero-tolerance)
// ---------------------------------------------------------------------------

describe("DISK-HARD-03 [Strict Manifest Zero-Tolerance]", () => {
  test("缺失 manifestVersion 被拒绝（不静默填充）", () => {
    const m = makeValidManifest();
    delete (m as Record<string, unknown>).manifestVersion;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FIELD_MISSING/);
  });

  test("manifestVersion 为不支持版本被拒绝", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).manifestVersion = "2.0.0";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_UNSUPPORTED_VERSION/);
  });

  test("缺失 packVersion 被拒绝", () => {
    const m = makeValidManifest();
    delete (m as Record<string, unknown>).packVersion;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FIELD_MISSING/);
  });

  test("packVersion 为不支持版本被拒绝", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).packVersion = "0.9.0";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_UNSUPPORTED_VERSION/);
  });

  test("缺失 scenePackDigest 被拒绝", () => {
    const m = makeValidManifest();
    delete (m as Record<string, unknown>).scenePackDigest;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FIELD_MISSING/);
  });

  test("scenePackDigest 带 sha256: 前缀被拒绝（必须纯十六进制）", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).scenePackDigest = "sha256:" + "c".repeat(64);
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_HASH/);
  });

  test("scenePackDigest 大写十六进制被拒绝", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).scenePackDigest = "C".repeat(64);
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_HASH/);
  });

  test("缺失 generatedAt 被拒绝", () => {
    const m = makeValidManifest();
    delete (m as Record<string, unknown>).generatedAt;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FIELD_MISSING/);
  });

  test("缺失 sceneId 被拒绝", () => {
    const m = makeValidManifest();
    delete (m as Record<string, unknown>).sceneId;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FIELD_MISSING/);
  });

  test("byteSize 为非安全整数（NaN）被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).byteSize = NaN;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_INVALID_BYTESIZE/);
  });

  test("byteSize 为负数被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).byteSize = -1;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_INVALID_BYTESIZE/);
  });

  test("byteSize 为浮点数被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).byteSize = 1.5;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_INVALID_BYTESIZE/);
  });

  test("entry path 含盘符被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).path = "C:evil.webp";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_DRIVE_OR_UNC/);
  });

  test("entry path 含 .. 段被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).path = "assets/../escape.webp";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_TRAVERSAL_TOKEN/);
  });

  test("合法 manifest 通过严格校验", () => {
    const result = validateManifestSchema(makeValidManifest());
    expect(result.manifestVersion).toBe("1.0.0");
    expect(result.packVersion).toBe("1.0.0");
    expect(result.scenePackDigest).toBe("c".repeat(64));
    expect(result.files).toHaveLength(1);
  });

  test("MANIFEST-CANONICAL-03: 多形态重复路径注入被拦截（规范化去重）", () => {
    const m = makeValidManifest();
    // 两个声明在规范化后均为 assets/scene.webp
    m.files = [
      { path: "assets/scene.webp", sha256: "a".repeat(64), byteSize: 1024, mimeType: "image/webp" },
      { path: "./assets//scene.webp", sha256: "b".repeat(64), byteSize: 2048, mimeType: "image/webp" },
    ];
    m.fileCount = 2;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_DUPLICATE_PATH/);
  });

  test("MANIFEST-STRICT-04: 未知根字段被拒绝（严格闭包 Schema）", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).maliciousPayload = "exfiltrate-data";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_UNKNOWN_FIELDS_REJECTED/);
  });

  test("MANIFEST-STRICT-04b: 未知 entry 字段被拒绝", () => {
    const m = makeValidManifest();
    (m.files[0] as Record<string, unknown>).injectedField = "evil";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_UNKNOWN_FIELDS/);
  });

  test("可选字段 evidenceDigest 存在时必须为合法 SHA-256", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).evidenceDigest = "e".repeat(64);
    const result = validateManifestSchema(m);
    expect((result as unknown as Record<string, unknown>).evidenceDigest).toBe("e".repeat(64));
  });

  test("可选字段 evidenceDigest 格式非法时被拒绝", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>).evidenceDigest = "not-a-hash";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_OPTIONAL_HASH/);
  });
});

// ---------------------------------------------------------------------------
// DISK-HARD-04: Crash-state recovery simulation
// ---------------------------------------------------------------------------

describe("DISK-HARD-04 [Crash-State Recovery]", () => {
  let tempBase: string;
  let targetDir: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-hard-04-");
    targetDir = path.join(tempBase, "output");
  });

  afterEach(() => {
    removeDir(tempBase);
  });

  test("target 缺失 + 单个孤儿 backup → 自动恢复", () => {
    // 构造崩溃现场：target 不存在，但有一个 backup 目录
    const backupDir = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ recovered: true }));
    fs.mkdirSync(path.join(backupDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(backupDir, "assets", "scene.webp"), "data");

    expect(fs.existsSync(targetDir)).toBe(false);

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    // target 应已从 backup 恢复
    expect(fs.existsSync(targetDir)).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "assets", "scene.webp"))).toBe(true);
    // backup 应已被移除（重命名为 target）
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(report.recovered).toBe(true);
    expect(report.action).toBe("RESTORED_FROM_BACKUP");
  });

  test("target 存在 + 孤儿 backup → 清理 backup，不恢复", () => {
    // 构造：target 存在（上次替换成功），但残留了 backup
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify({ current: true }));

    const backupDir = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "old.json"), "old-data");

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    // target 保持不变
    expect(fs.existsSync(targetDir)).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, "manifest.json"), "utf8")).toContain("current");
    // backup 被清理
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(report.recovered).toBe(true);
    expect(report.action).toBe("CLEANED_ORPHAN_BACKUPS");
  });

  test("target 缺失 + 多个孤儿 backup → 保守不恢复（歧义，需人工介入）", () => {
    const backup1 = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    const backup2 = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    fs.mkdirSync(backup1, { recursive: true });
    fs.mkdirSync(backup2, { recursive: true });

    expect(fs.existsSync(targetDir)).toBe(false);

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    // 歧义场景：不自动恢复，target 仍不存在
    expect(fs.existsSync(targetDir)).toBe(false);
    expect(report.recovered).toBe(false);
    expect(report.action).toBe("AMBIGUOUS_MANUAL_INTERVENTION_REQUIRED");
  });

  test("无孤儿目录 + target 不存在 → 无操作（全新输出）", () => {
    expect(fs.existsSync(targetDir)).toBe(false);

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    expect(fs.existsSync(targetDir)).toBe(false);
    expect(report.action).toBe("NO_ACTION_NEEDED");
    // recovered=true 表示系统处于健康状态（无残留问题），非"执行了恢复"
    expect(report.recovered).toBe(true);
  });

  test("无孤儿目录 + target 存在 → 无操作", () => {
    fs.mkdirSync(targetDir, { recursive: true });

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    expect(report.action).toBe("NO_ACTION_NEEDED");
    expect(report.recovered).toBe(true);
  });

  test("孤儿 staging 目录被清理", () => {
    const stagingDir = `${targetDir}.staging-${crypto.randomBytes(8).toString("hex")}`;
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, "partial.json"), "partial");

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(report.action).toBe("CLEANED_ORPHAN_STAGING");
    expect(report.recovered).toBe(true);
  });

  test("RECOV-MALICIOUS-01: 同前缀但格式不符的合法目录不被误删", () => {
    // 创建一个同前缀但不符合严格格式的用户合法目录
    const legitimateDir = `${targetDir}.backup-mydata`;
    fs.mkdirSync(legitimateDir, { recursive: true });
    fs.writeFileSync(path.join(legitimateDir, "important.txt"), "user-data");

    // 同时创建一个符合格式的孤儿 backup
    const realBackup = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    fs.mkdirSync(realBackup, { recursive: true });
    fs.writeFileSync(path.join(realBackup, "manifest.json"), "{}");

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    // 合法目录必须保留
    expect(fs.existsSync(legitimateDir)).toBe(true);
    expect(fs.existsSync(path.join(legitimateDir, "important.txt"))).toBe(true);
    // 真正的 backup 被恢复
    expect(fs.existsSync(targetDir)).toBe(true);
    expect(fs.existsSync(realBackup)).toBe(false);
    expect(report.action).toBe("RESTORED_FROM_BACKUP");
  });

  test("RECOV-SYMLINK-02: 符号链接恢复攻击被拒绝（RECOVERY_SYMLINK_EXPLOIT）", () => {
    // 创建外部目录（模拟攻击目标）
    const externalDir = path.join(tempBase, "external-sensitive");
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, "secret.txt"), "do-not-delete");

    // 创建符合格式的 backup 名称，但作为符号链接指向外部目录
    const maliciousBackup = `${targetDir}.backup-${crypto.randomBytes(8).toString("hex")}`;
    fs.symlinkSync(externalDir, maliciousBackup, "dir");

    expect(fs.existsSync(targetDir)).toBe(false);

    // 崩溃恢复应检测到 symlink 并拒绝，绝不删除外部目录
    expect(() => recoverFromPreviousCrashSync(targetDir)).toThrow(SecurityPathError);
    expect(() => recoverFromPreviousCrashSync(targetDir)).toThrow(/RECOVERY_SYMLINK_EXPLOIT/);

    // 外部目录必须完好无损
    expect(fs.existsSync(externalDir)).toBe(true);
    expect(fs.existsSync(path.join(externalDir, "secret.txt"))).toBe(true);
    // symlink 本身保留（未被删除）
    expect(fs.lstatSync(maliciousBackup).isSymbolicLink()).toBe(true);
  });

  test("RECOV-MALICIOUS-01b: staging 同前缀但格式不符不被误删", () => {
    const legitimateStaging = `${targetDir}.staging-userdata`;
    fs.mkdirSync(legitimateStaging, { recursive: true });
    fs.writeFileSync(path.join(legitimateStaging, "keep.txt"), "important");

    const report: CrashRecoveryReport = recoverFromPreviousCrashSync(targetDir);

    expect(fs.existsSync(legitimateStaging)).toBe(true);
    expect(report.action).toBe("NO_ACTION_NEEDED");
  });
});
