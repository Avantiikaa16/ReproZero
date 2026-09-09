import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { integrationCredentials } from '../../db/schema';
import { decryptSecret } from './secret-crypto';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_BASE = 'https://api.github.com';
// 'repo' is required to create branches and pull requests on private (and
// public) repos on the user's behalf.
const GITHUB_SCOPES = 'repo read:user';
// Every outbound call to GitHub gets a hard timeout so a slow/hung upstream
// can't leave a request (or a Vercel function) stuck indefinitely.
const GITHUB_FETCH_TIMEOUT_MS = 10_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  return value;
}

export function getGithubRedirectUri(): string {
  return process.env.GITHUB_OAUTH_REDIRECT_URI || `${requireEnv('APP_BASE_URL')}/api/integrations/github/callback`;
}

export function buildGithubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GITHUB_OAUTH_CLIENT_ID'),
    redirect_uri: getGithubRedirectUri(),
    scope: GITHUB_SCOPES,
    state,
    allow_signup: 'false',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = { access_token: string; scope: string; token_type: string; error?: string; error_description?: string };

export async function exchangeGithubCode(code: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('GITHUB_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('GITHUB_OAUTH_CLIENT_SECRET'),
      code,
      redirect_uri: getGithubRedirectUri(),
    }),
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub token exchange failed: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as TokenResponse;
  if (payload.error) throw new Error(`GitHub token exchange failed: ${payload.error_description ?? payload.error}`);
  return payload;
}

export type GithubUser = { login: string; id: number; avatarUrl: string };

export async function getGithubUser(accessToken: string): Promise<GithubUser> {
  const response = await fetch(`${API_BASE}/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Failed to fetch GitHub user: ${response.status}`);
  const payload = (await response.json()) as { login: string; id: number; avatar_url: string };
  return { login: payload.login, id: payload.id, avatarUrl: payload.avatar_url };
}

/**
 * Classic GitHub OAuth App tokens don't expire, so there's no refresh
 * flow to implement here (unlike Jira) — this just decrypts the stored
 * token.
 */
async function getGithubAccessToken(integrationConnectionId: string): Promise<string> {
  const [credentials] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integrationConnectionId, integrationConnectionId));
  if (!credentials) throw new Error('GitHub is not connected for this organization.');
  return decryptSecret(credentials.encryptedAccessToken);
}

async function githubApiFetch(integrationConnectionId: string, path: string, init?: { method?: string; body?: unknown }): Promise<Response> {
  const token = await getGithubAccessToken(integrationConnectionId);
  return fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
}

/** Parses "https://github.com/owner/repo", "owner/repo", or a .git URL. */
export function parseGithubRepository(repository: string): { owner: string; repo: string } | null {
  const cleaned = repository.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const match = cleaned.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function createBranch(
  integrationConnectionId: string,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranchName: string,
): Promise<{ ref: string; url: string }> {
  const baseRef = await githubApiFetch(integrationConnectionId, `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
  if (!baseRef.ok) throw new Error(`Failed to read base branch "${baseBranch}": ${baseRef.status} ${await baseRef.text()}`);
  const baseSha = ((await baseRef.json()) as { object: { sha: string } }).object.sha;

  const created = await githubApiFetch(integrationConnectionId, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${newBranchName}`, sha: baseSha },
  });
  if (!created.ok) throw new Error(`Failed to create branch "${newBranchName}": ${created.status} ${await created.text()}`);
  return { ref: newBranchName, url: `https://github.com/${owner}/${repo}/tree/${newBranchName}` };
}

export async function createDraftPullRequest(
  integrationConnectionId: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string }> {
  const response = await githubApiFetch(integrationConnectionId, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: { title, head, base, body, draft: true },
  });
  if (!response.ok) throw new Error(`Failed to open draft pull request: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as { number: number; html_url: string };
  return { number: payload.number, url: payload.html_url };
}
