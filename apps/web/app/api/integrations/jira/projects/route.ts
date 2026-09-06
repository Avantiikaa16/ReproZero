import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/client';
import { integrationConnections } from '../../../../../db/schema';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { listJiraProjects } from '../../../../lib/jira-adapter';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'jira')));

    if (!connection || connection.status !== 'connected') {
      return Response.json({ error: 'Jira is not connected for this workspace.' }, { status: 409 });
    }

    const projects = await listJiraProjects(connection.id);
    return Response.json({ projects });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Failed to list Jira projects.', error);
    return Response.json({ error: 'Failed to list Jira projects.' }, { status: 500 });
  }
}
