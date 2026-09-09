import { describe, expect, it } from 'vitest';
import { generateWebhookToken, verifyWebhookToken } from '../app/lib/jira-webhook';

describe('jira-webhook token verification', () => {
  it('generates a token of consistent, non-trivial length', () => {
    const token = generateWebhookToken();
    expect(token).toHaveLength(48); // 24 random bytes, hex-encoded
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('generates a different token every time', () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken());
  });

  it('accepts the exact token that was issued', () => {
    const token = generateWebhookToken();
    expect(verifyWebhookToken(token, token)).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    const token = generateWebhookToken();
    const wrong = 'a'.repeat(token.length);
    expect(verifyWebhookToken(token, wrong)).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    const token = generateWebhookToken();
    expect(verifyWebhookToken(token, 'short')).toBe(false);
  });

  it('rejects when either side is missing', () => {
    const token = generateWebhookToken();
    expect(verifyWebhookToken(token, null)).toBe(false);
    expect(verifyWebhookToken('', token)).toBe(false);
    expect(verifyWebhookToken('', null)).toBe(false);
  });
});
