import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// DTO snapshots are stored as JSON; indexed ownership/version fields are enforced
// independently by every server command. Monetary columns are integer haléř.
export const bootstrap = sqliteTable('bootstrap', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), seeded: integer('seeded').notNull().default(0),
});
export const organizations = sqliteTable('organizations', { id: text('id').primaryKey(), data: text('data').notNull() });
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), organizationId: text('organization_id').notNull(), role: text('role').notNull(), email: text('email').notNull(), data: text('data').notNull(),
}, t => [uniqueIndex('membership_user_unique').on(t.userId), index('membership_org_idx').on(t.organizationId)]);
export const contracts = sqliteTable('contracts', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), status: text('status').notNull(), version: integer('version').notNull(), amountCents: integer('amount_cents').notNull(), data: text('data').notNull(),
}, t => [index('contract_org_idx').on(t.organizationId)]);
export const items = sqliteTable('items', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), contractId: text('contract_id').notNull(), version: integer('version').notNull(), amountCents: integer('amount_cents').notNull(), claimedCents: integer('claimed_cents').notNull(), data: text('data').notNull(),
}, t => [index('item_contract_idx').on(t.contractId), index('item_org_idx').on(t.organizationId)]);
export const files = sqliteTable('files', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), contractId: text('contract_id').notNull(), objectKey: text('object_key').notNull(), data: text('data').notNull(),
}, t => [index('file_contract_idx').on(t.contractId)]);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), contractId: text('contract_id').notNull(), itemId: text('item_id').notNull(), data: text('data').notNull(),
}, t => [index('audit_org_idx').on(t.organizationId), index('audit_contract_idx').on(t.contractId)]);
export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), email: text('email').notNull(), role: text('role').notNull(), tokenHash: text('token_hash').notNull(), expiresAt: text('expires_at').notNull(), usedBy: text('used_by'), createdBy: text('created_by').notNull(),
}, t => [uniqueIndex('invite_token_unique').on(t.tokenHash)]);
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), data: text('data').notNull(),
}, t => [index('feedback_org_idx').on(t.organizationId)]);
