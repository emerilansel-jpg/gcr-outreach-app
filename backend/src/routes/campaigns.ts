import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { campaigns, contacts } from "../db/schema";
import type { Database } from "../db";

const campaignRoutes = new Hono<{ Variables: { db: Database } }>();

// List all campaigns
campaignRoutes.get("/", async (c) => {
  const db = c.get("db");
  const result = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));

  // Get contact count for each campaign
  const campaignsWithStats = await Promise.all(
    result.map(async (campaign) => {
      const contactCount = await db
        .select({ count: contacts.id })
        .from(contacts)
        .where(eq(contacts.campaignId, campaign.id));
      return {
        ...campaign,
        contactCount: contactCount.length,
      };
    })
  );

  return c.json(campaignsWithStats);
});

// Create campaign
campaignRoutes.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    name: string;
    missionContext: string;
    tone?: string;
    targetAudience?: string;
  }>();

  const result = await db
    .insert(campaigns)
    .values({
      name: body.name,
      missionContext: body.missionContext,
      tone: body.tone || "professional",
      targetAudience: body.targetAudience,
    })
    .returning();

  return c.json(result[0], 201);
});

// Get campaign by ID
campaignRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));

  const result = await db.select().from(campaigns).where(eq(campaigns.id, id));

  if (result.length === 0) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  // Get stats
  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, id));

  const stats = {
    totalContacts: allContacts.length,
    withEmail: allContacts.filter((c) => c.email).length,
    contacted: allContacts.filter((c) => c.status === "contacted").length,
    replied: allContacts.filter((c) => c.status === "replied").length,
  };

  return c.json({ ...result[0], stats });
});

// Update campaign
campaignRoutes.put("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    name?: string;
    missionContext?: string;
    tone?: string;
    targetAudience?: string;
  }>();

  const result = await db
    .update(campaigns)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaigns.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  return c.json(result[0]);
});

// Delete campaign
campaignRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));

  // Delete associated contacts first
  await db.delete(contacts).where(eq(contacts.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));

  return c.json({ success: true });
});

export default campaignRoutes;
