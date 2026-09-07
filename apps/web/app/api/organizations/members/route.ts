import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { memberships, users } from '../../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const rows = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, context.organizationId));

    return Response.json({ members: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load organization members.', error);
    return Response.json({ error: 'Failed to load organization members.' }, { status: 500 });
  }
}
