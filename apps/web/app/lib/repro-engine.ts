export type ReproductionRequest = {
  evidenceType: 'ticket' | 'files' | 'event';
  evidence: string;
  repository: string;
  demo?: boolean;
};

export type ReproductionResult = {
  runId: string;
  incidentId: string;
  verdict: 'FIX_VERIFIED';
  generatedAt: string;
  reproSpec: {
    provider: 'aws';
    region: string;
    resourceId: string;
    fixture: string;
    precondition: string;
    action: string;
    assertions: string[];
  };
  failure: {
    errorCode: string;
    message: string;
    firewallState: 'DELETING';
    trace: Array<{ action: string; result: string }>;
  };
  codePath: string[];
  patch: { file: string; summary: string; diff: string };
  verification: {
    before: { state: 'DELETING'; testsPassing: number };
    after: { state: 'DELETED'; testsPassing: number };
    totalTests: number;
  };
  memory: { key: string; lesson: string; confidence: number; status: 'stored' };
  analysis?: import('./live-integrations').IncidentAnalysis;
  greptile?: import('./live-integrations').GreptileRepositoryStatus;
  claudeMemory?: import('./live-integrations').ClaudeMemoryResult;
  integrations: Record<string, string>;
};

const trace = [
  { action: 'disassociateElasticIp(eipalloc-demo-301)', result: 'success' },
  { action: 'deleteLoadBalancer(demo-1842)', result: 'success' },
  { action: 'deleteSubnet(subnet-demo-401)', result: 'success' },
  { action: 'deleteVpc(vpc-demo-501)', result: 'ResourceNotFound' },
];

export function runReproduction(input: ReproductionRequest): ReproductionResult {
  const evidence = input.evidence.toLowerCase();
  const isDit1842 = input.demo || evidence.includes('dit-1842') || evidence.includes('resourcenotfound');

  if (!isDit1842) {
    throw new Error('This hackathon build currently supports the DIT-1842 AWS reproduction. Load the AWS demo to run the verified path.');
  }

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
}
