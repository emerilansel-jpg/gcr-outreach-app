import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { messages, contacts, campaigns } from "../db/schema";
import type { Database } from "../db";
import { generatePersonalizedPitch } from "../services/ai";
import { sendEmail } from "../services/manyreach";

interface Env {
  DB: D1Database;
  HUNTER_API_KEY: string;
  MANYREACH_API_KEY: string;
  CF_AI_API_TOKEN: string;
}

const messageRoutes = new Hono<{ Variables: { db: Database }; Bindings: Env }>();

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

  // Save message as draft
  const messageResult = await db
    .insert(messages)
    .values({
      contactId,
      campaignId: contact.campaignId,
      channel: body.channel,
      subject: pitch.subject,
      body: pitch.body,
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

// Send a single message via ManyReach
messageRoutes.post("/send/:id", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const id = Number(c.req.param("id"));

  // Get message
  const msgResult = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id));

  if (msgResult.length === 0) {
    return c.json({ error: "Message not found" }, 404);
  }
  const msg = msgResult[0];

  // Get contact for email
  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, msg.contactId));

  if (contactResult.length === 0 || !contactResult[0].email) {
    return c.json({ error: "Contact has no email" }, 400);
  }

  const contact = contactResult[0];
  const contactEmail = contact.email!;

  // Send via ManyReach
  const sendResult = await sendEmail(env.MANYREACH_API_KEY, {
    to: contactEmail,
    subject: msg.subject || "Outreach",
    body: msg.body,
    tags: ["gcr-outreach"],
  });

  if (!sendResult.success) {
    return c.json({ error: sendResult.error }, 500);
  }

  // Update message status
  const updated = await db
    .update(messages)
    .set({
      status: "sent",
      sentAt: new Date().toISOString(),
      manyreachId: sendResult.messageId,
    })
    .where(eq(messages.id, id))
    .returning();

  // Update contact status
  await db
    .update(contacts)
    .set({
      status: "contacted",
      kanbanStage: "follow_up_1",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, msg.contactId));

  return c.json(updated[0]);
});

// Bulk send messages
messageRoutes.post("/bulk-send", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const body = await c.req.json<{ messageIds: number[] }>();

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

      const sendResult = await sendEmail(env.MANYREACH_API_KEY, {
        to: contactResult[0].email,
        subject: msg.subject || "Outreach",
        body: msg.body,
        tags: ["gcr-outreach"],
      });

      if (sendResult.success) {
        await db
          .update(messages)
          .set({
            status: "sent",
            sentAt: new Date().toISOString(),
            manyreachId: sendResult.messageId,
          })
          .where(eq(messages.id, msgId));

        await db
          .update(contacts)
          .set({
            status: "contacted",
            kanbanStage: "follow_up_1",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(contacts.id, msg.contactId));

        results.push({ messageId: msgId, success: true });
      } else {
        results.push({ messageId: msgId, error: sendResult.error });
      }
    } catch (error) {
      results.push({ messageId: msgId, error: (error as Error).message });
    }
  }

  return c.json({ results });
});

export default messageRoutes;
