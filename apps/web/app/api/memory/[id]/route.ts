import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { memoryReferences } from '../../../../db/schema';
import { recordAuditEvent } from '../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../lib/auth-context';

// Phase 7: "allow users to exclude or delete stored incident memory" — this
// is a real, permanent delete, org-scoped so it can only ever remove the
// caller's own workspace's memory.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [existing] = await db
      .select({ id: memoryReferences.id })
      .from(memoryReferences)
      .where(and(eq(memoryReferences.id, id), eq(memoryReferences.organizationId, context.organizationId)));
    if (!existing) return Response.json({ error: 'Memory entry not found.' }, { status: 404 });

    await db.delete(memoryReferences).where(eq(memoryReferences.id, id));

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'memory.deleted',
      resourceType: 'memory_reference',
      resourceId: id,
    });

    return Response.json({ status: 'deleted' });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to delete memory.', error);
    return Response.json({ error: 'Failed to delete memory.' }, { status: 500 });
  }
}
