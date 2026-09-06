import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { integrationConnections } from '../../../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { searchJiraTickets } from '../../../../lib/jira-adapter';

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'jira')));

    if (!connection || connection.status !== 'connected') {
      return Response.json({ error: 'Jira is not connected for this workspace.' }, { status: 409 });
    }

    const url = new URL(request.url);
    const startAt = Number(url.searchParams.get('startAt') ?? '0');
    const maxResults = Math.min(Number(url.searchParams.get('maxResults') ?? '25'), 100);

    const result = await searchJiraTickets(connection.id, {
      projectKey: url.searchParams.get('project') ?? undefined,
      query: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      priority: url.searchParams.get('priority') ?? undefined,
      assignee: url.searchParams.get('assignee') ?? undefined,
      labels: url.searchParams.get('labels')?.split(',').filter(Boolean),
      startAt: Number.isFinite(startAt) ? startAt : 0,
      maxResults: Number.isFinite(maxResults) ? maxResults : 25,
    });

    return Response.json(result);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to search Jira tickets.', error);
    return Response.json({ error: 'Failed to search Jira tickets.' }, { status: 500 });
  }
}
