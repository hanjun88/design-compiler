/**
 * Phase 4-B: Professional Scene Pack Compiler Tests
 *
 * PACK-01: SceneCompilationIR → asset plan 100% deterministic
 * PACK-02: 8+1 manifest entries classification valid
 * PACK-03: every generated asset SHA-256 present
 * PACK-04: every asset source/derived provenance complete
 * PACK-05: same IR twice → byte-identical assets
 * PACK-06: same IR twice → identical SHA-256 ledger
 * PACK-07: unsupported capability → BLOCKED → no silent fallback
 * PACK-08: invalid physical metadata → REJECT
 * PACK-09: asset bytes changed → SHA-256 mismatch detected
 * PACK-10: scene.json references → every asset exists → every hash matches
 * PACK-11: historical boundary → ZERO DIFF
 */

import type { SceneCompilationIR, TracedSceneParameter } from "../../../chinese-aesthetic/scene-contract/types";
import {
  planAssets,
  STANDARD_ASSET_DEFINITIONS,
} from "../../../chinese-aesthetic/scene-pack/asset-planner";
import {
  validateAssetBoundary,
  validateAssetBoundaries,
  TRUTH_CLASS_TO_LIFECYCLE,
  COMPILATION_STRATEGY_TO_TRUTH_CLASS,
} from "../../../chinese-aesthetic/scene-pack/asset-boundary";
import {
  sha256Bytes,
  sha256String,
  sha256Object,
  buildAssetHashLedger,
  verifyAssetHashLedger,
  computeLedgerRootHash,
} from "../../../chinese-aesthetic/scene-pack/asset-ledger";
import {
  MockAssetCompiler,
  AssetCompilationCoordinator,
} from "../../../chinese-aesthetic/scene-pack/asset-compiler";
import {
  validateAsset,
  validateAssets,
} from "../../../chinese-aesthetic/scene-pack/asset-validator";
import {
  compileAndEmitScenePack,
} from "../../../chinese-aesthetic/scene-pack/scene-pack-emitter";

// ---------------------------------------------------------------------------
// 测试辅助：构造合法的 SceneCompilationIR
// ---------------------------------------------------------------------------

function makeParam(value: number, seq = 0): TracedSceneParameter {
  return {
    value,
    appliedFromInstructionSeq: [seq],
    provenanceHashes: ["fnv1a:testhash001"],
  };
}

function makeBoolParam(value: boolean, seq = 0): TracedSceneParameter<boolean> {
  return {
    value,
    appliedFromInstructionSeq: [seq],
    provenanceHashes: ["fnv1a:testhash001"],
  };
}

function makeValidIR(): SceneCompilationIR {
  const ir: SceneCompilationIR = {
    schemaVersion: "1.0.0",
    sceneId: "scene:test:v1",
    sourceProvenance: {
      validatedDesignIRHash: "sha256:ir001",
      aestheticExecutionPlanHash: "fnv1a:plan001",
      aestheticRuntimePlanHash: "fnv1a:runtime001",
      compiledAt: "2026-09-16T00:00:00Z",
      compilerVersion: "test-compiler@1.0.0",
    },
    composition: {
      negativeSpaceRatio: makeParam(0.35),
      focalOffset: makeParam(0.5),
      clusterDensity: makeParam(0.4),
      axialSymmetry: makeParam(0.6),
    },
    spatial: {
      depthLayers: makeParam(4),
      atmosphericDensity: makeParam(0.3),
      horizonPosition: makeParam(0.45),
      occlusionRatio: makeParam(0.2),
    },
    material: {
      patinaLevel: makeParam(0.5),
      specularSharpness: makeParam(20.0),
      contrastRatio: makeParam(0.6),
      surfaceEntropy: makeParam(0.4),
    },
    lighting: {
      skyLuminance: makeParam(0.7),
      shadowTemperature: makeParam(0.4),
      mistDensity: makeParam(0.3),
      accentLuminance: makeParam(0.5),
    },
    camera: {
      fov: makeParam(60),
      pitch: makeParam(0),
      yaw: makeParam(0),
      parallaxLayers: makeParam(3),
    },
    motion: {
      cameraMotionSmoothness: makeParam(0.5),
      opticalFlowCoherence: makeParam(0.5),
      motionContinuity: makeParam(0.6),
      isDynamic: makeBoolParam(true),
    },
    assetBindings: {
      manifest: {
        manifestVersion: "1.0.0",
        sceneId: "scene:test:v1",
        generatedAt: "2026-09-16T00:00:00Z",
        assets: [],
        totalAssets: 0,
        physicalAssetCount: 0,
        derivedAssetCount: 0,
      },
      hashes: {},
    },
    deterministicDigest: "fnv1a:testdigest001",
  };
  return ir;
}

// ---------------------------------------------------------------------------
// PACK-01: SceneCompilationIR → asset plan 100% deterministic
// ---------------------------------------------------------------------------

describe("PACK-01: Asset Planning Determinism", () => {
  test("相同 IR 两次规划产生相同的 planDigest", () => {
    const ir = makeValidIR();
    const plan1 = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const plan2 = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    expect(plan1.planDigest).toBe(plan2.planDigest);
    expect(plan1.totalAssets).toBe(plan2.totalAssets);
  });

  test("规划结果包含 8+1 标准资产", () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    expect(plan.totalAssets).toBe(9); // 8 visual + 1 manifest
  });

  test("规划结果按 assetId 确定性排序", () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const ids = plan.entries.map((e) => e.assetId);
    const sortedIds = [...ids].sort();
    expect(ids).toEqual(sortedIds);
  });

  test("不同 IR 产生不同的 planDigest", () => {
    const ir1 = makeValidIR();
    const ir2 = makeValidIR();
    ir2.sceneId = "scene:different:v1";
    const plan1 = planAssets(ir1, { plannedAt: "2026-09-16T00:00:00Z" });
    const plan2 = planAssets(ir2, { plannedAt: "2026-09-16T00:00:00Z" });
    expect(plan1.planDigest).not.toBe(plan2.planDigest);
  });
});

// ---------------------------------------------------------------------------
// PACK-02: 8+1 manifest entries classification valid
// ---------------------------------------------------------------------------

describe("PACK-02: Asset Classification Validity", () => {
  test("标准资产定义包含 9 项", () => {
    expect(STANDARD_ASSET_DEFINITIONS.length).toBe(9);
  });

  test("每个资产都有有效的真实性分类", () => {
    for (const def of STANDARD_ASSET_DEFINITIONS) {
      expect(["SOURCE", "DERIVED", "GENERATED"]).toContain(def.truthClass);
    }
  });

  test("每个资产都有有效的生命周期类型", () => {
    for (const def of STANDARD_ASSET_DEFINITIONS) {
      expect(["PHYSICAL", "DERIVED"]).toContain(def.lifecycle);
    }
  });

  test("真实性分类与生命周期类型一致", () => {
    for (const def of STANDARD_ASSET_DEFINITIONS) {
      expect(TRUTH_CLASS_TO_LIFECYCLE[def.truthClass]).toBe(def.lifecycle);
    }
  });

  test("编译策略与真实性分类一致", () => {
    for (const def of STANDARD_ASSET_DEFINITIONS) {
      const expected = COMPILATION_STRATEGY_TO_TRUTH_CLASS[def.compilationStrategy];
      if (expected) {
        expect(def.truthClass).toBe(expected);
      }
    }
  });

  test("scene.webp 是 SOURCE/PHYSICAL", () => {
    const scene = STANDARD_ASSET_DEFINITIONS.find((d) => d.assetId === "asset:scene-primary");
    expect(scene).toBeDefined();
    expect(scene!.truthClass).toBe("SOURCE");
    expect(scene!.lifecycle).toBe("PHYSICAL");
  });

  test("depth.webp 是 DERIVED/DERIVED", () => {
    const depth = STANDARD_ASSET_DEFINITIONS.find((d) => d.assetId === "asset:depth");
    expect(depth).toBeDefined();
    expect(depth!.truthClass).toBe("DERIVED");
    expect(depth!.lifecycle).toBe("DERIVED");
  });

  test("scene.json 是 DERIVED/DERIVED", () => {
    const manifest = STANDARD_ASSET_DEFINITIONS.find((d) => d.assetId === "asset:scene-manifest");
    expect(manifest).toBeDefined();
    expect(manifest!.truthClass).toBe("DERIVED");
    expect(manifest!.lifecycle).toBe("DERIVED");
  });
});

// ---------------------------------------------------------------------------
// PACK-03: every generated asset SHA-256 present
// ---------------------------------------------------------------------------

describe("PACK-03: SHA-256 Presence", () => {
  test("sha256Bytes 生成 64 字符十六进制哈希", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = sha256Bytes(data);
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("相同字节产生相同 SHA-256", () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(sha256Bytes(data)).toBe(sha256Bytes(data));
  });

  test("不同字节产生不同 SHA-256", () => {
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([1, 2, 4]);
    expect(sha256Bytes(data1)).not.toBe(sha256Bytes(data2));
  });

  test("MockAssetCompiler 编译的资产有 SHA-256", async () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const coordinator = new AssetCompilationCoordinator({
      compiledAt: "2026-09-16T00:00:00Z",
    });
    const result = await coordinator.compileAll(ir.sceneId, plan.planDigest, plan.entries);
    for (const asset of result.assets) {
      if (asset.status === "COMPILED") {
        expect(asset.sha256.length).toBe(64);
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// PACK-04: every asset source/derived provenance complete
// ---------------------------------------------------------------------------

describe("PACK-04: Asset Provenance Completeness", () => {
  test("每个已编译资产都有 sourcePlanEntry", async () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const coordinator = new AssetCompilationCoordinator({
      compiledAt: "2026-09-16T00:00:00Z",
    });
    const result = await coordinator.compileAll(ir.sceneId, plan.planDigest, plan.entries);
    for (const asset of result.assets) {
      expect(asset.sourcePlanEntry).toBeDefined();
      expect(asset.sourcePlanEntry.assetId).toBe(asset.assetId);
    }
  });

  test("SOURCE 资产有来源证据", () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const sourceAssets = plan.entries.filter((e) => e.truthClass === "SOURCE");
    for (const asset of sourceAssets) {
      expect(asset.description || asset.sourceIRField).toBeTruthy();
    }
  });

  test("DERIVED 资产有 sourceIRField", () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    // 主清单 (scene-manifest) 是 DERIVED 但不需要 sourceIRField
    const derivedAssets = plan.entries.filter(
      (e) => e.truthClass === "DERIVED" &&
             e.compilationStrategy === "COMPUTE_DERIVED" &&
             e.assetId !== "asset:scene-manifest",
    );
    expect(derivedAssets.length).toBeGreaterThan(0);
    for (const asset of derivedAssets) {
      expect(asset.sourceIRField).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// PACK-05: same IR twice → byte-identical assets
// ---------------------------------------------------------------------------

describe("PACK-05: Asset Compilation Determinism", () => {
  test("相同 IR 两次编译产生相同的资产 SHA-256", async () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });

    const coordinator1 = new AssetCompilationCoordinator({ compiledAt: "2026-09-16T00:00:00Z" });
    const coordinator2 = new AssetCompilationCoordinator({ compiledAt: "2026-09-16T00:00:00Z" });

    const result1 = await coordinator1.compileAll(ir.sceneId, plan.planDigest, plan.entries);
    const result2 = await coordinator2.compileAll(ir.sceneId, plan.planDigest, plan.entries);

    for (let i = 0; i < result1.assets.length; i++) {
      expect(result1.assets[i].sha256).toBe(result2.assets[i].sha256);
      expect(result1.assets[i].byteSize).toBe(result2.assets[i].byteSize);
    }
  });

  test("MockAssetCompiler 是确定性的", async () => {
    const compiler = new MockAssetCompiler();
    const entry = STANDARD_ASSET_DEFINITIONS[0];
    const context = { sceneId: "test", targetWidth: 100, targetHeight: 100, compiledAt: "2026-09-16T00:00:00Z" };
    const result1 = await compiler.compile(entry, context);
    const result2 = await compiler.compile(entry, context);
    expect(sha256Bytes(result1.bytes)).toBe(sha256Bytes(result2.bytes));
  });
});

// ---------------------------------------------------------------------------
// PACK-06: same IR twice → identical SHA-256 ledger
// ---------------------------------------------------------------------------

describe("PACK-06: Hash Ledger Determinism", () => {
  test("相同资产列表产生相同的账本根哈希", async () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const coordinator = new AssetCompilationCoordinator({ compiledAt: "2026-09-16T00:00:00Z" });
    const result = await coordinator.compileAll(ir.sceneId, plan.planDigest, plan.entries);

    const ledger1 = buildAssetHashLedger(ir.sceneId, result.assets, { generatedAt: "2026-09-16T00:00:00Z" });
    const ledger2 = buildAssetHashLedger(ir.sceneId, result.assets, { generatedAt: "2026-09-16T00:00:00Z" });

    expect(ledger1.ledgerRootHash).toBe(ledger2.ledgerRootHash);
  });

  test("账本根哈希随资产变更而变化", () => {
    const assets1 = [{ assetId: "a", fileName: "a.webp", sha256: "a".repeat(64), byteSize: 100, truthClass: "SOURCE" as const, hashedAt: "2026-09-16T00:00:00Z" }];
    const assets2 = [{ assetId: "a", fileName: "a.webp", sha256: "b".repeat(64), byteSize: 100, truthClass: "SOURCE" as const, hashedAt: "2026-09-16T00:00:00Z" }];
    expect(computeLedgerRootHash(assets1)).not.toBe(computeLedgerRootHash(assets2));
  });
});

// ---------------------------------------------------------------------------
// PACK-07: unsupported capability → BLOCKED → no silent fallback
// ---------------------------------------------------------------------------

describe("PACK-07: Explicit BLOCKED Handling", () => {
  test("深度缓冲不可用时 depth 资产被 BLOCKED", () => {
    const ir = makeValidIR();
    ir.capabilityBlocks = [{
      code: "DEPTH_BUFFER_UNAVAILABLE",
      reason: "No depth buffer available",
      affectedDomain: "spatial",
      provenance: {},
      blockedAt: "2026-09-16T00:00:00Z",
    }];
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const depth = plan.entries.find((e) => e.assetId === "asset:depth");
    expect(depth).toBeDefined();
    expect(depth!.compilationStrategy).toBe("BLOCKED");
    expect(depth!.blockedCode).toBe("DEPTH_BUFFER_UNAVAILABLE");
  });

  test("BLOCKED 资产在编译结果中保持 BLOCKED 状态", async () => {
    const ir = makeValidIR();
    ir.capabilityBlocks = [{
      code: "DEPTH_BUFFER_UNAVAILABLE",
      reason: "No depth buffer",
      affectedDomain: "spatial",
      provenance: {},
      blockedAt: "2026-09-16T00:00:00Z",
    }];
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    const coordinator = new AssetCompilationCoordinator({ compiledAt: "2026-09-16T00:00:00Z" });
    const result = await coordinator.compileAll(ir.sceneId, plan.planDigest, plan.entries);
    const depth = result.assets.find((a) => a.assetId === "asset:depth");
    expect(depth).toBeDefined();
    expect(depth!.status).toBe("BLOCKED");
    expect(depth!.sha256).toBe(""); // BLOCKED 资产没有哈希
    expect(result.blockedCount).toBeGreaterThan(0);
  });

  test("默认不允许 GENERATED 资产", () => {
    const ir = makeValidIR();
    const plan = planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z", allowGeneratedAssets: false });
    // 标准资产定义中没有 GENERATE_SYNTHETIC 策略
    const generatedAssets = plan.entries.filter((e) => e.truthClass === "GENERATED");
    expect(generatedAssets.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PACK-08: invalid physical metadata → REJECT
// ---------------------------------------------------------------------------

describe("PACK-08: Invalid Metadata Rejection", () => {
  test("缺少 SHA-256 的资产被验证器拒绝", () => {
    const asset = {
      assetId: "test",
      fileName: "test.webp",
      category: "PRIMARY_VISUAL",
      truthClass: "SOURCE" as const,
      lifecycle: "PHYSICAL" as const,
      mimeType: "image/webp",
      sha256: "",
      byteSize: 100,
      status: "COMPILED" as const,
      sourcePlanEntry: STANDARD_ASSET_DEFINITIONS[0],
    };
    const result = validateAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "INVALID_SHA256")).toBe(true);
  });

  test("byteSize 为 0 的资产被拒绝", () => {
    const asset = {
      assetId: "test",
      fileName: "test.webp",
      category: "PRIMARY_VISUAL",
      truthClass: "SOURCE" as const,
      lifecycle: "PHYSICAL" as const,
      mimeType: "image/webp",
      sha256: "a".repeat(64),
      byteSize: 0,
      status: "COMPILED" as const,
      sourcePlanEntry: STANDARD_ASSET_DEFINITIONS[0],
    };
    const result = validateAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "INVALID_BYTE_SIZE")).toBe(true);
  });

  test("GENERATED 标记为 SOURCE 的资产被边界守卫拒绝", () => {
    const asset = {
      assetId: "test",
      fileName: "test.webp",
      category: "PRIMARY_VISUAL",
      truthClass: "SOURCE" as const,
      lifecycle: "PHYSICAL" as const,
      mimeType: "image/webp",
      sha256: "a".repeat(64),
      byteSize: 100,
      status: "COMPILED" as const,
      sourcePlanEntry: { ...STANDARD_ASSET_DEFINITIONS[0], compilationStrategy: "GENERATE_SYNTHETIC" as const },
    };
    const violations = validateAssetBoundary(asset);
    expect(violations.some((v) => v.code === "GENERATED_MARKED_AS_SOURCE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PACK-09: asset bytes changed → SHA-256 mismatch detected
// ---------------------------------------------------------------------------

describe("PACK-09: SHA-256 Mismatch Detection", () => {
  test("资产字节变更后 SHA-256 不同", () => {
    const original = new Uint8Array([1, 2, 3]);
    const modified = new Uint8Array([1, 2, 4]);
    expect(sha256Bytes(original)).not.toBe(sha256Bytes(modified));
  });

  test("verifyAssetHashLedger 检测到哈希不匹配", () => {
    const ledger = {
      ledgerVersion: "1.0.0" as const,
      sceneId: "test",
      generatedAt: "2026-09-16T00:00:00Z",
      entries: [
        { assetId: "a", fileName: "a.webp", sha256: "a".repeat(64), byteSize: 100, truthClass: "SOURCE" as const, hashedAt: "2026-09-16T00:00:00Z" },
      ],
      totalAssets: 1,
      ledgerRootHash: "test",
    };
    const actualAssets = [{ assetId: "a", sha256: "b".repeat(64) }];
    const result = verifyAssetHashLedger(ledger, actualAssets);
    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBe(1);
    expect(result.mismatches[0].assetId).toBe("a");
  });

  test("verifyAssetHashLedger 检测到缺失资产", () => {
    const ledger = {
      ledgerVersion: "1.0.0" as const,
      sceneId: "test",
      generatedAt: "2026-09-16T00:00:00Z",
      entries: [
        { assetId: "a", fileName: "a.webp", sha256: "a".repeat(64), byteSize: 100, truthClass: "SOURCE" as const, hashedAt: "2026-09-16T00:00:00Z" },
      ],
      totalAssets: 1,
      ledgerRootHash: "test",
    };
    const actualAssets: Array<{ assetId: string; sha256: string }> = [];
    const result = verifyAssetHashLedger(ledger, actualAssets);
    expect(result.valid).toBe(false);
    expect(result.missingAssets).toContain("a");
  });
});

// ---------------------------------------------------------------------------
// PACK-10: scene.json references → every asset exists → every hash matches
// ---------------------------------------------------------------------------

describe("PACK-10: Scene Pack Reference Integrity", () => {
  test("compileAndEmitScenePack 产生完整的场景包", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    expect(result.success).toBe(true);
    expect(result.pack).toBeDefined();
    expect(result.pack!.packDigest).toMatch(/^sha256:/);
  });

  test("场景包中的哈希账本与编译资产一致", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    const pack = result.pack!;
    // 账本中的每个资产都应该在编译结果中找到
    for (const entry of pack.hashLedger.entries) {
      const asset = pack.compiledAssets.assets.find((a) => a.assetId === entry.assetId);
      expect(asset).toBeDefined();
      expect(asset!.sha256).toBe(entry.sha256);
    }
  });

  test("场景包包含完整的来源溯源", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    const pack = result.pack!;
    expect(pack.sourceProvenance.sceneIRDigest).toBe(ir.deterministicDigest);
    expect(pack.sourceProvenance.validatedDesignIRHash).toBe(ir.sourceProvenance.validatedDesignIRHash);
    expect(pack.sourceProvenance.aestheticExecutionPlanHash).toBe(ir.sourceProvenance.aestheticExecutionPlanHash);
    expect(pack.sourceProvenance.aestheticRuntimePlanHash).toBe(ir.sourceProvenance.aestheticRuntimePlanHash);
  });
});

// ---------------------------------------------------------------------------
// PACK-11: historical boundary → ZERO DIFF
// ---------------------------------------------------------------------------

describe("PACK-11: Historical Boundary ZERO DIFF", () => {
  test("ScenePack 不包含 Core Compiler 的 RuntimeExecutionPlan 字段", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    const json = JSON.stringify(result.pack);
    expect(json).not.toContain("negotiation");
    expect(json).not.toContain("runtimePlan");
    expect(json).not.toContain("assetManifest");
  });

  test("ScenePack 不包含 chineseScore 或 aestheticScore", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    const json = JSON.stringify(result.pack);
    expect(json).not.toContain("chineseScore");
    expect(json).not.toContain("aestheticScore");
  });

  test("ScenePack 不包含 HeartMirror 特定语义", async () => {
    const ir = makeValidIR();
    const result = await compileAndEmitScenePack(ir, {
      generatedAt: "2026-09-16T00:00:00Z",
    });
    const json = JSON.stringify(result.pack);
    expect(json).not.toContain("Kunlun");
    expect(json).not.toContain("Mandala");
    expect(json).not.toContain("I Ching");
  });

  test("资产规划不修改输入的 SceneCompilationIR", () => {
    const ir = makeValidIR();
    const originalDigest = ir.deterministicDigest;
    const originalSceneId = ir.sceneId;
    planAssets(ir, { plannedAt: "2026-09-16T00:00:00Z" });
    expect(ir.deterministicDigest).toBe(originalDigest);
    expect(ir.sceneId).toBe(originalSceneId);
  });
});
