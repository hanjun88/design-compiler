/**
 * Ambient access to the DecisionPack for compiler modules.
 *
 * Production code obtains aesthetic numbers only through requireDecisionPack(); with no pack
 * in scope it throws (fail closed). A pack is scoped to a call tree with withDecisionPack()
 * (AsyncLocalStorage, so concurrent compilations never see each other's pack). Test and CLI
 * entry points may install a process-wide default with setDefaultDecisionPack(); nothing in
 * library code ever does.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { DecisionContextMismatchError, type DecisionPack } from "./decision-pack";

export class NoDecisionPackError extends Error {
  constructor() {
    super("no AestheticConstraintSheet decision pack is active: compile through a validated skill sheet (withDecisionPack)");
    this.name = "NoDecisionPackError";
  }
}

const store = new AsyncLocalStorage<DecisionPack>();
let defaultPack: DecisionPack | null = null;
let defaultPacks: ReadonlyMap<string, DecisionPack> | null = null;

export function withDecisionPack<T>(pack: DecisionPack, fn: () => T): T {
  return store.run(pack, fn);
}

/** Process-wide fallback pack (tests / CLIs). Pass null to clear. */
export function setDefaultDecisionPack(pack: DecisionPack | null): void {
  defaultPack = pack;
}

/** Process-wide fallback packs keyed by period; used when a test exercises several periods. */
export function setDefaultDecisionPacksByPeriod(packs: ReadonlyMap<string, DecisionPack> | null): void {
  defaultPacks = packs;
}

/**
 * The active pack. When `period` is given it must match the pack's period; with per-period
 * defaults installed the matching one is chosen.
 */
export function requireDecisionPack(period?: string): DecisionPack {
  const scoped = store.getStore();
  if (scoped) {
    if (period !== undefined) scoped.assertPeriod(period);
    return scoped;
  }
  if (period !== undefined && defaultPacks) {
    const p = defaultPacks.get(period);
    if (p) return p;
    throw new DecisionContextMismatchError(period, [...defaultPacks.keys()].join(","));
  }
  if (defaultPack) {
    if (period !== undefined) defaultPack.assertPeriod(period);
    return defaultPack;
  }
  throw new NoDecisionPackError();
}

export function hasDecisionPack(): boolean {
  return store.getStore() !== undefined || defaultPack !== null || defaultPacks !== null;
}
