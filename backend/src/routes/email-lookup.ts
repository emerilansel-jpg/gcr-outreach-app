import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { contacts, emailEnrichments } from "../db/schema";
import type { Database } from "../db";
import { findEmail, lookupEmailByDomain } from "../services/hunter";

interface Env {
  DB: D1Database;
  HUNTER_API_KEY: string;
  MANYREACH_API_KEY: string;
  CF_AI_API_TOKEN: string;
}

const emailLookupRoutes = new Hono<{ Variables: { db: Database }; Bindings: Env }>();

// Look up email for a single contact
emailLookupRoutes.post("/contact/:id", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const contactId = Number(c.req.param("id"));

  if (!env.HUNTER_API_KEY) {
    return c.json({ error: "Hunter.io API key not configured" }, 400);
  }

  // Get contact
  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId));

  if (contactResult.length === 0) {
    return c.json({ error: "Contact not found" }, 404);
  }

  const contact = contactResult[0];
  if (!contact.website) {
    return c.json({ error: "Contact has no website for email lookup" }, 400);
  }

  try {
    // Extract domain from website
    const url = contact.website.startsWith("http")
      ? contact.website
      : `https://${contact.website}`;
    const domain = new URL(url).hostname;

    // Split name into first/last
    const nameParts = contact.name.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Try email finder first
    const result = await findEmail(env.HUNTER_API_KEY, domain, firstName, lastName);

    if (result.data?.email) {
      // Save enrichment
      await db.insert(emailEnrichments).values({
        contactId,
        email: result.data.email,
        confidence: result.data.score,
        sources: JSON.stringify(result.data.sources || []),
        verifiedAt: new Date().toISOString(),
      });

      // Update contact email
      await db
        .update(contacts)
        .set({
          email: result.data.email,
          emailVerified: result.data.score > 80 ? 1 : 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(contacts.id, contactId));

      return c.json({
        email: result.data.email,
        confidence: result.data.score,
        sources: result.data.sources,
      });
    }

    // Fallback to domain search
    const domainResult = await lookupEmailByDomain(env.HUNTER_API_KEY, domain);

    if (domainResult.emails?.length > 0) {
      // Try to match by name
      const matched = domainResult.emails.find(
        (e) =>
          e.position?.toLowerCase().includes(firstName.toLowerCase()) ||
          e.value.toLowerCase().includes(firstName.toLowerCase())
      );

      const email = matched?.value || domainResult.emails[0].value;
      const confidence = matched?.confidence || domainResult.emails[0].confidence;

      await db.insert(emailEnrichments).values({
        contactId,
        email,
        confidence,
        sources: JSON.stringify(matched?.sources || domainResult.emails[0].sources || []),
      });

      await db
        .update(contacts)
        .set({
          email,
          emailVerified: confidence > 80 ? 1 : 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(contacts.id, contactId));

      return c.json({
        email,
        confidence,
        sources: matched?.sources || domainResult.emails[0].sources,
      });
    }

    return c.json({ error: "No email found" }, 404);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Bulk lookup emails
emailLookupRoutes.post("/bulk", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const body = await c.req.json<{ contactIds: number[] }>();

  if (!env.HUNTER_API_KEY) {
    return c.json({ error: "Hunter.io API key not configured" }, 400);
  }

  const results = [];
  for (const contactId of body.contactIds) {
    try {
      const contactResult = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId));

        if (contactResult.length === 0 || !contactResult[0].website) {
        results.push({ contactId, error: "No website" });
        continue;
      }

      const contact = contactResult[0];
      if (!contact.website) {
        results.push({ contactId, error: "No website" });
        continue;
      }
      const url = contact.website.startsWith("http")
        ? contact.website
        : `https://${contact.website}`;
      const domain = new URL(url).hostname;

      const nameParts = contact.name.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const result = await findEmail(env.HUNTER_API_KEY, domain, firstName, lastName);

      if (result.data?.email) {
        await db.insert(emailEnrichments).values({
          contactId,
          email: result.data.email,
          confidence: result.data.score,
          sources: JSON.stringify(result.data.sources || []),
        });

        await db
          .update(contacts)
          .set({
            email: result.data.email,
            emailVerified: result.data.score > 80 ? 1 : 0,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(contacts.id, contactId));

        results.push({
          contactId,
          email: result.data.email,
          confidence: result.data.score,
        });
      } else {
        results.push({ contactId, error: "No email found" });
      }

      // Rate limit: 100ms between requests
      await new Promise((r) => setTimeout(r, 100));
    } catch (error) {
      results.push({ contactId, error: (error as Error).message });
    }
  }

  return c.json({ results });
});

export default emailLookupRoutes;
