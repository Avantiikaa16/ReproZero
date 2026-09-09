import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db/client';
import { projects } from '../../../db/schema';
import { recordAuditEvent } from '../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const rows = await db.select().from(projects).where(eq(projects.organizationId, context.organizationId)).orderBy(desc(projects.createdAt));
    return Response.json({ projects: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load projects.', error);
    return Response.json({ error: 'Failed to load projects.' }, { status: 500 });
  }
}

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  repository: z.string().min(1).max(500),
  defaultBranch: z.string().min(1).max(200).default('main'),
  description: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const parsed = createProjectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid project payload.', issues: parsed.error.issues }, { status: 400 });
    }

    const [project] = await db
      .insert(projects)
      .values({ organizationId: context.organizationId, createdBy: context.userId, ...parsed.data })
      .returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name: project.name, repository: project.repository },
    });

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to create project.', error);
    return Response.json({ error: 'Failed to create project.' }, { status: 500 });
  }
}
