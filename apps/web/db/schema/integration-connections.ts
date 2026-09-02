import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';

export const integrationConnectionStatuses = ['pending', 'connected', 'error', 'disabled'] as const;
export type IntegrationConnectionStatus = (typeof integrationConnectionStatuses)[number];

/**
 * Generic evidence-source registry. `provider` is a plain string (validated
 * app-side against a const list, not a DB enum) so a new adapter — Jira,
 * Linear, PagerDuty, a raw webhook — never requires a migration. All
 * provider-specific shape lives in `config`; nothing Jira-specific belongs
 * on this table or any core table.
 */
export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status', { enum: integrationConnectionStatuses }).notNull().default('pending'),
  config: jsonb('config').notNull().default({}),
  credentialsRef: text('credentials_ref'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
