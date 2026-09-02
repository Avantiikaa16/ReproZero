import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';

export const membershipRoles = ['owner', 'admin', 'member'] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clerkMembershipId: text('clerk_membership_id').unique(),
  role: text('role', { enum: membershipRoles }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memberships_org_user_unique').on(table.organizationId, table.userId),
]);
