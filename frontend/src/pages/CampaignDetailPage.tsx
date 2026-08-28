import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import Papa from "papaparse";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Upload,
  Plus,
  Search,
  Mail,
  Linkedin,
  Twitter,
  Loader2,
  Send,
  Check,
  ExternalLink,
} from "lucide-react";

export default function CampaignDetailPage() {
  const { id } = useParams();
  const campaignId = Number(id);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAddContact, setShowAddContact] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    website: "",
    socialUrl: "",
    email: "",
    company: "",
    title: "",
  });
  const [activeTab, setActiveTab] = useState<"contacts" | "messages">("contacts");
  const [selectedChannel, setSelectedChannel] = useState<"email" | "linkedin" | "twitter">("email");
  const [showScrape, setShowScrape] = useState(false);
  const [scrapeForm, setScrapeForm] = useState({
    query: "",
    limit: 3,
    enrichment: true,
  });

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.getCampaign(campaignId),
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts", campaignId],
    queryFn: () => api.getContacts(campaignId),
  });

  const addContactMutation = useMutation({
    mutationFn: (data: any) => api.addContact({ ...data, campaignId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      setShowAddContact(false);
      setAddForm({ name: "", website: "", socialUrl: "", email: "", company: "", title: "" });
      toast.success("Contact added!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (contacts: any[]) => api.bulkAddContacts(campaignId, contacts),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success(`Imported ${data.imported} contacts!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const lookupEmailMutation = useMutation({
    mutationFn: (contactId: number) => api.lookupEmail(contactId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      const label = data.source === "outscraper" ? "Outscraper" : data.source === "anymail" ? "Anymail" : "finder";
      if (data.email) {
        toast.success(`${label}: ${data.email}`);
      } else {
        toast.error("No email found (none published on web)");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Email verification (single contact) — provider selectable: reoon | manyreach
  const verifyMutation = useMutation({
    mutationFn: (args: { contactId: number; provider: string }) =>
      api.verifyEmail(args.contactId, args.provider),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      const label = data.source === "manyreach" ? "ManyReach" : "Reoon";
      if (data.verified) {
        toast.success(`${label}: ${data.status} (${data.confidence ?? ""}% confidence)`);
      } else if (data.error === "INSUFFICIENT_DATA_TOKENS" || data.error === "INSUFFICIENT_CREDITS") {
        toast.error(`${label}: insufficient credits/data tokens — top up the account`);
      } else {
        toast.error(`${label}: ${data.status ?? data.error ?? "not safe to send"}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Outscraper lead scraping
  const scrapeMutation = useMutation({
    mutationFn: (params: { query: string; limit: number; enrichment: boolean }) =>
      api.scrapeLeads(campaignId, {
        query: params.query,
        limit: params.limit,
        enrichment: params.enrichment ? ["emails"] : [],
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      setShowScrape(false);
      setScrapeForm({ query: "", limit: 20, enrichment: true });
      toast.success(`Scraped ${data.found} leads, imported ${data.imported} contacts!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: (contactId: number) =>
      api.generatePitch(contactId, selectedChannel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success("Pitch generated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateAllMutation = useMutation({
    mutationFn: () => api.generateAllPitches(campaignId, selectedChannel),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success(`Generated ${data.generated} pitches!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const contacts = results.data
          .filter((row: any) => row.name || row.Name)
          .map((row: any) => ({
            name: row.name || row.Name || "",
            website: row.website || row.Website || "",
            socialUrl: row.social_url || row.socialUrl || row["Social URL"] || "",
            email: row.email || row.Email || "",
            company: row.company || row.Company || "",
            title: row.title || row.Title || "",
          }));
        bulkImportMutation.mutate(contacts);
      },
    });
    e.target.value = "";
  };

  if (campaignLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/campaigns"
          className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Campaigns
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campaign?.name}</h1>
            <p className="mt-1 text-gray-500">{campaign?.missionContext}</p>
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-400">
              <span className="capitalize">Tone: {campaign?.tone}</span>
              {campaign?.targetAudience && (
                <span>Target: {campaign.targetAudience}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/kanban?campaign=${campaignId}`} className="btn-secondary text-sm">
              Kanban Board
            </Link>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="card flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowAddContact(true)}
          className="btn-primary text-sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Contact
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary text-sm"
        >
          <Upload className="mr-1 h-4 w-4" />
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleCSVUpload}
        />

        <button
          onClick={() => setShowScrape(true)}
          className="btn-secondary text-sm"
        >
          <Search className="mr-1 h-4 w-4" />
          Scrape Leads
        </button>

        <div className="mx-2 h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Channel:</span>
          <select
            className="select w-auto text-sm"
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value as any)}
          >
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">Twitter/X</option>
          </select>
        </div>

        <button
          onClick={() => generateAllMutation.mutate()}
          disabled={generateAllMutation.isPending}
          className="btn-primary text-sm"
        >
          {generateAllMutation.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-1 h-4 w-4" />
          )}
          Generate All Pitches
        </button>
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg">
            <h2 className="mb-4 text-lg font-semibold">Add Contact</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addContactMutation.mutate(addForm);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Name *
                  </label>
                  <input
                    className="input"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Company
                  </label>
                  <input
                    className="input"
                    value={addForm.company}
                    onChange={(e) =>
                      setAddForm({ ...addForm, company: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Website
                  </label>
                  <input
                    className="input"
                    placeholder="https://example.com"
                    value={addForm.website}
                    onChange={(e) =>
                      setAddForm({ ...addForm, website: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Social URL
                  </label>
                  <input
                    className="input"
                    placeholder="https://linkedin.com/in/..."
                    value={addForm.socialUrl}
                    onChange={(e) =>
                      setAddForm({ ...addForm, socialUrl: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    className="input"
                    value={addForm.email}
                    onChange={(e) =>
                      setAddForm({ ...addForm, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    className="input"
                    value={addForm.title}
                    onChange={(e) =>
                      setAddForm({ ...addForm, title: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scrape Leads Modal */}
      {showScrape && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg">
            <h2 className="mb-4 text-lg font-semibold">Scrape Leads (Outscraper)</h2>
            <p className="mb-4 text-sm text-gray-500">
              Search Google Maps for businesses and import them as contacts.
              Keep the limit low while testing — Outscraper bills ~1 credit per result.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!scrapeForm.query.trim()) {
                  toast.error("Enter a search query");
                  return;
                }
                scrapeMutation.mutate({
                  query: scrapeForm.query.trim(),
                  limit: Number(scrapeForm.limit) || 20,
                  enrichment: scrapeForm.enrichment,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Search Query *
                </label>
                <input
                  className="input"
                  placeholder="e.g. coffee shops jakarta"
                  value={scrapeForm.query}
                  onChange={(e) => setScrapeForm({ ...scrapeForm, query: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Limit (max results)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input"
                    value={scrapeForm.limit}
                    onChange={(e) =>
                      setScrapeForm({ ...scrapeForm, limit: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={scrapeForm.enrichment}
                      onChange={(e) =>
                        setScrapeForm({ ...scrapeForm, enrichment: e.target.checked })
                      }
                    />
                    Enrich with emails
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowScrape(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={scrapeMutation.isPending}
                >
                  {scrapeMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1 h-4 w-4" />
                  )}
                  Scrape
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {(["contacts", "messages"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Contacts Tab */}
      {activeTab === "contacts" && (
        <div>
          {contactsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
            </div>
          ) : contacts && contacts.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Stage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {contacts.map((contact: any) => (
                    <tr key={contact.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {contact.name}
                        </div>
                        {contact.socialUrl && (
                          <a
                            href={contact.socialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-xs text-blue-500 hover:text-blue-700"
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            Social
                          </a>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {contact.company || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {contact.email ? (
                          <span className="text-sm text-gray-900">{contact.email}</span>
                        ) : (
                          <button
                            onClick={() => lookupEmailMutation.mutate(contact.id)}
                            disabled={lookupEmailMutation.isPending}
                            className="text-xs text-brand-600 hover:text-brand-700"
                          >
                            <Search className="mr-1 inline h-3 w-3" />
                            Find Email
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            contact.kanbanStage === "closed"
                              ? "bg-green-100 text-green-700"
                              : contact.kanbanStage === "follow_up_1"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {contact.kanbanStage?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-3">
                          {contact.email && (
                            <span className="inline-flex items-center gap-1">
                              <button
                                onClick={() =>
                                  verifyMutation.mutate({ contactId: contact.id, provider: "reoon" })
                                }
                                disabled={verifyMutation.isPending}
                                className="text-xs text-emerald-600 hover:text-emerald-700"
                                title="Verify email with Reoon"
                              >
                                Verify (Reoon)
                              </button>
                              <button
                                onClick={() =>
                                  verifyMutation.mutate({ contactId: contact.id, provider: "manyreach" })
                                }
                                disabled={verifyMutation.isPending}
                                className="text-xs text-sky-600 hover:text-sky-700"
                                title="Verify email with ManyReach"
                              >
                                (ManyReach)
                              </button>
                            </span>
                          )}
                          <button
                            onClick={() => generateMutation.mutate(contact.id)}
                            disabled={generateMutation.isPending}
                            className="text-xs text-brand-600 hover:text-brand-700"
                          >
                            Generate Pitch
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card text-center py-12 text-gray-400">
              No contacts yet. Import a CSV or add contacts manually.
            </div>
          )}
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === "messages" && (
        <MessagesTab contacts={contacts || []} campaignId={campaignId} />
      )}
    </div>
  );
}

function MessagesTab({
  contacts,
  campaignId,
}: {
  contacts: any[];
  campaignId: number;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  // Get all messages from all contacts
  const allMessages = contacts.flatMap((c: any) =>
    (c.messages || []).map((m: any) => ({ ...m, contactName: c.name }))
  );

  const sendMutation = useMutation({
    mutationFn: (msgId: number) => api.sendMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success("Message sent!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.updateMessage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      setEditingId(null);
      toast.success("Message updated");
    },
  });

  if (allMessages.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        No messages generated yet. Generate pitches from the Contacts tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allMessages.map((msg: any) => (
        <div key={msg.id} className="card">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-900">
                {msg.contactName}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                {msg.channel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  msg.status === "sent"
                    ? "bg-green-100 text-green-700"
                    : msg.status === "draft"
                    ? "bg-gray-100 text-gray-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {msg.status}
              </span>
              {msg.status === "draft" && (
                <>
                  <button
                    onClick={() => {
                      setEditingId(msg.id);
                      setEditBody(msg.body);
                    }}
                    className="text-xs text-brand-600 hover:text-brand-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => sendMutation.mutate(msg.id)}
                    disabled={sendMutation.isPending}
                    className="btn-primary text-xs py-1"
                  >
                    <Send className="mr-1 h-3 w-3" />
                    Send
                  </button>
                </>
              )}
            </div>
          </div>
          {editingId === msg.id ? (
            <div className="space-y-2">
              <textarea
                className="textarea"
                rows={6}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateMutation.mutate({ id: msg.id, data: { body: editBody } })
                  }
                  className="btn-primary text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {msg.subject && (
                <p className="mb-2 font-medium">Subject: {msg.subject}</p>
              )}
              {msg.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
