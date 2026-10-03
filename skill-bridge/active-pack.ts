/**
 * Ambient access to the DecisionPack for compiler modules.
 *
 * Production code obtains aesthetic numbers only through requireDecisionPack(); with no pack
 * in scope it throws (fail closed). A pack is scoped to a call tree with withDecisionPack()
 * (AsyncLocalStorage, so concurrent compilations never see each other's pack). Test and CLI
 * entry points may install a process-wide provider with setDefaultDecisionPackProvider();
 * nothing in library code ever does.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { DecisionPack } from "./decision-pack";

export class NoDecisionPackError extends Error {
  constructor(period?: string) {
    super(
      `no AestheticConstraintSheet decision pack is active${period ? ` for period ${period}` : ""}: ` +
        "compile through a validated skill sheet (withDecisionPack)",
    );
    this.name = "NoDecisionPackError";
  }
}

/** Resolves the pack for an optional period; returns undefined when it has none. */
export type DecisionPackProvider = (period?: string) => DecisionPack | undefined;

const store = new AsyncLocalStorage<DecisionPack>();
let provider: DecisionPackProvider | null = null;

export function withDecisionPack<T>(pack: DecisionPack, fn: () => T): T {
  return store.run(pack, fn);
}

/** Process-wide fallback (tests / CLIs). Pass null to clear. */
export function setDefaultDecisionPackProvider(p: DecisionPackProvider | null): void {
  provider = p;
}

/** Convenience: one fixed pack as the process-wide fallback. */
export function setDefaultDecisionPack(pack: DecisionPack | null): void {
  provider = pack ? () => pack : null;
}

/**
 * The active pack. When `period` is given it must match the pack's period (a scoped pack of
 * another period is a DecisionContextMismatchError, never a silent fallback).
 */
export function requireDecisionPack(period?: string): DecisionPack {
  const scoped = store.getStore();
  if (scoped) {
    if (period !== undefined) scoped.assertPeriod(period);
    return scoped;
  }
  const p = provider?.(period);
  if (p) {
    if (period !== undefined) p.assertPeriod(period);
    return p;
  }
  throw new NoDecisionPackError(period);
}

export function hasDecisionPack(): boolean {
  return store.getStore() !== undefined || provider !== null;
}
