import { randomBytes } from 'node:crypto';
import { authErrorResponse, requireWorkspaceContext } from '../../../../lib/auth-context';
import { buildJiraAuthorizeUrl } from '../../../../lib/jira-adapter';

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const nonce = randomBytes(24).toString('base64url');
    const state = Buffer.from(JSON.stringify({ organizationId: context.organizationId, userId: context.userId, nonce })).toString(
      'base64url',
    );

    const response = Response.redirect(buildJiraAuthorizeUrl(state), 302);
    response.headers.append(
      'Set-Cookie',
      `jira_oauth_nonce=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
    return response;
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Failed to start Jira connection.' }, { status: 500 });
  }
}
