import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { messages, contacts, campaigns } from "../db/schema";
import type { Database } from "../db";
import { generatePersonalizedPitch } from "../services/ai";
import { addProspect, createCampaign } from "../services/manyreach";

interface Env {
  DB: D1Database;
  MANYREACH_API_KEY: string;
  ACCOUNT_ID: string;
  CF_AI_API_TOKEN: string;
}

const messageRoutes = new Hono<{ Variables: { db: Database }; Bindings: Env }>();

// Get all messages for a campaign (with contact info)
messageRoutes.get("/campaign/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));

  const result = await db
    .select({
      id: messages.id,
      contactId: messages.contactId,
      campaignId: messages.campaignId,
      channel: messages.channel,
      subject: messages.subject,
      body: messages.body,
      status: messages.status,
      sentAt: messages.sentAt,
      openedAt: messages.openedAt,
      repliedAt: messages.repliedAt,
      manyreachId: messages.manyreachId,
      createdAt: messages.createdAt,
      contactName: contacts.name,
      contactEmail: contacts.email,
      contactCompany: contacts.company,
    })
    .from(messages)
    .innerJoin(contacts, eq(messages.contactId, contacts.id))
    .where(eq(messages.campaignId, campaignId))
    .orderBy(desc(messages.createdAt));

  return c.json(result);
});

// Get messages for a contact
messageRoutes.get("/contact/:contactId", async (c) => {
  const db = c.get("db");
  const contactId = Number(c.req.param("contactId"));

  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(desc(messages.createdAt));

  return c.json(result);
});

// Generate AI pitch for a contact
messageRoutes.post("/generate/:contactId", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const contactId = Number(c.req.param("contactId"));
  const body = await c.req.json<{ channel: "email" | "linkedin" | "twitter" }>();

  // Get contact
  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId));

  if (contactResult.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }
  const contact = contactResult[0];

  // Get campaign
  const campaignResult = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, contact.campaignId));

  if (campaignResult.length === 0) {
    return c.json({ error: "Campaign not found" }, 404);
  }
  const campaign = campaignResult[0];

  // Generate pitch
  let pitch;
  try {
    pitch = await generatePersonalizedPitch(
      env,
      {
        name: contact.name,
        website: contact.website || undefined,
        socialUrl: contact.socialUrl || undefined,
        company: contact.company || undefined,
        title: contact.title || undefined,
        email: contact.email || undefined,
      },
      {
        name: campaign.name,
        missionContext: campaign.missionContext,
        tone: campaign.tone || "professional",
        targetAudience: campaign.targetAudience || undefined,
      },
      body.channel
    );
  } catch (err) {
    console.error("Pitch generation failed:", err);
    return c.json({ error: "Pitch generation failed", detail: (err as Error).message }, 500);
  }

  // Save message as draft
  const messageResult = await db
    .insert(messages)
    .values({
      contactId,
      campaignId: contact.campaignId,
      channel: body.channel,
      subject: pitch.subject != null ? String(pitch.subject) : null,
      body: typeof pitch.body === "string" ? pitch.body : JSON.stringify(pitch.body ?? ""),
      status: "draft",
    })
    .returning();

  return c.json(messageResult[0]);
});

// Generate pitches for all contacts in a campaign
messageRoutes.post("/generate-all/:campaignId", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const campaignId = Number(c.req.param("campaignId"));
  const body = await c.req.json<{ channel: "email" | "linkedin" | "twitter" }>();

  // Get campaign
  const campaignResult = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));

  if (campaignResult.length === 0) {
    return c.json({ error: "Campaign not found" }, 404);
  }
  const campaign = campaignResult[0];

  // Get all contacts in campaign
  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId));

  const results = [];
  for (const contact of allContacts) {
    try {
      const pitch = await generatePersonalizedPitch(
        env,
        {
          name: contact.name,
          website: contact.website || undefined,
          socialUrl: contact.socialUrl || undefined,
          company: contact.company || undefined,
          title: contact.title || undefined,
          email: contact.email || undefined,
        },
        {
          name: campaign.name,
          missionContext: campaign.missionContext,
          tone: campaign.tone || "professional",
          targetAudience: campaign.targetAudience || undefined,
        },
        body.channel
      );

      const messageResult = await db
        .insert(messages)
        .values({
          contactId: contact.id,
          campaignId,
          channel: body.channel,
          subject: pitch.subject,
          body: pitch.body,
          status: "draft",
        })
        .returning();

      results.push({ contactId: contact.id, message: messageResult[0] });
    } catch (error) {
      results.push({
        contactId: contact.id,
        error: (error as Error).message,
      });
    }
  }

  return c.json({ generated: results.length, results });
});

// Update message (edit draft)
messageRoutes.put("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ subject?: string; body?: string; status?: string }>();

  const result = await db
    .update(messages)
    .set(body)
    .where(eq(messages.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }

  return c.json(result[0]);
});

// Helper: queue a single message into ManyReach as a campaign prospect.
// ManyReach is a drip-campaign platform: we keep ONE ManyReach campaign per GCR
// campaign (stored as a contact tag) and add each contact as a prospect. The
// personalized pitch lives on the prospect's `icebreaker` field.
async function queueMessageViaManyReach(
  db: Database,
  env: Env,
  msg: typeof messages.$inferSelect,
  contact: typeof contacts.$inferSelect,
  campaignId: number
) {
  const nameParts = contact.name.split(" ");
  const addResult = await addProspect(env.MANYREACH_API_KEY, campaignId, {
    email: contact.email!,
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" ") ?? "",
    company: contact.company ?? undefined,
    icebreaker: msg.body,
  });

  if (!addResult.success) {
    return { success: false as const, error: addResult.error };
  }

  const updated = await db
    .update(messages)
    .set({
      status: "sent",
      sentAt: new Date().toISOString(),
      manyreachId: String(addResult.prospectId),
    })
    .where(eq(messages.id, msg.id))
    .returning();

  await db
    .update(contacts)
    .set({
      status: "contacted",
      kanbanStage: "follow_up_1",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, contact.id));

  return { success: true as const, message: updated[0] };
}

// Resolve (or create) the ManyReach campaign that mirrors this GCR campaign.
async function resolveManyReachCampaign(
  db: Database,
  env: Env,
  gcrCampaignId: number
): Promise<{ campaignId?: number; error?: string }> {
  const campaignResult = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, gcrCampaignId));
  if (campaignResult.length === 0) {
    return { error: "Campaign not found" };
  }
  const campaign = campaignResult[0];
  if (campaign.manyreachCampaignId) {
    return { campaignId: campaign.manyreachCampaignId };
  }

  const created = await createCampaign(env.MANYREACH_API_KEY, {
    name: `GCR: ${campaign.name}`,
    fromEmail: "noreply@gcrindex.org",
    fromName: "GCR Outreach",
    subject: campaign.name,
  });
  if (!created.success || !created.campaignId) {
    return { error: created.error ?? "Failed to create ManyReach campaign" };
  }

  await db
    .update(campaigns)
    .set({ manyreachCampaignId: created.campaignId, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, gcrCampaignId));

  return { campaignId: created.campaignId };
}

// Send a single message via ManyReach
messageRoutes.post("/send/:id", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const id = Number(c.req.param("id"));

  if (!env.MANYREACH_API_KEY) {
    return c.json({ error: "MANYREACH_API_KEY not configured" }, 400);
  }

  const msgResult = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id));
  if (msgResult.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }
  const msg = msgResult[0];

  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, msg.contactId));
  if (contactResult.length === 0 || !contactResult[0].email) {
    return c.json({ error: "Contact has no email" }, 400);
  }
  const contact = contactResult[0];

  const resolved = await resolveManyReachCampaign(db, env, msg.campaignId);
  if (resolved.error || !resolved.campaignId) {
    return c.json({ error: resolved.error }, 500);
  }

  const result = await queueMessageViaManyReach(db, env, msg, contact, resolved.campaignId);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }
  return c.json(result.message);
});

// Bulk send messages
messageRoutes.post("/bulk-send", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const body = await c.req.json<{ messageIds: number[] }>();

  if (!env.MANYREACH_API_KEY) {
    return c.json({ error: "MANYREACH_API_KEY not configured" }, 400);
  }

  const results = [];
  for (const msgId of body.messageIds) {
    try {
      const msgResult = await db
        .select()
        .from(messages)
        .where(eq(messages.id, msgId));
      if (msgResult.length === 0) {
        results.push({ messageId: msgId, error: "Message not found" });
        continue;
      }
      const msg = msgResult[0];

      const contactResult = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, msg.contactId));
      if (contactResult.length === 0 || !contactResult[0].email) {
        results.push({ messageId: msgId, error: "No email" });
        continue;
      }
      const contact = contactResult[0];

      // Resolve the ManyReach campaign for THIS message's GCR campaign. Messages
      // in a bulk send can belong to different campaigns, so we resolve per message
      // (resolveManyReachCampaign caches the id on the campaign row, so repeated
      // lookups hit the DB only once per distinct campaign).
      const resolved = await resolveManyReachCampaign(db, env, msg.campaignId);
      if (resolved.error || !resolved.campaignId) {
        results.push({ messageId: msgId, error: resolved.error });
        continue;
      }
      const campaignId = resolved.campaignId;

      const result = await queueMessageViaManyReach(db, env, msg, contact, campaignId);
      if (result.success) {
        results.push({ messageId: msgId, success: true });
      } else {
        results.push({ messageId: msgId, error: result.error });
      }
    } catch (error) {
      results.push({ messageId: msgId, error: (error as Error).message });
    }
  }

  return c.json({ results });
});

export default messageRoutes;
