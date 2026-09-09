import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../../db/client';
import { incidentNotes, incidents, integrationConnections } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { createBranch, createDraftPullRequest, parseGithubRepository } from '../../../../lib/github-adapter';

// `confirmed: true` required on every request, same as the Jira
// write-back route — this only ever runs after the client has already
// shown the user the exact target repo/branch/files and gotten explicit
// approval.
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_branch'),
    branchName: z.string().min(1).max(200),
    baseBranch: z.string().min(1).max(200).default('main'),
    confirmed: z.literal(true),
  }),
  z.object({
    action: z.literal('create_pr'),
    head: z.string().min(1).max(200),
    base: z.string().min(1).max(200).default('main'),
    title: z.string().min(1).max(300),
    body: z.string().max(4000).default(''),
    confirmed: z.literal(true),
  }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;

    const [incident] = await db.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, context.organizationId)));
    if (!incident) return Response.json({ error: 'Incident not found.' }, { status: 404 });
    if (!incident.repository) return Response.json({ error: 'This incident has no repository set.' }, { status: 409 });

    const target = parseGithubRepository(incident.repository);
    if (!target) return Response.json({ error: `Could not parse "${incident.repository}" as a GitHub repository.` }, { status: 400 });

    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'github')));
    if (!connection || connection.status !== 'connected') {
      return Response.json({ error: 'GitHub is not connected for this workspace.' }, { status: 409 });
    }

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid GitHub action request.', issues: parsed.error.issues }, { status: 400 });
    }

    if (parsed.data.action === 'create_branch') {
      const result = await createBranch(connection.id, target.owner, target.repo, parsed.data.baseBranch, parsed.data.branchName);
      await db.insert(incidentNotes).values({
        incidentId: id,
        authorId: context.userId,
        type: 'system',
        content: `Created branch "${result.ref}" on ${target.owner}/${target.repo}`,
        metadata: { githubAction: 'create_branch', url: result.url },
      });
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'github.branch_created',
        resourceType: 'incident',
        resourceId: id,
        metadata: { repository: `${target.owner}/${target.repo}`, branch: result.ref },
      });
      return Response.json({ status: 'ok', url: result.url });
    }

    const result = await createDraftPullRequest(
      connection.id,
      target.owner,
      target.repo,
      parsed.data.head,
      parsed.data.base,
      parsed.data.title,
      parsed.data.body,
    );
    await db.insert(incidentNotes).values({
      incidentId: id,
      authorId: context.userId,
      type: 'system',
      content: `Opened draft pull request #${result.number} on ${target.owner}/${target.repo}`,
      metadata: { githubAction: 'create_pr', url: result.url },
    });
    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'github.pr_opened',
      resourceType: 'incident',
      resourceId: id,
      metadata: { repository: `${target.owner}/${target.repo}`, prNumber: result.number },
    });
    return Response.json({ status: 'ok', url: result.url });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('GitHub action failed.', error);
    return Response.json({ error: error instanceof Error ? error.message : 'GitHub action failed.' }, { status: 500 });
  }
}
