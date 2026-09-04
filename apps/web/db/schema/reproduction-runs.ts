import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidents } from './incidents';
import { users } from './users';

/**
 * `mode` is the honesty label carried through to the UI (mirrors the
 * mode: 'live'|'fallback' convention already used in live-integrations.ts).
 * Every run today is 'demo_simulation' — real isolated execution is Phase
 * 5 and not built yet. Never claim 'live_sandbox' for a run that didn't
 * actually execute in one.
 */
export const reproductionRunModes = ['demo_simulation', 'live_sandbox'] as const;
export type ReproductionRunMode = (typeof reproductionRunModes)[number];

export const reproductionRunStatuses = ['queued', 'running', 'succeeded', 'failed'] as const;
export type ReproductionRunStatus = (typeof reproductionRunStatuses)[number];

export const reproductionRuns = pgTable('reproduction_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
  mode: text('mode', { enum: reproductionRunModes }).notNull().default('demo_simulation'),
  status: text('status', { enum: reproductionRunStatuses }).notNull().default('queued'),
  // Holds the ReproductionResult-shaped payload (ReproSpec, failure trace,
  // patch, verification, memory) regardless of mode.
  result: jsonb('result').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
