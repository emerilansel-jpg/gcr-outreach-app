interface Env {
  AI?: Ai;
  CF_AI_API_TOKEN: string;
  ACCOUNT_ID: string;
  DB: D1Database;
}

type Ai = {
  run: (
    model: string,
    inputs: { messages: Array<{ role: string; content: string }> },
    options?: Record<string, unknown>
  ) => Promise<{ response?: string }>;
};

interface ContactInfo {
  name: string;
  website?: string;
  socialUrl?: string;
  company?: string;
  title?: string;
  email?: string;
}

interface CampaignContext {
  name: string;
  missionContext: string;
  tone: string;
  targetAudience?: string;
}

export async function generatePersonalizedPitch(
  env: Env,
  contact: ContactInfo,
  campaign: CampaignContext,
  channel: "email" | "linkedin" | "twitter"
): Promise<{ subject?: string; body: string }> {
  const channelInstructions = {
    email: "Write a professional cold email outreach message. Include a subject line.",
    linkedin:
      "Write a LinkedIn connection request message (under 300 chars) or InMail (under 1000 chars).",
    twitter: "Write a short, engaging Twitter/X DM or reply (under 280 chars).",
  };

  const prompt = `You are an expert outreach copywriter. Generate a personalized ${channel} message OUTREACHING TO this person (writing FROM the perspective of GCR index org TO them).

## Mission Context
Campaign: ${campaign.name}
Mission: ${campaign.missionContext}
Tone: ${campaign.tone}
${campaign.targetAudience ? `Target Audience: ${campaign.targetAudience}` : ""}

## Contact Info
Name: ${contact.name}
${contact.company ? `Current Role/Position: ${contact.title}` : ""}
${contact.website ? `Website: ${contact.website}` : ""}
${contact.socialUrl ? `Social: ${contact.socialUrl}` : ""}

## Instructions
${channelInstructions[channel]}

## Requirements
- Write as if contacting THIS PERSON directly (not about them)
- Reference their specific details naturally in the message body
- Be concise and value-focused
- Include a clear call-to-action
- Match the ${campaign.tone} tone
- Do NOT be spammy or generic
- Do NOT say "we acknowledge your staff" or similar meta-commentary
- The message should be an OUTREACH email/msg TO the contact
${channel === "email" ? '- Return JSON: {"subject": "...", "body": "..."}' : '- Return JSON: {"body": "..."}'}

Return ONLY valid JSON, no markdown.`;

  const systemPrompt =
    "You are an expert outreach copywriter. Always return valid JSON.";

  // The Workers AI binding may return `response` as a string OR as an already
  // parsed object (depending on the model). Normalize to a {subject, body}.
  let parsedResult: { subject?: string; body: string } | null = null;

  if (env.AI) {
    // Preferred path: built-in Workers AI binding (no API token required).
    const result = await env.AI.run(
      "@cf/meta/llama-3.2-3b-instruct",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      },
      { temperature: 0.7, max_tokens: 1024 }
    );
    const resp = (result as any).response;
    if (resp && typeof resp === "object") {
      parsedResult = { subject: resp.subject, body: resp.body ?? "" };
    } else if (typeof resp === "string") {
      parsedResult = extractJson(resp);
    }
  } else {
    // Fallback: REST API using a token that has Workers AI permission.
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/ai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_AI_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "@cf/meta/llama-3.2-3b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      result?: { response: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    const respStr =
      data.result?.response ||
      data.choices?.[0]?.message?.content ||
      "";
    parsedResult = extractJson(respStr);
  }

  if (parsedResult && typeof parsedResult.body === "string" && parsedResult.body.trim().length > 0) {
    return { subject: parsedResult.subject, body: parsedResult.body };
  }

  // Fallback: return whatever we have as the raw body.
  return { body: parsedResult?.body ?? "" };
}

function extractJson(raw: string): { subject?: string; body: string } | null {
    // 1. Direct parse.
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed && typeof parsed === "object") {
        return { subject: parsed.subject, body: parsed.body ?? raw };
      }
    } catch {
      /* try other strategies */
    }
    // 2. Strip ```json ... ``` fences.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        const parsed = JSON.parse(fenced[1].trim());
        if (parsed && typeof parsed === "object") {
          return { subject: parsed.subject, body: parsed.body ?? raw };
        }
      } catch {
        /* fall through */
      }
    }
    // 3. Grab the first balanced { ... } block.
    const brace = raw.match(/\{[\s\S]*\}/);
    if (brace) {
      try {
        const parsed = JSON.parse(brace[0]);
        if (parsed && typeof parsed === "object") {
          return { subject: parsed.subject, body: parsed.body ?? raw };
        }
      } catch {
        /* fall through */
      }
    }
    return null;
}

export async function generateBulkPitches(
  env: Env,
  contacts: ContactInfo[],
  campaign: CampaignContext,
  channel: "email" | "linkedin" | "twitter"
): Promise<Array<ContactInfo & { subject?: string; body: string }>> {
  const results = [];
  for (const contact of contacts) {
    try {
      const pitch = await generatePersonalizedPitch(
        env,
        contact,
        campaign,
        channel
      );
      results.push({ ...contact, ...pitch });
    } catch (error) {
      results.push({
        ...contact,
        body: `Error generating pitch: ${(error as Error).message}`,
      });
    }
  }
  return results;
}
