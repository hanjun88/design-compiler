/**
 * Phase 4-D: Deterministic Disk Emitter — Acceptance Tests
 *
 * DISK-01 [Atomic Write Safety]: 进程异常中断或校验失败时，不留存破损的不完整目标目录
 * DISK-02 [Bit-Identical Readback]: 从磁盘重读出的所有文件哈希与内存编译结果 100% 一致
 * DISK-03 [Zero Drift on Re-emission]: 连续 5 次执行落盘流程，目标目录二进制不发生任何位漂移
 * DISK-04 [Tamper Evident]: 模拟修改任一 WebP 文件 1 字节，磁盘验证器拦截并报 HASH_MISMATCH
 * DISK-05 [History Boundary Protection]: 落盘模块为独立 emitter 组件，历史核心保持 ZERO DIFF
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SceneCompilationIR, TracedSceneParameter, SceneCapabilityBlocked } from "../../../chinese-aesthetic/scene-contract/types";
import {
  compileAndEmitToDisk,
  DiskEmitter,
  ByteCaptureCompiler,
} from "../../../chinese-aesthetic/scene-pack/disk-emitter";
import type { PackDirectoryManifest } from "../../../chinese-aesthetic/scene-pack/disk-emitter";
import { DiskValidator } from "../../../chinese-aesthetic/scene-pack/disk-validator";
import { GoldenPackCompiler } from "../../../chinese-aesthetic/scene-pack/golden-pack-compiler";
import { StandardAssetCompiler } from "../../../chinese-aesthetic/scene-pack/standard-asset-compiler";
import { sha256Bytes } from "../../../chinese-aesthetic/scene-pack/asset-ledger";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, "../../../chinese-aesthetic/scene-pack/fixtures/golden-cyber-chinese-01/source");

function makeParam(value: number, seq = 0): TracedSceneParameter {
  return { value, appliedFromInstructionSeq: [seq], provenanceHashes: ["sha256:disk-test-001"] };
}
function makeBoolParam(value: boolean, seq = 0): TracedSceneParameter<boolean> {
  return { value, appliedFromInstructionSeq: [seq], provenanceHashes: ["sha256:disk-test-001"] };
}

function makeGoldenIR(overrides?: Partial<SceneCompilationIR>): SceneCompilationIR {
  const ir: SceneCompilationIR = {
    schemaVersion: "1.0.0",
    sceneId: "scene:disk:cyber-chinese-01",
    sourceProvenance: {
      validatedDesignIRHash: "sha256:disk-ir-001",
      aestheticExecutionPlanHash: "sha256:disk-plan-001",
      aestheticRuntimePlanHash: "sha256:disk-runtime-001",
      compiledAt: "2026-09-16T00:00:00.000Z",
      compilerVersion: "disk-test-compiler@1.0.0",
    },
    composition: { negativeSpaceRatio: makeParam(0.42), focalOffset: makeParam(0), clusterDensity: makeParam(0.35), axialSymmetry: makeParam(0.72) },
    spatial: { depthLayers: makeParam(5), atmosphericDensity: makeParam(0.25), horizonPosition: makeParam(0.52), occlusionRatio: makeParam(0.18) },
    material: { patinaLevel: makeParam(0.45), specularSharpness: makeParam(18), contrastRatio: makeParam(0.58), surfaceEntropy: makeParam(0.42) },
    lighting: { skyLuminance: makeParam(0.68), shadowTemperature: makeParam(0.38), mistDensity: makeParam(0.22), accentLuminance: makeParam(0.55) },
    camera: { fov: makeParam(55), pitch: makeParam(-5), yaw: makeParam(0), parallaxLayers: makeParam(3) },
    motion: { cameraMotionSmoothness: makeParam(0.6), opticalFlowCoherence: makeParam(0.55), motionContinuity: makeParam(0.65), isDynamic: makeBoolParam(false) },
    assetBindings: { manifest: { manifestVersion: "1.0.0", sceneId: "scene:disk:cyber-chinese-01", generatedAt: "2026-09-16T00:00:00.000Z", assets: [], totalAssets: 0, physicalAssetCount: 0, derivedAssetCount: 0 }, hashes: {} },
    deterministicDigest: "sha256:disk-ir-digest-001",
    ...overrides,
  };
  return ir;
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function listFilesRecursive(dir: string, baseDir?: string): string[] {
  const base = baseDir ?? dir;
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, base));
    } else {
      results.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return results.sort();
}

function hashDirectory(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of listFilesRecursive(dir)) {
    const bytes = fs.readFileSync(path.join(dir, file));
    hashes[file] = sha256Bytes(bytes);
  }
  return hashes;
}

// 全局超时：单次编译+落盘约 1-2s
jest.setTimeout(120000);

// ---------------------------------------------------------------------------
// DISK-01: Atomic Write Safety
// ---------------------------------------------------------------------------

describe("DISK-01 [Atomic Write Safety]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-01-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("落盘失败时不创建目标目录，临时目录被清理", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    // 编译成功但传入空字节映射，触发 MISSING_ASSET_BYTES
    const compiler = new GoldenPackCompiler({ sourceAssetsDir: FIXTURES_DIR });
    const result = await compiler.compile(ir);
    expect(result.success).toBe(true);

    const emitter = new DiskEmitter();
    const emitResult = emitter.emit(
      result.pack!,
      result.evidence!,
      new Map(), // 空字节映射 → 所有资产 MISSING_ASSET_BYTES
      outputDir,
    );

    expect(emitResult.success).toBe(false);
    expect(emitResult.errors.length).toBeGreaterThan(0);
    expect(emitResult.errors[0].code).toBe("MISSING_ASSET_BYTES");
    expect(emitResult.tempDirCleaned).toBe(true);

    // 目标目录不应存在
    expect(fs.existsSync(outputDir)).toBe(false);

    // 不应有任何 .tmp-* 残留
    const tmpEntries = fs.readdirSync(tempBase).filter((f) => f.startsWith("output.tmp-"));
    expect(tmpEntries.length).toBe(0);
  });

  test("成功落盘后目标目录结构完整", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    expect(emitResult.success).toBe(true);
    expect(fs.existsSync(outputDir)).toBe(true);

    const files = listFilesRecursive(outputDir);
    expect(files).toContain("manifest.json");
    expect(files).toContain("scene.json");
    expect(files).toContain("evidence/machine-provenance.json");
    expect(files).toContain("evidence/human-audit-ledger.json");
    expect(files).toContain("assets/scene.webp");
    expect(files).toContain("assets/depth.webp");
    expect(files).toContain("assets/water-mask.webp");
    expect(files).toContain("assets/water-normal.webp");
    expect(files).toContain("assets/gate-colossus.webp");
    expect(files).toContain("assets/gate-left.webp");
    expect(files).toContain("assets/gate-right.webp");
    expect(files).toContain("assets/interior-realm.webp");
  });

  test("失败时已存在的目标目录不被破坏", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    // 第一次成功落盘
    const first = await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });
    expect(first.emitResult.success).toBe(true);
    const firstHashes = hashDirectory(outputDir);

    // 第二次用空字节映射触发失败
    const compiler = new GoldenPackCompiler({ sourceAssetsDir: FIXTURES_DIR });
    const result = await compiler.compile(ir);
    const emitter = new DiskEmitter();
    const failResult = emitter.emit(result.pack!, result.evidence!, new Map(), outputDir);
    expect(failResult.success).toBe(false);

    // 原目标目录应保持不变
    expect(fs.existsSync(outputDir)).toBe(true);
    const afterHashes = hashDirectory(outputDir);
    expect(afterHashes).toEqual(firstHashes);
  });
});

// ---------------------------------------------------------------------------
// DISK-02: Bit-Identical Readback
// ---------------------------------------------------------------------------

describe("DISK-02 [Bit-Identical Readback]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-02-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("DiskValidator 冷重读确认所有文件哈希与 manifest 一致", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    const { emitResult, assetBytes } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    // 冷启动验证
    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);

    expect(validation.valid).toBe(true);
    expect(validation.mismatches).toEqual([]);
    expect(validation.missingFiles).toEqual([]);
    expect(validation.extraFiles).toEqual([]);
    expect(validation.rootHashValid).toBe(true);
    expect(validation.errors).toEqual([]);

    // manifest 中的文件数与实际文件数一致（manifest.json 自身不计入 files）
    expect(validation.manifest!.fileCount).toBe(validation.manifest!.files.length);
    const diskFiles = listFilesRecursive(outputDir);
    expect(diskFiles.length).toBe(validation.manifest!.fileCount + 1); // +1 for manifest.json
  });

  test("每个资产文件的磁盘哈希与编译时的 SHA-256 一致", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    const { emitResult, assetBytes, packResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    const compiledAssets = packResult.pack!.compiledAssets.assets.filter(
      (a) => a.status === "COMPILED",
    );

    for (const asset of compiledAssets) {
      const isSceneManifest = asset.assetId === "asset:scene-manifest";
      const relativePath = isSceneManifest
        ? asset.fileName
        : path.join("assets", asset.fileName);
      const filePath = path.join(outputDir, relativePath);

      expect(fs.existsSync(filePath)).toBe(true);
      const diskBytes = fs.readFileSync(filePath);
      const diskHash = sha256Bytes(diskBytes);

      expect(diskHash).toBe(asset.sha256);
      expect(diskBytes.length).toBe(asset.byteSize);
    }
  });

  test("证据文件为有效 JSON 且包含必需字段", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    const machine = JSON.parse(fs.readFileSync(path.join(outputDir, "evidence/machine-provenance.json"), "utf8"));
    expect(machine.evidenceType).toBe("MACHINE_PROVENANCE");
    expect(machine.assetHashTree).toBeDefined();
    expect(machine.selfHash).toBeDefined();

    const human = JSON.parse(fs.readFileSync(path.join(outputDir, "evidence/human-audit-ledger.json"), "utf8"));
    expect(human.evidenceType).toBe("HUMAN_AUDIT_LEDGER");
    expect(human.auditEntries.length).toBeGreaterThan(0);
    expect(human.signatures.length).toBeGreaterThan(0);

    const scene = JSON.parse(fs.readFileSync(path.join(outputDir, "scene.json"), "utf8"));
    expect(scene.manifestVersion).toBe("1.0.0");
    expect(scene.assetReferences.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DISK-03: Zero Drift on Re-emission
// ---------------------------------------------------------------------------

describe("DISK-03 [Zero Drift on Re-emission]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-03-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("连续 5 次落盘，目标目录所有文件字节级一致", async () => {
    const ir = makeGoldenIR();
    const runs: Array<Record<string, string>> = [];

    for (let i = 0; i < 5; i++) {
      const outputDir = path.join(tempBase, `run-${i}`);
      const { emitResult } = await compileAndEmitToDisk(ir, {
        sourceAssetsDir: FIXTURES_DIR,
        outputDir,
      });
      expect(emitResult.success).toBe(true);
      runs.push(hashDirectory(outputDir));
    }

    // 所有运行的文件集合和哈希必须完全一致
    for (let i = 1; i < runs.length; i++) {
      expect(Object.keys(runs[i]).sort()).toEqual(Object.keys(runs[0]).sort());
      for (const file of Object.keys(runs[0])) {
        expect(runs[i][file]).toBe(runs[0][file]);
      }
    }
  }, 180000);

  test("连续 5 次落盘，manifest.json 的 rootHash 一致", async () => {
    const ir = makeGoldenIR();
    const rootHashes: string[] = [];

    for (let i = 0; i < 5; i++) {
      const outputDir = path.join(tempBase, `root-${i}`);
      const { emitResult } = await compileAndEmitToDisk(ir, {
        sourceAssetsDir: FIXTURES_DIR,
        outputDir,
      });
      expect(emitResult.success).toBe(true);
      rootHashes.push(emitResult.manifest!.rootHash);
    }

    for (let i = 1; i < rootHashes.length; i++) {
      expect(rootHashes[i]).toBe(rootHashes[0]);
    }
  }, 180000);
});

// ---------------------------------------------------------------------------
// DISK-04: Tamper Evident
// ---------------------------------------------------------------------------

describe("DISK-04 [Tamper Evident]", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-04-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("修改 WebP 文件 1 字节后，DiskValidator 检测到 HASH_MISMATCH", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });
    expect(emitResult.success).toBe(true);

    // 篡改：修改 assets/scene.webp 的第 100 字节
    const scenePath = path.join(outputDir, "assets/scene.webp");
    const original = fs.readFileSync(scenePath);
    const tampered = Buffer.from(original);
    tampered[100] = tampered[100] === 0 ? 1 : 0; // 翻转 1 字节
    fs.writeFileSync(scenePath, tampered);

    // 验证篡改被检测
    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);

    expect(validation.valid).toBe(false);
    expect(validation.mismatches.length).toBeGreaterThanOrEqual(1);

    const sceneMismatch = validation.mismatches.find((m) => m.path === "assets/scene.webp");
    expect(sceneMismatch).toBeDefined();
    expect(sceneMismatch!.expectedSha256).not.toBe(sceneMismatch!.actualSha256);

    // rootHash 保护 manifest 自身完整性；篡改数据文件不改变 manifest 记录，故 rootHash 仍有效
    expect(validation.rootHashValid).toBe(true);
  });

  test("修改证据文件后，DiskValidator 检测到篡改", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    // 篡改 machine-provenance.json
    const machinePath = path.join(outputDir, "evidence/machine-provenance.json");
    const content = fs.readFileSync(machinePath, "utf8");
    fs.writeFileSync(machinePath, content + " "); // 追加 1 空格

    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);

    expect(validation.valid).toBe(false);
    const mismatch = validation.mismatches.find((m) => m.path === "evidence/machine-provenance.json");
    expect(mismatch).toBeDefined();
  });

  test("删除文件后，DiskValidator 报告 MISSING", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    // 删除 depth.webp
    fs.unlinkSync(path.join(outputDir, "assets/depth.webp"));

    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);

    expect(validation.valid).toBe(false);
    expect(validation.missingFiles).toContain("assets/depth.webp");
  });

  test("添加未声明文件后，DiskValidator 报告 EXTRA", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    // 添加未声明的文件
    fs.writeFileSync(path.join(outputDir, "assets/rogue.webp"), "fake");

    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);

    expect(validation.valid).toBe(false);
    expect(validation.extraFiles).toContain("assets/rogue.webp");
  });

  test("validateFile 单文件精准验证", async () => {
    const outputDir = path.join(tempBase, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    const validator = new DiskValidator();

    // 未篡改的文件应通过
    const ok = validator.validateFile(outputDir, "assets/scene.webp");
    expect(ok.valid).toBe(true);

    // 篡改后应失败
    const scenePath = path.join(outputDir, "assets/scene.webp");
    const buf = fs.readFileSync(scenePath);
    buf[50] = buf[50] === 0 ? 1 : 0;
    fs.writeFileSync(scenePath, buf);

    const fail = validator.validateFile(outputDir, "assets/scene.webp");
    expect(fail.valid).toBe(false);
    expect(fail.expectedSha256).not.toBe(fail.actualSha256);
  });
});

// ---------------------------------------------------------------------------
// DISK-05: History Boundary Protection
// ---------------------------------------------------------------------------

describe("DISK-05 [History Boundary Protection]", () => {
  test("disk-emitter 和 disk-validator 为独立模块，不修改历史核心", () => {
    // 验证新模块存在且为独立文件
    const emitterPath = path.join(__dirname, "../../../chinese-aesthetic/scene-pack/disk-emitter.ts");
    const validatorPath = path.join(__dirname, "../../../chinese-aesthetic/scene-pack/disk-validator.ts");
    expect(fs.existsSync(emitterPath)).toBe(true);
    expect(fs.existsSync(validatorPath)).toBe(true);

    // 验证 disk-emitter 不 import compiler-core（只检查 import 行，不检查注释）
    const emitterSource = fs.readFileSync(emitterPath, "utf8");
    const emitterImports = emitterSource.split("\n").filter((l) => l.trim().startsWith("import"));
    for (const line of emitterImports) {
      expect(line).not.toContain("compiler-core");
    }

    // 验证 disk-validator 不 import compiler-core
    const validatorSource = fs.readFileSync(validatorPath, "utf8");
    const validatorImports = validatorSource.split("\n").filter((l) => l.trim().startsWith("import"));
    for (const line of validatorImports) {
      expect(line).not.toContain("compiler-core");
    }

    // 验证 ByteCaptureCompiler 实现 IAssetCompiler 接口（装饰器模式，零修改 coordinator）
    expect(emitterSource).toContain("class ByteCaptureCompiler");
    expect(emitterSource).toContain("implements IAssetCompiler");
  });

  test("Phase 4-B 核心文件未被 disk-emitter 修改", () => {
    // 这些文件在 Phase 4-B 封签，disk-emitter 不应修改它们
    const coreFiles = [
      "asset-planner.ts",
      "asset-compiler.ts",
      "asset-validator.ts",
      "asset-ledger.ts",
      "asset-boundary.ts",
      "scene-pack-emitter.ts",
      "types.ts",
    ];
    for (const file of coreFiles) {
      const filePath = path.join(__dirname, "../../../chinese-aesthetic/scene-pack/", file);
      expect(fs.existsSync(filePath)).toBe(true);
      const source = fs.readFileSync(filePath, "utf8");
      // 核心文件不应 import disk-emitter
      expect(source).not.toContain("disk-emitter");
      expect(source).not.toContain("disk-validator");
    }
  });

  test("落盘产物不含 HeartMirror 下游业务语义", async () => {
    const localTemp = makeTempDir("disk-05-");
    const outputDir = path.join(localTemp, "output");
    const ir = makeGoldenIR();

    await compileAndEmitToDisk(ir, { sourceAssetsDir: FIXTURES_DIR, outputDir });

    const allContent = listFilesRecursive(outputDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => fs.readFileSync(path.join(outputDir, f), "utf8"))
      .join("");

    const forbidden = ["Kunlun", "Spacetime", "Mandala", "I Ching", "ACT_0", "HeartMirror", "heartmirror", "chineseScore", "aestheticScore"];
    for (const term of forbidden) {
      expect(allContent).not.toContain(term);
    }

    removeDir(localTemp);
  });
});

// ---------------------------------------------------------------------------
// 集成测试：完整 compile → emit → validate 闭环
// ---------------------------------------------------------------------------

describe("Integration: compile → emit → validate full loop", () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = makeTempDir("disk-integ-");
  });
  afterEach(() => {
    removeDir(tempBase);
  });

  test("完整闭环：编译 → 原子落盘 → 冷重读验证 → 全部通过", async () => {
    const outputDir = path.join(tempBase, "cyber-chinese-01");
    const ir = makeGoldenIR();

    // 1. 编译 + 落盘
    const { emitResult, packResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
      aestheticParadigm: "CONTEMPORARY_CYBER_CHINESE",
    });

    expect(emitResult.success).toBe(true);
    expect(packResult.success).toBe(true);
    expect(packResult.evidenceVerification!.valid).toBe(true);

    // 2. 冷重读验证
    const validator = new DiskValidator();
    const validation = validator.validate(outputDir);
    expect(validation.valid).toBe(true);

    // 3. 目录结构符合规格
    const files = listFilesRecursive(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "scene.json",
        "evidence/machine-provenance.json",
        "evidence/human-audit-ledger.json",
        "assets/scene.webp",
        "assets/depth.webp",
        "assets/water-mask.webp",
        "assets/water-normal.webp",
        "assets/gate-colossus.webp",
        "assets/gate-left.webp",
        "assets/gate-right.webp",
        "assets/interior-realm.webp",
      ]),
    );

    // 4. manifest 自洽
    const manifest = emitResult.manifest!;
    expect(manifest.sceneId).toBe(ir.sceneId);
    expect(manifest.fileCount).toBe(manifest.files.length);
    expect(manifest.files.length).toBe(11); // 8 images + scene.json + 2 evidence
  });

  test("BLOCKED 资产不写入磁盘，不进入 manifest", async () => {
    const outputDir = path.join(tempBase, "blocked");
    const block: SceneCapabilityBlocked = {
      code: "MOTION_DATA_UNAVAILABLE",
      reason: "Single-frame input",
      affectedDomain: "motion",
      affectedParameter: "motionContinuity",
      provenance: { instructionSeq: 0, provenanceHash: "sha256:block" },
      blockedAt: "2026-09-16T00:00:00.000Z",
    };
    const ir = makeGoldenIR({ capabilityBlocks: [block] });

    const { emitResult } = await compileAndEmitToDisk(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      outputDir,
    });

    expect(emitResult.success).toBe(true);

    // water-normal 应被 BLOCKED，不应出现在磁盘或 manifest 中
    const files = listFilesRecursive(outputDir);
    expect(files).not.toContain("assets/water-normal.webp");

    const manifestPaths = emitResult.manifest!.files.map((f) => f.path);
    expect(manifestPaths).not.toContain("assets/water-normal.webp");
  });
});
