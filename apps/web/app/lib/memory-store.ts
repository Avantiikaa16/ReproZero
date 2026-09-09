import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { memoryReferences, type MemorySource } from '../../db/schema';
import type { ReproductionResult } from './adapters';

export async function storeMemoryReference(input: {
  organizationId: string;
  incidentId: string;
  incidentTitle: string;
  result: ReproductionResult;
  source: MemorySource;
}): Promise<void> {
  await db.insert(memoryReferences).values({
    organizationId: input.organizationId,
    incidentId: input.incidentId,
    signature: input.result.memory.key,
    title: input.incidentTitle,
    rootCause: input.result.failure.message,
    codePath: input.result.codePath,
    attemptedFixes: [input.result.patch.summary],
    verifiedRepair: input.result.memory.lesson,
    evidence: {
      runId: input.result.runId,
      verdict: input.result.verdict,
      before: input.result.verification.before,
      after: input.result.verification.after,
    },
    confidence: input.result.memory.confidence,
    source: input.source,
  });
}

const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'were', 'been', 'when', 'while', 'incident']);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word)),
  );
}

export type SimilarMemory = {
  id: string;
  title: string;
  rootCause: string | null;
  verifiedRepair: string | null;
  confidence: number | null;
  incidentId: string | null;
  sharedTerms: string[];
};

export type MemoryCandidate = {
  id: string;
  title: string;
  rootCause: string | null;
  verifiedRepair: string | null;
  confidence: number | null;
  incidentId: string | null;
};

/**
 * Deliberately simple keyword-overlap matching, not embeddings — but every
 * match comes with the exact terms that matched, so the "similarity
 * explanation" Phase 7 calls for is always concrete, never a black box.
 * Pulled apart from the DB fetch below purely so this scoring logic is
 * unit-testable without a live database (see test/memory-store.test.ts).
 */
export function scoreMemoryCandidates(
  queryText: string,
  candidates: MemoryCandidate[],
  excludeIncidentId?: string,
): SimilarMemory[] {
  const queryTerms = tokenize(queryText);
  if (queryTerms.size === 0) return [];

  const scored = candidates
    .filter((candidate) => candidate.incidentId !== excludeIncidentId)
    .map((candidate) => {
      const candidateTerms = tokenize(`${candidate.title} ${candidate.rootCause ?? ''}`);
      const sharedTerms = [...queryTerms].filter((term) => candidateTerms.has(term));
      return { candidate, sharedTerms };
    })
    .filter((entry) => entry.sharedTerms.length >= 2)
    .sort((a, b) => b.sharedTerms.length - a.sharedTerms.length)
    .slice(0, 5);

  return scored.map(({ candidate, sharedTerms }) => ({
    id: candidate.id,
    title: candidate.title,
    rootCause: candidate.rootCause,
    verifiedRepair: candidate.verifiedRepair,
    confidence: candidate.confidence,
    incidentId: candidate.incidentId,
    sharedTerms,
  }));
}

export async function findSimilarMemories(
  organizationId: string,
  queryText: string,
  excludeIncidentId?: string,
): Promise<SimilarMemory[]> {
  // Cheap early exit before the DB round-trip below — an all-stopword or
  // empty query can never match anything scoreMemoryCandidates would keep.
  if (tokenize(queryText).size === 0) return [];

  const candidates = await db
    .select()
    .from(memoryReferences)
    .where(eq(memoryReferences.organizationId, organizationId))
    .orderBy(desc(memoryReferences.createdAt))
    .limit(200);

  return scoreMemoryCandidates(queryText, candidates, excludeIncidentId);
}
