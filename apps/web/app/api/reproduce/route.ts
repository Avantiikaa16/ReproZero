import { runReproduction, type ReproductionRequest } from '../../lib/repro-engine';
import { analyzeIncident, getGreptileRepositoryStatus, recallClaudeMemory, storeClaudeMemory } from '../../lib/live-integrations';

// This route is intentionally public (the marketing-page demo, no auth) and
// forwards evidence text to a paid OpenAI call — both a cost and an abuse
// surface with no session to attach a real per-user limit to. Two
// zero-new-infra guardrails: a hard size cap (rejected before the body is
// even parsed) and a best-effort per-IP rate limit.
const MAX_BODY_BYTES = 50_000;
const MAX_EVIDENCE_CHARS = 20_000;
const MAX_REPOSITORY_CHARS = 300;

// In-memory, per-serverless-instance sliding window — NOT durable or
// shared across Vercel's multiple instances/cold starts, so a determined
// attacker rotating instances or IPs isn't actually stopped by this. It's
// deliberately not claimed as real protection; it just costs an attacker
// more effort for free, without provisioning a paid rate-limit service
// (Upstash/Vercel KV) that hasn't been asked for.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  // Bound the map itself so a flood of distinct IPs can't grow it unbounded.
  if (requestLog.size > 5000) {
    const oldestKey = requestLog.keys().next().value;
    if (oldestKey) requestLog.delete(oldestKey);
  }
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.' }, { status: 413 });
    }

    // Content-Length can be absent on a chunked request, so this also caps
    // the body actually read, not just what the client claimed to send.
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.' }, { status: 413 });
    }
    const input = JSON.parse(rawBody) as ReproductionRequest;

    if (!input.evidence?.trim() || !input.repository?.trim()) {
      return Response.json({ error: 'Evidence and repository are required.' }, { status: 400 });
    }
    if (input.evidence.length > MAX_EVIDENCE_CHARS || input.repository.length > MAX_REPOSITORY_CHARS) {
      return Response.json({ error: 'Evidence or repository text is too long.' }, { status: 400 });
    }

    const reproduction = runReproduction(input);
    const [analysis, greptile, recalledMemory] = await Promise.all([
      analyzeIncident(input.evidence),
      getGreptileRepositoryStatus(),
      recallClaudeMemory(input.evidence),
    ]);
    const storedMemory = await storeClaudeMemory(
      `${reproduction.memory.lesson} Verified by ${reproduction.runId}: before=${reproduction.verification.before.state}, after=${reproduction.verification.after.state}, tests=${reproduction.verification.after.testsPassing}/${reproduction.verification.totalTests}.`,
      reproduction.runId,
    );
    const claudeMemory = { ...storedMemory, recalled: recalledMemory.recalled };

    return Response.json({
      ...reproduction,
      analysis,
      greptile,
      claudeMemory,
      integrations: {
        ...reproduction.integrations,
        openai: analysis.mode,
        greptile: greptile.mode === 'live' ? 'live_index' : 'demo_adapter',
        claudeMem: claudeMemory.mode === 'live' ? 'live_local_worker' : 'demo_adapter',
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build reproduction.';
    return Response.json({ error: message }, { status: 422 });
  }
}
