import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { integrationConnections, integrationCredentials } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { deleteJiraWebhooks } from '../../../../lib/jira-adapter';

/**
 * Disables the connection and deletes its credentials (revoking future API
 * access) but keeps the connection row itself — incidents and ticket
 * snapshots that reference it must stay resolvable and auditable even
 * after disconnect.
 */
export async function POST() {
  try {
    const context = await requireWorkspaceContext();

    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'jira')));

    if (!connection) {
      return Response.json({ error: 'Jira is not connected.' }, { status: 404 });
    }

    // Deregister the webhook (if any) while credentials still exist — this
    // needs a valid access token, so it must run before the delete below.
    // Non-fatal: a webhook Atlassian can't reach after disconnect just goes
    // stale and Atlassian expires it on its own in ~30 days regardless.
    const existingConfig = connection.config as { webhookIds?: number[] };
    if (existingConfig.webhookIds?.length) {
      try {
        await deleteJiraWebhooks(connection.id, existingConfig.webhookIds);
      } catch (error) {
        console.error('Failed to deregister Jira webhooks on disconnect (non-fatal).', error);
      }
    }

    await db.delete(integrationCredentials).where(eq(integrationCredentials.integrationConnectionId, connection.id));
    await db
      .update(integrationConnections)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(eq(integrationConnections.id, connection.id));

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'integration.disconnected',
      resourceType: 'integration_connection',
      resourceId: connection.id,
      metadata: { provider: 'jira' },
    });

    return Response.json({ status: 'disconnected' });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to disconnect Jira.', error);
    return Response.json({ error: 'Failed to disconnect Jira.' }, { status: 500 });
  }
}
