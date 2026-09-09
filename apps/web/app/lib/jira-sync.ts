import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { incidents, jiraTicketSnapshots } from '../../db/schema';
import { recordAuditEvent } from './audit';
import { getJiraTicketDetail } from './jira-adapter';

/**
 * Applies one fresh Jira fetch to an already-linked incident: updates the
 * incident's title/summary and inserts a new append-only ticket snapshot.
 * Shared by the manual "Resync" action (tickets/[key]/import route, for an
 * already-imported ticket) and the webhook receiver, so both paths behave
 * identically and never drift — the only difference is `actorId` (null for
 * a webhook-triggered sync, since no human triggered it) and the audit
 * `action` label.
 */
export async function resyncJiraIncident(params: {
  incidentId: string;
  connectionId: string;
  externalKey: string;
  organizationId: string;
  actorId: string | null;
  action: string;
}): Promise<{ incident: typeof incidents.$inferSelect; snapshot: typeof jiraTicketSnapshots.$inferSelect }> {
  const detail = await getJiraTicketDetail(params.connectionId, params.externalKey);

  const [incident] = await db
    .update(incidents)
    .set({ title: detail.summary, summary: detail.description.slice(0, 2000), updatedAt: new Date() })
    .where(eq(incidents.id, params.incidentId))
    .returning();

  const [snapshot] = await db
    .insert(jiraTicketSnapshots)
    .values({
      incidentId: incident.id,
      integrationConnectionId: params.connectionId,
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
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: params.action,
    resourceType: 'incident',
    resourceId: incident.id,
    metadata: { externalTicketKey: detail.key },
  });

  return { incident, snapshot };
}
