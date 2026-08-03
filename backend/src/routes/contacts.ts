import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { contacts, messages } from "../db/schema";
import type { Database } from "../db";

const contactRoutes = new Hono<{ Variables: { db: Database } }>();

// List contacts for a campaign
contactRoutes.get("/campaign/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));

  const result = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId))
    .orderBy(desc(contacts.createdAt));

  return c.json(result);
});

// Get contact by ID
contactRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));

  const result = await db.select().from(contacts).where(eq(contacts.id, id));

  if (result.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  // Get messages for this contact
  const contactMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.contactId, id))
    .orderBy(desc(messages.createdAt));

  return c.json({ ...result[0], messages: contactMessages });
});

// Add single contact
contactRoutes.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    campaignId: number;
    name: string;
    website?: string;
    socialUrl?: string;
    email?: string;
    company?: string;
    title?: string;
  }>();

  const result = await db
    .insert(contacts)
    .values({
      campaignId: body.campaignId,
      name: body.name,
      website: body.website,
      socialUrl: body.socialUrl,
      email: body.email,
      company: body.company,
      title: body.title,
    })
    .returning();

  return c.json(result[0], 201);
});

// Bulk import contacts
contactRoutes.post("/bulk/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));
  const body = await c.req.json<{
    contacts: Array<{
      name: string;
      website?: string;
      socialUrl?: string;
      email?: string;
      company?: string;
      title?: string;
    }>;
  }>();

  const results = [];
  for (const contact of body.contacts) {
    const result = await db
      .insert(contacts)
      .values({
        campaignId,
        name: contact.name,
        website: contact.website,
        socialUrl: contact.socialUrl,
        email: contact.email,
        company: contact.company,
        title: contact.title,
      })
      .returning();
    results.push(result[0]);
  }

  return c.json({ imported: results.length, contacts: results }, 201);
});

// Update contact
contactRoutes.put("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    name?: string;
    website?: string;
    socialUrl?: string;
    email?: string;
    emailVerified?: number;
    company?: string;
    title?: string;
    status?: string;
    kanbanStage?: string;
    notes?: string;
  }>();

  const result = await db
    .update(contacts)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  return c.json(result[0]);
});

// Delete contact
contactRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));

  await db.delete(messages).where(eq(messages.contactId, id));
  await db.delete(contacts).where(eq(contacts.id, id));

  return c.json({ success: true });
});

// Kanban: get all contacts grouped by stage for a campaign
contactRoutes.get("/kanban/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));

  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId))
    .orderBy(desc(contacts.createdAt));

  const stages = ["todo", "follow_up_1", "follow_up_2", "follow_up_3", "closed"];
  const kanban: Record<string, typeof allContacts> = {};
  for (const stage of stages) {
    kanban[stage] = allContacts.filter((ct) => ct.kanbanStage === stage);
  }

  return c.json(kanban);
});

// Kanban: move contact to a stage
contactRoutes.put("/:id/kanban", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ stage: string }>();

  const result = await db
    .update(contacts)
    .set({
      kanbanStage: body.stage,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  return c.json(result[0]);
});

export default contactRoutes;
