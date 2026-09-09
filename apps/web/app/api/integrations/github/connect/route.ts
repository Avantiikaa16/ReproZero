import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { buildGithubAuthorizeUrl } from '../../../../lib/github-adapter';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const nonce = randomBytes(24).toString('base64url');
    const state = Buffer.from(JSON.stringify({ organizationId: context.organizationId, userId: context.userId, nonce })).toString(
      'base64url',
    );

    const response = NextResponse.redirect(buildGithubAuthorizeUrl(state));
    response.cookies.set('github_oauth_nonce', nonce, {
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
    console.error('GitHub connect failed:', error);
    return Response.json({ error: 'Failed to start GitHub connection.' }, { status: 500 });
  }
}
