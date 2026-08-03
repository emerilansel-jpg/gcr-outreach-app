interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  campaignId?: string;
  tags?: string[];
}

interface ManyReachSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ManyReach API base URL - update with actual endpoint
const BASE_URL = "https://api.manyreach.com/v1";

export async function sendEmail(
  apiKey: string,
  params: SendEmailParams
): Promise<ManyReachSendResult> {
  try {
    const response = await fetch(`${BASE_URL}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html_body: params.body,
        from_name: params.fromName,
        from_email: params.fromEmail,
        reply_to: params.replyTo,
        external_id: params.campaignId,
        tags: params.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `ManyReach API error: ${response.status} - ${error}` };
    }

    const data = (await response.json()) as { id: string };
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function sendBulkEmails(
  apiKey: string,
  emails: SendEmailParams[]
): Promise<ManyReachSendResult[]> {
  const results = [];
  for (const email of emails) {
    const result = await sendEmail(apiKey, email);
    results.push(result);
    // Small delay between sends to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}

export async function getCampaignStatus(
  apiKey: string,
  campaignId: string
): Promise<{ sent: number; delivered: number; opened: number; replied: number; bounced: number }> {
  const response = await fetch(`${BASE_URL}/campaigns/${campaignId}/stats`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get campaign status: ${response.status}`);
  }

  return response.json() as Promise<{
    sent: number;
    delivered: number;
    opened: number;
    replied: number;
    bounced: number;
  }>;
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
