import { desc, eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { incidentNotes, incidents, projects, reproductionRuns } from '../../../../db/schema';

/**
 * Public, unauthenticated, read-only — deliberately excluded from
 * middleware.ts's matcher (no requireWorkspaceContext call at all here,
 * and this path isn't in that matcher list, so Clerk never touches it).
 * Serves exactly one incident, and only once its owning workspace has
 * explicitly opted it in via POST /api/incidents/[id]/public-share — an
 * incident's default publicSlug is null, so nothing is reachable here
 * unless a human deliberately flipped it on.
 *
 * Returns a narrow, explicit allow-list of fields, not the raw row: no
 * assigneeId/createdBy (internal user references), no
 * integrationConnectionId/externalTicketKey, and no Jira snapshot data at
 * all (comments/attachments there could carry third-party or customer
 * content this org doesn't fully control). This is opt-in exposure by
 * field, not a deny-list — so a column added to `incidents` later stays
 * private here by default.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [incident] = await db.select().from(incidents).where(eq(incidents.publicSlug, slug));
  if (!incident) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const notes = await db
    .select({ type: incidentNotes.type, content: incidentNotes.content, createdAt: incidentNotes.createdAt })
    .from(incidentNotes)
    .where(eq(incidentNotes.incidentId, incident.id))
    .orderBy(desc(incidentNotes.createdAt));

  const [latestRun] = await db
    .select({ status: reproductionRuns.status, mode: reproductionRuns.mode, result: reproductionRuns.result, createdAt: reproductionRuns.createdAt })
    .from(reproductionRuns)
    .where(eq(reproductionRuns.incidentId, incident.id))
    .orderBy(desc(reproductionRuns.createdAt))
    .limit(1);

  // Only the branch name — used to build a "view this file on GitHub" link
  // on the public page. Nothing else about the project is exposed.
  let defaultBranch = 'main';
  if (incident.projectId) {
    const [linkedProject] = await db.select({ defaultBranch: projects.defaultBranch }).from(projects).where(eq(projects.id, incident.projectId));
    if (linkedProject?.defaultBranch) defaultBranch = linkedProject.defaultBranch;
  }

  return Response.json(
    {
      incident: {
        title: incident.title,
        summary: incident.summary,
        status: incident.status,
        priority: incident.priority,
        repository: incident.repository,
        defaultBranch,
        reopenedCount: incident.reopenedCount,
        createdAt: incident.createdAt,
      },
      notes,
      latestRun: latestRun ?? null,
    },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' } },
  );
}
