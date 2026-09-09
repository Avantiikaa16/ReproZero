import type { ReproductionAdapter } from './types';

const trace = [
  { action: 'calculateProration(planA, planB, daysRemaining=0)', result: 'success' },
  { action: 'calculateProration(planA, planB, daysRemaining=31)', result: 'success' },
  { action: 'calculateProration(planA, planB, daysRemaining=-1)', result: 'NegativeDaysNotHandled' },
];

export const failingTestAdapter: ReproductionAdapter = {
  id: 'failing-test',
  name: 'Failing unit/integration test',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return (evidence.includes('test fail') || evidence.includes('failing test') || evidence.includes('unit test')) && evidence.includes('proration');
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'TEST-772',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'unit-test',
        region: 'n/a',
        resourceId: 'billing/proration.test.js',
        fixture: 'fixtures/proration-edge-cases.json',
        precondition: 'A plan downgrade is billed the same day a trial ends, producing a negative daysRemaining value',
        action: 'calculateProration(planA, planB, daysRemaining=-1)',
        assertions: ['result.credit >= 0', 'no thrown exception'],
      },
      failure: {
        errorCode: 'NegativeDaysNotHandled',
        message: 'calculateProration assumes daysRemaining is always >= 0 and returns a negative credit for edge-of-cycle downgrades',
        firewallState: 'TEST_FAILING',
        trace,
      },
      codePath: [
        'src/billing/proration.js: calculateProration',
        'src/billing/plan-cycle.js: daysRemainingInCycle',
        'tests/billing/proration.test.js',
        'fixtures/proration-edge-cases.json',
      ],
      patch: {
        file: 'src/billing/proration.candidate.js',
        summary: 'Clamp daysRemaining to zero before computing proration, and add the negative-days case as a permanent regression test.',
        diff: `  function calculateProration(from, to, daysRemaining) {\n-   const credit = (from.price / cycleDays) * daysRemaining;\n+   const clamped = Math.max(0, daysRemaining);\n+   const credit = (from.price / cycleDays) * clamped;\n    return { credit };\n  }`,
      },
      verification: {
        before: { state: 'TEST_FAILING', testsPassing: 2 },
        after: { state: 'TEST_PASSING', testsPassing: 3 },
        totalTests: 3,
      },
      memory: {
        key: 'incident/proration-negative-days',
        lesson: 'Billing calculations that take a day-count must clamp to zero — same-day trial-end-and-downgrade produces negative values otherwise.',
        confidence: 0.95,
        status: 'stored',
      },
      integrations: { codex: 'primary_build_agent', greptile: 'demo_adapter', claudeMem: 'demo_adapter' },
    };
  },
};
