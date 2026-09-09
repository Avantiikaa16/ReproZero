import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../../../db/client';
import { incidents, integrationConnections, jiraTicketSnapshots } from '../../../../../../../db/schema';
import { recordAuditEvent } from '../../../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../../../lib/auth-context';
import { getJiraTicketDetail } from '../../../../../../lib/jira-adapter';
import { resyncJiraIncident } from '../../../../../../lib/jira-sync';

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
    // with a fresh snapshot rather than creating a duplicate — the exact
    // same "apply a sync" logic the webhook receiver uses, so a manual
    // Resync and an automatic webhook-triggered sync never diverge.
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

    if (existing) {
      const { incident, snapshot } = await resyncJiraIncident({
        incidentId: existing.id,
        connectionId: connection.id,
        externalKey: key,
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'incident.jira_resynced',
      });
      return Response.json({ incident, jiraSnapshot: snapshot }, { status: 200 });
    }

    const detail = await getJiraTicketDetail(connection.id, key);

    const [incident] = await db
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
      .returning();

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
      action: 'incident.imported_from_jira',
      resourceType: 'incident',
      resourceId: incident.id,
      metadata: { externalTicketKey: detail.key },
    });

    return Response.json({ incident, jiraSnapshot: snapshot }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to import Jira ticket.', error);
    return Response.json({ error: 'Failed to import Jira ticket.' }, { status: 500 });
  }
}
