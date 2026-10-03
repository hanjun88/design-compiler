/**
 * Version binding between design-compiler and chinese-aesthetic-skill.
 *
 * contracts/binding/binding.json pins exactly which skill this compiler build accepts: source
 * repository + commit, skill version (and accepted semver range), contract version + hash,
 * rules-registry hash and provenance-ledger digest. The same record is read by
 *   - the runtime sheet validator (every sheet is checked against it, fail closed), and
 *   - scripts/verify-binding.mjs (CI: checks the pinned skill checkout and a freshly generated
 *     sheet against it).
 * Nothing else reads or writes a binding; there is no second copy.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import type { SkillBinding } from "../contracts/binding/binding.types";
import bindingSchema from "../contracts/binding/binding.schema.json";
import type { SheetIssue } from "./errors";
import { SheetRejectedError } from "./errors";

export type { SkillBinding };

const here = typeof __dirname === "string" ? __dirname : process.cwd();
/** contracts/binding/binding.json of this repository. */
export const DEFAULT_BINDING_PATH = resolve(here, "..", "contracts", "binding", "binding.json");

let bindingValidator: ValidateFunction | null = null;

function compileBindingValidator(): ValidateFunction {
  if (!bindingValidator) {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    bindingValidator = ajv.compile(bindingSchema as object);
  }
  return bindingValidator;
}

/** Validate a binding document; throws SheetRejectedError(BINDING_INVALID) on any problem. */
export function parseBinding(raw: unknown): SkillBinding {
  const validate = compileBindingValidator();
  if (!validate(raw)) {
    const errs = (validate.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
    const issues: SheetIssue[] = [{ code: "BINDING_INVALID", message: `binding.json does not match binding.schema.json: ${errs.join("; ")}` }];
    throw new SheetRejectedError(issues);
  }
  return raw as SkillBinding;
}

/** The binding committed in this repository (contracts/binding/binding.json), or the file at `path`. */
export function loadBinding(path: string = DEFAULT_BINDING_PATH): SkillBinding {
  return parseBinding(JSON.parse(readFileSync(path, "utf8")));
}
