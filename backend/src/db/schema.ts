import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Campaigns
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  missionContext: text("mission_context").notNull(),
  tone: text("tone").default("professional"),
  targetAudience: text("target_audience"),
  createdAt: text("created_at").default("(datetime('now'))"),
  updatedAt: text("updated_at").default("(datetime('now'))"),
});

// Contacts
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  name: text("name").notNull(),
  website: text("website"),
  socialUrl: text("social_url"),
  email: text("email"),
  emailVerified: integer("email_verified").default(0),
  company: text("company"),
  title: text("title"),
  status: text("status").default("new"),
  kanbanStage: text("kanban_stage").default("todo"),
  notes: text("notes"),
  createdAt: text("created_at").default("(datetime('now'))"),
  updatedAt: text("updated_at").default("(datetime('now'))"),
});

// Messages
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  channel: text("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").default("draft"),
  sentAt: text("sent_at"),
  openedAt: text("opened_at"),
  repliedAt: text("replied_at"),
  manyreachId: text("manyreach_id"),
  createdAt: text("created_at").default("(datetime('now'))"),
});

// Email Enrichments
export const emailEnrichments = sqliteTable("email_enrichments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id),
  email: text("email").notNull(),
  confidence: integer("confidence"),
  sources: text("sources"),
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").default("(datetime('now'))"),
});
