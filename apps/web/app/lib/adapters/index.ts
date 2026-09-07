import { awsFirewallDeletionAdapter } from './aws-firewall-deletion';
import { stripeWebhookOrderingAdapter } from './stripe-webhook-ordering';
import type { ReproductionAdapter, ReproductionRequest, ReproductionResult } from './types';

export const adapters: ReproductionAdapter[] = [awsFirewallDeletionAdapter, stripeWebhookOrderingAdapter];

export function runReproductionForEvidence(input: ReproductionRequest): ReproductionResult {
  const adapter = adapters.find((candidate) => candidate.canHandle(input));
  if (!adapter) {
    const supported = adapters.map((candidate) => candidate.name).join(', ');
    throw new Error(`No reproduction adapter recognized this evidence yet. Currently supported: ${supported}.`);
  }
  return adapter.run(input);
}

export type { ReproductionAdapter, ReproductionRequest, ReproductionResult } from './types';
