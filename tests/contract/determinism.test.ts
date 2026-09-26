/**
 * End-to-end determinism test — same input → same hash chain.
 *
 * Regression for: PatchEngine.compile 写入 meta.compiledAt = new Date().toISOString()
 * 曾被纳入 computeValidatedIRHash 预映像，导致同一输入在不同时刻执行得到不同的
 * validatedIRHash，破坏 same-input → same-hash 保证。
 *
 * 修复点在 HashPolicy.computeValidatedIRHash 内部排除 /meta/compiledAt；
 * 本测试通过 AestheticPipelineRunner 端到端验证修复效果。
 */

import { AestheticPipelineRunner } from "../../aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "../../aesthetic-integration/aesthetic-sheet-adapter";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import { HashPolicy } from "../../compiler-core/hash-policy";

const DETERMINISTIC_CAPTURED_AT = "2026-09-26T00:00:00.000Z";

function makeSheet(): AestheticConstraintSheet {
  return {
    sheetId: "determinism-sheet-01",
    designBrief: "Determinism check: Song-dynasty academy entrance",
    mood: "song-elegant",
    attributionStatement: "Determinism fixture.",
    structuralDimensions: [
      { id: "void-solid", weight: "primary" },
      { id: "spatial-order", weight: "primary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "Moon-White", hex: "#EDEAE4", areaPct: 0.65, usage: "bg" },
        { role: "secondary", name: "Dai-Qing", hex: "#2C3E50", areaPct: 0.25, usage: "text" },
        { role: "accent", name: "Dull-Gold", hex: "#B8860B", areaPct: 0.05, usage: "accent" },
        { role: "shadow", name: "Mo-Dai", hex: "#1A1A2E", areaPct: 0.05, usage: "shadow" },
      ],
      saturationMax: 0.5,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
    },
    proportion: {
      baseModulePx: 8,
      spacingScale: [1, 2, 3, 4, 6, 8],
      voidSolidRatio: "7:5",
      focalPointsMax: 1,
    },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3 },
    lighting: {
      primarySource: "skylight",
      timeSetting: "cloudy",
      lightDarkRatio: "3:7",
    },
    motion: {
      prototypes: ["light", "cloud"],
      durationMs: [1500, 8000],
      entryMode: "emerge",
      hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true,
      hardFailHits: [],
      forbidden: ["guochao-sticker"],
    },
    violations: [],
    score: 88,
  };
}

function fullCaps(): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
  };
}

const runner = new AestheticPipelineRunner();

describe("Pipeline determinism — same input → same hash chain", () => {
  test("两次执行同一输入，validatedIRHash / executionPlanHash / rawIRHash 全部一致", () => {
    const opts = {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-DET-01",
    };

    const run1 = runner.execute(makeSheet(), fullCaps(), opts);
    const run2 = runner.execute(makeSheet(), fullCaps(), opts);

    expect(run1.pipeline.status).toBe("SUCCESS");
    expect(run2.pipeline.status).toBe("SUCCESS");
    if (run1.pipeline.status !== "SUCCESS" || run2.pipeline.status !== "SUCCESS") return;

    // 核心断言：哈希链位级一致
    expect(run1.pipeline.hashChain.inputHash).toBe(run2.pipeline.hashChain.inputHash);
    expect(run1.pipeline.hashChain.rawIRHash).toBe(run2.pipeline.hashChain.rawIRHash);
    expect(run1.pipeline.hashChain.validatedIRHash).toBe(run2.pipeline.hashChain.validatedIRHash);
    expect(run1.pipeline.hashChain.executionPlanHash).toBe(run2.pipeline.hashChain.executionPlanHash);

    // 审计字段 compiledAt 仍存在于 validatedIR.meta（未被删除），
    // 只是不参与哈希。两次运行的 compiledAt 通常不同（new Date()），
    // 但哈希必须一致 —— 这正是本回归测试要守护的不变量。
    expect(run1.pipeline.validatedIR.meta.compiledAt).toBeTruthy();
    expect(run2.pipeline.validatedIR.meta.compiledAt).toBeTruthy();
  });

  test("即使手动篡改 compiledAt 为另一时间戳，记录在案的 validatedIRHash 仍可复现", () => {
    const opts = {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "TC-DET-02",
    };
    const result = runner.execute(makeSheet(), fullCaps(), opts);
    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    const recorded = result.pipeline.hashChain.validatedIRHash;
    const validatedIR = result.pipeline.validatedIR;

    // 直接篡改 compiledAt 为一个完全不同的时间戳。
    // 修复前：这会改变哈希 → 断言失败。
    // 修复后：compiledAt 被排除 → 重算哈希仍等于记录值。
    const tampered = JSON.parse(JSON.stringify(validatedIR)) as Record<string, unknown>;
    (tampered.meta as Record<string, unknown>).compiledAt = "1999-12-31T23:59:59.999Z";

    const recomputed = HashPolicy.computeValidatedIRHash(tampered);
    expect(recomputed).toBe(recorded);
  });
});
