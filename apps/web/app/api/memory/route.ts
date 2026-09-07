import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { memoryReferences } from '../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const rows = await db
      .select()
      .from(memoryReferences)
      .where(eq(memoryReferences.organizationId, context.organizationId))
      .orderBy(desc(memoryReferences.createdAt));
    return Response.json({ memories: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load memory.', error);
    return Response.json({ error: 'Failed to load memory.' }, { status: 500 });
  }
}
