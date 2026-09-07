import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../../db/client';
import { incidentNotes, incidents } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { postJiraComment, transitionJiraIssue } from '../../../../lib/jira-adapter';

// `confirmed: true` is required on every request — this route only ever
// performs a write the client has already shown the user and gotten
// explicit approval for. There is no path that transitions or comments on
// Jira as a side effect of anything else.
const writebackSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('comment'), body: z.string().min(1).max(4000), confirmed: z.literal(true) }),
  z.object({ action: z.literal('transition'), transitionId: z.string().min(1), transitionName: z.string().min(1), confirmed: z.literal(true) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });
    if (!incident.integrationConnectionId || !incident.externalTicketKey) {
      return Response.json({ error: 'This incident is not linked to a Jira ticket.' }, { status: 409 });
    }

    const parsed = writebackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid write-back request.', issues: parsed.error.issues }, { status: 400 });
    }

    const key = incident.externalTicketKey;
    const connectionId = incident.integrationConnectionId;

    if (parsed.data.action === 'comment') {
      await postJiraComment(connectionId, key, parsed.data.body);
      await db.insert(incidentNotes).values({
        incidentId: id,
        authorId: context.userId,
        type: 'system',
        content: `Posted comment to Jira ${key}: "${parsed.data.body}"`,
        metadata: { jiraAction: 'comment' },
      });
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'jira.comment_posted',
        resourceType: 'incident',
        resourceId: id,
        metadata: { externalTicketKey: key, body: parsed.data.body },
      });
    } else {
      await transitionJiraIssue(connectionId, key, parsed.data.transitionId);
      await db.insert(incidentNotes).values({
        incidentId: id,
        authorId: context.userId,
        type: 'system',
        content: `Transitioned Jira ${key} to "${parsed.data.transitionName}"`,
        metadata: { jiraAction: 'transition', transitionId: parsed.data.transitionId },
      });
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'jira.transitioned',
        resourceType: 'incident',
        resourceId: id,
        metadata: { externalTicketKey: key, transitionName: parsed.data.transitionName },
      });
    }

    return Response.json({ status: 'ok' });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Jira write-back failed.', error);
    return Response.json({ error: 'Failed to write back to Jira.' }, { status: 500 });
  }
}
