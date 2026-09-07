import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { integrationConnections, integrationCredentials } from '../../db/schema';
import { decryptSecret, encryptSecret } from './secret-crypto';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const JIRA_SCOPES = 'read:jira-work read:jira-user offline_access';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  return value;
}

export function getJiraRedirectUri(): string {
  return process.env.JIRA_OAUTH_REDIRECT_URI || `${requireEnv('APP_BASE_URL')}/api/integrations/jira/callback`;
}

export function buildJiraAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: requireEnv('JIRA_OAUTH_CLIENT_ID'),
    scope: JIRA_SCOPES,
    redirect_uri: getJiraRedirectUri(),
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

export async function exchangeJiraCode(code: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: requireEnv('JIRA_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('JIRA_OAUTH_CLIENT_SECRET'),
      code,
      redirect_uri: getJiraRedirectUri(),
    }),
  });
  if (!response.ok) throw new Error(`Jira token exchange failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<TokenResponse>;
}

async function refreshJiraToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: requireEnv('JIRA_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('JIRA_OAUTH_CLIENT_SECRET'),
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`Jira token refresh failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<TokenResponse>;
}

export type JiraAccessibleResource = { id: string; url: string; name: string };

export async function getJiraAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
  const response = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to list accessible Jira sites: ${response.status}`);
  return response.json() as Promise<JiraAccessibleResource[]>;
}

/**
 * Returns a valid access token for this connection, refreshing and
 * persisting the new token first if the stored one has expired. Every
 * Jira API call in this adapter should go through this rather than reading
 * integration_credentials directly.
 */
export async function getValidJiraAccessToken(integrationConnectionId: string): Promise<{ accessToken: string; cloudId: string }> {
  const [credentials] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integrationConnectionId, integrationConnectionId));
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, integrationConnectionId));

  if (!credentials || !connection || connection.status !== 'connected') {
    throw new Error('Jira is not connected for this organization.');
  }

  const config = connection.config as { cloudId?: string };
  if (!config.cloudId) throw new Error('Jira connection is missing its site (cloudId).');

  const expiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : 0;
  const isExpired = Date.now() > expiresAt - 60_000;

  if (!isExpired) {
    return { accessToken: decryptSecret(credentials.encryptedAccessToken), cloudId: config.cloudId };
  }

  if (!credentials.encryptedRefreshToken) {
    throw new Error('Jira access token expired and no refresh token is available. Reconnect Jira.');
  }

  const refreshed = await refreshJiraToken(decryptSecret(credentials.encryptedRefreshToken));
  await db
    .update(integrationCredentials)
    .set({
      encryptedAccessToken: encryptSecret(refreshed.access_token),
      encryptedRefreshToken: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : credentials.encryptedRefreshToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(integrationCredentials.id, credentials.id));

  return { accessToken: refreshed.access_token, cloudId: config.cloudId };
}

async function jiraApiFetch(integrationConnectionId: string, path: string): Promise<Response> {
  const { accessToken, cloudId } = await getValidJiraAccessToken(integrationConnectionId);
  return fetch(`https://api.atlassian.com/ex/jira/${cloudId}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
}

export type JiraProject = { id: string; key: string; name: string };

export async function listJiraProjects(integrationConnectionId: string): Promise<JiraProject[]> {
  const response = await jiraApiFetch(integrationConnectionId, '/rest/api/3/project/search?maxResults=100');
  if (!response.ok) throw new Error(`Failed to list Jira projects: ${response.status}`);
  const payload = (await response.json()) as { values: JiraProject[] };
  return payload.values;
}

export type JiraTicketSearchParams = {
  projectKey?: string;
  query?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  startAt?: number;
  maxResults?: number;
};

export type JiraTicketSummary = {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  updated: string;
  labels: string[];
};

/**
 * Only ever returns issues the connected user's own token can see — the
 * JQL runs as that user against Jira's own permission model, so this
 * never exposes anything the connected Jira account itself lacks access
 * to.
 */
export async function searchJiraTickets(
  integrationConnectionId: string,
  params: JiraTicketSearchParams,
): Promise<{ issues: JiraTicketSummary[]; hasMore: boolean }> {
  const clauses: string[] = [];
  if (params.projectKey) clauses.push(`project = "${params.projectKey}"`);
  if (params.status) clauses.push(`status = "${params.status}"`);
  if (params.priority) clauses.push(`priority = "${params.priority}"`);
  if (params.assignee) clauses.push(`assignee = "${params.assignee}"`);
  if (params.labels?.length) clauses.push(`labels in (${params.labels.map((label) => `"${label}"`).join(',')})`);
  if (params.query) clauses.push(`text ~ "${params.query.replace(/"/g, '\\"')}"`);
  // Jira Cloud's search API rejects a JQL with no restricting clause at
  // all ("Unbounded JQL queries are not allowed") — searching with every
  // filter left blank needs a real one, so this adds a practically
  // unrestrictive one (created any time in the last ~50 years) purely to
  // satisfy that requirement without meaningfully narrowing results.
  if (clauses.length === 0) clauses.push('created >= -18250d');
  const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;

  const search = new URLSearchParams({
    jql,
    startAt: String(params.startAt ?? 0),
    maxResults: String(params.maxResults ?? 25),
    fields: 'summary,status,priority,assignee,updated,labels',
  });

  const response = await jiraApiFetch(integrationConnectionId, `/rest/api/3/search/jql?${search.toString()}`);
  if (!response.ok) throw new Error(`Jira ticket search failed: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as {
    // Jira Cloud's newer /search/jql endpoint doesn't return a total count
    // at all (unlike the old /search endpoint) — hasMore below is derived
    // from the page size instead, never from a total.
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        priority?: { name: string } | null;
        assignee?: { displayName: string } | null;
        updated: string;
        labels: string[];
      };
    }>;
  };

  const maxResults = params.maxResults ?? 25;

  return {
    hasMore: payload.issues.length >= maxResults,
    issues: payload.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name ?? null,
      assignee: issue.fields.assignee?.displayName ?? null,
      updated: issue.fields.updated,
      labels: issue.fields.labels ?? [],
    })),
  };
}

export type JiraTicketDetail = {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string | null;
  assigneeName: string | null;
  reporterName: string | null;
  labels: string[];
  comments: Array<{ author: string; body: string; createdAt: string }>;
  attachments: Array<{ filename: string; url: string; size: number; mimeType: string }>;
  linkedIssues: Array<{ key: string; type: string; summary: string }>;
  raw: unknown;
};

function extractPlainText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return typeof adf === 'string' ? adf : '';
  const node = adf as { text?: string; content?: unknown[] };
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) return node.content.map(extractPlainText).join(' ');
  return '';
}

/**
 * Imports the complete ticket detail the connected user's Jira permissions
 * allow: summary, description, comments, attachments, labels, and linked
 * issues. Nothing beyond what that user's own Jira access already grants.
 */
export async function getJiraTicketDetail(integrationConnectionId: string, key: string): Promise<JiraTicketDetail> {
  const response = await jiraApiFetch(
    integrationConnectionId,
    `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,priority,assignee,reporter,labels,attachment,issuelinks,comment`,
  );
  if (!response.ok) throw new Error(`Failed to load Jira ticket ${key}: ${response.status}`);
  const payload = (await response.json()) as {
    key: string;
    fields: {
      summary: string;
      description?: unknown;
      status: { name: string };
      priority?: { name: string } | null;
      assignee?: { displayName: string } | null;
      reporter?: { displayName: string } | null;
      labels: string[];
      attachment: Array<{ filename: string; content: string; size: number; mimeType: string }>;
      issuelinks: Array<{
        type: { name: string };
        inwardIssue?: { key: string; fields: { summary: string } };
        outwardIssue?: { key: string; fields: { summary: string } };
      }>;
      comment: { comments: Array<{ author: { displayName: string }; body: unknown; created: string }> };
    };
  };

  return {
    key: payload.key,
    summary: payload.fields.summary,
    description: extractPlainText(payload.fields.description),
    status: payload.fields.status.name,
    priority: payload.fields.priority?.name ?? null,
    assigneeName: payload.fields.assignee?.displayName ?? null,
    reporterName: payload.fields.reporter?.displayName ?? null,
    labels: payload.fields.labels ?? [],
    comments: (payload.fields.comment?.comments ?? []).map((comment) => ({
      author: comment.author.displayName,
      body: extractPlainText(comment.body),
      createdAt: comment.created,
    })),
    attachments: (payload.fields.attachment ?? []).map((attachment) => ({
      filename: attachment.filename,
      url: attachment.content,
      size: attachment.size,
      mimeType: attachment.mimeType,
    })),
    linkedIssues: (payload.fields.issuelinks ?? []).map((link) => {
      const linked = link.inwardIssue ?? link.outwardIssue;
      return { key: linked?.key ?? '', type: link.type.name, summary: linked?.fields.summary ?? '' };
    }),
    raw: payload,
  };
}
