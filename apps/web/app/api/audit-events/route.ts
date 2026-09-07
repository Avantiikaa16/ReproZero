import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { auditEvents, users } from '../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorName: users.displayName,
        actorEmail: users.email,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(eq(auditEvents.organizationId, context.organizationId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    return Response.json({ events: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load audit events.', error);
    return Response.json({ error: 'Failed to load audit events.' }, { status: 500 });
  }
}
