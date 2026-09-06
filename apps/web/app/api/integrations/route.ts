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

    return Response.json({ connections });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load integrations.', error);
    return Response.json({ error: 'Failed to load integrations.' }, { status: 500 });
  }
}
