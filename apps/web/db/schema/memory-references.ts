import { jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidents } from './incidents';
import { organizations } from './organizations';

export const memorySources = ['hosted', 'claude_mem_live'] as const;
export type MemorySource = (typeof memorySources)[number];

/**
 * The hosted memory abstraction Phase 7 calls for: Vercel can't reach a
 * developer's local Claude-Mem worker, so a verified reproduction's lesson
 * is always stored here (source: 'hosted') regardless of whether the live
 * worker was also reachable — see live-integrations.ts's storeClaudeMemory
 * for the separate best-effort attempt against the actual worker, which
 * never blocks this table from getting an entry either way. The one thing
 * this store must never do is claim `source: 'claude_mem_live'` for
 * anything the local worker didn't actually confirm — see run/route.ts.
 */
export const memoryReferences = pgTable('memory_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  incidentId: uuid('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
  signature: text('signature').notNull(),
  title: text('title').notNull(),
  rootCause: text('root_cause'),
  codePath: jsonb('code_path').notNull().default([]),
  attemptedFixes: jsonb('attempted_fixes').notNull().default([]),
  verifiedRepair: text('verified_repair'),
  evidence: jsonb('evidence').notNull().default({}),
  confidence: real('confidence'),
  source: text('source', { enum: memorySources }).notNull().default('hosted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
