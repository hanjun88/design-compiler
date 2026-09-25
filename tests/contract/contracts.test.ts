import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";
import { ValidatedDesignIR, RuntimeExecutionPlan, DataGateResult } from "../../compiler-core/contracts";
import { ScoringEngine, ComplianceScoringWeights } from "../../compiler-core/scoring";
import { CompilerErrorCode } from "../../compiler-core/error-codes";

describe("Step 0: Schema-Contract Physical Isomorphism & Rules Assertions", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const valSchemaPath = path.join(__dirname, "../../schemas/validated-design-ir.schema.json");
  const execSchemaPath = path.join(__dirname, "../../schemas/execution-plan.schema.json");
  const estSchemaPath = path.join(__dirname, "../../schemas/estimated-parameter.schema.json");

  ajv.addSchema(JSON.parse(fs.readFileSync(estSchemaPath, "utf8")), "estimated-parameter.schema.json");
  const validateVal = ajv.compile(JSON.parse(fs.readFileSync(valSchemaPath, "utf8")));
  const validateExec = ajv.compile(JSON.parse(fs.readFileSync(execSchemaPath, "utf8")));

  // 100% 完整结构 ValidatedDesignIR 夹具，无 any、无空对象
  const validFullValidatedIR: ValidatedDesignIR = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: {
      grammarPack: "chinese-aesthetic",
      grammarVersion: "1.0.0",
      compiledAt: "2026-09-15T12:00:00Z"
    },
    sourceRef: {
      rawIRHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rawSchemaVersion: "1.0.0"
    },
    patches: [
      {
        op: "replace",
        path: "/composition/negativeSpaceRatio/value",
        value: 0.45,
        audit: {
          ruleId: "CA-RULE-01-XUSHI",
          principle: "虚实相生",
          reason: "恢复东方美学留白呼吸感",
          fromValue: 0.28
        }
      }
    ],
    validated: {
      composition: {
        focalPoint: {
          value: [0.5, 0.4],
          unit: "vector2",
          confidence: 0.92,
          status: "observed",
          evidence: ["saliency_peak"],
          source: "vision-estimation"
        },
        negativeSpaceRatio: {
          value: 0.45,
          unit: "ratio",
          confidence: 0.95,
          status: "grammar-derived",
          evidence: ["rule_applied"],
          source: "grammar-rule",
          derivedFrom: "CA-RULE-01-XUSHI"
        },
        depthLayerCount: {
          value: 4,
          unit: "scalar",
          confidence: 0.88,
          status: "estimated",
          evidence: ["depth_segmentation"],
          source: "depth-estimator"
        },
        symmetry: {
          value: 0.85,
          unit: "normalized",
          confidence: 0.9,
          status: "estimated",
          evidence: ["bilateral_match"],
          source: "vision-estimation"
        }
      },
      camera: {
        fov: {
          value: 35,
          unit: "degrees",
          confidence: 0.85,
          status: "estimated",
          evidence: ["perspective_vanishing_point"],
          source: "vision-estimation"
        },
        shotSize: {
          value: "long-shot",
          unit: "scalar",
          confidence: 0.9,
          status: "observed",
          evidence: ["scale_ratio"],
          source: "vision-estimation"
        },
        angle: {
          value: 0,
          unit: "degrees",
          confidence: 0.85,
          status: "estimated",
          evidence: ["horizon_level"],
          source: "vision-estimation"
        },
        height: {
          value: 1.6,
          unit: "scalar",
          confidence: 0.8,
          status: "estimated",
          evidence: ["eye_level_estimate"],
          source: "vision-estimation"
        }
      },
      lighting: {
        keyLight: {
          azimuth: {
            value: 45,
            unit: "degrees",
            confidence: 0.85,
            status: "estimated",
            evidence: ["shadow_cast"],
            source: "vision-estimation"
          },
          elevation: {
            value: 30,
            unit: "degrees",
            confidence: 0.85,
            status: "estimated",
            evidence: ["shadow_angle"],
            source: "vision-estimation"
          },
          colorTemp: {
            value: 5500,
            unit: "kelvin",
            confidence: 0.8,
            status: "estimated",
            evidence: ["specular_white_balance"],
            source: "vision-estimation"
          },
          intensity: {
            value: 1.2,
            unit: "scalar",
            confidence: 0.85,
            status: "estimated",
            evidence: ["luminance_histogram"],
            source: "vision-estimation"
          },
          softness: {
            value: 0.75,
            unit: "normalized",
            confidence: 0.88,
            status: "grammar-derived",
            evidence: ["rule_applied"],
            source: "grammar-rule"
          }
        },
        ambientRatio: {
          value: 0.25,
          unit: "ratio",
          confidence: 0.85,
          status: "estimated",
          evidence: ["ambient_luminance"],
          source: "vision-estimation"
        },
        rimLightPresent: {
          value: true,
          unit: "scalar",
          confidence: 0.9,
          status: "observed",
          evidence: ["silhouette_highlight"],
          source: "vision-estimation"
        }
      },
      materials: [
        {
          role: "dominant",
          baseType: {
            value: "stone",
            unit: "scalar",
            confidence: 0.9,
            status: "observed",
            evidence: ["texture_classifier"],
            source: "vision-estimation"
          },
          roughness: {
            value: 0.7,
            unit: "normalized",
            confidence: 0.85,
            status: "estimated",
            evidence: ["specular_spread"],
            source: "vision-estimation"
          },
          metalness: {
            value: 0.1,
            unit: "normalized",
            confidence: 0.9,
            status: "estimated",
            evidence: ["reflectance_ratio"],
            source: "vision-estimation"
          },
          wear: {
            value: 0.4,
            unit: "normalized",
            confidence: 0.8,
            status: "estimated",
            evidence: ["edge_chipping"],
            source: "vision-estimation"
          }
        }
      ],
      color: {
        dominant: {
          value: "#2b2b2b",
          unit: "hex",
          confidence: 0.95,
          status: "observed",
          evidence: ["palette_clustering"],
          source: "vision-estimation"
        },
        secondary: {
          value: "#7c7c7c",
          unit: "hex",
          confidence: 0.92,
          status: "observed",
          evidence: ["palette_clustering"],
          source: "vision-estimation"
        },
        accent: {
          value: "#d4af37",
          unit: "hex",
          confidence: 0.88,
          status: "observed",
          evidence: ["palette_clustering"],
          source: "vision-estimation"
        },
        contrastRatio: {
          value: 4.5,
          unit: "ratio",
          confidence: 0.9,
          status: "derived",
          evidence: ["wcag_formula"],
          source: "fallback-default"
        },
        temperatureBias: {
          value: -0.1,
          unit: "normalized",
          confidence: 0.85,
          status: "estimated",
          evidence: ["color_temperature_histogram"],
          source: "vision-estimation"
        }
      }
    },
    auditReport: {
      rulesEvaluated: 2,
      patchesEvaluated: 1,
      mutationsApplied: 1,
      testsPassed: 0,
      testsFailed: 0,
      complianceScore: 0.95,
      violations: [
        {
          ruleId: "CA-RULE-01-XUSHI",
          severity: "P1_WARNING",
          actionTaken: "MUTATED",
          message: "Negative space adjusted"
        }
      ]
    }
  };

  test("P0 同构断言: ValidatedDesignIR 真实完整结构必须 100% 通过冻结 Schema", () => {
    const isValid = validateVal(validFullValidatedIR);
    if (!isValid) {
      console.error(validateVal.errors);
    }
    expect(isValid).toBe(true);
  });

  test("P0 同构断言: RuntimeExecutionPlan 真实完整结构必须 100% 通过冻结 Schema", () => {
    const validPlan: RuntimeExecutionPlan = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      negotiation: {
        resolutionStatus: "ACCEPTED",
        selectedTier: "TIER_A",
        requirements: {
          requiredCapabilities: ["webgl2", "floatTextures"],
          preferredCapabilities: ["anisotropyExtension"]
        },
        capabilities: {
          webgl2: true,
          floatTextures: true,
          anisotropyExtension: true
        },
        downgrades: [],
        blockingFailures: []
      },
      runtimePlan: {
        pipeline: {
          rendererType: "WebGL2Renderer",
          toneMapping: "AgXToneMapping",
          colorSpace: "srgb-linear",
          postprocessing: ["volumetric_fog"]
        },
        sceneBindings: {
          cameraRig: { type: "CinematicOrbit", params: { fov: 35 } },
          lights: [{ type: "directional", parameters: { azimuth: 45, elevation: 30 } }],
          materials: [{ bindingId: "stone_dominant", shaderType: "MeshPhysicalMaterial", uniforms: { roughness: 0.7 } }]
        }
      },
      renderTarget: { width: 1920, height: 1080, pixelRatio: 1 },
      assetManifest: [{
        assetId: "volumetric-frag",
        type: "shader",
        uri: "assets/shaders/volumetric.frag",
        hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        loadingStrategy: "eager",
        required: true
      }]
    };

    const isValid = validateExec(validPlan);
    if (!isValid) {
      console.error(validateExec.errors);
    }
    expect(isValid).toBe(true);
  });

  test("P2 门禁断言: complianceWeights 权重之和若不为 1.0 必须强拦截", () => {
    const invalidWeights: ComplianceScoringWeights = {
      composition: 0.4,
      lighting: 0.3,
      color: 0.2,
      materials: 0.2 // 总和 1.1
    };

    expect(() => ScoringEngine.validateWeights(invalidWeights)).toThrow(
      /Compliance weights must sum to 1.0/
    );

    const validWeights: ComplianceScoringWeights = {
      composition: 0.35,
      lighting: 0.25,
      color: 0.20,
      materials: 0.20
    };

    expect(() => ScoringEngine.validateWeights(validWeights)).not.toThrow();
  });
});
