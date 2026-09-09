import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../db/client';
import { projects } from '../../../../db/schema';
import { recordAuditEvent } from '../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../lib/auth-context';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  repository: z.string().min(1).max(500).optional(),
  defaultBranch: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [existing] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, context.organizationId)));
    if (!existing) return Response.json({ error: 'Project not found.' }, { status: 404 });

    const parsed = updateProjectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid project payload.', issues: parsed.error.issues }, { status: 400 });
    }

    const [project] = await db.update(projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'project.updated',
      resourceType: 'project',
      resourceId: id,
      metadata: parsed.data,
    });

    return Response.json({ project });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to update project.', error);
    return Response.json({ error: 'Failed to update project.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [existing] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, context.organizationId)));
    if (!existing) return Response.json({ error: 'Project not found.' }, { status: 404 });

    await db.delete(projects).where(eq(projects.id, id));

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'project.deleted',
      resourceType: 'project',
      resourceId: id,
    });

    return Response.json({ status: 'deleted' });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to delete project.', error);
    return Response.json({ error: 'Failed to delete project.' }, { status: 500 });
  }
}
