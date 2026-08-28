import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Campaigns
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  missionContext: text("mission_context").notNull(),
  tone: text("tone").default("professional"),
  targetAudience: text("target_audience"),
  manyreachCampaignId: integer("manyreach_campaign_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
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
  // Where this contact came from: "manual" | "csv" | "scrape" (Outscraper).
  source: text("source").default("manual"),
  // Outscraper enrichment captured for scraped leads.
  phone: text("phone"),
  address: text("address"),
  rating: text("rating"),
  reviews: text("reviews"),
  placeId: text("place_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
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
  createdAt: text("created_at").default(sql`(datetime('now'))`),
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
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Outscraper async scraping jobs (polled to completion by a worker/cron).
// We persist the ticket so a separate poll step can resume it.
export const outscraperJobs = sqliteTable("outscraper_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  outscraperJobId: text("outscraper_job_id").notNull(),
  query: text("query").notNull(),
  status: text("status").default("pending"), // pending | finished | failed
  resultLimit: integer("result_limit").default(20),
  found: integer("found").default(0),
  results: text("results"), // JSON array of normalized leads (preview)
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
