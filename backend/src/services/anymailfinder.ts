// Anymail Finder API client (Hunter.io alternative — allows Gmail signup, no
// phone verification, pay-per-verified-result). Used as the email-lookup provider
// when Hunter.io is unavailable (e.g. restricted account) or as an additional
// fallback. Verified live 2026-08-20.
//
//   Base:    https://api.anymailfinder.com
//   Version: /v5.1
//   Auth:    Authorization: Bearer <API_KEY>   (no query-param auth)
//
//   POST /v5.1/find-email/person    { first_name, last_name, domain } -> { email, email_status, person_job_title, ... }
//   POST /v5.1/find-email/company   { domain }                         -> { emails, valid_emails, ... }
//   POST /v5.1/verify-email         { email }                         -> { email_status: valid|invalid|risky|... }
//   GET  /v5.1/account                                                -> { credits_left, email }
//
// Billing note: a credit is charged ONLY when a verified email is returned.
// Not-found / invalid results are free, so failed lookups cost nothing.

const BASE = "https://api.anymailfinder.com";

export interface AnymailPersonResult {
  credits_charged: number;
  email: string | null;
  email_status: string; // "verified" | "valid" | "risky" | "invalid" | "not_found"
  valid_email?: string | null;
  person_full_name?: string | null;
  person_job_title?: string | null;
  mx_domain?: string | null;
}

export interface AnymailCompanyResult {
  credits_charged: number;
  email_status: string;
  emails: Array<{ email: string; status?: string; position?: string }>;
  valid_emails: Array<{ email: string; status?: string; position?: string }>;
  mx_domain?: string | null;
}

export interface AnymailVerifyResult {
  credits_charged: number;
  email_status: string; // "valid" | "invalid" | "risky" | ...
  mx_domain?: string | null;
  mx_host?: string | null;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

/** Map Anymail's email_status to a boolean "verified" judgement. */
export function isVerifiedStatus(status: string | undefined): boolean {
  return status === "verified" || status === "valid";
}

/** Map Anymail email_status to a 0-100 confidence score. */
export function statusToConfidence(status: string | undefined): number {
  switch (status) {
    case "verified":
    case "valid":
      return 100;
    case "risky":
    case "unknown":
      return 60;
    default:
      return 0;
  }
}

/**
 * Find a person's email from first name, last name and domain.
 * Returns null (not an error) when no verified email is found.
 */
export async function findPersonEmail(
  apiKey: string,
  params: { firstName: string; lastName: string; domain: string }
): Promise<AnymailPersonResult> {
  const response = await fetch(`${BASE}/v5.1/find-email/person`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      first_name: params.firstName,
      last_name: params.lastName,
      domain: params.domain,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AnymailFinder person find failed: ${response.status} - ${err}`);
  }
  return (await response.json()) as AnymailPersonResult;
}

/**
 * Find emails for a whole domain (used as a fallback when the person lookup
 * returns nothing). Returns the list of discovered emails.
 */
export async function findCompanyEmails(
  apiKey: string,
  domain: string
): Promise<AnymailCompanyResult> {
  const response = await fetch(`${BASE}/v5.1/find-email/company`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ domain }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AnymailFinder company find failed: ${response.status} - ${err}`);
  }
  return (await response.json()) as AnymailCompanyResult;
}

/**
 * Verify a single email.
 * Throws on transport/HTTP error; a negative verification (invalid/risky) is a
 * normal result with email_status set accordingly.
 */
export async function verifyEmail(
  apiKey: string,
  email: string
): Promise<AnymailVerifyResult> {
  const response = await fetch(`${BASE}/v5.1/verify-email`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AnymailFinder verify failed: ${response.status} - ${err}`);
  }
  return (await response.json()) as AnymailVerifyResult;
}

/** Check remaining credits for the account. */
export async function getAccount(
  apiKey: string
): Promise<{ credits_left: number; email: string }> {
  const response = await fetch(`${BASE}/v5.1/account`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AnymailFinder account failed: ${response.status} - ${err}`);
  }
  return (await response.json()) as { credits_left: number; email: string };
}
