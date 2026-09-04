import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidents } from './incidents';
import { integrationConnections } from './integration-connections';

/**
 * Append-only. Every sync from Jira inserts a NEW row rather than updating
 * an existing one, so a reproduction's verdict stays auditable even if the
 * source Jira ticket is edited or its status changes later — "preserve
 * historical snapshots so results remain auditable even if a Jira ticket
 * later changes" (Phase 4 requirement). The most recent row per incidentId
 * is the current view; nothing here is ever mutated after insert.
 */
export const jiraTicketSnapshots = pgTable('jira_ticket_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'restrict' }),
  externalKey: text('external_key').notNull(),
  summary: text('summary'),
  description: text('description'),
  status: text('status'),
  priority: text('priority'),
  assigneeName: text('assignee_name'),
  reporterName: text('reporter_name'),
  labels: jsonb('labels').notNull().default([]),
  comments: jsonb('comments').notNull().default([]),
  attachments: jsonb('attachments').notNull().default([]),
  linkedIssues: jsonb('linked_issues').notNull().default([]),
  // Full raw API response for completeness/debugging. The Jira adapter is
  // responsible for never writing raw secrets (tokens, webhook signing
  // keys) into this payload before it's stored.
  rawPayload: jsonb('raw_payload').notNull().default({}),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
