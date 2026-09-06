import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../../../db/client';
import { incidents, integrationConnections, jiraTicketSnapshots } from '../../../../../../../db/schema';
import { recordAuditEvent } from '../../../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../../../lib/auth-context';
import { getJiraTicketDetail } from '../../../../../../lib/jira-adapter';

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { key } = await params;

    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'jira')));

    if (!connection || connection.status !== 'connected') {
      return Response.json({ error: 'Jira is not connected for this workspace.' }, { status: 409 });
    }

    // Reimporting an already-linked ticket updates the existing incident
    // with a fresh snapshot rather than creating a duplicate.
    const [existing] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(
        and(
          eq(incidents.organizationId, context.organizationId),
          eq(incidents.integrationConnectionId, connection.id),
          eq(incidents.externalTicketKey, key),
        ),
      );

    const detail = await getJiraTicketDetail(connection.id, key);

    const incident = existing
      ? (
          await db
            .update(incidents)
            .set({ title: detail.summary, summary: detail.description.slice(0, 2000), updatedAt: new Date() })
            .where(eq(incidents.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(incidents)
            .values({
              organizationId: context.organizationId,
              title: detail.summary,
              summary: detail.description.slice(0, 2000),
              status: 'New',
              integrationConnectionId: connection.id,
              externalTicketKey: detail.key,
              createdBy: context.userId,
            })
            .returning()
        )[0];

    const [snapshot] = await db
      .insert(jiraTicketSnapshots)
      .values({
        incidentId: incident.id,
        integrationConnectionId: connection.id,
        externalKey: detail.key,
        summary: detail.summary,
        description: detail.description,
        status: detail.status,
        priority: detail.priority,
        assigneeName: detail.assigneeName,
        reporterName: detail.reporterName,
        labels: detail.labels,
        comments: detail.comments,
        attachments: detail.attachments,
        linkedIssues: detail.linkedIssues,
        rawPayload: detail.raw as object,
      })
      .returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: existing ? 'incident.jira_resynced' : 'incident.imported_from_jira',
      resourceType: 'incident',
      resourceId: incident.id,
      metadata: { externalTicketKey: detail.key },
    });

    return Response.json({ incident, jiraSnapshot: snapshot }, { status: existing ? 200 : 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to import Jira ticket.', error);
    return Response.json({ error: 'Failed to import Jira ticket.' }, { status: 500 });
  }
}
