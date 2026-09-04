import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db/client';
import { incidentPriorities, incidents } from '../../../db/schema';
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
    return authErrorResponse(error) ?? Response.json({ error: 'Failed to load incidents.' }, { status: 500 });
  }
}

const createIncidentSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(4000).optional(),
  priority: z.enum(incidentPriorities).optional(),
  repository: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const parsed = createIncidentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid incident payload.', issues: parsed.error.issues }, { status: 400 });
    }

    const [incident] = await db
      .insert(incidents)
      .values({
        organizationId: context.organizationId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        priority: parsed.data.priority,
        repository: parsed.data.repository,
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
    return authErrorResponse(error) ?? Response.json({ error: 'Failed to create incident.' }, { status: 500 });
  }
}
