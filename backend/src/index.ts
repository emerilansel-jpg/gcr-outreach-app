import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "./db";
import { eq } from "drizzle-orm";
import { messages, contacts } from "./db/schema";
import campaignRoutes from "./routes/campaigns";
import contactRoutes from "./routes/contacts";
import messageRoutes from "./routes/messages";
import analyticsRoutes from "./routes/analytics";
import emailLookupRoutes from "./routes/email-lookup";
import leadsRoutes from "./routes/leads";

type Bindings = {
  DB: D1Database;
  AI: Ai;
  ACCOUNT_ID: string;
  ANYMAIL_API_KEY: string;
  MANYREACH_API_KEY: string;
  REOON_API_KEY: string;
  OUTSCRAPER_API_KEY: string;
  CF_AI_API_TOKEN: string;
};

type Variables = {
  db: ReturnType<typeof createDb>;
};

type Ai = {
  run: (
    model: string,
    inputs: { messages: Array<{ role: string; content: string }> },
    options?: Record<string, unknown>
  ) => Promise<{ response?: string }>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware - allow frontend origins (Pages, custom domain, localhost dev)
app.use(
  "*",
  cors({
    origin: [
      "https://gcr-outreach-frontend.pages.dev",
      "https://reach.gcrindex.org",
      "http://localhost:5173",
      "http://localhost:4173",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Initialize DB
app.use("*", async (c, next) => {
  c.set("db", createDb(c.env));
  await next();
});

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", message: "GCR Outreach API" });
});

// API Routes
app.route("/api/campaigns", campaignRoutes);
app.route("/api/contacts", contactRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/email-lookup", emailLookupRoutes);
app.route("/api/leads", leadsRoutes);

// ManyReach webhook endpoint: processes delivered, opened, replied, and bounced events
app.post("/api/webhooks/manyreach", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<any>().catch(() => ({}));

  const event = String(body.event || body.type || body.action || "").toLowerCase();
  const leadId = String(
    body.leadId ||
    body.leadID ||
    body.prospectId ||
    body.prospect_id ||
    body.data?.leadID ||
    body.data?.leadId ||
    ""
  );
  const email = body.email || body.recipient || body.data?.email;

  if (!event && !leadId && !email) {
    return c.json({ received: true, ignored: "empty_payload" });
  }

  // Find message by manyreachId or contact email
  let targetMsg = null;
  if (leadId) {
    const found = await db.select().from(messages).where(eq(messages.manyreachId, leadId));
    if (found.length > 0) targetMsg = found[0];
  }
  if (!targetMsg && email) {
    const contactRows = await db.select().from(contacts).where(eq(contacts.email, email));
    if (contactRows.length > 0) {
      const found = await db.select().from(messages).where(eq(messages.contactId, contactRows[0].id));
      if (found.length > 0) targetMsg = found[0];
    }
  }

  if (targetMsg) {
    const now = new Date().toISOString();
    if (event.includes("open")) {
      await db.update(messages).set({ status: "opened", openedAt: now }).where(eq(messages.id, targetMsg.id));
    } else if (event.includes("reply") || event.includes("replied")) {
      await db.update(messages).set({ status: "replied", repliedAt: now }).where(eq(messages.id, targetMsg.id));
      await db.update(contacts).set({ status: "replied", kanbanStage: "closed", updatedAt: now }).where(eq(contacts.id, targetMsg.contactId));
    } else if (event.includes("bounce")) {
      await db.update(messages).set({ status: "bounced" }).where(eq(messages.id, targetMsg.id));
      await db.update(contacts).set({ status: "bounced", updatedAt: now }).where(eq(contacts.id, targetMsg.contactId));
    } else if (event.includes("deliver") || event.includes("sent")) {
      await db.update(messages).set({ status: "sent", sentAt: targetMsg.sentAt || now }).where(eq(messages.id, targetMsg.id));
      await db.update(contacts).set({ status: "contacted", kanbanStage: "follow_up_1", updatedAt: now }).where(eq(contacts.id, targetMsg.contactId));
    }
  }

  return c.json({ received: true, matched: Boolean(targetMsg) });
});

// 404
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("API Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
