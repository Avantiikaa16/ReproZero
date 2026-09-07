/**
 * Kept as a thin re-export so every existing caller (the public
 * /api/reproduce demo endpoint, the authenticated per-incident run route,
 * and the marketing page's type import) keeps working with zero changes.
 * The actual reproduction logic now lives behind the adapter pattern in
 * ./adapters — see adapters/index.ts for the registry and adapters/types.ts
 * for the shared contract every adapter implements (Phase 8).
 */
export { runReproductionForEvidence as runReproduction } from './adapters';
export type { ReproductionRequest, ReproductionResult } from './adapters';
