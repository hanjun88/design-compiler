/**
 * Provenance transport: one ledger per compilation links
 *   source_ref (skill repo / commit / version / registry / contract) -> sheet -> rule_id -> decision_id
 *   -> provenance sources -> RFC 6902 patch,
 * and the decisions whose values the compiler actually read, to the hash chain of the result.
 * The ledger is hash-sealed; verifyLedger() recomputes the seal and re-derives every link from the sheet.
 */
import Ajv2020 from "ajv/dist/2020";
import ledgerSchema from "../contracts/provenance-ledger/provenance-ledger.schema.json";
import type { ProvenanceLedger } from "../contracts/provenance-ledger/provenance-ledger.types";
import type { RFC6902Op } from "../compiler-core/contracts";
import type { DecisionPack } from "./decision-pack";
import { canonicalSha256Without } from "./hash";

export type { ProvenanceLedger };

export interface LedgerInput {
  pack: DecisionPack;
  chain: { inputHash: string; rawIRHash: string; validatedIRHash: string; executionPlanHash: string };
  patches: readonly RFC6902Op[];
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateShape = ajv.compile(ledgerSchema as object);

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(`provenance ledger: ${message}`);
    this.name = "LedgerIntegrityError";
  }
}

export function sealLedger(body: Omit<ProvenanceLedger, "ledger_hash">): ProvenanceLedger {
  return { ...body, ledger_hash: canonicalSha256Without(body, []) };
}

export function buildLedger({ pack, chain, patches }: LedgerInput): ProvenanceLedger {
  const p = pack.provenance;
  const entries = patches.map((op, index) => {
    const ruleId = op.audit.ruleId;
    const ref = pack.grammarRuleRef(ruleId);
    if (!ref) throw new LedgerIntegrityError(`patch #${index} (${op.path}) carries no rule of the active sheet (audit.ruleId=${ruleId})`);
    const constraint = pack.constraintOf(ref.decision_id);
    if (!constraint) throw new LedgerIntegrityError(`decision ${ref.decision_id} is not in the sheet`);
    return {
      index,
      op: op.op,
      path: op.path,
      rule_id: ref.rule_id,
      decision_id: ref.decision_id,
      sources: constraint.provenance.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, ref: s.ref })),
    };
  });
  const body: Omit<ProvenanceLedger, "ledger_hash"> = {
    ledger_version: "1.0.0",
    source_ref: {
      repository: p.repository,
      commit: p.commit,
      skill_version: p.skill_version,
      schema_version: p.schema_version,
      contract_hash: p.contract_hash,
      registry_hash: p.registry_hash,
      ledger_hash: p.ledger_hash,
      sheet_hash: p.sheet_hash,
      constraints_hash: pack.constraintsHash,
      sheet_rule_id: p.sheet_rule_id,
      sheet_decision_id: p.sheet_decision_id,
    },
    chain,
    patches: entries,
    decisions_used: pack.usage().map((u) => ({ kind: u.kind, subject: u.subject, ...(u.key ? { key: u.key } : {}), rule_id: u.rule_id, decision_id: u.decision_id })),
  };
  return sealLedger(body);
}

/** Recompute the seal, check the shape, and re-derive every link from the sheet of `pack`. */
export function verifyLedger(ledger: ProvenanceLedger, pack: DecisionPack): void {
  if (!validateShape(ledger)) {
    throw new LedgerIntegrityError(`does not match its schema: ${(validateShape.errors ?? []).slice(0, 3).map((e) => `${e.instancePath} ${e.message}`).join("; ")}`);
  }
  if (canonicalSha256Without(ledger, ["ledger_hash"]) !== ledger.ledger_hash) throw new LedgerIntegrityError("seal does not match its content");
  const p = pack.provenance;
  if (ledger.source_ref.sheet_hash !== p.sheet_hash || ledger.source_ref.constraints_hash !== pack.constraintsHash || ledger.source_ref.registry_hash !== p.registry_hash || ledger.source_ref.commit !== p.commit || ledger.source_ref.contract_hash !== p.contract_hash) {
    throw new LedgerIntegrityError("source_ref does not describe the sheet of the active decision pack");
  }
  for (const e of ledger.patches) {
    const ref = pack.grammarRuleRef(e.rule_id);
    if (!ref || ref.decision_id !== e.decision_id) throw new LedgerIntegrityError(`patch #${e.index}: ${e.rule_id} -> ${e.decision_id} is not a decision of this sheet`);
    const c = pack.constraintOf(e.decision_id);
    if (!c || JSON.stringify(c.provenance.sources.map((s) => s.source_id)) !== JSON.stringify(e.sources.map((s) => s.source_id))) throw new LedgerIntegrityError(`patch #${e.index}: sources differ from the sheet`);
  }
  for (const u of ledger.decisions_used) {
    if (!pack.constraintOf(u.decision_id)) throw new LedgerIntegrityError(`decision ${u.decision_id} is not in the sheet`);
  }
}
