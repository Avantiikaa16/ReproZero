import { describe, expect, it } from 'vitest';
import { scoreMemoryCandidates, tokenize, type MemoryCandidate } from '../app/lib/memory-store';

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumerics, and drops short/stopword tokens', () => {
    expect(tokenize('Stripe Webhook Ordering Incident')).toEqual(new Set(['stripe', 'webhook', 'ordering']));
  });

  it('drops words of length <= 3', () => {
    expect(tokenize('the api has a crash')).toEqual(new Set(['crash']));
  });
});

describe('scoreMemoryCandidates', () => {
  const candidates: MemoryCandidate[] = [
    {
      id: 'mem-1',
      title: 'Stripe webhook duplicate charge',
      rootCause: 'Webhook retried without idempotency key, duplicate charge created',
      verifiedRepair: 'Added idempotency key check',
      confidence: 0.8,
      incidentId: 'inc-1',
    },
    {
      id: 'mem-2',
      title: 'AWS firewall rule deleted',
      rootCause: 'Security group rule removed by automation script',
      verifiedRepair: 'Restored firewall rule and added guardrail',
      confidence: 0.9,
      incidentId: 'inc-2',
    },
    {
      id: 'mem-3',
      title: 'Unrelated database migration rollback',
      rootCause: 'Not-null constraint violation during migration',
      verifiedRepair: 'Fixed migration ordering',
      confidence: 0.6,
      incidentId: 'inc-3',
    },
  ];

  it('returns an empty array for a query with no meaningful terms', () => {
    expect(scoreMemoryCandidates('the a is', candidates)).toEqual([]);
  });

  it('matches a candidate sharing at least two meaningful terms, with those terms surfaced', () => {
    const result = scoreMemoryCandidates('Customer sees a duplicate stripe webhook charge again', candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mem-1');
    expect(result[0].sharedTerms).toEqual(expect.arrayContaining(['stripe', 'webhook', 'duplicate', 'charge']));
  });

  it('excludes a candidate below the two-shared-term threshold', () => {
    // Shares only "firewall" (one term) with candidate 2 — not enough to surface.
    const result = scoreMemoryCandidates('firewall dashboard redesign', candidates);
    expect(result).toEqual([]);
  });

  it('excludes the candidate matching excludeIncidentId even if it would otherwise match', () => {
    const result = scoreMemoryCandidates('Customer sees a duplicate stripe webhook charge again', candidates, 'inc-1');
    expect(result).toEqual([]);
  });

  it('sorts by number of shared terms, most-overlapping first', () => {
    const result = scoreMemoryCandidates('firewall rule security group automation script deleted', candidates);
    expect(result[0].id).toBe('mem-2');
    expect(result[0].sharedTerms.length).toBeGreaterThanOrEqual(2);
  });

  it('caps results at 5', () => {
    const many: MemoryCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `mem-many-${i}`,
      title: 'Stripe webhook duplicate charge incident',
      rootCause: 'Webhook retried without idempotency key',
      verifiedRepair: null,
      confidence: 0.5,
      incidentId: `inc-many-${i}`,
    }));
    const result = scoreMemoryCandidates('stripe webhook duplicate charge idempotency', many);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});
