import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../../db/client';
import { incidents } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const bodySchema = z.object({
  enable: z.boolean(),
  // Only required/used when enable is true — validated below rather than
  // with .refine() so the "slug taken" case can return its own message.
  slug: z.string().min(3).max(60).regex(SLUG_PATTERN, 'Use lowercase letters, numbers, and hyphens only.').optional(),
});

/**
 * Toggles whether one incident is reachable, read-only and without
 * authentication, at GET /api/showcase/[slug] — see that route for exactly
 * what it exposes. This is the only place publicSlug is ever written, and
 * it always requires a workspace member; a visitor to the public page has
 * no way to reach this route or discover it exists.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 });
    }

    const [incident] = await db.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });

    if (!parsed.data.enable) {
      const [updated] = await db
        .update(incidents)
        .set({ publicSlug: null, updatedAt: new Date() })
        .where(eq(incidents.id, id))
        .returning();
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'incident.made_private',
        resourceType: 'incident',
        resourceId: id,
        metadata: {},
      });
      return Response.json({ incident: updated });
    }

    if (!parsed.data.slug) {
      return Response.json({ error: 'A URL slug is required to make this incident public.' }, { status: 400 });
    }

    const [existing] = await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.publicSlug, parsed.data.slug));
    if (existing && existing.id !== id) {
      return Response.json({ error: 'That URL is already taken — try a different one.' }, { status: 409 });
    }

    const [updated] = await db
      .update(incidents)
      .set({ publicSlug: parsed.data.slug, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'incident.made_public',
      resourceType: 'incident',
      resourceId: id,
      metadata: { slug: parsed.data.slug },
    });

    return Response.json({ incident: updated });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to update public sharing.', error);
    return Response.json({ error: 'Failed to update public sharing.' }, { status: 500 });
  }
}
