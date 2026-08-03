import { Hono } from "hono";
import { eq, count, sql } from "drizzle-orm";
import { campaigns, contacts, messages } from "../db/schema";
import type { Database } from "../db";

const analyticsRoutes = new Hono<{ Variables: { db: Database } }>();

// Overview stats
analyticsRoutes.get("/overview", async (c) => {
  const db = c.get("db");

  const totalCampaigns = await db.select({ count: count() }).from(campaigns);
  const totalContacts = await db.select({ count: count() }).from(contacts);
  const totalMessages = await db.select({ count: count() }).from(messages);

  const sentMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.status, "sent"));

  const openedMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.status, "opened"));

  const repliedMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.status, "replied"));

  const bouncedMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.status, "bounced"));

  const sent = sentMessages[0].count;
  const opened = openedMessages[0].count;
  const replied = repliedMessages[0].count;

  return c.json({
    totalCampaigns: totalCampaigns[0].count,
    totalContacts: totalContacts[0].count,
    totalMessages: totalMessages[0].count,
    sent,
    opened,
    replied,
    bounced: bouncedMessages[0].count,
    openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0",
    replyRate: sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0",
  });
});

// Campaign-specific stats
analyticsRoutes.get("/campaign/:id", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("id"));

  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));

  if (campaign.length === 0) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  const totalContacts = await db
    .select({ count: count() })
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId));

  const withEmail = await db
    .select({ count: count() })
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId));

  const totalMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaignId));

  const sentMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaignId));

  const openedMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaignId));

  const repliedMessages = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaignId));

  const sent = sentMessages[0].count;
  const opened = openedMessages[0].count;
  const replied = repliedMessages[0].count;

  return c.json({
    campaign: campaign[0],
    totalContacts: totalContacts[0].count,
    totalMessages: totalMessages[0].count,
    sent,
    opened,
    replied,
    openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0",
    replyRate: sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0",
  });
});

// Kanban stats for a campaign
analyticsRoutes.get("/kanban/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));

  const stages = ["todo", "follow_up_1", "follow_up_2", "follow_up_3", "closed"];
  const stats: Record<string, number> = {};

  for (const stage of stages) {
    const result = await db
      .select({ count: count() })
      .from(contacts)
      .where(eq(contacts.campaignId, campaignId));
    stats[stage] = result[0].count;
  }

  return c.json(stats);
});

export default analyticsRoutes;
