import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { incidents, reproductionRuns } from '../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../lib/auth-context';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const rows = await db
      .select({
        id: reproductionRuns.id,
        incidentId: reproductionRuns.incidentId,
        incidentTitle: incidents.title,
        mode: reproductionRuns.mode,
        status: reproductionRuns.status,
        result: reproductionRuns.result,
        createdAt: reproductionRuns.createdAt,
        completedAt: reproductionRuns.completedAt,
      })
      .from(reproductionRuns)
      .innerJoin(incidents, eq(reproductionRuns.incidentId, incidents.id))
      .where(eq(incidents.organizationId, context.organizationId))
      .orderBy(desc(reproductionRuns.createdAt));

    return Response.json({ runs: rows });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load reproduction runs.', error);
    return Response.json({ error: 'Failed to load reproduction runs.' }, { status: 500 });
  }
}
