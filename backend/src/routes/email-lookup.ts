import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { contacts, emailEnrichments } from "../db/schema";
import type { Database } from "../db";
import { findPersonEmail, findCompanyEmails, verifyEmail as verifyViaAnymail } from "../services/anymailfinder";
import { verifyEmails as verifyViaManyReach } from "../services/manyreach";
import { verifyEmail as verifyViaReoon } from "../services/reoon";
import { findEmailsByDomain } from "../services/outscraper";

interface Env {
  DB: D1Database;
  ANYMAIL_API_KEY: string;
  MANYREACH_API_KEY: string;
  REOON_API_KEY: string;
  OUTSCRAPER_API_KEY: string;
  CF_AI_API_TOKEN: string;
}

const emailLookupRoutes = new Hono<{ Variables: { db: Database }; Bindings: Env }>();

// Look up email for a single contact.
// Primary: Outscraper domain-based email discovery (no separate finder key
// needed). Optional fallback: Anymail Finder, only if ANYMAIL_API_KEY is set.
emailLookupRoutes.post("/contact/:id", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const contactId = Number(c.req.param("id"));

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

  const found = await findContactEmail(env, {
    name: contact.name,
    website: contact.website,
  });

  if (!found) {
    return c.json(
      {
        error: "No email found",
        detail:
          "Outscraper found no published emails" +
          (env.ANYMAIL_API_KEY ? " and Anymail Finder found nothing." : " and Anymail is not configured."),
      },
      404
    );
  }

  await db.insert(emailEnrichments).values({
    contactId,
    email: found.email,
    confidence: found.confidence,
    sources: JSON.stringify({ source: found.source, all: found.all ?? found.email }),
    verifiedAt: new Date().toISOString(),
  });
  await db
    .update(contacts)
    .set({
      email: found.email,
      emailVerified: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, contactId));

  return c.json({ source: found.source, email: found.email, all: found.all });
});

function toDomain(website: string): string | null {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Try to find an email via Anymail Finder. Returns a
 * normalized result or throws — callers decide whether to surface or fall back.
 */
async function lookupViaAnymail(
  apiKey: string,
  contact: { name: string; website: string }
): Promise<{ email: string; confidence: number; sources: string[] }> {
  const url = contact.website.startsWith("http")
    ? contact.website
    : `https://${contact.website}`;
  const domain = new URL(url).hostname;
  const nameParts = contact.name.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const person = await findPersonEmail(apiKey, { firstName, lastName, domain });
  if (person.email) {
    return {
      email: person.email,
      confidence: person.email_status === "verified" || person.email_status === "valid" ? 100 : 60,
      sources: [domain],
    };
  }

  // Fallback: company/domain search, then use the first valid email.
  const company = await findCompanyEmails(apiKey, domain);
  const first =
    company.valid_emails?.[0] ??
    company.emails?.find((e) => e.status === "valid" || e.status === "verified") ??
    company.emails?.[0];
  if (first?.email) {
    const status = first.status;
    return {
      email: first.email,
      confidence: status === "verified" || status === "valid" ? 100 : 60,
      sources: [domain],
    };
  }

  throw new Error("AnymailFinder: no email found");
}

/**
 * Find an email for a contact. Primary source is Outscraper domain-based
 * discovery; falls back to Anymail Finder only when its key is configured.
 * Returns null when nothing is found (so callers can decide what to surface).
 */
async function findContactEmail(
  env: Env,
  contact: { name: string; website: string }
): Promise<{ email: string; confidence: number; source: string; all?: unknown } | null> {
  const domain = toDomain(contact.website);
  if (!domain) return null;

  if (env.OUTSCRAPER_API_KEY) {
    try {
      const found = await findEmailsByDomain(env.OUTSCRAPER_API_KEY, domain);
      if (found.length > 0) {
        const name = contact.name.toLowerCase();
        const best =
          found.find(
            (f) => f.fullName && name.includes(f.fullName.toLowerCase().split(" ")[0])
          ) ?? found[0];
        return { email: best.email, confidence: 50, source: "outscraper", all: found };
      }
    } catch {
      // fall through to Anymail
    }
  }

  if (env.ANYMAIL_API_KEY) {
    try {
      const found = await lookupViaAnymail(env.ANYMAIL_API_KEY, contact);
      return { email: found.email, confidence: found.confidence, source: "anymail" };
    } catch {
      return null;
    }
  }

  return null;
}

// Look up email for a single contact (explicit Anymail-only path, kept for
// callers that specifically want Anymail Finder). Still works without a website
// if Anymail is configured.
emailLookupRoutes.post("/contact/:id/anymail", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const contactId = Number(c.req.param("id"));

  if (!env.ANYMAIL_API_KEY) {
    return c.json({ error: "Anymail Finder API key not configured" }, 400);
  }

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
    const found = await lookupViaAnymail(env.ANYMAIL_API_KEY, {
      name: contact.name,
      website: contact.website,
    });

    await db.insert(emailEnrichments).values({
      contactId,
      email: found.email,
      confidence: found.confidence,
      sources: JSON.stringify(found.sources),
      verifiedAt: new Date().toISOString(),
    });

    await db
      .update(contacts)
      .set({
        email: found.email,
        emailVerified: found.confidence > 80 ? 1 : 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(contacts.id, contactId));

    return c.json({ source: "anymail", ...found });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Bulk lookup emails
emailLookupRoutes.post("/bulk", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const body = await c.req.json<{ contactIds: number[] }>();

  if (!env.OUTSCRAPER_API_KEY && !env.ANYMAIL_API_KEY) {
    return c.json({ error: "No email discovery provider configured (Outscraper or Anymail)" }, 400);
  }

  const results = [];
  for (const contactId of body.contactIds) {
    try {
      const contactResult = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId));

      if (contactResult.length === 0 || !contactResult[0]?.website) {
        results.push({ contactId, error: "No website" });
        continue;
      }

      const contact = contactResult[0];

      const found = await findContactEmail(env, {
        name: contact.name,
        website: contact.website!,
      });
      if (!found) {
        results.push({ contactId, error: "No email found" });
        continue;
      }

      await db.insert(emailEnrichments).values({
        contactId,
        email: found.email,
        confidence: found.confidence,
        sources: JSON.stringify({ source: found.source, all: found.all ?? found.email }),
        verifiedAt: new Date().toISOString(),
      });
      await db
        .update(contacts)
        .set({
          email: found.email,
          emailVerified: 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(contacts.id, contactId));
      results.push({ contactId, email: found.email, source: found.source });
    } catch (error) {
      results.push({ contactId, error: (error as Error).message });
    }
  }

  return c.json({ results });
});

// Verify an already-found email.
// Provider order:
//   1. Reoon Email Verifier (new, dedicated SMTP verifier)
//   2. Anymail Finder verification (free when result is invalid)
//   3. ManyReach validation (consumes separate "Data Tokens", graceful 402 if 0)
// A `provider` query/body param can force a specific provider.
emailLookupRoutes.post("/verify/:id", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const contactId = Number(c.req.param("id"));
  const body = await c.req.json<{ provider?: string }>().catch(() => ({}) as any);
  const forceProvider = body.provider;

  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId));
  if (contactResult.length === 0 || !contactResult[0].email) {
    return c.json({ error: "Contact has no email" }, 400);
  }
  const email = contactResult[0].email;

  const markVerified = async (verified: boolean) => {
    await db
      .update(contacts)
      .set({ emailVerified: verified ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(contacts.id, contactId));
  };

  // 1. Reoon Email Verifier (preferred)
  if ((!forceProvider || forceProvider === "reoon") && env.REOON_API_KEY) {
    try {
      const result = await verifyViaReoon(env.REOON_API_KEY, email);
      if (result.status !== "error") {
        // Only mark as verified if Reoon considers it safe to send. Catch-all
        // (verified:true but safeToSend:false) is NOT safe to send.
        const safe = result.verified && result.safeToSend;
        await markVerified(safe);
        return c.json({
          source: "reoon",
          status: result.status,
          verified: safe,
          deliverable: result.verified,
          confidence: result.confidence,
          safeToSend: result.safeToSend,
        });
      }
    } catch (error) {
      // fall through to next provider
    }
  }

  // 2. Anymail Finder verification (Hunter.io removed)
  if ((!forceProvider || forceProvider === "anymail") && env.ANYMAIL_API_KEY) {
    try {
      const result = await verifyViaAnymail(env.ANYMAIL_API_KEY, email);
      const verified = result.email_status === "valid" || result.email_status === "verified";
      await markVerified(verified);
      return c.json({ source: "anymail", status: result.email_status });
    } catch (error) {
      // fall through to ManyReach
    }
  }

  // 3. Fallback: ManyReach validation
  if ((!forceProvider || forceProvider === "manyreach") && env.MANYREACH_API_KEY) {
    const mr = await verifyViaManyReach(env.MANYREACH_API_KEY, [email]);
    if (!mr.success && mr.error === "INSUFFICIENT_DATA_TOKENS") {
      return c.json(
        { source: "manyreach", error: "INSUFFICIENT_DATA_TOKENS", message: "ManyReach data-token balance is 0; top up tokens or verify via Anymail/Reoon." },
        402
      );
    }
    if (!mr.success) {
      return c.json({ source: "manyreach", error: mr.error }, 500);
    }
    return c.json({ source: "manyreach", status: mr.status });
  }

  return c.json({ error: "No email verification provider configured" }, 400);
});

export default emailLookupRoutes;
