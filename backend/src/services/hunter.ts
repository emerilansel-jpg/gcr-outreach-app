interface HunterDomainSearchResult {
  emails: Array<{
    value: string;
    type: string;
    confidence: number;
    sources: Array<{ domain: string; url: string; extracted_on: string; last_seen_on: string }>;
    position: string;
    department: string;
    seniority: string;
  }>;
}

interface HunterEmailFinderResult {
  data: {
    email: string;
    score: number;
    position: string;
    department: string;
    seniority: string;
    sources: Array<{ domain: string; url: string; extracted_on: string; last_seen_on: string }>;
  };
}

export async function lookupEmailByDomain(
  apiKey: string,
  domain: string
): Promise<HunterDomainSearchResult> {
  const response = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=5`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hunter.io domain search failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<HunterDomainSearchResult>;
}

export async function findEmail(
  apiKey: string,
  domain: string,
  firstName: string,
  lastName: string
): Promise<HunterEmailFinderResult> {
  const response = await fetch(
    `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${apiKey}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hunter.io email finder failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<HunterEmailFinderResult>;
}

export async function verifyEmail(
  apiKey: string,
  email: string
): Promise<{ data: { score: number; status: string } }> {
  const response = await fetch(
    `https://api.hunter.io/v2/email-verify?email=${encodeURIComponent(email)}&api_key=${apiKey}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hunter.io verify failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<{ data: { score: number; status: string } }>;
}
