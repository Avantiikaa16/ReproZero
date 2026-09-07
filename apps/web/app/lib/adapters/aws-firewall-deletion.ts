import type { LiveAwsVerification } from '../sandbox-runner';
import type { ReproductionAdapter, ReproductionResult } from './types';

const trace = [
  { action: 'disassociateElasticIp(eipalloc-demo-301)', result: 'success' },
  { action: 'deleteLoadBalancer(demo-1842)', result: 'success' },
  { action: 'deleteSubnet(subnet-demo-401)', result: 'success' },
  { action: 'deleteVpc(vpc-demo-501)', result: 'ResourceNotFound' },
];

export const awsFirewallDeletionAdapter: ReproductionAdapter = {
  id: 'aws-firewall-deletion',
  name: 'AWS resource lifecycle (DIT-1842)',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return Boolean(input.demo) || evidence.includes('dit-1842') || evidence.includes('resourcenotfound');
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'DIT-1842',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'aws',
        region: 'us-west-2',
        resourceId: 'fw-customer-1842',
        fixture: 'fixtures/dit-1842-environment.json',
        precondition: 'Referenced VPC vpc-demo-501 is absent before deletion begins',
        action: 'deleteFirewall("fw-customer-1842")',
        assertions: ['error.code == "ResourceNotFound"', 'firewall.state == "DELETING"'],
      },
      failure: {
        errorCode: 'ResourceNotFound',
        message: 'Vpc vpc-demo-501 was not found',
        firewallState: 'DELETING',
        trace,
      },
      codePath: [
        'src/firewall-deletion.js: deleteFirewall',
        'src/fake-aws-cloud.js: deleteVpc',
        'src/errors.js: ResourceNotFoundError',
        'src/firewall-repository.js: updateState',
        'fixtures/dit-1842-environment.json',
      ],
      patch: {
        file: 'src/firewall-deletion.candidate.js',
        summary: 'Treat already-absent AWS cleanup resources as idempotent success, while rethrowing every other error.',
        diff: `+ async function deleteIfPresent(operation) {\n+   try { await operation(); }\n+   catch (error) {\n+     if (error instanceof ResourceNotFoundError) return;\n+     throw error;\n+   }\n+ }\n\n- await cloud.deleteVpc(firewall.vpcId);\n+ await deleteIfPresent(() => cloud.deleteVpc(firewall.vpcId));`,
      },
      verification: {
        before: { state: 'DELETING', testsPassing: 1 },
        after: { state: 'DELETED', testsPassing: 2 },
        totalTests: 2,
      },
      memory: {
        key: 'incident/DIT-1842',
        lesson: 'Missing AWS resources during cleanup must be treated as idempotent success.',
        confidence: 0.97,
        status: 'stored',
      },
      integrations: {
        codex: 'primary_build_agent',
        greptile: 'demo_adapter',
        claudeMem: 'demo_adapter',
        aws: 'demo_adapter',
      },
    };
  },
};

/**
 * Substitutes real, sandbox-captured failure/verification/trace data into
 * the same result shape the demo adapter produces — the static commentary
 * (patch text, code path, memory lesson) doesn't change, since those
 * describe the real fix that's actually in the demo repo either way; only
 * the parts that genuinely differ between a simulation and a real run are
 * replaced. Phase 8's whole point: the rest of the app never needs to know
 * which one produced this result.
 */
export function buildLiveAwsResult(live: LiveAwsVerification): ReproductionResult {
  const base = awsFirewallDeletionAdapter.run({ evidenceType: 'ticket', evidence: 'dit-1842', repository: '' });
  return {
    ...base,
    verdict: live.verdict,
    failure: {
      errorCode: live.before.error?.code ?? 'Unknown',
      message: live.before.error?.message ?? '',
      firewallState: live.before.firewall.state,
      trace: live.before.trace.map((event) => ({ action: `${event.action}(${event.resourceId})`, result: event.result })),
    },
    verification: {
      before: { state: live.before.firewall.state, testsPassing: 0 },
      after: { state: live.after.firewall.state, testsPassing: live.testsPassing },
      totalTests: live.totalTests,
    },
    integrations: { ...base.integrations, aws: 'live_sandbox' },
  };
}
