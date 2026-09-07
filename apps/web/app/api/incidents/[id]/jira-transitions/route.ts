import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { incidents } from '../../../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { getJiraTransitions } from '../../../../lib/jira-adapter';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });
    if (!incident.integrationConnectionId || !incident.externalTicketKey) {
      return Response.json({ error: 'This incident is not linked to a Jira ticket.' }, { status: 409 });
    }

    const transitions = await getJiraTransitions(incident.integrationConnectionId, incident.externalTicketKey);
    return Response.json({ transitions });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to load Jira transitions.', error);
    return Response.json({ error: 'Failed to load Jira transitions.' }, { status: 500 });
  }
}
