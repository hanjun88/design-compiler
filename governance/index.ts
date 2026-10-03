/**
 * Governance — lifecycle of the aesthetic grammar the compiler runs on.
 *
 *   GrammarGovernor   generations of validated AestheticConstraintSheets per design context: submit with a
 *                     canary compile, guarded compile with automatic fallback, environment re-verification
 *                     and explicit, audited rollbackGrammar().
 *   regression-runner Golden Case sandbox regression with an injected executor (fails closed without one).
 *
 * The aesthetic content of a generation is the skill's; governance only decides which generation answers.
 */
export * from './grammar-governor';
export * from './regression-runner';
