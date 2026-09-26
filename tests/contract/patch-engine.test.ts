import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";
import { PatchEngine, type GrammarRulePack, type GrammarRule } from "../../compiler-core/patch-engine";
import type { RawDesignIR, ValidatedSceneGraph, RFC6902Op, AuditMetadata } from "../../compiler-core/contracts";
import { CompilerError, CompilerErrorCode } from "../../compiler-core/error-codes";

// ========== 辅助函数 ==========

function makeParam<T>(value: T, confidence = 0.90, unit = "normalized"): RawDesignIR["composition"]["focalPoint"] extends infer _ ? any : never {
  return {
    value,
    unit,
    confidence,
    status: "observed" as const,
    evidence: ["test_evidence_01"],
    source: "vision-estimation" as const,
  };
}

function makeRawIR(overrides?: { negativeSpaceRatio?: number; softness?: number; roughness?: number; temperatureBias?: number; symmetry?: number }): RawDesignIR {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-15T12:00:00Z" },
    composition: {
      focalPoint: makeParam<[number, number]>([0.5, 0.4], 0.92, "vector2"),
      negativeSpaceRatio: makeParam(overrides?.negativeSpaceRatio ?? 0.45, 0.95, "ratio"),
      depthLayerCount: makeParam(4, 0.88, "scalar"),
      symmetry: makeParam(overrides?.symmetry ?? 0.85, 0.90, "normalized"),
    },
    camera: {
      fov: makeParam(35, 0.85, "degrees"),
      shotSize: makeParam("long-shot", 0.90, "scalar"),
      angle: makeParam(0, 0.85, "degrees"),
      height: makeParam(1.6, 0.80, "scalar"),
    },
    lighting: {
      keyLight: {
        azimuth: makeParam(45, 0.85, "degrees"),
        elevation: makeParam(30, 0.85, "degrees"),
        colorTemp: makeParam(5500, 0.80, "kelvin"),
        intensity: makeParam(1.2, 0.85, "scalar"),
        softness: makeParam(overrides?.softness ?? 0.75, 0.88, "normalized"),
      },
      ambientRatio: makeParam(0.25, 0.85, "ratio"),
      rimLightPresent: makeParam(true, 0.90, "scalar"),
    },
    materials: [
      {
        role: "dominant" as const,
        baseType: makeParam("stone", 0.90, "scalar"),
        roughness: makeParam(overrides?.roughness ?? 0.70, 0.85, "normalized"),
        metalness: makeParam(0.1, 0.90, "normalized"),
        wear: makeParam(0.4, 0.80, "normalized"),
      },
    ],
    color: {
      dominant: makeParam("#2b2b2b", 0.95, "hex"),
      secondary: makeParam("#7c7c7c", 0.92, "hex"),
      accent: makeParam("#d4af37", 0.88, "hex"),
      contrastRatio: makeParam(4.5, 0.90, "ratio"),
      temperatureBias: makeParam(overrides?.temperatureBias ?? 0.10, 0.85, "normalized"),
    },
    provenance: {
      extractorVersion: "1.0.0",
      inferenceExecutionMs: 120,
      rawIntegrityStatus: "READY" as const,
      hashManifest: { algorithm: "SHA-256" as const, canonicalization: "RFC8785" as const },
      inputHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rawIRHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

function makeStandardGrammar(): GrammarRulePack {
  return {
    packName: "chinese-aesthetic",
    version: "1.0.0",
    description: "test grammar",
    rules: [
      {
        ruleId: "CA-RULE-01-XUSHI",
        principle: "虚实相生",
        category: "composition",
        targetPath: "/composition/negativeSpaceRatio/value",
        condition: { operator: "<", value: 0.35 },
        mutation: { op: "replace", value: 0.45 },
        severity: "P1_WARNING",
        reason: "恢复留白呼吸感",
      },
      {
        ruleId: "CA-RULE-02-YUNRUN",
        principle: "气韵生动",
        category: "lighting",
        targetPath: "/lighting/keyLight/softness/value",
        condition: { operator: "<", value: 0.50 },
        mutation: { op: "replace", value: 0.75 },
        severity: "P1_WARNING",
        reason: "柔化主光边缘",
      },
    ],
  };
}

function makeSceneGraph(): ValidatedSceneGraph {
  const rawIR = makeRawIR();
  return structuredClone({
    composition: rawIR.composition,
    camera: rawIR.camera,
    lighting: rawIR.lighting,
    materials: rawIR.materials,
    color: rawIR.color,
  }) as ValidatedSceneGraph;
}

function makeAudit(ruleId = "TEST-RULE-01"): AuditMetadata {
  return { ruleId, principle: "test", reason: "test reason" };
}

// ========== 测试套件 ==========

describe("Patch Engine — RFC 6902 AST-to-AST 转译器", () => {
  // TC-PE-01: Replace 操作
  test("TC-PE-01 Replace: 成功修改留白比，原值注入 audit.fromValue，AST 参数标记为 grammar-derived", () => {
    const engine = new PatchEngine(makeStandardGrammar());
    // negativeSpaceRatio=0.20 < 0.35，触发 CA-RULE-01
    const rawIR = makeRawIR({ negativeSpaceRatio: 0.20 });

    const result = engine.compile(rawIR);

    // 补丁存在且为 replace
    expect(result.patches.length).toBeGreaterThanOrEqual(1);
    const replacePatch = result.patches.find((p) => p.op === "replace" && p.path === "/composition/negativeSpaceRatio/value");
    expect(replacePatch).toBeDefined();
    if (replacePatch && replacePatch.op === "replace") {
      expect(replacePatch.value).toBe(0.45);
      expect(replacePatch.audit.fromValue).toBe(0.20);
      expect(replacePatch.audit.ruleId).toBe("CA-RULE-01-XUSHI");
    }

    // AST 中值已修改
    expect(result.validated.composition.negativeSpaceRatio.value).toBe(0.45);

    // 参数状态递进：标记为 grammar-derived
    expect(result.validated.composition.negativeSpaceRatio.status).toBe("grammar-derived");
    expect(result.validated.composition.negativeSpaceRatio.source).toBe("grammar-rule");
    expect(result.validated.composition.negativeSpaceRatio.derivedFrom).toBe("CA-RULE-01-XUSHI");
  });

  // TC-PE-02: Add 数组末尾 (-)
  test("TC-PE-02 Add array end (-): 成功使用 /materials/- 插入新材质项，数组长度增加", () => {
    const engine = new PatchEngine(makeStandardGrammar());
    const sceneGraph = makeSceneGraph();
    const initialLength = sceneGraph.materials.length;

    const newMaterial = {
      role: "accent" as const,
      baseType: makeParam("wood", 0.80, "scalar"),
      roughness: makeParam(0.6, 0.80, "normalized"),
      metalness: makeParam(0.0, 0.80, "normalized"),
      wear: makeParam(0.3, 0.80, "normalized"),
    };

    const patch: Extract<RFC6902Op, { op: "add" }> = {
      op: "add",
      path: "/materials/-",
      value: newMaterial,
      audit: makeAudit(),
    };

    // 通过类型断言访问私有方法
    (engine as any).applyAdd(sceneGraph, patch);

    expect(sceneGraph.materials.length).toBe(initialLength + 1);
    expect(sceneGraph.materials[initialLength].role).toBe("accent");
  });

  // TC-PE-03: Remove 操作
  test("TC-PE-03 Remove: 成功删除指定属性；删除不存在路径抛出 PATCH_PATH_NOT_FOUND", () => {
    const engine = new PatchEngine(makeStandardGrammar());

    // 成功删除
    const sceneGraph1 = makeSceneGraph();
    const removePatch: Extract<RFC6902Op, { op: "remove" }> = {
      op: "remove",
      path: "/composition/symmetry",
      audit: makeAudit(),
    };
    (engine as any).applyRemove(sceneGraph1, removePatch);
    expect((sceneGraph1.composition as any).symmetry).toBeUndefined();

    // 删除不存在路径抛出错误
    const sceneGraph2 = makeSceneGraph();
    const removeNonExistent: Extract<RFC6902Op, { op: "remove" }> = {
      op: "remove",
      path: "/composition/nonexistent",
      audit: makeAudit(),
    };
    expect(() => (engine as any).applyRemove(sceneGraph2, removeNonExistent)).toThrow(CompilerError);
    expect(() => (engine as any).applyRemove(sceneGraph2, removeNonExistent)).toThrow(
      /PATCH_PATH_NOT_FOUND/,
    );
  });

  // TC-PE-04: Test 操作
  test("TC-PE-04 Test: 相等时通过；不相等时抛出 PATCH_TEST_FAILED", () => {
    const engine = new PatchEngine(makeStandardGrammar());
    const sceneGraph = makeSceneGraph();

    // 相等时通过（不抛出）
    const testEqual: Extract<RFC6902Op, { op: "test" }> = {
      op: "test",
      path: "/composition/negativeSpaceRatio/value",
      value: 0.45,
      audit: makeAudit(),
    };
    expect(() => (engine as any).applyTest(sceneGraph, testEqual)).not.toThrow();

    // 不相等时抛出
    const testNotEqual: Extract<RFC6902Op, { op: "test" }> = {
      op: "test",
      path: "/composition/negativeSpaceRatio/value",
      value: 0.99,
      audit: makeAudit(),
    };
    expect(() => (engine as any).applyTest(sceneGraph, testNotEqual)).toThrow(CompilerError);
    expect(() => (engine as any).applyTest(sceneGraph, testNotEqual)).toThrow(/PATCH_TEST_FAILED/);
  });

  // TC-PE-05: Move / Copy 操作
  test("TC-PE-05 Move/Copy: move 转移属性且原属性被移除；copy 复制成功且保留原属性", () => {
    const engine = new PatchEngine(makeStandardGrammar());

    // Move 操作
    const sceneGraph1 = makeSceneGraph();
    const originalValue = sceneGraph1.composition.symmetry;
    const movePatch: Extract<RFC6902Op, { op: "move" }> = {
      op: "move",
      from: "/composition/symmetry",
      path: "/composition/depthLayerCount",
      audit: makeAudit(),
    };
    (engine as any).applyMove(sceneGraph1, movePatch);
    expect((sceneGraph1.composition as any).symmetry).toBeUndefined();
    expect(sceneGraph1.composition.depthLayerCount).toEqual(originalValue);

    // Copy 操作
    const sceneGraph2 = makeSceneGraph();
    const copyPatch: Extract<RFC6902Op, { op: "copy" }> = {
      op: "copy",
      from: "/composition/symmetry",
      path: "/composition/depthLayerCount",
      audit: makeAudit(),
    };
    (engine as any).applyCopy(sceneGraph2, copyPatch);
    // 原属性保留
    expect(sceneGraph2.composition.symmetry).toBeDefined();
    // 目标属性被复制
    expect(sceneGraph2.composition.depthLayerCount).toEqual(sceneGraph2.composition.symmetry);
  });

  // TC-PE-06: 补丁顺序确定性
  test("TC-PE-06 Deterministic ordering: 无序触发的规则最终在 patches 中保持 ruleId 升序", () => {
    // 构造规则顺序乱序的 grammar（CA-RULE-02 在 CA-RULE-01 前面）
    const unorderedGrammar: GrammarRulePack = {
      packName: "test",
      version: "1.0.0",
      description: "unordered test",
      rules: [
        {
          ruleId: "CA-RULE-02-YUNRUN",
          principle: "气韵生动",
          category: "lighting",
          targetPath: "/lighting/keyLight/softness/value",
          condition: { operator: "<", value: 0.50 },
          mutation: { op: "replace", value: 0.75 },
          severity: "P1_WARNING",
          reason: "柔化",
        },
        {
          ruleId: "CA-RULE-01-XUSHI",
          principle: "虚实相生",
          category: "composition",
          targetPath: "/composition/negativeSpaceRatio/value",
          condition: { operator: "<", value: 0.35 },
          mutation: { op: "replace", value: 0.45 },
          severity: "P1_WARNING",
          reason: "留白",
        },
      ],
    };

    const engine = new PatchEngine(unorderedGrammar);
    // 同时触发两条规则：negativeSpaceRatio=0.20, softness=0.30
    const rawIR = makeRawIR({ negativeSpaceRatio: 0.20, softness: 0.30 });

    const result = engine.compile(rawIR);

    expect(result.patches.length).toBe(2);
    // 验证按 ruleId 升序排列
    const ruleIds = result.patches.map((p) => p.audit.ruleId);
    expect(ruleIds).toEqual(["CA-RULE-01-XUSHI", "CA-RULE-02-YUNRUN"]);
  });

  // TC-PE-07: 合规分核算
  test("TC-PE-07 Compliance scoring: auditReport.complianceScore 在 0~1 范围内，触发规则后分数合理", () => {
    const engine = new PatchEngine(makeStandardGrammar());

    // 不触发任何规则（所有值都在合规范围内）
    const rawIRPass = makeRawIR({ negativeSpaceRatio: 0.50, softness: 0.80 });
    const resultPass = engine.compile(rawIRPass);
    expect(resultPass.auditReport.complianceScore).toBeGreaterThanOrEqual(0);
    expect(resultPass.auditReport.complianceScore).toBeLessThanOrEqual(1);
    expect(resultPass.auditReport.mutationsApplied).toBe(0);
    expect(resultPass.auditReport.complianceScore).toBe(1.0); // 无变更，满分

    // 触发规则（negativeSpaceRatio=0.20）
    const rawIRMutated = makeRawIR({ negativeSpaceRatio: 0.20 });
    const resultMutated = engine.compile(rawIRMutated);
    expect(resultMutated.auditReport.mutationsApplied).toBeGreaterThanOrEqual(1);
    expect(resultMutated.auditReport.complianceScore).toBeGreaterThanOrEqual(0);
    expect(resultMutated.auditReport.complianceScore).toBeLessThanOrEqual(1);
    // 触发变更后分数应低于满分
    expect(resultMutated.auditReport.complianceScore).toBeLessThan(1.0);
  });

  // TC-PE-08: Schema 物理同构验证
  test("TC-PE-08 Schema isomorphism: 编译产出的 ValidatedDesignIR 100% 通过 G0 Schema 校验", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);

    const schemaPath = path.join(__dirname, "../../schemas/validated-design-ir.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const validate = ajv.compile(schema);

    const engine = new PatchEngine(makeStandardGrammar());
    const rawIR = makeRawIR({ negativeSpaceRatio: 0.20, softness: 0.30 });
    const result = engine.compile(rawIR);

    const isValid = validate(result);
    if (!isValid) {
      console.error("Schema validation errors:", validate.errors);
    }
    expect(isValid).toBe(true);

    // 验证根级仅包含允许的字段（Hash Flow Contract）
    const rootKeys = Object.keys(result);
    expect(rootKeys).toEqual(
      expect.arrayContaining(["$schema", "meta", "sourceRef", "patches", "validated", "auditReport"]),
    );
    // 严禁存在 provenance 或 validatedIRHash 字段
    expect(rootKeys).not.toContain("provenance");
    expect(rootKeys).not.toContain("validatedIRHash");

    // sourceRef.rawIRHash 严格透传
    expect(result.sourceRef.rawIRHash).toBe(rawIR.provenance.rawIRHash);
  });

  // 额外：纯函数幂等性验证
  test("纯函数幂等性: 相同输入多次编译产出相同结果（除 compiledAt 时间戳）", () => {
    const engine = new PatchEngine(makeStandardGrammar());
    const rawIR = makeRawIR({ negativeSpaceRatio: 0.20 });

    const result1 = engine.compile(rawIR);
    const result2 = engine.compile(rawIR);

    // 排除 compiledAt 后比较
    const { meta: meta1, ...rest1 } = result1;
    const { meta: meta2, ...rest2 } = result2;
    expect(rest1).toEqual(rest2);
    expect(meta1.grammarPack).toBe(meta2.grammarPack);
    expect(meta1.grammarVersion).toBe(meta2.grammarVersion);

    // 输入不被修改
    expect(rawIR.composition.negativeSpaceRatio.value).toBe(0.20);
  });

  // ========== Rule Coverage Audit ==========
  // 编译时覆盖率审计：SILENT_NOOP 行为可观测性。
  // target 不存在的规则仍静默跳过（不报错），但 auditReport.ruleCoverage 会记录。

  function loadRealGrammar(): GrammarRulePack {
    const grammarPath = path.join(__dirname, "../../config/grammar-rules.json");
    return JSON.parse(fs.readFileSync(grammarPath, "utf8")) as GrammarRulePack;
  }

  describe("Rule Coverage Audit — auditReport.ruleCoverage", () => {
    test("TC-RC-01: total === 42 (CA-RULE-01..38 + ANTI-AI-01..04)", () => {
      const engine = new PatchEngine(loadRealGrammar());
      const result = engine.compile(makeRawIR());
      expect(result.auditReport.ruleCoverage.total).toBe(42);
    });

    test("TC-RC-02: targetFound >= 40 (≥95% coverage on standard fixture)", () => {
      const engine = new PatchEngine(loadRealGrammar());
      const result = engine.compile(makeRawIR());
      const rc = result.auditReport.ruleCoverage;
      expect(rc.targetFound).toBeGreaterThanOrEqual(40);
      expect(rc.targetFound + rc.targetMissing).toBe(rc.total);
    });

    test("TC-RC-03: adapter-补齐的 softness/temperatureBias/rimLightPresent 不在 missingTargets", () => {
      const engine = new PatchEngine(loadRealGrammar());
      const result = engine.compile(makeRawIR());
      const missing = result.auditReport.ruleCoverage.missingTargets;
      expect(missing).not.toContain("/lighting/keyLight/softness/value");
      expect(missing).not.toContain("/color/temperatureBias/value");
      expect(missing).not.toContain("/lighting/rimLightPresent/value");
    });

    test("TC-RC-04: perRule 长度=42 且按 ruleId ASCII 升序", () => {
      const engine = new PatchEngine(loadRealGrammar());
      const result = engine.compile(makeRawIR());
      const perRule = result.auditReport.ruleCoverage.perRule;
      expect(perRule.length).toBe(42);
      const ids = perRule.map((r) => r.ruleId);
      const sorted = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sorted);
      // 每条记录字段完整
      for (const entry of perRule) {
        expect(typeof entry.ruleId).toBe("string");
        expect(typeof entry.targetPath).toBe("string");
        expect(typeof entry.targetFound).toBe("boolean");
        expect(typeof entry.triggered).toBe("boolean");
      }
    });

    test("TC-RC-05: 移除 negativeSpaceRatio 后，对应规则 targetFound=false 且不崩溃", () => {
      const engine = new PatchEngine(loadRealGrammar());
      const rawIR = makeRawIR();
      // 物理删除 negativeSpaceRatio 节点，模拟 adapter 缺参
      delete (rawIR.composition as Record<string, unknown>).negativeSpaceRatio;

      // 不抛异常（SILENT_NOOP 行为）
      const result = engine.compile(rawIR);

      const rc = result.auditReport.ruleCoverage;
      // 所有指向 /composition/negativeSpaceRatio/value 的规则 targetFound=false
      const nsRules = rc.perRule.filter((r) => r.targetPath === "/composition/negativeSpaceRatio/value");
      expect(nsRules.length).toBeGreaterThan(0);
      for (const r of nsRules) {
        expect(r.targetFound).toBe(false);
      }
      // missingTargets 包含该路径
      expect(rc.missingTargets).toContain("/composition/negativeSpaceRatio/value");
      // 其余规则仍 targetFound=true
      expect(rc.targetFound).toBeGreaterThan(0);
    });
  });
});
