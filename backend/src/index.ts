import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "./db";
import campaignRoutes from "./routes/campaigns";
import contactRoutes from "./routes/contacts";
import messageRoutes from "./routes/messages";
import analyticsRoutes from "./routes/analytics";
import emailLookupRoutes from "./routes/email-lookup";

type Bindings = {
  DB: D1Database;
  HUNTER_API_KEY: string;
  MANYREACH_API_KEY: string;
  CF_AI_API_TOKEN: string;
};

type Variables = {
  db: ReturnType<typeof createDb>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware
app.use("*", cors());

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

// ManyReach webhook endpoint
app.post("/api/webhooks/manyreach", async (c) => {
  const body = await c.req.json();
  // TODO: Process webhook - update message status, contact kanban stage
  console.log("ManyReach webhook:", body);
  return c.json({ received: true });
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
