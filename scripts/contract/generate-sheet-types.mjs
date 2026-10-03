/**
 * generate-sheet-types.mjs — derives the TypeScript types of the AestheticConstraintSheet
 * from its JSON Schema. There is no handwritten mirror: the generated file is checked for
 * drift by lock-contract.mjs --check (and therefore by CI).
 *
 * Supported schema vocabulary (anything else is a hard error so the generator can never
 * silently under-approximate the contract): $ref, const, enum, oneOf, type
 * string|number|integer|boolean|array|object, properties/required/additionalProperties,
 * items, description.
 */
import { canonicalHash } from "./lib.mjs";

const SUPPORTED = new Set([
  "$ref", "const", "enum", "oneOf", "type", "properties", "required", "additionalProperties", "items", "description",
  // validation-only keywords: carried by the schema, irrelevant to the static type
  "pattern", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "uniqueItems", "propertyNames", "not",
  "discriminator", "$comment",
]);

const pascal = (s) => s.split(/[_\-.]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const lit = (v) => JSON.stringify(v);

function docComment(node, indent) {
  if (!node.description) return "";
  const lines = String(node.description).split("\n").map((l) => `${indent} * ${l}`);
  return `${indent}/**\n${lines.join("\n")}\n${indent} */\n`;
}

function tsType(node, indent, where) {
  for (const k of Object.keys(node)) {
    if (!SUPPORTED.has(k)) throw new Error(`generate-sheet-types: unsupported keyword "${k}" at ${where}`);
  }
  if (node.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(node.$ref);
    if (!m) throw new Error(`generate-sheet-types: unsupported $ref ${node.$ref} at ${where}`);
    return pascal(m[1]);
  }
  if ("const" in node) return lit(node.const);
  if (node.enum) return node.enum.map(lit).join(" | ");
  if (node.oneOf) return node.oneOf.map((n, i) => tsType(n, indent, `${where}/oneOf/${i}`)).join(" | ");
  switch (node.type) {
    case "string": return "string";
    case "number":
    case "integer": return "number";
    case "boolean": return "boolean";
    case "array": {
      const inner = tsType(node.items ?? {}, indent, `${where}/items`);
      return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
    }
    case "object": {
      if (node.properties) {
        const req = new Set(node.required ?? []);
        const inner = `${indent}  `;
        const body = Object.entries(node.properties)
          .map(([k, v]) => `${docComment(v, inner)}${inner}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}${req.has(k) ? "" : "?"}: ${tsType(v, inner, `${where}/${k}`)};`)
          .join("\n");
        return `{\n${body}\n${indent}}`;
      }
      if (node.additionalProperties && typeof node.additionalProperties === "object") {
        return `Record<string, ${tsType(node.additionalProperties, indent, `${where}/additionalProperties`)}>`;
      }
      return "Record<string, unknown>";
    }
    default:
      throw new Error(`generate-sheet-types: cannot map ${JSON.stringify(node).slice(0, 80)} at ${where}`);
  }
}

export function generateTypes(schema) {
  const hash = canonicalHash(schema);
  const out = [];
  out.push("/* eslint-disable */");
  out.push("/**");
  out.push(" * GENERATED FILE — DO NOT EDIT.");
  out.push(` * Source:        ${"contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.schema.json"}`);
  out.push(` * contract_hash: ${hash}`);
  out.push(" * Regenerate:    node scripts/contract/lock-contract.mjs --write");
  out.push(" * Drift is a CI failure (node scripts/contract/lock-contract.mjs --check).");
  out.push(" */");
  out.push("");
  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    const body = tsType(def, "", `$defs/${name}`);
    out.push(`${docComment(def, "").trimEnd()}`.trimEnd());
    out.push(`export type ${pascal(name)} = ${body};`);
    out.push("");
  }
  const { $defs: _defs, $id: _id, $schema: _schema, title: _title, ...rootNode } = schema;
  const root = tsType(rootNode, "", "#");
  out.push(`${docComment(schema, "").trimEnd()}`.trimEnd());
  out.push(`export type AestheticConstraintSheet = ${root};`);
  out.push("");
  out.push("export type ConstraintKind = AestheticConstraintSheet[\"constraints\"][number][\"kind\"];");
  out.push("export type AestheticConstraint = AestheticConstraintSheet[\"constraints\"][number];");
  out.push("export type ConstraintOfKind<K extends ConstraintKind> = Extract<AestheticConstraint, { kind: K }>;");
  out.push("");
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n");
}
