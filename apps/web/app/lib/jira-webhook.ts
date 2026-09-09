import 'server-only';
import crypto from 'node:crypto';

/**
 * Atlassian's dynamic webhook registration API for OAuth 2.0 (3LO) apps —
 * unlike Connect apps, which get a JWT-signed callback — does not sign its
 * webhook payloads at all. The standard workaround (and Atlassian's own
 * guidance for securing a dynamic webhook URL) is a random token embedded
 * in the callback URL itself, verified on every inbound call. This token
 * grants no Jira API access on its own; it only proves a request claiming
 * to be "issue X changed" actually came from the webhook we registered.
 */
export function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Constant-time comparison so a mistimed response can't leak the token a byte at a time. */
export function verifyWebhookToken(expected: string, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
