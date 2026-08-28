const API_URL = import.meta.env.PROD
  ? "https://gcr-outreach-api.emerilansel.workers.dev/api"
  : "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

// Campaigns
export const api = {
  // Campaigns
  getCampaigns: () => request<any[]>("/campaigns"),
  createCampaign: (data: any) =>
    request<any>("/campaigns", { method: "POST", body: JSON.stringify(data) }),
  getCampaign: (id: number) => request<any>(`/campaigns/${id}`),
  updateCampaign: (id: number, data: any) =>
    request<any>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCampaign: (id: number) =>
    request<any>(`/campaigns/${id}`, { method: "DELETE" }),

  // Contacts
  getContacts: (campaignId: number) =>
    request<any[]>(`/contacts/campaign/${campaignId}`),
  getContact: (id: number) => request<any>(`/contacts/${id}`),
  addContact: (data: any) =>
    request<any>("/contacts", { method: "POST", body: JSON.stringify(data) }),
  bulkAddContacts: (campaignId: number, contacts: any[]) =>
    request<any>(`/contacts/bulk/${campaignId}`, {
      method: "POST",
      body: JSON.stringify({ contacts }),
    }),
  updateContact: (id: number, data: any) =>
    request<any>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteContact: (id: number) =>
    request<any>(`/contacts/${id}`, { method: "DELETE" }),

  // Kanban
  getKanban: (campaignId: number) =>
    request<Record<string, any[]>>(`/contacts/kanban/${campaignId}`),
  moveKanban: (contactId: number, stage: string) =>
    request<any>(`/contacts/${contactId}/kanban`, {
      method: "PUT",
      body: JSON.stringify({ stage }),
    }),

  // Messages
  generatePitch: (contactId: number, channel: string) =>
    request<any>(`/messages/generate/${contactId}`, {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
  generateAllPitches: (campaignId: number, channel: string) =>
    request<any>(`/messages/generate-all/${campaignId}`, {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
  updateMessage: (id: number, data: any) =>
    request<any>(`/messages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  sendMessage: (id: number) =>
    request<any>(`/messages/send/${id}`, { method: "POST" }),
  bulkSendMessages: (messageIds: number[]) =>
    request<any>("/messages/bulk-send", {
      method: "POST",
      body: JSON.stringify({ messageIds }),
    }),

  // Email Lookup
  lookupEmail: (contactId: number) =>
    request<any>(`/email-lookup/contact/${contactId}`, { method: "POST" }),
  bulkLookupEmails: (contactIds: number[]) =>
    request<any>("/email-lookup/bulk", {
      method: "POST",
      body: JSON.stringify({ contactIds }),
    }),
  verifyEmail: (contactId: number, provider?: string) =>
    request<any>(`/email-lookup/verify/${contactId}`, {
      method: "POST",
      body: JSON.stringify({ provider: provider ?? "reoon" }),
    }),

  // Leads (Outscraper scraping)
  scrapeLeads: (campaignId: number, params: { query: string | string[]; limit?: number; enrichment?: string[] }) =>
    request<any>(`/leads/scrape/${campaignId}`, {
      method: "POST",
      body: JSON.stringify(params),
    }),
  getScrapeJobs: (campaignId: number) =>
    request<any[]>(`/leads/jobs/${campaignId}`),

  // Analytics
  getAnalytics: () => request<any>("/analytics/overview"),
  getCampaignAnalytics: (id: number) =>
    request<any>(`/analytics/campaign/${id}`),
};
