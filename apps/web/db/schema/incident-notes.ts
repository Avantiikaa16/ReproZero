import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidents } from './incidents';
import { users } from './users';

export const incidentNoteTypes = [
  'note',
  'evidence',
  'log',
  'file',
  'repository_link',
  'environment_detail',
  'status_change',
  'request_info',
  'system',
] as const;
export type IncidentNoteType = (typeof incidentNoteTypes)[number];

/**
 * The incident's timeline: manual notes, attached evidence/logs/files,
 * status-change entries, and system-generated events all live here as one
 * ordered feed, distinguished by `type`. `authorId` null means system-
 * generated (e.g. an automated status change from a run completing).
 */
export const incidentNotes = pgTable('incident_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type', { enum: incidentNoteTypes }).notNull().default('note'),
  content: text('content'),
  // Shape depends on `type` — e.g. { from, to } for status_change,
  // { filename, url, size, mimeType } for file.
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
