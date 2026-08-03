interface Env {
  CF_AI_API_TOKEN: string;
  DB: D1Database;
}

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

  const prompt = `You are an expert outreach copywriter. Generate a personalized ${channel} message.

## Mission Context
Campaign: ${campaign.name}
Mission: ${campaign.missionContext}
Tone: ${campaign.tone}
${campaign.targetAudience ? `Target Audience: ${campaign.targetAudience}` : ""}

## Contact Info
Name: ${contact.name}
${contact.company ? `Company: ${contact.company}` : ""}
${contact.title ? `Title: ${contact.title}` : ""}
${contact.website ? `Website: ${contact.website}` : ""}
${contact.socialUrl ? `Social: ${contact.socialUrl}` : ""}

## Instructions
${channelInstructions[channel]}

## Requirements
- Be personal and reference specific details about the contact
- Be concise and value-focused
- Include a clear call-to-action
- Match the ${campaign.tone} tone
- Do NOT be spammy or generic
${channel === "email" ? '- Return JSON: {"subject": "...", "body": "..."}' : '- Return JSON: {"body": "..."}'}

Return ONLY valid JSON, no markdown.`;

  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/placeholder/accounts/ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_AI_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "@cf/meta/llama-3.1-8b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You are an expert outreach copywriter. Always return valid JSON.",
          },
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
    result: { response: string };
  };
  const text = data.result?.response || "";

  // Parse JSON from response
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fallback: return raw text as body
  }

  return { body: text };
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
