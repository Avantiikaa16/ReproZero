import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';

/**
 * A real, linked entity for a repository, replacing the free-text
 * `incidents.repository` field as the source of truth once set. An
 * incident without a projectId still works via its own free-text
 * repository field — this is additive, not a breaking migration.
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // owner/repo, or a full GitHub URL — same shape parseGithubRepository()
  // in github-adapter.ts already accepts.
  repository: text('repository').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
