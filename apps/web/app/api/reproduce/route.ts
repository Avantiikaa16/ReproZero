import { runReproduction, type ReproductionRequest } from '../../lib/repro-engine';
import { analyzeIncident, getGreptileRepositoryStatus, recallClaudeMemory, storeClaudeMemory } from '../../lib/live-integrations';

export async function POST(request: Request) {
  try {
    const input = await request.json() as ReproductionRequest;

    if (!input.evidence?.trim() || !input.repository?.trim()) {
      return Response.json({ error: 'Evidence and repository are required.' }, { status: 400 });
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
