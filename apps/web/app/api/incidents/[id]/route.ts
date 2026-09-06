import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../db/client';
import { incidentNotes, incidentPriorities, incidentStatuses, incidents, jiraTicketSnapshots, reproductionRuns, users } from '../../../../db/schema';
import { recordAuditEvent } from '../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../lib/auth-context';

async function loadIncidentOrThrow(organizationId: string, id: string) {
  const [incident] = await db.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, organizationId)));
  if (!incident) throw Object.assign(new Error('Incident not found.'), { status: 404 });
  return incident;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const incident = await loadIncidentOrThrow(context.organizationId, id);

    const [latestSnapshot] = await db
      .select()
      .from(jiraTicketSnapshots)
      .where(eq(jiraTicketSnapshots.incidentId, id))
      .orderBy(desc(jiraTicketSnapshots.fetchedAt))
      .limit(1);

    const notes = await db.select().from(incidentNotes).where(eq(incidentNotes.incidentId, id)).orderBy(desc(incidentNotes.createdAt));
    const runs = await db.select().from(reproductionRuns).where(eq(reproductionRuns.incidentId, id)).orderBy(desc(reproductionRuns.createdAt));

    return Response.json({ incident, jiraSnapshot: latestSnapshot ?? null, notes, runs });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      return Response.json({ error: error.message }, { status: (error as { status: number }).status });
    }
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load incident.', error);
    return Response.json({ error: 'Failed to load incident.' }, { status: 500 });
  }
}

const updateIncidentSchema = z.object({
  status: z.enum(incidentStatuses).optional(),
  priority: z.enum(incidentPriorities).nullable().optional(),
  // 'me' is resolved to the caller's own user id server-side below — the
  // client has no reliable way to know its own internal DB user id.
  assigneeId: z.union([z.string().uuid(), z.literal('me')]).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const incident = await loadIncidentOrThrow(context.organizationId, id);

    const parsed = updateIncidentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid update payload.', issues: parsed.error.issues }, { status: 400 });
    }

    if (parsed.data.assigneeId === 'me') {
      parsed.data.assigneeId = context.userId;
    } else if (parsed.data.assigneeId) {
      const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsed.data.assigneeId));
      if (!assignee) return Response.json({ error: 'Assignee not found.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const timelineNotes: Array<{ type: (typeof incidentNotes.$inferInsert)['type']; content: string; metadata: Record<string, unknown> }> = [];

    if (parsed.data.status && parsed.data.status !== incident.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'Completed') {
        updates.completedAt = new Date();
      } else if (incident.status === 'Completed') {
        // Reopening: track it, and clear the completion timestamp since
        // it's no longer accurate.
        updates.completedAt = null;
        updates.reopenedCount = incident.reopenedCount + 1;
      }
      timelineNotes.push({
        type: 'status_change',
        content: `Status changed from ${incident.status} to ${parsed.data.status}`,
        metadata: { from: incident.status, to: parsed.data.status },
      });
    }
    if (parsed.data.priority !== undefined && parsed.data.priority !== incident.priority) {
      updates.priority = parsed.data.priority;
    }
    if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== incident.assigneeId) {
      updates.assigneeId = parsed.data.assigneeId;
      timelineNotes.push({
        type: 'system',
        content: parsed.data.assigneeId ? 'Incident assigned' : 'Incident unassigned',
        metadata: { assigneeId: parsed.data.assigneeId },
      });
    }

    const [updated] = await db.update(incidents).set(updates).where(eq(incidents.id, id)).returning();

    for (const note of timelineNotes) {
      await db.insert(incidentNotes).values({ incidentId: id, authorId: context.userId, ...note });
    }

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'incident.updated',
      resourceType: 'incident',
      resourceId: id,
      metadata: updates,
    });

    return Response.json({ incident: updated });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      return Response.json({ error: error.message }, { status: (error as { status: number }).status });
    }
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to update incident.', error);
    return Response.json({ error: 'Failed to update incident.' }, { status: 500 });
  }
}
