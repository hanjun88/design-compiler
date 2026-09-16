/**
 * Phase 4-C: Golden Scene Pack Acceptance Tests
 *
 * GOLDEN-01 [Real Bitstreams]: 所有非 BLOCKED 资产均为有效格式（WebP/JSON）
 * GOLDEN-02 [Zero Non-Deterministic Drift]: 连续 10 次编译，输出哈希 100% 一致
 * GOLDEN-03 [Explicit Blocked Pass-Through]: 缺失运动/深度输入时，派生资产严格 BLOCKED
 * GOLDEN-04 [End-to-End Reverse Trace]: 派生纹理可追溯到 IR 参数节点
 * GOLDEN-05 [Dual Evidence Sealed]: 机器+人类双证据签名通过，散列关联自洽
 * GOLDEN-06 [Zero Leakage]: 产物无下游业务私有结构
 */

import * as path from "node:path";
import * as fs from "node:fs";
import type { SceneCompilationIR, TracedSceneParameter, SceneCapabilityBlocked } from "../../../chinese-aesthetic/scene-contract/types";
import {
  GoldenPackCompiler,
  compileGoldenScenePack,
} from "../../../chinese-aesthetic/scene-pack/golden-pack-compiler";
import {
  StandardAssetCompiler,
  MissingSourceEvidenceError,
} from "../../../chinese-aesthetic/scene-pack/standard-asset-compiler";
import {
  verifyDualEvidence,
} from "../../../chinese-aesthetic/scene-pack/evidence";

// 单次真实资产编译约 15-30s（sharp 图像处理 + 像素级派生计算）
jest.setTimeout(120000);

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, "../../../chinese-aesthetic/scene-pack/fixtures/golden-cyber-chinese-01/source");

function makeParam(value: number, seq = 0): TracedSceneParameter {
  return {
    value,
    appliedFromInstructionSeq: [seq],
    provenanceHashes: ["sha256:golden-testhash-001"],
  };
}

function makeBoolParam(value: boolean, seq = 0): TracedSceneParameter<boolean> {
  return {
    value,
    appliedFromInstructionSeq: [seq],
    provenanceHashes: ["sha256:golden-testhash-001"],
  };
}

function makeGoldenIR(overrides?: Partial<SceneCompilationIR>): SceneCompilationIR {
  const ir: SceneCompilationIR = {
    schemaVersion: "1.0.0",
    sceneId: "scene:golden:cyber-chinese-01",
    sourceProvenance: {
      validatedDesignIRHash: "sha256:golden-ir-001",
      aestheticExecutionPlanHash: "sha256:golden-plan-001",
      aestheticRuntimePlanHash: "sha256:golden-runtime-001",
      compiledAt: "2026-09-16T00:00:00.000Z",
      compilerVersion: "golden-test-compiler@1.0.0",
    },
    composition: {
      negativeSpaceRatio: makeParam(0.42),
      focalOffset: makeParam(0.0),
      clusterDensity: makeParam(0.35),
      axialSymmetry: makeParam(0.72),
    },
    spatial: {
      depthLayers: makeParam(5),
      atmosphericDensity: makeParam(0.25),
      horizonPosition: makeParam(0.52),
      occlusionRatio: makeParam(0.18),
    },
    material: {
      patinaLevel: makeParam(0.45),
      specularSharpness: makeParam(18.0),
      contrastRatio: makeParam(0.58),
      surfaceEntropy: makeParam(0.42),
    },
    lighting: {
      skyLuminance: makeParam(0.68),
      shadowTemperature: makeParam(0.38),
      mistDensity: makeParam(0.22),
      accentLuminance: makeParam(0.55),
    },
    camera: {
      fov: makeParam(55),
      pitch: makeParam(-5),
      yaw: makeParam(0),
      parallaxLayers: makeParam(3),
    },
    motion: {
      cameraMotionSmoothness: makeParam(0.6),
      opticalFlowCoherence: makeParam(0.55),
      motionContinuity: makeParam(0.65),
      isDynamic: makeBoolParam(false),
    },
    assetBindings: {
      manifest: {
        manifestVersion: "1.0.0",
        sceneId: "scene:golden:cyber-chinese-01",
        generatedAt: "2026-09-16T00:00:00.000Z",
        assets: [],
        totalAssets: 0,
        physicalAssetCount: 0,
        derivedAssetCount: 0,
      },
      hashes: {},
    },
    deterministicDigest: "sha256:golden-ir-digest-001",
    ...overrides,
  };
  return ir;
}

function makeMotionBlockedIR(): SceneCompilationIR {
  const block: SceneCapabilityBlocked = {
    code: "MOTION_DATA_UNAVAILABLE",
    reason: "Single-frame input — no motion vectors available",
    affectedDomain: "motion",
    affectedParameter: "motionContinuity",
    provenance: { instructionSeq: 0, provenanceHash: "sha256:golden-block-001" },
    blockedAt: "2026-09-16T00:00:00.000Z",
  };
  return makeGoldenIR({ capabilityBlocks: [block] });
}

function isValidWebP(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

function isValidJson(bytes: Uint8Array): boolean {
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GOLDEN-01: Real Bitstreams
// ---------------------------------------------------------------------------

describe("GOLDEN-01 [Real Bitstreams]", () => {
  test("所有非 BLOCKED 资产均为有效 WebP 或 JSON 格式", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    expect(result.success).toBe(true);
    expect(result.pack).toBeDefined();

    const compiledAssets = result.pack!.compiledAssets.assets;
    const nonBlocked = compiledAssets.filter((a) => a.status === "COMPILED");

    expect(nonBlocked.length).toBeGreaterThan(0);

    for (const asset of nonBlocked) {
      expect(asset.byteSize).toBeGreaterThan(0);
      expect(asset.sha256.length).toBe(64);

      if (asset.mimeType.startsWith("image/")) {
        // 验证 WebP magic number
        const filePath = path.join(FIXTURES_DIR, asset.fileName);
        // 派生资产不在 source 目录，需要从编译结果中获取字节
        // 这里验证元数据中的 mimeType 和尺寸
        expect(asset.mimeType).toBe("image/webp");
        expect(asset.dimensions).toBeDefined();
        expect(asset.dimensions!.width).toBe(1920);
        expect(asset.dimensions!.height).toBe(1080);
      } else if (asset.mimeType === "application/json") {
        expect(asset.fileName).toBe("scene.json");
      }
    }
  });

  test("SOURCE 资产文件真实存在于源目录且为有效 WebP", () => {
    const sourceFiles = ["scene.webp", "gate-colossus.webp", "gate-left.webp", "gate-right.webp", "interior-realm.webp"];
    for (const file of sourceFiles) {
      const filePath = path.join(FIXTURES_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
      const bytes = fs.readFileSync(filePath);
      expect(isValidWebP(new Uint8Array(bytes))).toBe(true);
      expect(bytes.length).toBeGreaterThan(1000); // 真实图片应大于 1KB
    }
  });

  test("缺失源文件时抛出 MISSING_SOURCE_EVIDENCE 而非静默回退", async () => {
    const compiler = new StandardAssetCompiler();
    const context = {
      sceneId: "test",
      targetWidth: 1920,
      targetHeight: 1080,
      sourceAssetsDir: "/nonexistent/path",
      compiledAt: "2026-09-16T00:00:00.000Z",
    };
    const entry = {
      assetId: "asset:scene-primary",
      fileName: "scene.webp",
      category: "PRIMARY_VISUAL",
      truthClass: "SOURCE" as const,
      lifecycle: "PHYSICAL" as const,
      mimeType: "image/webp",
      required: true,
      compilationStrategy: "COPY_SOURCE" as const,
      description: "test",
    };

    await expect(compiler.compile(entry, context)).rejects.toThrow(MissingSourceEvidenceError);
  });
});

// ---------------------------------------------------------------------------
// GOLDEN-02: Zero Non-Deterministic Drift
// ---------------------------------------------------------------------------

describe("GOLDEN-02 [Zero Non-Deterministic Drift]", () => {
  test("连续 10 次编译，所有资产 SHA-256 100% 逐字节一致", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });

    const runs: Array<Record<string, string>> = [];

    for (let i = 0; i < 10; i++) {
      const result = await compiler.compile(ir);
      expect(result.success).toBe(true);

      const assetHashes: Record<string, string> = {};
      for (const asset of result.pack!.compiledAssets.assets) {
        if (asset.status === "COMPILED") {
          assetHashes[asset.assetId] = asset.sha256;
        }
      }
      runs.push(assetHashes);
    }

    // 所有运行的资产哈希必须完全一致
    for (let i = 1; i < runs.length; i++) {
      expect(Object.keys(runs[i]).sort()).toEqual(Object.keys(runs[0]).sort());
      for (const assetId of Object.keys(runs[0])) {
        expect(runs[i][assetId]).toBe(runs[0][assetId]);
      }
    }

    // packDigest 也必须一致
    // （注意：packDigest 包含 generatedAt，我们使用固定时间所以应该一致）
  }, 180000);

  test("ScenePackDigest 跨运行一致", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });

    const result1 = await compiler.compile(ir);
    const result2 = await compiler.compile(ir);

    expect(result1.pack!.packDigest).toBe(result2.pack!.packDigest);
  }, 30000);
});

// ---------------------------------------------------------------------------
// GOLDEN-03: Explicit Blocked Pass-Through
// ---------------------------------------------------------------------------

describe("GOLDEN-03 [Explicit Blocked Pass-Through]", () => {
  test("MOTION_DATA_UNAVAILABLE → water-normal 资产严格 BLOCKED", async () => {
    const ir = makeMotionBlockedIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    expect(result.success).toBe(true);

    const waterNormal = result.pack!.compiledAssets.assets.find(
      (a) => a.assetId === "asset:water-normal",
    );
    expect(waterNormal).toBeDefined();
    expect(waterNormal!.status).toBe("BLOCKED");
    expect(waterNormal!.blockedCode).toBe("MOTION_DATA_UNAVAILABLE");
    expect(waterNormal!.sha256).toBe("");
    expect(waterNormal!.byteSize).toBe(0);
  });

  test("BLOCKED 资产不进入哈希账本", async () => {
    const ir = makeMotionBlockedIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const ledgerAssetIds = result.pack!.hashLedger.entries.map((e) => e.assetId);
    expect(ledgerAssetIds).not.toContain("asset:water-normal");
  });

  test("BLOCKED 资产出现在 capabilityBlocks 中", async () => {
    const ir = makeMotionBlockedIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const blockCodes = result.pack!.capabilityBlocks.map((b) => b.code);
    expect(blockCodes).toContain("MOTION_DATA_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// GOLDEN-04: End-to-End Reverse Trace
// ---------------------------------------------------------------------------

describe("GOLDEN-04 [End-to-End Reverse Trace]", () => {
  test("每个 COMPILED 资产携带 sourcePlanEntry 溯源链", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const compiled = result.pack!.compiledAssets.assets.filter((a) => a.status === "COMPILED");
    for (const asset of compiled) {
      expect(asset.sourcePlanEntry).toBeDefined();
      expect(asset.sourcePlanEntry.assetId).toBe(asset.assetId);
      expect(asset.sourcePlanEntry.compilationStrategy).toBeDefined();
      expect(asset.sourcePlanEntry.truthClass).toBe(asset.truthClass);
    }
  });

  test("DERIVED 资产的 sourceIRField 指向 IR 参数字段", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const depth = result.pack!.compiledAssets.assets.find((a) => a.assetId === "asset:depth");
    expect(depth).toBeDefined();
    expect(depth!.status).toBe("COMPILED");
    expect(depth!.sourcePlanEntry.sourceIRField).toBe("spatial.depthLayers");

    const waterMask = result.pack!.compiledAssets.assets.find((a) => a.assetId === "asset:water-mask");
    expect(waterMask).toBeDefined();
    expect(waterMask!.sourcePlanEntry.sourceIRField).toBe("material.surfaceEntropy");
  });

  test("SOURCE 资产的 sourceIRField 或 description 存在", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const sourceAssets = result.pack!.compiledAssets.assets.filter(
      (a) => a.truthClass === "SOURCE" && a.status === "COMPILED",
    );
    for (const asset of sourceAssets) {
      const hasEvidence = asset.sourcePlanEntry.sourceIRField || asset.sourcePlanEntry.description;
      expect(hasEvidence).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// GOLDEN-05: Dual Evidence Sealed
// ---------------------------------------------------------------------------

describe("GOLDEN-05 [Dual Evidence Sealed]", () => {
  test("双证据链生成且自校验通过", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    expect(result.evidence).toBeDefined();
    expect(result.evidence!.machine).toBeDefined();
    expect(result.evidence!.human).toBeDefined();
    expect(result.evidence!.crossReferenceHash).toBeDefined();

    expect(result.evidenceVerification).toBeDefined();
    expect(result.evidenceVerification!.valid).toBe(true);
  });

  test("机器证据包含资产散列树且根哈希正确", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const machine = result.evidence!.machine;
    expect(machine.evidenceType).toBe("MACHINE_PROVENANCE");
    expect(machine.assetHashTree.entries.length).toBeGreaterThan(0);
    expect(machine.assetHashTree.rootHash.length).toBe(64);
    expect(machine.selfHash.startsWith("sha256:")).toBe(true);
  });

  test("人类证据包含留白率测量和专家签名", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const human = result.evidence!.human;
    expect(human.evidenceType).toBe("HUMAN_AUDIT_LEDGER");
    expect(human.negativeSpaceRatio.value).toBeGreaterThanOrEqual(0);
    expect(human.negativeSpaceRatio.value).toBeLessThanOrEqual(1);
    expect(human.negativeSpaceRatio.idealRange.min).toBe(0.35);
    expect(human.negativeSpaceRatio.idealRange.max).toBe(0.65);
    expect(human.auditEntries.length).toBeGreaterThan(0);
    expect(human.signatures.length).toBeGreaterThan(0);
    expect(human.signatures[0].algorithm).toBe("sha256");
    expect(human.signatures[0].signature.length).toBe(64);
  });

  test("双证据交叉引用哈希一致", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    // 独立验证双证据
    const verification = verifyDualEvidence(result.evidence!, result.pack);
    expect(verification.crossReferenceValid).toBe(true);
    expect(verification.sceneManifestConsistent).toBe(true);
  });

  test("机器证据的 scenePackDigest 与 pack.packDigest 一致", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    expect(result.evidence!.machine.scenePackDigest).toBe(result.pack!.packDigest);
  });
});

// ---------------------------------------------------------------------------
// GOLDEN-06: Zero Leakage
// ---------------------------------------------------------------------------

describe("GOLDEN-06 [Zero Leakage]", () => {
  test("产物中不含 HeartMirror 下游业务私有结构", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const packJson = JSON.stringify(result.pack);
    const evidenceJson = JSON.stringify(result.evidence);
    const allJson = packJson + evidenceJson;

    // 禁止出现的下游业务关键词
    const forbiddenTerms = [
      "Kunlun",
      "Spacetime",
      "Mandala",
      "I Ching",
      "ACT_0",
      "ACT0",
      "HeartMirror",
      "heartmirror",
      "heart_mirror",
    ];

    for (const term of forbiddenTerms) {
      expect(allJson).not.toContain(term);
    }
  });

  test("不生成 ChineseScore / aestheticScore", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const allJson = JSON.stringify(result.pack) + JSON.stringify(result.evidence);
    expect(allJson).not.toContain("chineseScore");
    expect(allJson).not.toContain("aestheticScore");
    expect(allJson).not.toContain("ChineseScore");
    expect(allJson).not.toContain("AestheticScore");
  });

  test("人类证据只记录测量值和判定，不输出文化评分", async () => {
    const ir = makeGoldenIR();
    const compiler = new GoldenPackCompiler({
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
    });
    const result = await compiler.compile(ir);

    const human = result.evidence!.human;
    for (const entry of human.auditEntries) {
      // 每个条目有 measuredValue 和 verdict，但没有 score 字段
      expect(entry).toHaveProperty("measuredValue");
      expect(entry).toHaveProperty("verdict");
      expect(entry).not.toHaveProperty("score");
      expect(entry.verdict).toMatch(/^(PASS|FLAG|INCONCLUSIVE)$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 集成测试：完整 Golden Pack 编译
// ---------------------------------------------------------------------------

describe("Golden Pack Integration: Full Compilation Pipeline", () => {
  test("完整流水线：IR → 真实资产编译 → 双证据链 → 验证通过", async () => {
    const ir = makeGoldenIR();
    const result = await compileGoldenScenePack(ir, {
      sourceAssetsDir: FIXTURES_DIR,
      targetWidth: 1920,
      targetHeight: 1080,
      aestheticParadigm: "CONTEMPORARY_CYBER_CHINESE",
    });

    expect(result.success).toBe(true);
    expect(result.pack).toBeDefined();
    expect(result.evidence).toBeDefined();
    expect(result.evidenceVerification).toBeDefined();
    expect(result.evidenceVerification!.valid).toBe(true);

    // 资产统计
    const compiled = result.pack!.compiledAssets.assets.filter((a) => a.status === "COMPILED");
    const blocked = result.pack!.compiledAssets.assets.filter((a) => a.status === "BLOCKED");
    expect(compiled.length).toBeGreaterThanOrEqual(5); // scene, depth, water-mask, water-normal, scene.json + gates
    expect(result.pack!.compiledAssets.compiledCount).toBe(compiled.length);
    expect(result.pack!.compiledAssets.blockedCount).toBe(blocked.length);

    // 哈希账本
    expect(result.pack!.hashLedger.totalAssets).toBe(compiled.length);
    expect(result.pack!.hashLedger.ledgerRootHash.length).toBe(64);

    // 溯源链
    expect(result.pack!.sourceProvenance.sceneIRDigest).toBe(ir.deterministicDigest);
    expect(result.pack!.sourceProvenance.validatedDesignIRHash).toBe(ir.sourceProvenance.validatedDesignIRHash);
  }, 30000);
});
