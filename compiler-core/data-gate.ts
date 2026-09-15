import { HashPolicy } from "./hash-policy";
import { JsonPointerResolver } from "./json-pointer";
import type { DataGateResult, FidelityEvaluationResult, RawDesignIR } from "./contracts";

/**
 * G1 Data Gate — ABI 1.0.0
 *
 * Invariants:
 * - confidence < confidenceFloor => status=unknown AND value=null.
 * - Required paths are RFC 6901 JSON Pointers and are resolved after rewriting.
 * - Missing or unknown required parameters => BLOCKED_DATA; no downstream grammar.
 * - Optional unknown parameters do not block the pipeline.
 * - Input RawDesignIR is never mutated; hashing occurs only on the sanitized PASS copy.
 * - Business failures are represented by DataGateResult, never thrown as exceptions.
 */
export interface G1Policy {
  version: string;
  confidenceFloor: number;
  lowConfidenceAction: "UNKNOWN";
  requiredPaths: string[];
  policyDescription?: string;
}

type ParameterLike = {
  value: unknown;
  unit: string;
  confidence: number;
  status: string;
  evidence: unknown;
  source: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParameterLike(value: unknown): value is ParameterLike {
  if (!isObject(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, "value") &&
    typeof value.unit === "string" &&
    typeof value.confidence === "number" &&
    typeof value.status === "string" &&
    Array.isArray(value.evidence) &&
    typeof value.source === "string"
  );
}

function sanitizeParameters(node: unknown, floor: number, rewritten: string[], pointer = ""): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => sanitizeParameters(item, floor, rewritten, `${pointer}/${index}`));
    return;
  }
  if (!isObject(node)) return;

  if (isParameterLike(node)) {
    if (!Number.isFinite(node.confidence)) {
      node.status = "unknown";
      node.value = null;
      rewritten.push(pointer || "/");
      return;
    }
    if (node.confidence < floor) {
      node.status = "unknown";
      node.value = null;
      rewritten.push(pointer || "/");
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1");
    sanitizeParameters(value, floor, rewritten, `${pointer}/${escaped}`);
  }
}

function terminalEvaluation(rawIR: RawDesignIR, diagnostics: string[]): FidelityEvaluationResult {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    testCaseId: "G1_DATA_GATE",
    executedAt: new Date().toISOString(),
    status: "BLOCKED_DATA",
    tierExecuted: "NONE",
    versions: {
      compiler: "1.0.0",
      distiller: rawIR.provenance.extractorVersion,
      grammar: "NOT_RUN",
      adapter: "NOT_RUN",
      evaluator: "1.0.0",
    },
    diagnostics,
    provenance: {
      hashManifest: {
        algorithm: "SHA-256",
        canonicalization: "RFC8785",
      },
      hashChain: {
        inputHash: rawIR.provenance.inputHash,
      },
      timing: {
        distillationExecutionMs: rawIR.provenance.inferenceExecutionMs,
      },
    },
  };
}

export class DataGate {
  constructor(private readonly policy: G1Policy) {
    if (!Number.isFinite(policy.confidenceFloor) || policy.confidenceFloor < 0 || policy.confidenceFloor > 1) {
      throw new RangeError("G1 confidenceFloor must be a finite number in [0, 1]");
    }
    if (policy.lowConfidenceAction !== "UNKNOWN") {
      throw new RangeError("G1 lowConfidenceAction must be UNKNOWN");
    }
  }

  /** Execute G1 using a cloned RawDesignIR and deterministic required-path checks. */
  public execute(rawIR: RawDesignIR): DataGateResult {
    const sanitized = structuredClone(rawIR);
    const rewritten: string[] = [];
    sanitizeParameters(sanitized, this.policy.confidenceFloor, rewritten);

    const blocking: string[] = [];
    for (const pointer of this.policy.requiredPaths) {
      let resolved;
      try {
        resolved = JsonPointerResolver.resolve(sanitized, pointer);
      } catch {
        blocking.push(`${pointer}: invalid JSON Pointer`);
        continue;
      }

      if (!resolved.found) {
        blocking.push(`${pointer}: required parameter not found`);
        continue;
      }

      if (!isParameterLike(resolved.value)) {
        blocking.push(`${pointer}: required target is not a RawEstimatedParameter`);
        continue;
      }

      if (resolved.value.status === "unknown") {
        blocking.push(`${pointer}: required parameter is unknown after confidence rewrite`);
      }
    }

    if (blocking.length > 0) {
      return {
        kind: "BLOCKED_DATA",
        evaluation: terminalEvaluation(rawIR, [
          "G1 Data Gate blocked the pipeline.",
          ...blocking,
          ...(rewritten.length > 0 ? [`Rewritten low-confidence parameters: ${rewritten.join(", ")}`] : []),
        ]),
      };
    }

    sanitized.provenance.rawIntegrityStatus = "READY";
    sanitized.provenance.rawIRHash = HashPolicy.computeRawIRHash(
      sanitized as unknown as Record<string, unknown>,
    );
    if (rewritten.length > 0) {
      sanitized.provenance.lowConfidenceWarnings = [
        ...(sanitized.provenance.lowConfidenceWarnings ?? []),
        ...rewritten.map((pointer) => `LOW_CONFIDENCE_REWRITTEN:${pointer}`),
      ];
    }

    return { kind: "PASS", rawIR: sanitized };
  }
}

/**
 * Compatibility helper for callers that only need confidence classification.
 * It performs no mutation.
 */
export function checkParamConfidence(param: unknown, threshold: number): { passed: boolean; confidence: number } {
  if (!isParameterLike(param)) return { passed: false, confidence: Number.NaN };
  return { passed: Number.isFinite(param.confidence) && param.confidence >= threshold, confidence: param.confidence };
}

export function checkParamSource(param: unknown): boolean {
  return isParameterLike(param) && typeof param.source === "string" && param.source.length > 0;
}

export function checkParamCalibration(param: unknown): { status: "PRODUCTION" | "EXPERIMENTAL"; method: string } {
  if (!isParameterLike(param)) return { status: "EXPERIMENTAL", method: "invalid-parameter" };
  return param.status === "unknown"
    ? { status: "EXPERIMENTAL", method: "confidence-gate" }
    : { status: "PRODUCTION", method: "confidence-gate" };
}
