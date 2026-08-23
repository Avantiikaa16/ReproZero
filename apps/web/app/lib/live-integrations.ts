export type IncidentAnalysis = {
  mode: 'live' | 'fallback';
  model: string;
  summary: string;
  confirmedFacts: string[];
  failureCondition: string;
  repairPrinciple: string;
};

export type GreptileRepositoryStatus = {
  mode: 'live' | 'fallback';
  status: string;
  indexedCommit: string;
  repository: string;
};

export type ClaudeMemoryResult = {
  mode: 'live' | 'fallback';
  recalled: number;
  stored: boolean;
  observationId?: number;
};

const fallbackAnalysis: IncidentAnalysis = {
  mode: 'fallback',
  model: 'deterministic-demo-adapter',
  summary: 'The firewall deletion workflow encounters an already-absent VPC and exits before terminating the instance or marking the firewall deleted.',
  confirmedFacts: [
    'The firewall begins in ACTIVE state.',
    'Elastic IP, load balancer, and subnet cleanup succeed.',
    'The referenced VPC is absent before deletion begins.',
    'ResourceNotFound escapes the workflow and leaves state at DELETING.',
  ],
  failureCondition: 'deleteVpc throws ResourceNotFound when the VPC is already absent.',
  repairPrinciple: 'Treat absence during destructive cleanup as idempotent success; rethrow all other errors.',
};

export async function analyzeIncident(evidence: string): Promise<IncidentAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  if (!apiKey) return fallbackAnalysis;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          {
            role: 'developer',
            content: 'You are the incident-understanding stage of ReproZero. Extract only evidence-supported facts. Never invent customer data. Return a concise causal analysis for a software engineer.',
          },
          { role: 'user', content: evidence.slice(0, 12000) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'incident_analysis',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                summary: { type: 'string' },
                confirmedFacts: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
                failureCondition: { type: 'string' },
                repairPrinciple: { type: 'string' },
              },
              required: ['summary', 'confirmedFacts', 'failureCondition', 'repairPrinciple'],
            },
          },
        },
      }),
    });

    if (!response.ok) return fallbackAnalysis;
    const payload = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!text) return fallbackAnalysis;
    const parsed = JSON.parse(text) as Omit<IncidentAnalysis, 'mode' | 'model'>;
    return { mode: 'live', model, ...parsed };
  } catch {
    return fallbackAnalysis;
  }
}

export async function getGreptileRepositoryStatus(): Promise<GreptileRepositoryStatus> {
  const apiKey = process.env.GREPTILE_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const fallback: GreptileRepositoryStatus = {
    mode: 'fallback',
    status: 'demo_adapter',
    indexedCommit: '5a30ec6c5acb03da8867f16d622f0933b7d631a8',
    repository: 'Avantiikaa16/ReproZero_AWS_Demo',
  };
  if (!apiKey || !githubToken) return fallback;

  try {
    const id = encodeURIComponent('github:main:avantiikaa16/reprozero_aws_demo');
    const response = await fetch(`https://api.greptile.com/repositories/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-GitHub-Token': githubToken },
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { status?: string; lastProcessedSha?: string };
    return {
      mode: 'live',
      status: payload.status || 'COMPLETED',
      indexedCommit: payload.lastProcessedSha || fallback.indexedCommit,
      repository: fallback.repository,
    };
  } catch {
    return fallback;
  }
}

export async function recallClaudeMemory(query: string): Promise<ClaudeMemoryResult> {
  const baseUrl = process.env.CLAUDE_MEM_BASE_URL;
  if (!baseUrl) return { mode: 'fallback', recalled: 0, stored: false };
  try {
    const url = new URL('/api/search', baseUrl);
    url.searchParams.set('q', query.slice(0, 500));
    url.searchParams.set('project', 'ReproZero');
    url.searchParams.set('limit', '5');
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { mode: 'fallback', recalled: 0, stored: false };
    const payload = await response.json() as { results?: unknown[]; observations?: unknown[]; content?: unknown[] };
    const recalled = payload.results?.length ?? payload.observations?.length ?? payload.content?.length ?? 0;
    return { mode: 'live', recalled, stored: false };
  } catch {
    return { mode: 'fallback', recalled: 0, stored: false };
  }
}

export async function storeClaudeMemory(lesson: string, runId: string): Promise<ClaudeMemoryResult> {
  const baseUrl = process.env.CLAUDE_MEM_BASE_URL;
  if (!baseUrl) return { mode: 'fallback', recalled: 0, stored: false };
  try {
    const response = await fetch(new URL('/api/memory/save', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'DIT-1842 verified repair',
        text: lesson,
        project: 'ReproZero',
        metadata: { incident: 'DIT-1842', runId, verdict: 'FIX_VERIFIED' },
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { mode: 'fallback', recalled: 0, stored: false };
    const payload = await response.json() as { id?: number };
    return { mode: 'live', recalled: 0, stored: true, observationId: payload.id };
  } catch {
    return { mode: 'fallback', recalled: 0, stored: false };
  }
}
