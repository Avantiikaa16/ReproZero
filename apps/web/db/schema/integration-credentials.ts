import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { integrationConnections } from './integration-connections';

/**
 * Separated from integration_connections on purpose: this table holds the
 * actual (encrypted) OAuth token material, so it's never accidentally
 * included in a general "list my org's connections" query/response. Only
 * the provider adapter (e.g. the Jira client) should ever query this table,
 * and only server-side. Tokens are encrypted at rest via secret-crypto.ts
 * before being written here — this column never holds plaintext.
 */
export const integrationCredentials = pgTable('integration_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .unique()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  // e.g. Jira's "cloudId" identifying which Atlassian site this token is for.
  externalAccountId: text('external_account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
