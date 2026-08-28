// Outscraper API client — lead / business scraping (Google Maps search) and
// email/contact enrichment. Used to scrape fresh leads into campaigns.
//
//   Base:    https://api.app.outscraper.com
//   Auth:    header `X-API-KEY` (the maintained SDK uses this; older docs use
//            `?api_key=` but the header is canonical — verified 2026-08-27).
//
//   Google Maps Search: GET /maps/search-v3
//     Params: query (array, repeated), language, region,
//             organizationsPerQueryLimit (= "limit", max orgs per query),
//             skipPlaces, dropDuplicates, enrichment (array, e.g. ["emails"]),
//             async ("true" returns a job ticket instead of data).
//     Sync response:   { status, data: [[business,...]], total }
//     Async response:  { status, id, results_location } -> poll GET /requests/:id
//
//   Field names confirmed from a live response (2026-08-27):
//     name, website, phone, address, city, state, state_code, country,
//     postal_code, subtypes, rating, reviews, latitude, longitude,
//     place_id, business_status, description.
//   Enrichment adds an `emails` field (array of strings) when requested.
//
// Billing note: ~1 credit per business row; enrichment costs extra credits.
// Keep organizationsPerQueryLimit small while testing.

const BASE = "https://api.app.outscraper.com";

function authHeaders(apiKey: string): Record<string, string> {
  return { "X-API-KEY": apiKey };
}

/** A single scraped business/lead, normalized from Outscraper's raw shape. */
export interface ScrapedLead {
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  subtypes: string | null;
  rating: number | null;
  reviews: number | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  businessStatus: string | null;
  emails: string[]; // from enrichment
  raw: Record<string, unknown>;
}

export interface SearchParams {
  query: string | string[];
  limit?: number;
  language?: string;
  region?: string;
  enrichment?: string[]; // e.g. ["emails"]
  dropDuplicates?: boolean;
  async?: boolean;
}

/** Parse one Outscraper business record into our normalized lead shape. */
export function parseBusiness(raw: Record<string, unknown>): ScrapedLead {
  const emails = Array.isArray(raw.emails)
    ? (raw.emails as unknown[]).filter((e): e is string => typeof e === "string")
    : [];

  return {
    name: (raw.name as string) ?? "",
    website: (raw.website as string) ?? null,
    phone: (raw.phone as string) ?? null,
    address: (raw.address as string) ?? null,
    city: (raw.city as string) ?? null,
    state: (raw.state as string) ?? null,
    country: (raw.country as string) ?? null,
    postalCode: (raw.postal_code as string) ?? null,
    subtypes: (raw.subtypes as string) ?? null,
    rating: typeof raw.rating === "number" ? (raw.rating as number) : null,
    reviews: typeof raw.reviews === "number" ? (raw.reviews as number) : null,
    latitude: typeof raw.latitude === "number" ? (raw.latitude as number) : null,
    longitude:
      typeof raw.longitude === "number" ? (raw.longitude as number) : null,
    placeId: (raw.place_id as string) ?? null,
    businessStatus: (raw.business_status as string) ?? null,
    emails,
    raw,
  };
}

function buildSearchUrl(params: SearchParams): string {
  const qs = new URLSearchParams();
  const queries = Array.isArray(params.query)
    ? params.query
    : [params.query];
  for (const q of queries) qs.append("query", q);
  qs.set("organizationsPerQueryLimit", String(params.limit ?? 20));
  qs.set("language", params.language ?? "en");
  if (params.region) qs.set("region", params.region);
  qs.set("dropDuplicates", String(params.dropDuplicates ?? true));
  if (params.enrichment && params.enrichment.length > 0) {
    qs.set("enrichment", JSON.stringify(params.enrichment));
  }
  qs.set("async", String(params.async ?? false));
  return `${BASE}/maps/search-v3?${qs.toString()}`;
}

export interface AsyncJobTicket {
  id: string;
  status: string;
  resultsLocation: string;
}

/**
 * Start a Google Maps search. If `async` is true, returns a job ticket to poll
 * with getJobResult(). If `async` is false (default), returns parsed leads.
 */
export async function searchMaps(
  apiKey: string,
  params: SearchParams
): Promise<{ async: false; leads: ScrapedLead[] } | { async: true; job: AsyncJobTicket }> {
  const url = buildSearchUrl(params);
  const response = await fetch(url, { headers: authHeaders(apiKey) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outscraper search failed: ${response.status} - ${text}`);
  }
  const data = (await response.json()) as Record<string, unknown>;

  // Async job ticket
  if (params.async && data.id) {
    return {
      async: true,
      job: {
        id: data.id as string,
        status: (data.status as string) ?? "Pending",
        resultsLocation:
          (data.results_location as string) ??
          `${BASE}/requests/${data.id}`,
      },
    };
  }

  // Sync: `data` is either array-of-arrays (one inner array per query) or a
  // flat array of business objects (single query). Handle both.
  const rawData = data.data;
  const outer = Array.isArray(rawData) ? rawData : [];
  const leads: ScrapedLead[] = [];
  for (const item of outer) {
    if (Array.isArray(item)) {
      // array-of-arrays shape
      for (const inner of item) {
        if (inner && typeof inner === "object") {
          leads.push(parseBusiness(inner as Record<string, unknown>));
        }
      }
    } else if (item && typeof item === "object") {
      // flat array shape
      leads.push(parseBusiness(item as Record<string, unknown>));
    }
  }
  return { async: false, leads };
}

/** Poll an async Outscraper job until finished, returning parsed leads. */
export async function getJobResult(
  apiKey: string,
  jobId: string,
  timeoutMs = 60_000,
  pollMs = 3_000
): Promise<ScrapedLead[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${BASE}/requests/${jobId}`, {
      headers: authHeaders(apiKey),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Outscraper job poll failed: ${response.status} - ${text}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const status = (data.status as string) ?? "";
    if (status === "Finished") {
      const rawData = data.data;
      const outer = Array.isArray(rawData) ? rawData : [];
      const leads: ScrapedLead[] = [];
      for (const item of outer) {
        if (Array.isArray(item)) {
          for (const inner of item) {
            if (inner && typeof inner === "object") {
              leads.push(parseBusiness(inner as Record<string, unknown>));
            }
          }
        } else if (item && typeof item === "object") {
          leads.push(parseBusiness(item as Record<string, unknown>));
        }
      }
      return leads;
    }
    if (status === "Failed" || status === "Error") {
      throw new Error(`Outscraper job ${jobId} failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Outscraper job ${jobId} timed out after ${timeoutMs}ms`);
}

/**
 * Find emails published on / associated with a given domain. Uses Outscraper's
 * "Emails and Contacts" scraper, which is ALWAYS async (returns a job ticket we
 * must poll). Returns discovered contacts with name/title/email where present.
 *
 * Only works when the business has published emails on its web presence; results
 * are typically sparse compared to a dedicated email-finder service.
 */
export interface FoundEmail {
  email: string;
  fullName?: string;
  title?: string;
}

export async function findEmailsByDomain(
  apiKey: string,
  domain: string,
  timeoutMs = 60_000,
  pollMs = 3_000
): Promise<FoundEmail[]> {
  const url = `${BASE}/emails-and-contacts?query=${encodeURIComponent(
    domain
  )}&limit=1`;
  const startResp = await fetch(url, { headers: authHeaders(apiKey) });
  if (!startResp.ok) {
    const text = await startResp.text();
    throw new Error(`Outscraper findEmails failed: ${startResp.status} - ${text}`);
  }
  const startData = (await startResp.json()) as { id?: string };
  if (!startData.id) {
    throw new Error("Outscraper findEmails: no job id returned");
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pollResp = await fetch(`${BASE}/requests/${startData.id}`, {
      headers: authHeaders(apiKey),
    });
    if (!pollResp.ok) {
      const text = await pollResp.text();
      throw new Error(`Outscraper findEmails poll failed: ${pollResp.status} - ${text}`);
    }
    const data = (await pollResp.json()) as Record<string, unknown>;
    const status = (data.status as string) ?? "";
    if (status === "Success" || status === "Finished") {
      const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
      const results: FoundEmail[] = [];
      for (const row of rows) {
        const emails = Array.isArray(row.emails)
          ? (row.emails as Record<string, unknown>[])
          : [];
        for (const e of emails) {
          const value = e.value;
          if (typeof value === "string" && value.includes("@")) {
            results.push({
              email: value,
              fullName: typeof e.full_name === "string" ? e.full_name : undefined,
              title: typeof e.title === "string" ? e.title : undefined,
            });
          }
        }
      }
      return results;
    }
    if (status === "Failed" || status === "Error") {
      throw new Error(`Outscraper findEmails job failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Outscraper findEmails timed out after ${timeoutMs}ms`);
}
