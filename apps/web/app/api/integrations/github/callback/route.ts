import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '../../../../../db/client';
import { integrationConnections, integrationCredentials } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { exchangeGithubCode, getGithubUser } from '../../../../lib/github-adapter';
import { encryptSecret } from '../../../../lib/secret-crypto';

function redirectToIntegrations(request: Request, query: string): NextResponse {
  const url = new URL(`/integrations?${query}`, request.url);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieNonce = cookieHeader.match(/github_oauth_nonce=([^;]+)/)?.[1];

  if (!code || !state) {
    return redirectToIntegrations(request, 'error=github_missing_code');
  }

  let parsedState: { organizationId: string; userId: string; nonce: string };
  try {
    parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return redirectToIntegrations(request, 'error=github_invalid_state');
  }

  if (!cookieNonce || cookieNonce !== parsedState.nonce) {
    return redirectToIntegrations(request, 'error=github_state_mismatch');
  }

  try {
    const context = await requireWorkspaceContext();
    if (context.organizationId !== parsedState.organizationId || context.userId !== parsedState.userId) {
      return redirectToIntegrations(request, 'error=github_session_mismatch');
    }

    const tokens = await exchangeGithubCode(code);
    const user = await getGithubUser(tokens.access_token);

    const [existingConnection] = await db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'github')));

    const connectionValues = {
      displayName: user.login,
      status: 'connected' as const,
      config: { login: user.login, avatarUrl: user.avatarUrl },
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    const connectionId = existingConnection
      ? existingConnection.id
      : (
          await db
            .insert(integrationConnections)
            .values({ organizationId: context.organizationId, provider: 'github', createdBy: context.userId, ...connectionValues })
            .returning({ id: integrationConnections.id })
        )[0].id;

    if (existingConnection) {
      await db.update(integrationConnections).set(connectionValues).where(eq(integrationConnections.id, connectionId));
    }

    const encryptedAccessToken = encryptSecret(tokens.access_token);
    const [existingCredentials] = await db
      .select()
      .from(integrationCredentials)
      .where(eq(integrationCredentials.integrationConnectionId, connectionId));

    if (existingCredentials) {
      await db
        .update(integrationCredentials)
        .set({ encryptedAccessToken, scope: tokens.scope, externalAccountId: String(user.id), updatedAt: new Date() })
        .where(eq(integrationCredentials.id, existingCredentials.id));
    } else {
      await db.insert(integrationCredentials).values({
        integrationConnectionId: connectionId,
        encryptedAccessToken,
        scope: tokens.scope,
        externalAccountId: String(user.id),
      });
    }

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'integration.connected',
      resourceType: 'integration_connection',
      resourceId: connectionId,
      metadata: { provider: 'github', login: user.login },
    });

    const response = redirectToIntegrations(request, 'connected=github');
    response.cookies.set('github_oauth_nonce', '', { httpOnly: true, maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('GitHub OAuth callback failed:', error);
    return redirectToIntegrations(request, 'error=github_connect_failed');
  }
}
