// Reoon Email Verifier API client.
//
//   Base:    https://emailverifier.reoon.com
//   Endpoint: GET /api/v1/verify
//   Auth:    query param `key` (NOT `api_key` — Reoon rejects `api_key`).
//
//   Params:  email (required), key (required), mode ("power" | "quick"),
//            hard_validation (bool), timeout (seconds).
//
//   Status values: deliverable | invalid | risky | unknown
//   Response (success) includes: status, is_deliverable, is_safe_to_send,
//   overall_score (0-100), is_valid_syntax, mx_records, is_catch_all, ...
//   Response (error envelope): { status: "error", reason: "..." }
//
// Verified live 2026-08-27.

const BASE = "https://emailverifier.reoon.com";

export type ReoonStatus = "deliverable" | "invalid" | "risky" | "unknown" | "error";

export interface ReoonVerifyResult {
  status: ReoonStatus;
  verified: boolean;
  confidence: number; // 0-100
  safeToSend: boolean;
  validSyntax: boolean | null;
  mxRecords: boolean | null;
  catchAll: boolean | null;
  reason?: string; // present on error envelope
  raw?: Record<string, unknown>;
}

/**
 * Verify a single email via Reoon.
 * Throws on transport failure; a negative verification is a normal result.
 */
export async function verifyEmail(
  apiKey: string,
  email: string,
  opts: { mode?: "power" | "quick"; hardValidation?: boolean; timeout?: number } = {}
): Promise<ReoonVerifyResult> {
  const params = new URLSearchParams({
    email,
    key: apiKey,
    mode: opts.mode ?? "power",
    hard_validation: String(opts.hardValidation ?? true),
    timeout: String(opts.timeout ?? 60),
  });

  const response = await fetch(`${BASE}/api/v1/verify?${params.toString()}`, {
    method: "GET",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reoon verify failed: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const status = String(data.status ?? "").toLowerCase() as ReoonStatus;

  // Error envelope
  if (status === "error" || data.reason) {
    return {
      status: "error",
      verified: false,
      confidence: 0,
      safeToSend: false,
      validSyntax: null,
      mxRecords: null,
      catchAll: null,
      reason: (data.reason as string) ?? "Unknown error",
      raw: data,
    };
  }

  const isDeliverable = Boolean(data.is_deliverable);
  const safeToSend = Boolean(data.is_safe_to_send);
  const overallScore =
    typeof data.overall_score === "number" ? (data.overall_score as number) : null;

  const verified = status === "deliverable" || isDeliverable;
  // Confidence: prefer Reoon's overall_score; fall back to a status mapping.
  const confidence =
    overallScore != null
      ? overallScore
      : status === "deliverable"
      ? 100
      : status === "risky"
      ? 50
      : 0;

  return {
    status,
    verified,
    confidence,
    safeToSend,
    validSyntax:
      typeof data.is_valid_syntax === "boolean" ? data.is_valid_syntax : null,
    mxRecords: typeof data.mx_records === "boolean" ? data.mx_records : null,
    catchAll: typeof data.is_catch_all === "boolean" ? data.is_catch_all : null,
    raw: data,
  };
}
