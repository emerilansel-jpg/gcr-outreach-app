import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { contacts } from "../db/schema";
import type { Database } from "../db";

const contactRoutes = new Hono<{ Variables: { db: Database } }>();

// Get all contacts for a campaign
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

// Get kanban board for a campaign (grouped by stage)
const KANBAN_STAGES = ["todo", "contacted", "replied", "converted", "rejected"];
contactRoutes.get("/kanban/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));
  const result = await db
    .select()
    .from(contacts)
    .where(eq(contacts.campaignId, campaignId));

  const board: Record<string, typeof result> = {};
  for (const stage of KANBAN_STAGES) board[stage] = [];
  for (const contact of result) {
    const stage =
      contact.kanbanStage && KANBAN_STAGES.includes(contact.kanbanStage)
        ? contact.kanbanStage
        : "todo";
    board[stage].push(contact);
  }
  return c.json(board);
});

// Get single contact
contactRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const result = await db.select().from(contacts).where(eq(contacts.id, id));
  if (result.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }
  return c.json(result[0]);
});

// Create contact
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
    notes?: string;
    phone?: string;
    address?: string;
    rating?: string;
    reviews?: string;
    placeId?: string;
    source?: string;
    kanbanStage?: string;
  }>();

  if (!body.campaignId || !body.name) {
    return c.json({ error: "campaignId and name are required" }, 400);
  }

  const result = await db
    .insert(contacts)
    .values({
      campaignId: body.campaignId,
      name: body.name,
      website: body.website ?? null,
      socialUrl: body.socialUrl ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      title: body.title ?? null,
      notes: body.notes ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      rating: body.rating ?? null,
      reviews: body.reviews ?? null,
      placeId: body.placeId ?? null,
      source: body.source ?? "manual",
      kanbanStage: body.kanbanStage ?? "todo",
    })
    .returning();

  return c.json(result[0], 201);
});

// Bulk add contacts to a campaign
contactRoutes.post("/bulk/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));
  const body = await c.req.json<{ contacts: Array<Record<string, any>> }>();

  if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
    return c.json({ error: "contacts array is required" }, 400);
  }

  const values = body.contacts.map((c) => ({
    campaignId,
    name: c.name ?? "Unknown",
    website: c.website ?? null,
    socialUrl: c.socialUrl ?? null,
    email: c.email ?? null,
    company: c.company ?? null,
    title: c.title ?? null,
    notes: c.notes ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
    rating: c.rating ?? null,
    reviews: c.reviews ?? null,
    placeId: c.placeId ?? null,
    source: c.source ?? "manual",
    kanbanStage: c.kanbanStage ?? "todo",
  }));

  const result = await db.insert(contacts).values(values).returning();
  return c.json(result, 201);
});

// Update contact
contactRoutes.put("/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, any>>();

  const existing = await db.select().from(contacts).where(eq(contacts.id, id));
  if (existing.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  const fields = [
    "name",
    "website",
    "socialUrl",
    "email",
    "emailVerified",
    "company",
    "title",
    "status",
    "kanbanStage",
    "notes",
    "phone",
    "address",
    "rating",
    "reviews",
    "placeId",
    "source",
  ];
  for (const f of fields) {
    if (f in body) updateData[f] = body[f];
  }

  const result = await db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, id))
    .returning();

  return c.json(result[0]);
});

// Move contact on kanban board
contactRoutes.put("/:id/kanban", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ stage: string }>();

  if (!body.stage) {
    return c.json({ error: "stage is required" }, 400);
  }

  const result = await db
    .update(contacts)
    .set({ kanbanStage: body.stage, updatedAt: new Date().toISOString() })
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

  const existing = await db.select().from(contacts).where(eq(contacts.id, id));
  if (existing.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  await db.delete(contacts).where(eq(contacts.id, id));
  return c.json({ success: true });
});

export default contactRoutes;
