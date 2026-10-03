import { HashPolicy } from "../compiler-core/hash-policy";

/** RFC 8785 canonical form + SHA-256, lowercase hex without the "sha256:" prefix (the form used by the contract). */
export function canonicalSha256(value: unknown): string {
  return HashPolicy.computeHash(value).slice("sha256:".length);
}

/** Hash of `value` with the object key path `omit` (a.b.c) removed from a deep copy. */
export function canonicalSha256Without(value: unknown, omit: readonly string[]): string {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const path of omit) {
    const segs = path.split(".");
    let cur: unknown = copy;
    for (let i = 0; i < segs.length - 1; i++) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[segs[i]];
      else { cur = undefined; break; }
    }
    if (cur && typeof cur === "object") delete (cur as Record<string, unknown>)[segs[segs.length - 1]];
  }
  return canonicalSha256(copy);
}
