import { describe, expect, it } from 'vitest';
import { adapters, runReproductionForEvidence } from '../app/lib/adapters';

describe('reproduction adapter registry', () => {
  it('registers all six Phase 8 reproduction types', () => {
    expect(adapters).toHaveLength(6);
  });

  it('routes AWS-shaped evidence to the AWS adapter and produces a verified result', () => {
    const result = runReproductionForEvidence({ evidenceType: 'ticket', evidence: '', repository: '', demo: true });
    expect(result.incidentId).toBe('DIT-1842');
    expect(result.verdict).toBe('FIX_VERIFIED');
  });

  it('routes Stripe-shaped evidence to the Stripe adapter', () => {
    const result = runReproductionForEvidence({
      evidenceType: 'ticket',
      evidence: 'Customer reports a duplicate stripe webhook charge',
      repository: '',
    });
    expect(result.incidentId).toBe('STRIPE-9921');
  });

  it('routes API pagination evidence to the API adapter', () => {
    const result = runReproductionForEvidence({
      evidenceType: 'ticket',
      evidence: 'Pagination cursor returns duplicate rows from the api',
      repository: '',
    });
    expect(result.incidentId).toBe('API-3311');
  });

  it('routes failing-test evidence to the failing-test adapter', () => {
    const result = runReproductionForEvidence({
      evidenceType: 'ticket',
      evidence: 'Unit test failing on proration edge case',
      repository: '',
    });
    expect(result.incidentId).toBe('TEST-772');
  });

  it('routes config-mismatch evidence to the config adapter', () => {
    const result = runReproductionForEvidence({
      evidenceType: 'ticket',
      evidence: 'Config missing environment variable in production',
      repository: '',
    });
    expect(result.incidentId).toBe('CFG-514');
  });

  it('routes migration evidence to the database migration adapter', () => {
    const result = runReproductionForEvidence({
      evidenceType: 'ticket',
      evidence: 'Schema migration failed with a not-null constraint violation, had to rollback',
      repository: '',
    });
    expect(result.incidentId).toBe('DB-2290');
  });

  it('throws a clear, honest error listing supported adapters when nothing matches', () => {
    expect(() =>
      runReproductionForEvidence({ evidenceType: 'ticket', evidence: 'completely unrelated evidence text', repository: '' }),
    ).toThrowError(/No reproduction adapter recognized this evidence yet/);
  });

  it('every adapter produces a result with the fields the rest of the app depends on', () => {
    const inputs = [
      { evidenceType: 'ticket' as const, evidence: '', repository: '', demo: true },
      { evidenceType: 'ticket' as const, evidence: 'duplicate stripe webhook', repository: '' },
      { evidenceType: 'ticket' as const, evidence: 'api pagination duplicate rows', repository: '' },
      { evidenceType: 'ticket' as const, evidence: 'failing test on proration', repository: '' },
      { evidenceType: 'ticket' as const, evidence: 'config environment variable missing', repository: '' },
      { evidenceType: 'ticket' as const, evidence: 'migration schema constraint rollback', repository: '' },
    ];
    for (const input of inputs) {
      const result = runReproductionForEvidence(input);
      expect(result.runId).toMatch(/^run_/);
      expect(result.patch.diff.length).toBeGreaterThan(0);
      expect(result.codePath.length).toBeGreaterThan(0);
      expect(result.memory.confidence).toBeGreaterThan(0);
      expect(result.memory.confidence).toBeLessThanOrEqual(1);
    }
  });
});
