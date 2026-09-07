export type ReproductionRequest = {
  evidenceType: 'ticket' | 'files' | 'event';
  evidence: string;
  repository: string;
  demo?: boolean;
};

/**
 * Same field names/shape as the original AWS-only version — deliberately
 * unchanged so every existing caller (the public /api/reproduce demo, the
 * authenticated per-incident run route, and the marketing page's rendering)
 * keeps working with zero changes. Only the literal string types were
 * loosened to `string` so a non-AWS adapter can populate them too; a
 * literal AWS value is still assignable to `string`, so this is a pure
 * widening, not a breaking change.
 */
export type ReproductionResult = {
  runId: string;
  incidentId: string;
  verdict: string;
  generatedAt: string;
  reproSpec: {
    provider: string;
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
    // Legacy name from the AWS-only version; holds the reproduced
    // resource's end state for any adapter, not just a firewall.
    firewallState: string;
    trace: Array<{ action: string; result: string }>;
  };
  codePath: string[];
  patch: { file: string; summary: string; diff: string };
  verification: {
    before: { state: string; testsPassing: number };
    after: { state: string; testsPassing: number };
    totalTests: number;
  };
  memory: { key: string; lesson: string; confidence: number; status: 'stored' };
  analysis?: import('../live-integrations').IncidentAnalysis;
  greptile?: import('../live-integrations').GreptileRepositoryStatus;
  claudeMemory?: import('../live-integrations').ClaudeMemoryResult;
  integrations: Record<string, string>;
};

/**
 * The Phase 8 adapter contract: every reproduction adapter produces the
 * same normalized ReproductionResult, so the rest of the product (UI,
 * incident workspace, memory storage) never needs to know which adapter
 * actually ran.
 */
export type ReproductionAdapter = {
  id: string;
  name: string;
  /** Cheap, evidence-text-based check — no I/O, just string matching. */
  canHandle(input: ReproductionRequest): boolean;
  run(input: ReproductionRequest): ReproductionResult;
};
