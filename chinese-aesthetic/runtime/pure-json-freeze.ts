/**
 * pure-json-freeze.ts — Pure-Tree JSON AST Deep Freeze
 *
 * Phase 5 Step 5.1. Recursively validates and freezes a pure JSON data structure.
 *
 * Enforcement:
 * - Pure tree only: cycles and shared references (DAG) rejected via WeakSet
 * - Prototype dispatch: arrays → Array.prototype|null; objects → Object.prototype|null
 * - Array length descriptor: exists, has value, enumerable:false, non-negative safe integer
 *   (writable may be false — compatible with Object.freeze)
 * - All properties/indices must be enumerable data properties (no accessors, no non-enumerable)
 * - No sparse arrays, no non-index array properties, no symbol keys
 * - No non-finite numbers (NaN/Infinity/-Infinity)
 * - No functions, symbols, bigint, undefined, binary buffers
 */

export class JsonAstSecurityError extends Error {
  constructor(message: string, public readonly code: string) {
    super(`[JSON_AST_SECURITY_VIOLATION] ${code}: ${message}`);
    this.name = "JsonAstSecurityError";
  }
}

/**
 * Validate a pure-tree JSON AST and recursively deep-freeze it.
 * Returns the frozen root (same reference, now immutable).
 *
 * @throws JsonAstSecurityError on any violation
 */
export function deepFreezePureJson<T>(root: T): Readonly<T> {
  const seen = new WeakSet<object>();

  function freezeInternal(node: unknown): unknown {
    // Primitives
    if (node === null || typeof node !== "object") {
      if (typeof node === "number") {
        if (!Number.isFinite(node)) {
          throw new JsonAstSecurityError(
            `Non-finite number forbidden in JSON AST: ${node}`,
            "NON_FINITE_NUMBER",
          );
        }
        return node;
      }
      if (
        typeof node === "function" ||
        typeof node === "symbol" ||
        typeof node === "bigint" ||
        typeof node === "undefined"
      ) {
        throw new JsonAstSecurityError(
          `Illegal non-JSON primitive: ${typeof node}`,
          "ILLEGAL_PRIMITIVE",
        );
      }
      return node;
    }

    // Binary buffers forbidden
    if (node instanceof ArrayBuffer || ArrayBuffer.isView(node)) {
      throw new JsonAstSecurityError(
        "Binary buffers forbidden in pure JSON AST",
        "BINARY_IN_JSON_FORBIDDEN",
      );
    }

    // Cycle / shared reference detection (pure tree, not DAG)
    if (seen.has(node)) {
      throw new JsonAstSecurityError(
        "Non-tree JSON AST detected: cycle or shared reference encountered",
        "NON_TREE_REFERENCE_REJECTED",
      );
    }
    seen.add(node);

    if (Array.isArray(node)) {
      const proto = Object.getPrototypeOf(node);
      if (proto !== Array.prototype && proto !== null) {
        throw new JsonAstSecurityError(
          "Array prototype must be Array.prototype or null",
          "ILLEGAL_PROTOTYPE",
        );
      }
      // Array length descriptor audit (compatible with frozen writable:false)
      const lengthDesc = Object.getOwnPropertyDescriptor(node, "length");
      if (!lengthDesc || !("value" in lengthDesc)) {
        throw new JsonAstSecurityError("Array length descriptor invalid", "ARRAY_LENGTH_DESCRIPTOR_INVALID");
      }
      if (lengthDesc.enumerable !== false) {
        throw new JsonAstSecurityError("Array length must be non-enumerable", "ARRAY_LENGTH_NON_ENUMERABLE_REQUIRED");
      }
      if (
        typeof lengthDesc.value !== "number" ||
        !Number.isSafeInteger(lengthDesc.value) ||
        lengthDesc.value < 0
      ) {
        throw new JsonAstSecurityError(
          "Array length must be a non-negative safe integer",
          "ARRAY_LENGTH_INVALID",
        );
      }
      // Reject non-index own properties and symbol keys
      const ownKeys = Reflect.ownKeys(node);
      for (const k of ownKeys) {
        if (typeof k === "symbol") {
          throw new JsonAstSecurityError("Symbol keys forbidden on arrays", "SYMBOL_KEY_FORBIDDEN");
        }
        if (k !== "length") {
          const idx = Number(k);
          if (
            !Number.isSafeInteger(idx) ||
            idx < 0 ||
            String(idx) !== k ||
            idx >= node.length
          ) {
            throw new JsonAstSecurityError(
              `Non-index property "${String(k)}" on array rejected`,
              "ILLEGAL_ARRAY_PROPERTY",
            );
          }
        }
      }
      // Validate each index
      for (let i = 0; i < node.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(node, String(i))) {
          throw new JsonAstSecurityError(`Sparse array detected at index ${i}`, "SPARSE_ARRAY_FORBIDDEN");
        }
        const desc = Object.getOwnPropertyDescriptor(node, String(i));
        if (!desc || !("value" in desc)) {
          throw new JsonAstSecurityError(
            `Accessor property forbidden on array index ${i}`,
            "ACCESSOR_FORBIDDEN",
          );
        }
        if (desc.enumerable !== true) {
          throw new JsonAstSecurityError(
            `Non-enumerable index "${i}" forbidden`,
            "NON_ENUMERABLE_FORBIDDEN",
          );
        }
        freezeInternal(desc.value);
      }
    } else {
      // Plain object
      const proto = Object.getPrototypeOf(node);
      if (proto !== Object.prototype && proto !== null) {
        throw new JsonAstSecurityError(
          "Object prototype must be Object.prototype or null",
          "ILLEGAL_PROTOTYPE",
        );
      }
      const ownKeys = Reflect.ownKeys(node);
      for (const k of ownKeys) {
        if (typeof k === "symbol") {
          throw new JsonAstSecurityError("Symbol keys forbidden in JSON AST", "SYMBOL_KEY_FORBIDDEN");
        }
        const desc = Object.getOwnPropertyDescriptor(node, k);
        if (!desc || !("value" in desc)) {
          throw new JsonAstSecurityError(
            `Accessor property "${String(k)}" forbidden in JSON AST`,
            "ACCESSOR_FORBIDDEN",
          );
        }
        if (desc.enumerable !== true) {
          throw new JsonAstSecurityError(
            `Non-enumerable property "${String(k)}" forbidden in JSON AST`,
            "NON_ENUMERABLE_FORBIDDEN",
          );
        }
        freezeInternal(desc.value);
      }
    }

    return Object.freeze(node);
  }

  return freezeInternal(root) as Readonly<T>;
}
