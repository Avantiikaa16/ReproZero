import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { incidents, integrationConnections } from '../../../../../db/schema';
import { resyncJiraIncident } from '../../../../lib/jira-sync';
import { verifyWebhookToken } from '../../../../lib/jira-webhook';

/**
 * Called directly by Atlassian's servers, never by a signed-in user — no
 * Clerk session exists on this request, so this deliberately never calls
 * requireWorkspaceContext(). Authenticity instead rests on the random
 * `token` query param embedded in the callback URL at registration time
 * (see registerJiraWebhooks in jira-adapter.ts and the comment in
 * jira-webhook.ts for why Atlassian gives us no payload signature to check
 * here, unlike Stripe's webhook).
 *
 * The webhook is registered with a broad `project is not EMPTY` filter
 * (scoping it to only the projects a workspace has imported from would
 * mean re-registering on every import), so this fires for every issue
 * change on the connected Jira site — anything not already linked to an
 * incident is silently ignored rather than creating incidents nobody
 * asked for.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const connectionId = url.searchParams.get('connectionId');
  const token = url.searchParams.get('token');
  if (!connectionId) return Response.json({ error: 'Missing connectionId' }, { status: 400 });

  const [connection] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, connectionId));

  if (!connection || connection.provider !== 'jira' || connection.status !== 'connected') {
    // A disconnected/stale connection — tell Atlassian this is handled
    // (200) so it doesn't keep retrying or auto-disable the webhook.
    return Response.json({ ignored: true }, { status: 200 });
  }

  const config = connection.config as { webhookToken?: string };
  if (!verifyWebhookToken(config.webhookToken ?? '', token)) {
    return Response.json({ error: 'Invalid webhook token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Atlassian posts one event per call, but this tolerates a batch too.
  const events = Array.isArray(payload) ? payload : [payload];
  const results: Array<{ key: string; synced: boolean }> = [];

  for (const event of events) {
    const issueKey = (event as { issue?: { key?: string } })?.issue?.key;
    if (!issueKey) continue;

    const [linkedIncident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(and(eq(incidents.integrationConnectionId, connection.id), eq(incidents.externalTicketKey, issueKey)));

    if (!linkedIncident) {
      results.push({ key: issueKey, synced: false });
      continue;
    }

    try {
      await resyncJiraIncident({
        incidentId: linkedIncident.id,
        connectionId: connection.id,
        externalKey: issueKey,
        organizationId: connection.organizationId,
        actorId: null,
        action: 'incident.jira_synced_via_webhook',
      });
      results.push({ key: issueKey, synced: true });
    } catch (error) {
      console.error(`Jira webhook: failed to resync ${issueKey}.`, error);
      results.push({ key: issueKey, synced: false });
    }
  }

  return Response.json({ processed: results });
}
