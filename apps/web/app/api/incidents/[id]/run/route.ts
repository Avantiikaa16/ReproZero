import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { incidentNotes, incidents, jiraTicketSnapshots, reproductionRuns } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { storeClaudeMemory } from '../../../../lib/live-integrations';
import { storeMemoryReference } from '../../../../lib/memory-store';
import { runReproduction } from '../../../../lib/repro-engine';

/**
 * Runs the existing deterministic demo engine against this incident's
 * evidence. Only one reproduction adapter (the AWS DIT-1842 scenario)
 * exists today — Phase 8's adapter pattern isn't built yet — so most
 * incidents will honestly fail with "not yet supported" rather than
 * silently pretending to reproduce something the engine doesn't model.
 * mode stays 'demo_simulation'; nothing here executes real code.
 */
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
      const result = runReproduction({ evidenceType: 'ticket', evidence, repository: incident.repository ?? '' });

      await db
        .update(reproductionRuns)
        .set({ status: 'succeeded', result, completedAt: new Date() })
        .where(eq(reproductionRuns.id, run.id));
      await db.update(incidents).set({ status: 'Reproduced', updatedAt: new Date() }).where(eq(incidents.id, id));
      await db.insert(incidentNotes).values({
        incidentId: id,
        type: 'system',
        content: 'Reproduction run succeeded (demo simulation).',
        metadata: { runId: run.id },
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
        metadata: { incidentId: id, mode: 'demo_simulation', outcome: 'succeeded' },
      });

      return Response.json({ run: { ...run, status: 'succeeded', result } });
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
        metadata: { incidentId: id, mode: 'demo_simulation', outcome: 'failed', message },
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
