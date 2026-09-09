import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { integrationConnections } from './integration-connections';
import { organizations } from './organizations';
import { projects } from './projects';
import { users } from './users';

export const incidentStatuses = [
  'New',
  'Evidence needed',
  'Ready to reproduce',
  'Reproducing',
  'Reproduced',
  'Fix proposed',
  'Verifying',
  'Verified',
  'Blocked',
  'Completed',
] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentPriorities = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentPriority = (typeof incidentPriorities)[number];

/**
 * Core incident record. Deliberately provider-agnostic: an incident may or
 * may not have come from Jira (integrationConnectionId + externalTicketKey
 * are nullable). See jira-ticket-snapshots.ts for the immutable, versioned
 * ticket data itself — this table only holds a denormalized quick-reference
 * key, never the mutable Jira fields, so a later-edited Jira ticket never
 * silently rewrites incident history.
 */
export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  status: text('status', { enum: incidentStatuses }).notNull().default('New'),
  priority: text('priority', { enum: incidentPriorities }),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  // Free text, kept for incidents without a linked project (e.g. imported
  // before a project existed, or a one-off repo). When projectId is set,
  // the project's own repository/defaultBranch are the source of truth for
  // GitHub actions — this field becomes a display fallback, not deleted.
  repository: text('repository'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  environmentDetails: jsonb('environment_details').notNull().default({}),
  integrationConnectionId: uuid('integration_connection_id').references(() => integrationConnections.id, { onDelete: 'set null' }),
  externalTicketKey: text('external_ticket_key'),
  reopenedCount: integer('reopened_count').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // Null = private (the default for every incident). Set only via an
  // explicit "make public" action (see /api/incidents/[id]/public-share) —
  // never inferred or defaulted on. When set, GET /api/showcase/[slug]
  // serves a deliberately narrow, read-only view of this one incident with
  // no authentication — see that route for exactly what is/isn't exposed.
  publicSlug: text('public_slug').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
