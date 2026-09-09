import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { integrationConnections } from '../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const connections = await db
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.provider,
        displayName: integrationConnections.displayName,
        status: integrationConnections.status,
        config: integrationConnections.config,
        lastSyncedAt: integrationConnections.lastSyncedAt,
        createdAt: integrationConnections.createdAt,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, context.organizationId));

    // config.webhookToken is the shared secret that authenticates inbound
    // Jira webhook calls (see jira-webhook.ts) — never send it to the
    // browser, same rule as any other credential in this app.
    const sanitized = connections.map((connection) => {
      const config = { ...(connection.config as Record<string, unknown>) };
      delete config.webhookToken;
      return { ...connection, config };
    });

    return Response.json({ connections: sanitized });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load integrations.', error);
    return Response.json({ error: 'Failed to load integrations.' }, { status: 500 });
  }
}
