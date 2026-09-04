import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { memberships, organizations, users } from '../../db/schema';

export class AuthContextError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type WorkspaceContext = {
  clerkUserId: string;
  clerkOrgId: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * The single authorization gate every workspace-owned API route must call
 * first. Verifies (a) there's a signed-in Clerk session, (b) an active
 * organization is selected, and (c) the mirrored Postgres rows for both
 * exist and the user is actually a member of that org — never trusts a
 * client-supplied organizationId on its own.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  if (!clerkUserId) {
    throw new AuthContextError('Not signed in.', 401);
  }
  if (!clerkOrgId) {
    throw new AuthContextError('No active organization selected.', 400);
  }

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  const [organization] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId));

  if (!user || !organization) {
    // The Clerk webhook hasn't synced this user/org into Postgres yet.
    throw new AuthContextError('Workspace is still syncing. Try again in a moment.', 409);
  }

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, organization.id)));

  if (!membership) {
    throw new AuthContextError('Not a member of this organization.', 403);
  }

  return {
    clerkUserId,
    clerkOrgId,
    userId: user.id,
    organizationId: organization.id,
    role: membership.role,
  };
}

export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthContextError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
