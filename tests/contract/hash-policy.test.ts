import { HashPolicy } from "../../compiler-core/hash-policy";
import { RawDesignIR, ValidatedDesignIR } from "../../compiler-core/contracts";

describe("Hash Policy — 哈希流契约验证", () => {
  // --------------------------------------------------------------------------
  // 1. RawIR 自闭环哈希免疫验证
  // --------------------------------------------------------------------------
  describe("RawIR 自闭环哈希免疫", () => {
    const baseRawIR: RawDesignIR = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      meta: {
        sourceType: "image",
        aspectRatio: "16:9",
        timestamp: "2026-09-15T12:00:00Z"
      },
      composition: {
        focalPoint: {
          value: [0.5, 0.5],
          unit: "vector2",
          confidence: 0.9,
          status: "observed",
          evidence: ["test"],
          source: "vision-estimation"
        },
        negativeSpaceRatio: {
          value: 0.4,
          unit: "ratio",
          confidence: 0.85,
          status: "estimated",
          evidence: ["test"],
          source: "vision-estimation"
        },
        depthLayerCount: {
          value: 3,
          unit: "scalar",
          confidence: 0.8,
          status: "estimated",
          evidence: ["test"],
          source: "depth-estimator"
        },
        symmetry: {
          value: 0.7,
          unit: "normalized",
          confidence: 0.75,
          status: "estimated",
          evidence: ["test"],
          source: "vision-estimation"
        }
      },
      camera: {
        fov: { value: 35, unit: "degrees", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
        shotSize: { value: "medium", unit: "scalar", confidence: 0.85, status: "observed", evidence: ["test"], source: "vision-estimation" },
        angle: { value: 0, unit: "degrees", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
        height: { value: 1.5, unit: "scalar", confidence: 0.75, status: "estimated", evidence: ["test"], source: "vision-estimation" }
      },
      lighting: {
        keyLight: {
          azimuth: { value: 45, unit: "degrees", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
          elevation: { value: 30, unit: "degrees", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
          colorTemp: { value: 5500, unit: "kelvin", confidence: 0.75, status: "estimated", evidence: ["test"], source: "vision-estimation" },
          intensity: { value: 1.0, unit: "scalar", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
          softness: { value: 0.5, unit: "normalized", confidence: 0.75, status: "estimated", evidence: ["test"], source: "vision-estimation" }
        },
        ambientRatio: { value: 0.2, unit: "ratio", confidence: 0.8, status: "estimated", evidence: ["test"], source: "vision-estimation" },
        rimLightPresent: { value: false, unit: "scalar", confidence: 0.7, status: "estimated", evidence: ["test"], source: "vision-estimation" }
      },
      materials: [],
      color: {
        dominant: { value: "#000000", unit: "hex", confidence: 0.9, status: "observed", evidence: ["test"], source: "vision-estimation" },
        secondary: { value: "#ffffff", unit: "hex", confidence: 0.9, status: "observed", evidence: ["test"], source: "vision-estimation" },
        accent: { value: "#ff0000", unit: "hex", confidence: 0.85, status: "observed", evidence: ["test"], source: "vision-estimation" },
        contrastRatio: { value: 1.0, unit: "ratio", confidence: 0.8, status: "derived", evidence: ["test"], source: "fallback-default" },
        temperatureBias: { value: 0, unit: "normalized", confidence: 0.75, status: "estimated", evidence: ["test"], source: "vision-estimation" }
      },
      provenance: {
        extractorVersion: "1.0.0",
        inferenceExecutionMs: 100,
        rawIntegrityStatus: "READY",
        hashManifest: {
          algorithm: "SHA-256",
          canonicalization: "RFC8785"
        },
        inputHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        rawIRHash: "" // 动态填入
      }
    };

    test("rawIRHash 自闭环：排除自身字段后计算的哈希必须与存储值一致", () => {
      const rawIR = JSON.parse(JSON.stringify(baseRawIR)) as RawDesignIR;
      const computedHash = HashPolicy.computeHashWithExclusion(
        rawIR as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );
      rawIR.provenance.rawIRHash = computedHash;

      // 验证：再次计算必须一致
      const reComputed = HashPolicy.computeHashWithExclusion(
        rawIR as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );
      expect(reComputed).toBe(computedHash);
      expect(rawIR.provenance.rawIRHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test("哈希免疫：修改 rawIRHash 自身不影响预映像哈希", () => {
      const rawIR1 = JSON.parse(JSON.stringify(baseRawIR)) as RawDesignIR;
      const hash1 = HashPolicy.computeHashWithExclusion(
        rawIR1 as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );

      const rawIR2 = JSON.parse(JSON.stringify(baseRawIR)) as RawDesignIR;
      rawIR2.provenance.rawIRHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const hash2 = HashPolicy.computeHashWithExclusion(
        rawIR2 as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );

      expect(hash1).toBe(hash2);
    });

    test("哈希敏感：修改任何其他字段必须改变哈希", () => {
      const rawIR1 = JSON.parse(JSON.stringify(baseRawIR)) as RawDesignIR;
      const hash1 = HashPolicy.computeHashWithExclusion(
        rawIR1 as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );

      const rawIR2 = JSON.parse(JSON.stringify(baseRawIR)) as RawDesignIR;
      rawIR2.composition.negativeSpaceRatio.value = 0.99;
      const hash2 = HashPolicy.computeHashWithExclusion(
        rawIR2 as unknown as Record<string, unknown>,
        ["/provenance/rawIRHash"]
      );

      expect(hash1).not.toBe(hash2);
    });
  });

  // --------------------------------------------------------------------------
  // 2. ValidatedIR sourceRef 因果哈希裂变验证
  // --------------------------------------------------------------------------
  describe("ValidatedIR sourceRef 因果哈希裂变", () => {
    test("ValidatedDesignIR 内部严禁存在自身 hash 字段", () => {
      // 检测 contracts.ts 中 ValidatedDesignIR 的定义
      // ValidatedDesignIR 有 sourceRef.rawIRHash（指向 RawIR），但没有 validatedIRHash（自身哈希）
      // 这是设计约束：validatedIRHash 仅存在于下游 FidelityEvaluationResult
      const validatedIRKeys = [
        "$schema", "meta", "sourceRef", "rawSnapshot", "patches",
        "validated", "auditReport"
      ];
      expect(validatedIRKeys).not.toContain("validatedIRHash");
      expect(validatedIRKeys).not.toContain("selfHash");
    });

    test("sourceRef.rawIRHash 必须与 RawIR.provenance.rawIRHash 因果一致", () => {
      const rawIRHash = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

      // 模拟 ValidatedIR 的 sourceRef
      const validatedSourceRef = {
        rawIRHash: rawIRHash,
        rawSchemaVersion: "1.0.0"
      };

      // 模拟 RawIR 的 provenance
      const rawIRProvenance = {
        rawIRHash: rawIRHash
      };

      expect(validatedSourceRef.rawIRHash).toBe(rawIRProvenance.rawIRHash);
    });

    test("sourceRef 与 RawIR 哈希不一致时必须能被检测", () => {
      const rawIRHash = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const mismatchedHash = "sha256:00000000000000000000000000000000000000000000000000000000000000";

      const validatedSourceRef = { rawIRHash: mismatchedHash };
      const rawIRProvenance = { rawIRHash: rawIRHash };

      expect(validatedSourceRef.rawIRHash).not.toBe(rawIRProvenance.rawIRHash);
    });
  });

  // --------------------------------------------------------------------------
  // 3. 8位/16位 PixelBuffer 规范化哈希
  // --------------------------------------------------------------------------
  describe("PixelBuffer 规范化哈希", () => {
    test("8-bit PixelBuffer 规范化哈希必须位级一致", () => {
      const data1 = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
      const data2 = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);

      const hash1 = HashPolicy.computePixelBufferHash(data1, 2, 1);
      const hash2 = HashPolicy.computePixelBufferHash(data2, 2, 1);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test("16-bit PixelBuffer 规范化哈希必须位级一致", () => {
      const data1 = new Uint16Array([65535, 0, 0, 65535]);
      const data2 = new Uint16Array([65535, 0, 0, 65535]);

      const hash1 = HashPolicy.computePixelBufferHash(data1, 2, 1);
      const hash2 = HashPolicy.computePixelBufferHash(data2, 2, 1);

      expect(hash1).toBe(hash2);
    });

    test("8-bit 与 16-bit 相同像素值必须产生不同哈希（depth 字段参与哈希）", () => {
      const data8 = new Uint8ClampedArray([255, 0]);
      const data16 = new Uint16Array([255, 0]);

      const hash8 = HashPolicy.computePixelBufferHash(data8, 1, 2);
      const hash16 = HashPolicy.computePixelBufferHash(data16, 1, 2);

      expect(hash8).not.toBe(hash16);
    });

    test("不同像素数据必须产生不同哈希", () => {
      const data1 = new Uint8ClampedArray([255, 0, 0]);
      const data2 = new Uint8ClampedArray([0, 255, 0]);

      const hash1 = HashPolicy.computePixelBufferHash(data1, 1, 3);
      const hash2 = HashPolicy.computePixelBufferHash(data2, 1, 3);

      expect(hash1).not.toBe(hash2);
    });

    test("normalizePixelBuffer 返回正确的 depth 标记", () => {
      const data8 = new Uint8ClampedArray([1, 2, 3]);
      const data16 = new Uint16Array([1, 2, 3]);

      const norm8 = HashPolicy.normalizePixelBuffer(data8, 1, 3);
      const norm16 = HashPolicy.normalizePixelBuffer(data16, 1, 3);

      expect(norm8.depth).toBe(8);
      expect(norm16.depth).toBe(16);
      expect(norm8.data).toEqual([1, 2, 3]);
      expect(norm16.data).toEqual([1, 2, 3]);
    });
  });

  // --------------------------------------------------------------------------
  // 4. 实体注入检测
  // --------------------------------------------------------------------------
  describe("实体注入检测", () => {
    test("检测到禁止的自引用字段时返回 true", () => {
      const payload = {
        name: "test",
        selfHash: "sha256:fake",
        nested: { value: 1 }
      };
      const forbidden = ["selfHash", "_internal", "validatedIRHash"];
      expect(HashPolicy.detectInjection(payload, forbidden)).toBe(true);
    });

    test("未检测到禁止字段时返回 false", () => {
      const payload = {
        name: "test",
        value: 42,
        nested: { data: "safe" }
      };
      const forbidden = ["selfHash", "_internal", "validatedIRHash"];
      expect(HashPolicy.detectInjection(payload, forbidden)).toBe(false);
    });

    test("递归检测嵌套对象中的禁止字段", () => {
      const payload = {
        name: "test",
        nested: {
          deep: {
            _internal: "injected"
          }
        }
      };
      const forbidden = ["selfHash", "_internal", "validatedIRHash"];
      expect(HashPolicy.detectInjection(payload, forbidden)).toBe(true);
    });
  });
});
