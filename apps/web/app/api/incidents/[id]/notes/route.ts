import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../../db/client';
import { incidentNoteTypes, incidentNotes, incidents } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';

const createNoteSchema = z.object({
  type: z.enum(incidentNoteTypes).default('note'),
  content: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });

    const parsed = createNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid note payload.', issues: parsed.error.issues }, { status: 400 });
    }

    const [note] = await db
      .insert(incidentNotes)
      .values({
        incidentId: id,
        authorId: context.userId,
        type: parsed.data.type,
        content: parsed.data.content,
        metadata: parsed.data.metadata ?? {},
      })
      .returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'incident.note_added',
      resourceType: 'incident',
      resourceId: id,
      metadata: { noteType: parsed.data.type },
    });

    return Response.json({ note }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to add note.', error);
    return Response.json({ error: 'Failed to add note.' }, { status: 500 });
  }
}
