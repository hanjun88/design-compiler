/**
 * Phase 4-D.1: Disk Security — Negative Test Matrix
 *
 * DISK-SEC-01: Path Traversal Ingestion
 * DISK-SEC-02: Safe Replacement Rollback
 * DISK-SEC-03: Symlink Spoofing Rejection
 * DISK-SEC-04: Malformed Manifest Rejection
 * DISK-SEC-05: Atomic Staging Leak Prevention
 */

// Mock fs.renameSync 为可替换的 jest mock（默认调用原始实现），
// 用于 DISK-SEC-02 模拟 rename 失败触发回滚。
// ESM import * as fs 的命名空间属性不可重定义，必须通过 jest.mock 包装。
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    renameSync: jest.fn(actual.renameSync),
  };
});

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  DiskEmitter,
  ByteCaptureCompiler,
  compileAndEmitToDisk,
  type DiskEmitResult,
  type ProfessionalScenePack,
  type DualEvidenceBundle,
} from "../../../chinese-aesthetic/scene-pack";
import {
  DiskValidator,
  validateManifestSchema,
  ManifestSchemaError,
} from "../../../chinese-aesthetic/scene-pack/disk-validator";
import {
  resolveSandboxedPath,
  SecurityPathError,
  isSafeRelativePath,
} from "../../../chinese-aesthetic/scene-pack/safe-path";
import type { SceneCompilationIR, TracedSceneParameter } from "../../../chinese-aesthetic/scene-contract/types";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(
  __dirname,
  "../../../chinese-aesthetic/scene-pack/fixtures/golden-cyber-chinese-01/source",
);

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mp(v: number): TracedSceneParameter {
  return { value: v, appliedFromInstructionSeq: [0], provenanceHashes: ["x"] };
}

function mb(v: boolean): TracedSceneParameter<boolean> {
  return { value: v, appliedFromInstructionSeq: [0], provenanceHashes: ["x"] };
}

function makeGoldenIR(): SceneCompilationIR {
  return {
    schemaVersion: "1.0.0",
    sceneId: "sec-test",
    sourceProvenance: {
      validatedDesignIRHash: "a".repeat(64),
      aestheticExecutionPlanHash: "b".repeat(64),
      aestheticRuntimePlanHash: "c".repeat(64),
      compiledAt: "2026-09-16T00:00:00.000Z",
      compilerVersion: "test",
    },
    composition: { negativeSpaceRatio: mp(0.42), focalOffset: mp(0), clusterDensity: mp(0.35), axialSymmetry: mp(0.72) },
    spatial: { depthLayers: mp(5), atmosphericDensity: mp(0.25), horizonPosition: mp(0.52), occlusionRatio: mp(0.18) },
    material: { patinaLevel: mp(0.45), specularSharpness: mp(18), contrastRatio: mp(0.58), surfaceEntropy: mp(0.42) },
    lighting: { skyLuminance: mp(0.68), shadowTemperature: mp(0.38), mistDensity: mp(0.22), accentLuminance: mp(0.55) },
    camera: { fov: mp(55), pitch: mp(-5), yaw: mp(0), parallaxLayers: mp(3) },
    motion: { cameraMotionSmoothness: mp(0.6), opticalFlowCoherence: mp(0.55), motionContinuity: mp(0.65), isDynamic: mb(false) },
    assetBindings: {
      manifest: { manifestVersion: "1.0.0", sceneId: "sec-test", generatedAt: "2026-09-16T00:00:00.000Z", assets: [], totalAssets: 0, physicalAssetCount: 0, derivedAssetCount: 0 },
      hashes: {},
    },
    deterministicDigest: "x".repeat(64),
  };
}

/** 构造最小化 mock 场景包（用于直接测试 DiskEmitter 的路径守卫） */
function makeMockPack(maliciousFileName: string): { pack: ProfessionalScenePack; evidence: DualEvidenceBundle; bytes: Map<string, Uint8Array> } {
  const fileBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const fileHash = crypto.createHash("sha256").update(fileBytes).digest("hex");

  const pack = {
    packVersion: "1.0.0" as const,
    sceneId: "mock-sec-test",
    compiledAssets: {
      assets: [
        {
          assetId: "asset:malicious",
          fileName: maliciousFileName,
          status: "COMPILED" as const,
          sha256: fileHash,
          byteSize: fileBytes.length,
          mimeType: "application/octet-stream",
          truthClass: "DERIVED" as const,
          compilationStrategy: "DERIVED" as const,
          sourceRefs: [],
          compilationDurationMs: 0,
        },
      ],
    },
  } as unknown as ProfessionalScenePack;

  const evidence = {
    machine: { protocol: "1.0.0", sceneId: "mock", generatedAt: "2026-09-16T00:00:00.000Z", operations: [] },
    human: { protocol: "1.0.0", sceneId: "mock", generatedAt: "2026-09-16T00:00:00.000Z", dimensions: [] },
  } as unknown as DualEvidenceBundle;

  const bytes = new Map<string, Uint8Array>();
  bytes.set("asset:malicious", fileBytes);

  return { pack, evidence, bytes };
}

// ---------------------------------------------------------------------------
// DISK-SEC-01: Path Traversal Ingestion
// ---------------------------------------------------------------------------

describe("DISK-SEC-01 [Path Traversal Ingestion]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-sec-01-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("resolveSandboxedPath 拒绝 ../../etc/passwd 路径穿越", () => {
    expect(() => resolveSandboxedPath(tempBase, "../../etc/passwd")).toThrow(SecurityPathError);
    expect(() => resolveSandboxedPath(tempBase, "../../etc/passwd")).toThrow(/PATH_TRAVERSAL_TOKEN/);
  });

  test("resolveSandboxedPath 拒绝绝对路径", () => {
    expect(() => resolveSandboxedPath(tempBase, "/etc/passwd")).toThrow(SecurityPathError);
    expect(() => resolveSandboxedPath(tempBase, "/etc/passwd")).toThrow(/ABSOLUTE_PATH/);
  });

  test("resolveSandboxedPath 拒绝 null 字节注入", () => {
    expect(() => resolveSandboxedPath(tempBase, "assets/evil\0.webp")).toThrow(SecurityPathError);
    expect(() => resolveSandboxedPath(tempBase, "assets/evil\0.webp")).toThrow(/NULL_BYTE_DETECTED/);
  });

  test("resolveSandboxedPath 拒绝 Windows 盘符路径", () => {
    expect(() => resolveSandboxedPath(tempBase, "C:\\Windows\\System32")).toThrow(SecurityPathError);
  });

  test("resolveSandboxedPath 接受合法相对路径", () => {
    const result = resolveSandboxedPath(tempBase, "assets/scene.webp");
    expect(result).toBe(path.resolve(tempBase, "assets/scene.webp"));
  });

  test("isSafeRelativePath 正确识别恶意路径", () => {
    expect(isSafeRelativePath("../../etc/passwd")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("assets/scene.webp")).toBe(true);
  });

  test("DiskEmitter 拒绝恶意 fileName，不写入任何文件，不残留 staging", () => {
    const outputDir = path.join(tempBase, "output");
    // ../../escape.webp 经 path.join("assets", ...) 后为 ../escape.webp，逃逸沙箱
    const { pack, evidence, bytes } = makeMockPack("../../escape.webp");

    const emitter = new DiskEmitter();
    const result: DiskEmitResult = emitter.emit(pack, evidence, bytes, outputDir);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === "PATH_TRAVERSAL_TOKEN")).toBe(true);

    // 目标目录不应被创建
    expect(fs.existsSync(outputDir)).toBe(false);

    // 不应有任何 staging 目录残留
    const parent = path.dirname(outputDir);
    const leftovers = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
    expect(leftovers).toHaveLength(0);
  });

  test("DiskEmitter 拒绝含多级穿越的 fileName", () => {
    const outputDir = path.join(tempBase, "output2");
    const { pack, evidence, bytes } = makeMockPack("../../../tmp/evil.webp");

    const emitter = new DiskEmitter();
    const result = emitter.emit(pack, evidence, bytes, outputDir);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === "PATH_TRAVERSAL_TOKEN")).toBe(true);
    expect(fs.existsSync(outputDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DISK-SEC-02: Safe Replacement Rollback
// ---------------------------------------------------------------------------

describe("DISK-SEC-02 [Safe Replacement Rollback]", () => {
  let tempBase: string;
  const renameMock = fs.renameSync as unknown as jest.Mock;
  const originalRename = renameMock.getMockImplementation() as typeof fs.renameSync;

  beforeEach(() => {
    tempBase = makeTempDir("disk-sec-02-");
  });
  afterEach(() => {
    removeDir(tempBase);
    renameMock.mockImplementation(originalRename);
    renameMock.mockClear();
  });

  test("rename(staging→target) 失败时自动回滚，原目录完好无损", async () => {
    const outputDir = path.join(tempBase, "output");

    // 1. 先创建一个有内容的目标目录（模拟已存在的旧版本）
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "scene.json"), JSON.stringify({ version: "old" }));
    fs.mkdirSync(path.join(outputDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(outputDir, "assets/old.webp"), Buffer.from([0xAA, 0xBB]));
    const oldSceneHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(outputDir, "scene.json"))).digest("hex");

    // 2. Mock fs.renameSync：第一次（target→backup）成功，第二次（staging→target）抛 EBUSY
    let callCount = 0;
    renameMock.mockImplementation((oldPath: fs.PathLike, newPath: fs.PathLike) => {
      callCount++;
      if (callCount === 2) {
        // 第二次调用是 staging→target，模拟 EBUSY 失败
        const err = new Error("EBUSY: resource busy or locked") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      }
      // 第一次（target→backup）和第三次（backup→target 回滚）走原始实现
      return originalRename(oldPath, newPath);
    });

    // 3. 执行编译+落盘
    const ir = makeGoldenIR();
    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    // 4. 断言落盘失败
    expect(emitResult.success).toBe(false);
    expect(emitResult.rollbackPerformed).toBe(true);

    // 5. 断言原目录内容完好无损（回滚成功）
    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "scene.json"))).toBe(true);
    const restoredHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(outputDir, "scene.json"))).digest("hex");
    expect(restoredHash).toBe(oldSceneHash);
    expect(fs.existsSync(path.join(outputDir, "assets/old.webp"))).toBe(true);

    // 6. 不应有 backup 目录残留（回滚后 backup 已重命名回 target）
    const parent = path.dirname(outputDir);
    const backups = fs.readdirSync(parent).filter((f) => f.includes(".backup-"));
    expect(backups).toHaveLength(0);

    // 7. 不应有 staging 目录残留
    const stagings = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
    expect(stagings).toHaveLength(0);
  });

  test("目标目录不存在时 rename 失败不影响系统（无回滚对象）", async () => {
    const outputDir = path.join(tempBase, "fresh-output");

    // Mock renameSync 总是失败
    renameMock.mockImplementation(() => {
      const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });

    const ir = makeGoldenIR();
    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    expect(emitResult.success).toBe(false);
    // 目标目录不应存在（staging 写入成功但 rename 失败，staging 被清理）
    expect(fs.existsSync(outputDir)).toBe(false);

    // 无 staging 残留
    const parent = path.dirname(outputDir);
    if (fs.existsSync(parent)) {
      const stagings = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
      expect(stagings).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// DISK-SEC-03: Symlink Spoofing Rejection
// ---------------------------------------------------------------------------

describe("DISK-SEC-03 [Symlink Spoofing Rejection]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-sec-03-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("DiskValidator 检测到资产符号链接时拒绝（路径守卫 ANCESTRAL_SYMLINK 或 lstat SECURITY_REJECTED）", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    // 1. 正常落盘
    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    // 2. 将 assets/scene.webp 替换为指向 /etc/passwd 的符号链接
    const scenePath = path.join(outputDir, "assets/scene.webp");
    fs.unlinkSync(scenePath);
    fs.symlinkSync("/etc/passwd", scenePath);

    // 3. 验证器应检测到 symlink（路径守卫在 lstat 之前拦截，报 ANCESTRAL_SYMLINK_DETECTED）
    const validator = new DiskValidator();
    const result = validator.validate(outputDir);

    expect(result.valid).toBe(false);
    // 路径守卫或 lstat 任一环节检测到 symlink 即通过
    const symlinkDetected = result.errors.some(
      (e) => e.includes("ANCESTRAL_SYMLINK_DETECTED") || e.includes("SECURITY_REJECTED"),
    );
    expect(symlinkDetected).toBe(true);
    expect(result.errors.some((e) => e.includes("Symbolic link detected"))).toBe(true);
  });

  test("validateFile 对符号链接返回拒绝（ANCESTRAL_SYMLINK 或 SECURITY_REJECTED）", async () => {
    const outputDir = path.join(tempBase, "output2");
    const ir = makeGoldenIR();

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    // 替换 depth.webp 为 symlink（指向存在的文件，模拟越界读取）
    const depthPath = path.join(outputDir, "assets/depth.webp");
    fs.unlinkSync(depthPath);
    fs.symlinkSync("/etc/passwd", depthPath);

    const validator = new DiskValidator();
    const fileResult = validator.validateFile(outputDir, "assets/depth.webp");
    expect(fileResult.valid).toBe(false);
    expect(
      fileResult.error?.includes("ANCESTRAL_SYMLINK_DETECTED") ||
      fileResult.error?.includes("SECURITY_REJECTED"),
    ).toBe(true);
  });

  test("正常文件（非 symlink）通过验证", async () => {
    const outputDir = path.join(tempBase, "output3");
    const ir = makeGoldenIR();

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    const validator = new DiskValidator();
    const result = validator.validate(outputDir);
    expect(result.valid).toBe(true);
    expect(result.symlinkFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DISK-SEC-04: Malformed Manifest Rejection
// ---------------------------------------------------------------------------

describe("DISK-SEC-04 [Malformed Manifest Rejection]", () => {
  const validFile = {
    path: "assets/scene.webp",
    sha256: "a".repeat(64),
    byteSize: 1024,
    mimeType: "image/webp",
    truthClass: "SOURCE",
  };

  function makeValidManifest() {
    return {
      manifestVersion: "1.0.0",
      packVersion: "1.0.0",
      sceneId: "test",
      generatedAt: "2026-09-16T00:00:00.000Z",
      scenePackDigest: "c".repeat(64),
      rootHash: "f".repeat(64),
      fileCount: 1,
      files: [validFile],
    };
  }

  test("合法 manifest 通过 schema 校验", () => {
    const result = validateManifestSchema(makeValidManifest());
    expect(result.rootHash).toBe("f".repeat(64));
    expect(result.files).toHaveLength(1);
  });

  test("rootHash 非 64 位十六进制被拒绝", () => {
    const m = makeValidManifest();
    m.rootHash = "not-a-hash";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_ROOT_HASH/);
  });

  test("rootHash 大写十六进制被拒绝（必须小写）", () => {
    const m = makeValidManifest();
    m.rootHash = "A".repeat(64);
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_ROOT_HASH/);
  });

  test("rootHash 含特殊字符被拒绝", () => {
    const m = makeValidManifest();
    m.rootHash = "g".repeat(64); // 'g' 不是十六进制
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
  });

  test("fileCount 与 files.length 不一致被拒绝", () => {
    const m = makeValidManifest();
    m.fileCount = 99;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FILECOUNT_MISMATCH/);
  });

  test("files 不是数组被拒绝", () => {
    const m = makeValidManifest();
    (m as Record<string, unknown>)["files"] = "not-an-array";
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_FILES_NOT_ARRAY/);
  });

  test("重复路径声明被拒绝", () => {
    const m = makeValidManifest();
    m.files = [validFile, { ...validFile }];
    m.fileCount = 2;
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_DUPLICATE_PATH/);
  });

  test("entry 中绝对路径被拒绝", () => {
    const m = makeValidManifest();
    m.files = [{ ...validFile, path: "/etc/passwd" }];
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_INVALID_PATH/);
  });

  test("entry 中非法 SHA-256 被拒绝", () => {
    const m = makeValidManifest();
    m.files = [{ ...validFile, sha256: "too-short" }];
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_INVALID_HASH/);
  });

  test("entry 中负 byteSize 被拒绝", () => {
    const m = makeValidManifest();
    m.files = [{ ...validFile, byteSize: -1 }];
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(m)).toThrow(/MANIFEST_ENTRY_INVALID_BYTESIZE/);
  });

  test("entry 中 null 字节路径被拒绝", () => {
    const m = makeValidManifest();
    m.files = [{ ...validFile, path: "assets/evil\0.webp" }];
    expect(() => validateManifestSchema(m)).toThrow(ManifestSchemaError);
  });

  test("manifest 根不是对象被拒绝", () => {
    expect(() => validateManifestSchema(null)).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema("string")).toThrow(ManifestSchemaError);
    expect(() => validateManifestSchema(42)).toThrow(ManifestSchemaError);
  });

  test("DiskValidator.validate 对畸形 manifest 返回 valid=false", () => {
    const tempDir = makeTempDir("disk-sec-04-manifest-");
    try {
      // 写入一个畸形 manifest
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "manifest.json"),
        JSON.stringify({ rootHash: "bad", files: [], fileCount: 0 }),
      );

      const validator = new DiskValidator();
      const result = validator.validate(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("schema validation failed"))).toBe(true);
      expect(result.manifest).toBeNull();
    } finally {
      removeDir(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// DISK-SEC-05: Atomic Staging Leak Prevention
// ---------------------------------------------------------------------------

describe("DISK-SEC-05 [Atomic Staging Leak Prevention]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-sec-05-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("资产字节缺失时落盘失败，不残留 .staging-* 目录", () => {
    const outputDir = path.join(tempBase, "output");

    // 构造一个 pack，其资产在 bytes map 中不存在
    const pack = {
      packVersion: "1.0.0" as const,
      sceneId: "leak-test",
      compiledAssets: {
        assets: [
          {
            assetId: "asset:missing",
            fileName: "missing.webp",
            status: "COMPILED" as const,
            sha256: "a".repeat(64),
            byteSize: 100,
            mimeType: "image/webp",
            truthClass: "DERIVED" as const,
            compilationStrategy: "DERIVED" as const,
            sourceRefs: [],
            compilationDurationMs: 0,
          },
        ],
      },
    } as unknown as ProfessionalScenePack;

    const evidence = {
      machine: { protocol: "1.0.0", sceneId: "leak", generatedAt: "2026-09-16T00:00:00.000Z", operations: [] },
      human: { protocol: "1.0.0", sceneId: "leak", generatedAt: "2026-09-16T00:00:00.000Z", dimensions: [] },
    } as unknown as DualEvidenceBundle;

    const emptyBytes = new Map<string, Uint8Array>();

    const emitter = new DiskEmitter();
    const result = emitter.emit(pack, evidence, emptyBytes, outputDir);

    expect(result.success).toBe(false);
    expect(result.tempDirCleaned).toBe(true);
    expect(fs.existsSync(outputDir)).toBe(false);

    // 检查父目录下无 staging 残留
    const parent = path.dirname(outputDir);
    const stagings = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
    expect(stagings).toHaveLength(0);
  });

  test("路径穿越失败时不残留 staging 目录", () => {
    const outputDir = path.join(tempBase, "output2");
    const { pack, evidence, bytes } = makeMockPack("../../escape.webp");

    const emitter = new DiskEmitter();
    const result = emitter.emit(pack, evidence, bytes, outputDir);

    expect(result.success).toBe(false);
    expect(result.tempDirCleaned).toBe(true);

    const parent = path.dirname(outputDir);
    const stagings = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
    expect(stagings).toHaveLength(0);
  });

  test("成功落盘后不残留 staging 或 backup 目录", async () => {
    const outputDir = path.join(tempBase, "output3");
    const ir = makeGoldenIR();

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    expect(emitResult.success).toBe(true);

    const parent = path.dirname(outputDir);
    const stagings = fs.readdirSync(parent).filter((f) => f.includes(".staging-"));
    const backups = fs.readdirSync(parent).filter((f) => f.includes(".backup-"));
    expect(stagings).toHaveLength(0);
    expect(backups).toHaveLength(0);
  });

  test("覆盖已有目录成功后不残留 backup 目录", async () => {
    const outputDir = path.join(tempBase, "output4");

    // 先创建旧版本
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "old.txt"), "old");

    const ir = makeGoldenIR();
    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    expect(emitResult.success).toBe(true);

    // 旧文件应被替换（不存在）
    expect(fs.existsSync(path.join(outputDir, "old.txt"))).toBe(false);

    // 无 backup 残留
    const parent = path.dirname(outputDir);
    const backups = fs.readdirSync(parent).filter((f) => f.includes(".backup-"));
    expect(backups).toHaveLength(0);
  });
});
