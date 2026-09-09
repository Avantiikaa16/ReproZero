import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../app/lib/secret-crypto';

// Fixed 32-byte base64 key for test purposes only — never a real secret.
// Read lazily inside each encrypt/decrypt call, so setting it here (rather
// than before the import) still works fine.
process.env.TOKEN_ENCRYPTION_KEY = 'lBa1QAjJWTS5UQuykQarbj423jD53dq+skT3SzmhmHE=';

describe('secret-crypto', () => {
  it('round-trips a plaintext value through encrypt then decrypt', () => {
    const plaintext = 'ghp_someVeryRealLookingGithubToken1234567890';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'same-input-every-time';
    const first = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(plaintext);
    expect(decryptSecret(second)).toBe(plaintext);
  });

  it('throws rather than silently returning garbage when the ciphertext is tampered with', () => {
    const encrypted = encryptSecret('tamper-test');
    const tampered = encrypted.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
