import type { ReproductionAdapter } from './types';

const trace = [
  { action: 'readEnv(FEATURE_NEW_CHECKOUT)', result: 'undefined' },
  { action: 'featureFlag.resolve(NEW_CHECKOUT, default=true)', result: 'ConfigDriftFromStaging' },
  { action: 'render(CheckoutPage)', result: 'MissingRequiredConfig' },
];

export const configMismatchAdapter: ReproductionAdapter = {
  id: 'config-mismatch',
  name: 'Configuration/environment mismatch',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return (evidence.includes('config') || evidence.includes('environment variable') || evidence.includes('env var')) && (evidence.includes('missing') || evidence.includes('mismatch'));
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'CFG-514',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'config',
        region: 'production',
        resourceId: 'FEATURE_NEW_CHECKOUT',
        fixture: 'fixtures/production-env-snapshot.json',
        precondition: 'FEATURE_NEW_CHECKOUT is set in staging but was never added to the production environment',
        action: 'render(CheckoutPage)',
        assertions: ['no unhandled exception on missing env var', 'falls back to a documented default'],
      },
      failure: {
        errorCode: 'MissingRequiredConfig',
        message: 'process.env.FEATURE_NEW_CHECKOUT is undefined in production; code assumes it is always set and throws',
        firewallState: 'CONFIG_DRIFT',
        trace,
      },
      codePath: [
        'src/config/feature-flags.js: resolve',
        'src/config/env-schema.js: validateOnBoot',
        'src/checkout/CheckoutPage.jsx: render',
        'fixtures/production-env-snapshot.json',
      ],
      patch: {
        file: 'src/config/feature-flags.candidate.js',
        summary: 'Require every feature flag to declare an explicit default in a schema, validated at boot, instead of assuming the env var is always present.',
        diff: `  const FEATURE_NEW_CHECKOUT = process.env.FEATURE_NEW_CHECKOUT;\n- if (FEATURE_NEW_CHECKOUT === undefined) throw new Error('missing config');\n+ const flags = defineFlags({ FEATURE_NEW_CHECKOUT: { default: false } });\n+ validateOnBoot(flags); // fails fast at deploy time, not at request time, and never on a missing-but-defaulted flag`,
      },
      verification: {
        before: { state: 'CONFIG_DRIFT', testsPassing: 1 },
        after: { state: 'CONFIG_VALIDATED', testsPassing: 2 },
        totalTests: 2,
      },
      memory: {
        key: 'incident/config-drift-feature-flag',
        lesson: 'Every environment-driven feature flag needs a declared default validated at boot, not an assumption that the var is always set.',
        confidence: 0.9,
        status: 'stored',
      },
      integrations: { codex: 'primary_build_agent', greptile: 'demo_adapter', claudeMem: 'demo_adapter' },
    };
  },
};
