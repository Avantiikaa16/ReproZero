import type { ReproductionAdapter } from './types';

const trace = [
  { action: 'stripe.webhook.received(evt_demo_9921)', result: 'success' },
  { action: 'order.fulfill(order_9921)', result: 'success' },
  { action: 'stripe.webhook.redelivered(evt_demo_9921)', result: 'success' },
  { action: 'order.fulfill(order_9921)', result: 'DuplicateFulfillment' },
];

/**
 * A second, independently-buildable reproduction type: Stripe redelivers a
 * webhook (network timeout, slow 200 response, etc.) using the same event
 * ID, and a handler with no idempotency check fulfills the same order —
 * and charges the customer's account credit — twice.
 */
export const stripeWebhookOrderingAdapter: ReproductionAdapter = {
  id: 'stripe-webhook-ordering',
  name: 'Stripe webhook redelivery / event-ordering',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return evidence.includes('duplicate') && (evidence.includes('stripe') || evidence.includes('webhook'));
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'STRIPE-9921',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'stripe',
        region: 'global',
        resourceId: 'evt_demo_9921',
        fixture: 'fixtures/stripe-duplicate-webhook.json',
        precondition: 'Stripe redelivers checkout.session.completed for evt_demo_9921 after a slow acknowledgement',
        action: 'handleWebhook(evt_demo_9921)',
        assertions: ['order.fulfilled_count == 1', 'ledger.credits_applied == 1'],
      },
      failure: {
        errorCode: 'DuplicateFulfillment',
        message: 'Event evt_demo_9921 was processed twice; order_9921 was fulfilled and credited twice.',
        firewallState: 'DUPLICATED',
        trace,
      },
      codePath: [
        'src/webhooks/stripe-handler.js: handleWebhook',
        'src/orders/fulfillment.js: fulfill',
        'src/orders/order-repository.js: markFulfilled',
        'fixtures/stripe-duplicate-webhook.json',
      ],
      patch: {
        file: 'src/webhooks/stripe-handler.candidate.js',
        summary: 'Record processed Stripe event IDs and skip fulfillment for an event already handled, while still returning 200 to acknowledge redelivery.',
        diff: `+ async function alreadyProcessed(eventId) {\n+   return processedEvents.has(eventId);\n+ }\n\n  async function handleWebhook(event) {\n+   if (await alreadyProcessed(event.id)) return { status: 200, skipped: true };\n    await fulfill(event.data.object.order_id);\n+   await processedEvents.add(event.id);\n  }`,
      },
      verification: {
        before: { state: 'DUPLICATED', testsPassing: 1 },
        after: { state: 'DEDUPLICATED', testsPassing: 2 },
        totalTests: 2,
      },
      memory: {
        key: 'incident/stripe-duplicate-webhook',
        lesson: 'Stripe webhook handlers must be idempotent against redelivery, keyed on the event ID.',
        confidence: 0.94,
        status: 'stored',
      },
      integrations: {
        codex: 'primary_build_agent',
        greptile: 'demo_adapter',
        claudeMem: 'demo_adapter',
        stripe: 'demo_adapter',
      },
    };
  },
};
