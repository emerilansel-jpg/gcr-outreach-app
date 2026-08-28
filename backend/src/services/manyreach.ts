// ManyReach API client (V2 base path + V1 prospect-add helper)
//
// IMPORTANT — integration model (verified live 2026-08-18):
//   ManyReach is a DRIP-CAMPAIGN platform, NOT a transactional "send one email" API.
//   Flow: create a campaign (template) -> add prospects (each with per-prospect body
//   via custom/icebreaker fields) -> start the campaign.
//
//   Correct endpoints (the old code used /v1/messages/send + Bearer — both 404/401):
//     V2 base:  https://api.manyreach.com/api/v2   (auth: header `X-API-Key`)
//     V1 base:  https://api.manyreach.com/api       (auth: query `?apikey=`)
//
//   We use V2 for account/credits/stats and V1 for adding prospects, because the V1
//   prospect-add endpoint returns the prospect (lead) id directly and accepts a
//   per-prospect JSON body — which lets us keep per-contact personalized pitches
//   even though the campaign only stores ONE template body.

const V2_BASE = "https://api.manyreach.com/api/v2";
const V1_BASE = "https://api.manyreach.com/api";

export interface ManyReachProspect {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  // Personalized pitch for this contact. Stored in `icebreaker` so the campaign
  // template can reference it, or surfaced in the GCR UI. ManyReach templates use
  // {firstName}/{lastName} placeholders; for a fully custom body we keep it here.
  icebreaker?: string;
}

export interface ManyReachSendResult {
  success: boolean;
  campaignId?: string;
  prospectId?: number;
  error?: string;
}

export interface ManyReachCampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
}

/**
 * Create a (paused/draft) campaign in ManyReach.
 * The campaign holds the shared template; personalized bodies are passed per-prospect.
 */
export async function createCampaign(
  apiKey: string,
  params: { name: string; fromEmail: string; fromName?: string; subject: string; replyTo?: string }
): Promise<{ success: boolean; campaignId?: number; error?: string }> {
  try {
    const response = await fetch(`${V2_BASE}/campaigns`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        fromEmails: params.fromEmail,
        fromName: params.fromName ?? "",
        replyToEmail: params.replyTo ?? "",
        subject: params.subject,
        // Placeholder body — replaced per-prospect via icebreaker on add.
        body: "Hello {firstName}, please see the message prepared for you.",
        trackOpens: true,
        trackClicks: false,
        dailyLimit: 50,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `ManyReach createCampaign ${response.status}: ${err}` };
    }
    const data = (await response.json()) as { campaignId: number; status: string };
    return { success: true, campaignId: data.campaignId };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Add a single prospect to a campaign.
 * Returns the ManyReach lead (prospect) id used for tracking.
 */
export async function addProspect(
  apiKey: string,
  campaignId: number,
  prospect: ManyReachProspect
): Promise<{ success: boolean; prospectId?: number; error?: string }> {
  try {
    const url = `${V1_BASE}/campaigns/prospects/add?apikey=${encodeURIComponent(
      apiKey
    )}&campaignid=${campaignId}&sendQuickly=false&addOnlyIfNew=true`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: prospect.email,
        firstName: prospect.firstName ?? "",
        lastName: prospect.lastName ?? "",
        company: prospect.company ?? "",
        icebreaker: prospect.icebreaker ?? "",
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `ManyReach addProspect ${response.status}: ${err}` };
    }
    const data = (await response.json()) as {
      code: number;
      message?: string;
      data?: { leadID: number };
    };
    if (data.code !== 1 || !data.data) {
      return { success: false, error: `ManyReach addProspect: ${data.message ?? "unknown"}` };
    }
    return { success: true, prospectId: data.data.leadID };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Start a campaign so queued prospects begin sending.
 * NOTE: requires at least one connected/active sender in the ManyReach account,
 * otherwise the API returns 422 (see coldstart.md known issues).
 */
export async function startCampaign(
  apiKey: string,
  campaignId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${V2_BASE}/campaigns/${campaignId}/start`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `ManyReach startCampaign ${response.status}: ${err}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function getCampaignStatus(
  apiKey: string,
  campaignId: number
): Promise<ManyReachCampaignStats> {
  const response = await fetch(`${V2_BASE}/campaigns/${campaignId}/stats`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`ManyReach getCampaignStatus ${response.status}`);
  }
  const data = (await response.json()) as {
    sent?: number;
    delivered?: number;
    opened?: number;
    replies?: number;
    bounced?: number;
  };
  return {
    sent: data.sent ?? 0,
    delivered: data.delivered ?? 0,
    opened: data.opened ?? 0,
    replied: data.replies ?? 0,
    bounced: data.bounced ?? 0,
  };
}

/**
 * Validate emails via ManyReach.
 * NOTE: this consumes separate "Data Tokens" (NOT sending credits). If the account
 * has 0 tokens the API returns 402 INSUFFICIENT_CREDITS — callers must handle that
 * gracefully and fall back to Anymail Finder verification.
 */
export async function verifyEmails(
  apiKey: string,
  emails: string[]
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const response = await fetch(`${V2_BASE}/validation/emails`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    if (response.status === 402) {
      return { success: false, error: "INSUFFICIENT_DATA_TOKENS" };
    }
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `ManyReach verifyEmails ${response.status}: ${err}` };
    }
    const data = (await response.json()) as { title?: string; status?: string };
    return { success: true, status: data.status ?? data.title };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleWebhook(
  body: Record<string, unknown>
): Promise<{ messageId: string; event: string; timestamp: string }> {
  // ManyReach webhook handler - processes delivery events
  // Events: sent, delivered, opened, replied, bounced, unsubscribed
  return {
    messageId: body.message_id as string,
    event: body.event as string,
    timestamp: body.timestamp as string,
  };
}
