import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '../../../../../db/client';
import { integrationConnections, integrationCredentials } from '../../../../../db/schema';
import { recordAuditEvent } from '../../../../lib/audit';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { exchangeJiraCode, getJiraAccessibleResources } from '../../../../lib/jira-adapter';
import { encryptSecret } from '../../../../lib/secret-crypto';

// NextResponse.redirect(), not Response.redirect() — the latter's headers
// are immutable per the Fetch spec, which broke clearing the nonce cookie
// below the same way it broke setting it in connect/route.ts.
function redirectToIntegrations(request: Request, query: string): NextResponse {
  const url = new URL(`/integrations?${query}`, request.url);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieNonce = cookieHeader.match(/jira_oauth_nonce=([^;]+)/)?.[1];

  if (!code || !state) {
    return redirectToIntegrations(request, 'error=jira_missing_code');
  }

  let parsedState: { organizationId: string; userId: string; nonce: string };
  try {
    parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return redirectToIntegrations(request, 'error=jira_invalid_state');
  }

  if (!cookieNonce || cookieNonce !== parsedState.nonce) {
    return redirectToIntegrations(request, 'error=jira_state_mismatch');
  }

  try {
    const context = await requireWorkspaceContext();
    if (context.organizationId !== parsedState.organizationId || context.userId !== parsedState.userId) {
      return redirectToIntegrations(request, 'error=jira_session_mismatch');
    }

    const tokens = await exchangeJiraCode(code);
    const sites = await getJiraAccessibleResources(tokens.access_token);
    const site = sites[0];
    if (!site) {
      return redirectToIntegrations(request, 'error=jira_no_accessible_site');
    }

    // One Jira connection per org: find the existing row (if any) and
    // update it in place rather than accumulating duplicates on reconnect.
    const [existingConnection] = await db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.organizationId, context.organizationId), eq(integrationConnections.provider, 'jira')));

    const connectionValues = {
      displayName: site.name,
      status: 'connected' as const,
      config: { siteUrl: site.url, cloudId: site.id, siteName: site.name },
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    const connectionId = existingConnection
      ? existingConnection.id
      : (
          await db
            .insert(integrationConnections)
            .values({ organizationId: context.organizationId, provider: 'jira', createdBy: context.userId, ...connectionValues })
            .returning({ id: integrationConnections.id })
        )[0].id;

    if (existingConnection) {
      await db.update(integrationConnections).set(connectionValues).where(eq(integrationConnections.id, connectionId));
    }

    const encryptedAccessToken = encryptSecret(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const [existingCredentials] = await db
      .select()
      .from(integrationCredentials)
      .where(eq(integrationCredentials.integrationConnectionId, connectionId));

    if (existingCredentials) {
      await db
        .update(integrationCredentials)
        .set({ encryptedAccessToken, encryptedRefreshToken, expiresAt, scope: tokens.scope, externalAccountId: site.id, updatedAt: new Date() })
        .where(eq(integrationCredentials.id, existingCredentials.id));
    } else {
      await db.insert(integrationCredentials).values({
        integrationConnectionId: connectionId,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        scope: tokens.scope,
        externalAccountId: site.id,
      });
    }

    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'integration.connected',
      resourceType: 'integration_connection',
      resourceId: connectionId,
      metadata: { provider: 'jira', siteName: site.name },
    });

    const response = redirectToIntegrations(request, 'connected=jira');
    response.cookies.set('jira_oauth_nonce', '', { httpOnly: true, maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Jira OAuth callback failed:', error);
    return redirectToIntegrations(request, 'error=jira_connect_failed');
  }
}
