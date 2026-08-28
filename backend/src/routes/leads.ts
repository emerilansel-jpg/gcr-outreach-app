import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { contacts, outscraperJobs } from "../db/schema";
import type { Database } from "../db";
import { searchMaps } from "../services/outscraper";

interface Env {
  DB: D1Database;
  OUTSCRAPER_API_KEY: string;
  ANYMAIL_API_KEY: string;
  MANYREACH_API_KEY: string;
  CF_AI_API_TOKEN: string;
}

const leadsRoutes = new Hono<{ Variables: { db: Database }; Bindings: Env }>();

/**
 * Scrape leads via Outscraper (Google Maps search) and import them as contacts
 * in a campaign. The search runs synchronously and returns the imported leads.
 *
 * Body:
 *   query:      string | string[]  (e.g. "coffee shops jakarta")
 *   limit?:     number             (max businesses per query, default 20)
 *   enrichment?: string[]          (e.g. ["emails"])
 *   region?:    string
 *   language?:  string
 */
leadsRoutes.post("/scrape/:campaignId", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const campaignId = Number(c.req.param("campaignId"));

  if (!env.OUTSCRAPER_API_KEY) {
    return c.json({ error: "Outscraper API key not configured" }, 400);
  }

  const body = await c.req.json<{
    query: string | string[];
    limit?: number;
    enrichment?: string[];
    region?: string;
    language?: string;
  }>().catch(() => ({} as any));

  if (!body.query) {
    return c.json({ error: "query is required" }, 400);
  }

  try {
    const result = await searchMaps(env.OUTSCRAPER_API_KEY, {
      query: body.query,
      limit: body.limit ?? 20,
      enrichment: body.enrichment ?? [],
      region: body.region,
      language: body.language ?? "en",
      async: false,
    });

    if (result.async) {
      // Shouldn't happen with async:false, but guard anyway.
      return c.json({ error: "Unexpected async response" }, 500);
    }

    const leads = result.leads;
    const imported = [];
    const skipped = 0;

    for (const lead of leads) {
      if (!lead.name) continue;

      // De-dupe by placeId within the campaign.
      if (lead.placeId) {
        const existing = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.campaignId, campaignId),
              eq(contacts.placeId, lead.placeId)
            )
          );
        if (existing.length > 0) continue;
      }

      const email = lead.emails?.[0] ?? null;
      const row = await db
        .insert(contacts)
        .values({
          campaignId,
          name: lead.name,
          company: lead.name,
          website: lead.website,
          email,
          emailVerified: email ? 0 : 0,
          phone: lead.phone,
          address: lead.address,
          rating: lead.rating != null ? String(lead.rating) : null,
          reviews: lead.reviews != null ? String(lead.reviews) : null,
          placeId: lead.placeId,
          source: "scrape",
          status: "new",
          kanbanStage: "todo",
        })
        .returning();
      imported.push(row[0]);
    }

    // Record a scrape-history row.
    await db.insert(outscraperJobs).values({
      campaignId,
      outscraperJobId: `sync-${Date.now()}`,
      query: JSON.stringify(body.query),
      status: "finished",
      resultLimit: body.limit ?? 20,
      found: imported.length,
      results: JSON.stringify(
        leads.map((l) => ({ name: l.name, website: l.website, email: l.emails?.[0] ?? null }))
      ),
    });

    return c.json({
      found: leads.length,
      imported: imported.length,
      skipped,
      contacts: imported,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * Scrape history for a campaign.
 */
leadsRoutes.get("/jobs/:campaignId", async (c) => {
  const db = c.get("db");
  const campaignId = Number(c.req.param("campaignId"));
  const rows = await db
    .select()
    .from(outscraperJobs)
    .where(eq(outscraperJobs.campaignId, campaignId));
  return c.json(rows);
});

export default leadsRoutes;
