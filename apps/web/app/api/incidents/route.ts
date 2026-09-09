import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db/client';
import { incidentPriorities, incidents, projects } from '../../../db/schema';
import { recordAuditEvent } from '../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const rows = await db
      .select()
      .from(incidents)
      .where(eq(incidents.organizationId, context.organizationId))
      .orderBy(desc(incidents.updatedAt));
    return Response.json({ incidents: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load incidents.', error);
    return Response.json({ error: 'Failed to load incidents.' }, { status: 500 });
  }
}

const createIncidentSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(4000).optional(),
  priority: z.enum(incidentPriorities).optional(),
  repository: z.string().max(500).optional(),
  projectId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const parsed = createIncidentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid incident payload.', issues: parsed.error.issues }, { status: 400 });
    }

    let repository = parsed.data.repository;
    if (parsed.data.projectId) {
      const [project] = await db
        .select({ repository: projects.repository })
        .from(projects)
        .where(and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, context.organizationId)));
      if (!project) return Response.json({ error: 'Project not found.' }, { status: 400 });
      // The linked project's repo is the source of truth once set — keep
      // this field in sync so the plain-text display never disagrees with it.
      repository = project.repository;
    }

    const [incident] = await db
      .insert(incidents)
      .values({
        organizationId: context.organizationId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        priority: parsed.data.priority,
        repository,
        projectId: parsed.data.projectId,
        createdBy: context.userId,
        status: 'New',
      })
      .returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'incident.created',
      resourceType: 'incident',
      resourceId: incident.id,
      metadata: { title: incident.title, source: 'manual' },
    });

    return Response.json({ incident }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to create incident.', error);
    return Response.json({ error: 'Failed to create incident.' }, { status: 500 });
  }
}
