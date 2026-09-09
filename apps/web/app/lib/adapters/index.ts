import { apiResponseFailureAdapter } from './api-response-failure';
import { awsFirewallDeletionAdapter } from './aws-firewall-deletion';
import { configMismatchAdapter } from './config-mismatch';
import { databaseMigrationAdapter } from './database-migration';
import { failingTestAdapter } from './failing-test';
import { stripeWebhookOrderingAdapter } from './stripe-webhook-ordering';
import type { ReproductionAdapter, ReproductionRequest, ReproductionResult } from './types';

// All six reproduction types from the Phase 8 spec. Only awsFirewallDeletionAdapter
// has a real executable repo behind it (see sandbox-runner.ts) — every other
// adapter here is a deterministic demo simulation, same as the AWS one was
// before Phase 5. Never claim live execution for these; `mode` on a run
// only ever says 'live_sandbox' when a real sandbox attempt genuinely
// succeeded (see run/route.ts's produceReproduction()).
export const adapters: ReproductionAdapter[] = [
  awsFirewallDeletionAdapter,
  stripeWebhookOrderingAdapter,
  apiResponseFailureAdapter,
  failingTestAdapter,
  configMismatchAdapter,
  databaseMigrationAdapter,
];

export function runReproductionForEvidence(input: ReproductionRequest): ReproductionResult {
  const adapter = adapters.find((candidate) => candidate.canHandle(input));
  if (!adapter) {
    const supported = adapters.map((candidate) => candidate.name).join(', ');
    throw new Error(`No reproduction adapter recognized this evidence yet. Currently supported: ${supported}.`);
  }
  return adapter.run(input);
}

export type { ReproductionAdapter, ReproductionRequest, ReproductionResult } from './types';
