import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { incidentNotes, incidents, jiraTicketSnapshots, reproductionRuns } from '../../../../../db/schema';
import { awsFirewallDeletionAdapter, buildLiveAwsResult } from '../../../../lib/adapters/aws-firewall-deletion';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { storeClaudeMemory } from '../../../../lib/live-integrations';
import { storeMemoryReference } from '../../../../lib/memory-store';
import { runReproduction, type ReproductionResult } from '../../../../lib/repro-engine';
import { runAwsFirewallDeletionInSandbox } from '../../../../lib/sandbox-runner';

/**
 * For the AWS DIT-1842 scenario, genuinely clones the demo repo into an
 * isolated Vercel Sandbox and runs its real tests/verification (Phase 5).
 * Every other adapter (and AWS itself, if the sandbox attempt fails for
 * any reason — quota, network, transient error) falls back to the
 * deterministic demo engine. `mode` always reflects what actually
 * happened; a fallback never gets labeled 'live_sandbox'.
 */
async function produceReproduction(input: {
  evidenceType: 'ticket';
  evidence: string;
  repository: string;
}): Promise<{ result: ReproductionResult; mode: 'live_sandbox' | 'demo_simulation' }> {
  if (awsFirewallDeletionAdapter.canHandle(input)) {
    try {
      const live = await runAwsFirewallDeletionInSandbox();
      return { result: buildLiveAwsResult(live), mode: 'live_sandbox' };
    } catch (sandboxError) {
      console.error('Live sandbox execution failed, falling back to demo simulation:', sandboxError);
    }
  }
  return { result: runReproduction(input), mode: 'demo_simulation' };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });

    const [snapshot] = await db
      .select({ description: jiraTicketSnapshots.description })
      .from(jiraTicketSnapshots)
      .where(eq(jiraTicketSnapshots.incidentId, id))
      .orderBy(desc(jiraTicketSnapshots.fetchedAt))
      .limit(1);

    const evidence = [incident.title, incident.summary, snapshot?.description].filter(Boolean).join('\n\n');

    const [run] = await db
      .insert(reproductionRuns)
      .values({ incidentId: id, triggeredBy: context.userId, mode: 'demo_simulation', status: 'running', startedAt: new Date() })
      .returning();

    await db.update(incidents).set({ status: 'Reproducing', updatedAt: new Date() }).where(eq(incidents.id, id));

    try {
      const { result, mode } = await produceReproduction({ evidenceType: 'ticket', evidence, repository: incident.repository ?? '' });

      await db
        .update(reproductionRuns)
        .set({ status: 'succeeded', mode, result, completedAt: new Date() })
        .where(eq(reproductionRuns.id, run.id));
      await db.update(incidents).set({ status: 'Reproduced', updatedAt: new Date() }).where(eq(incidents.id, id));
      await db.insert(incidentNotes).values({
        incidentId: id,
        type: 'system',
        content: `Reproduction run succeeded (${mode === 'live_sandbox' ? 'live sandbox execution' : 'demo simulation'}).`,
        metadata: { runId: run.id, mode },
      });

      // Always stored in our own DB (the hosted abstraction Phase 7 calls
      // for, since Vercel can't reach a local Claude-Mem worker). Also make
      // a best-effort attempt at the live worker; `source` only ever says
      // 'claude_mem_live' when that attempt genuinely succeeded — never as
      // a default or an assumption.
      const claudeMemAttempt = await storeClaudeMemory(result.memory.lesson, result.runId);
      await storeMemoryReference({
        organizationId: context.organizationId,
        incidentId: id,
        incidentTitle: incident.title,
        result,
        source: claudeMemAttempt.mode === 'live' ? 'claude_mem_live' : 'hosted',
      });

      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'incident.reproduction_run',
        resourceType: 'reproduction_run',
        resourceId: run.id,
        metadata: { incidentId: id, mode, outcome: 'succeeded' },
      });

      return Response.json({ run: { ...run, status: 'succeeded', mode, result } });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'Reproduction failed.';
      await db
        .update(reproductionRuns)
        .set({ status: 'failed', result: { error: message }, completedAt: new Date() })
        .where(eq(reproductionRuns.id, run.id));
      await db.insert(incidentNotes).values({
        incidentId: id,
        type: 'system',
        content: `Reproduction run did not complete: ${message}`,
        metadata: { runId: run.id },
      });

      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'incident.reproduction_run',
        resourceType: 'reproduction_run',
        resourceId: run.id,
        metadata: { incidentId: id, outcome: 'failed', message },
      });

      return Response.json({ run: { ...run, status: 'failed', result: { error: message } } }, { status: 200 });
    }
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to run reproduction.', error);
    return Response.json({ error: 'Failed to run reproduction.' }, { status: 500 });
  }
}
