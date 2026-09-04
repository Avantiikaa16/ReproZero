import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { buildJiraAuthorizeUrl } from '../../../../lib/jira-adapter';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const nonce = randomBytes(24).toString('base64url');
    const state = Buffer.from(JSON.stringify({ organizationId: context.organizationId, userId: context.userId, nonce })).toString(
      'base64url',
    );

    // Response.redirect() returns a Response with immutable headers per the
    // Fetch spec — setting a cookie on it afterward throws "TypeError:
    // immutable". NextResponse.redirect() doesn't have that restriction.
    const response = NextResponse.redirect(buildJiraAuthorizeUrl(state));
    response.cookies.set('jira_oauth_nonce', nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return response;
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    console.error('Jira connect failed:', error);
    return Response.json({ error: 'Failed to start Jira connection.' }, { status: 500 });
  }
}
