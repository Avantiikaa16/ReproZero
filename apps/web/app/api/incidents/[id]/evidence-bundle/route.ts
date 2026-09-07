import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { auditEvents, incidentNotes, incidents, jiraTicketSnapshots, reproductionRuns } from '../../../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';

/**
 * A complete, portable record of an incident: the incident itself, every
 * Jira snapshot ever taken (not just the latest, so the bundle stays
 * auditable even if the ticket changed after import), every note, every
 * reproduction run's full result, and every audit event about it — enough
 * for someone outside this workspace to verify the whole story offline.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });

    const [jiraSnapshots, notes, runs, events] = await Promise.all([
      db.select().from(jiraTicketSnapshots).where(eq(jiraTicketSnapshots.incidentId, id)).orderBy(desc(jiraTicketSnapshots.fetchedAt)),
      db.select().from(incidentNotes).where(eq(incidentNotes.incidentId, id)).orderBy(desc(incidentNotes.createdAt)),
      db.select().from(reproductionRuns).where(eq(reproductionRuns.incidentId, id)).orderBy(desc(reproductionRuns.createdAt)),
      db.select().from(auditEvents).where(and(eq(auditEvents.resourceType, 'incident'), eq(auditEvents.resourceId, id))).orderBy(desc(auditEvents.createdAt)),
    ]);

    const bundle = {
      bundleVersion: 1,
      exportedAt: new Date().toISOString(),
      incident,
      jiraSnapshots,
      notes,
      reproductionRuns: runs,
      auditEvents: events,
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="reprozero-evidence-${incident.externalTicketKey ?? id.slice(0, 8)}.json"`,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to build evidence bundle.', error);
    return Response.json({ error: 'Failed to build evidence bundle.' }, { status: 500 });
  }
}
