import { useState, useRef, useEffect } from "react";
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
  Edit2,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Settings,
  Phone,
  Globe,
  CheckSquare,
  Square,
} from "lucide-react";

const PRESET_REGIONS = [
  { value: "", label: "All Regions (Global)" },
  { value: "id", label: "Indonesia (ID)" },
  { value: "sg", label: "Singapore (SG)" },
  { value: "my", label: "Malaysia (MY)" },
  { value: "us", label: "United States (US)" },
  { value: "gb", label: "United Kingdom (GB)" },
  { value: "au", label: "Australia (AU)" },
  { value: "de", label: "Germany (DE)" },
  { value: "nl", label: "Netherlands (NL)" },
  { value: "jp", label: "Japan (JP)" },
  { value: "other", label: "Other / Custom Region..." },
];

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
    limit: 20,
    enrichment: true,
    regionMode: "", // preset value or "other"
    customRegion: "",
    language: "en",
  });

  // UX states: search, filter, pagination, edit contact, multi-selection
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [editCampaignForm, setEditCampaignForm] = useState({
    name: "",
    missionContext: "",
    tone: "professional",
    targetAudience: "",
  });

  const [editingContact, setEditingContact] = useState<any | null>(null);

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
    mutationFn: (params: { query: string; limit: number; enrichment: boolean; region?: string; language?: string }) =>
      api.scrapeLeads(campaignId, {
        query: params.query,
        limit: params.limit,
        enrichment: params.enrichment ? ["emails"] : [],
        region: params.region || undefined,
        language: params.language || "en",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      setShowScrape(false);
      setScrapeForm({ query: "", limit: 20, enrichment: true, regionMode: "", customRegion: "", language: "en" });
      toast.success(`Scraped ${data.found} leads, imported ${data.imported} contacts!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: (contactId: number) =>
      api.generatePitch(contactId, selectedChannel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      toast.success("Pitch generated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateAllMutation = useMutation({
    mutationFn: () => api.generateAllPitches(campaignId, selectedChannel),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      toast.success(`Generated ${data.generated} pitches!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.updateContact(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      setEditingContact(null);
      toast.success("Contact updated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: number) => api.deleteContact(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success("Contact deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkLookupMutation = useMutation({
    mutationFn: (contactIds: number[]) => api.bulkLookupEmails(contactIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      const foundCount = data.results?.filter((r: any) => r.email)?.length || 0;
      toast.success(`Found ${foundCount} emails from ${data.results?.length || 0} contacts!`);
      setSelectedIds([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkGenerateMutation = useMutation({
    mutationFn: (ids: number[]) => api.bulkGeneratePitches(ids, selectedChannel),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      toast.success(`Generated ${data.generated} pitches!`);
      setSelectedIds([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => api.bulkDeleteContacts(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success(`Deleted ${data.deleted} contacts!`);
      setSelectedIds([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateCampaignMutation = useMutation({
    mutationFn: (data: any) => api.updateCampaign(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setShowEditCampaign(false);
      toast.success("Campaign updated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Filtered and paginated contacts
  const filteredContacts = (contacts || []).filter((c: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (stageFilter !== "all" && c.kanbanStage !== stageFilter) return false;
    if (emailFilter === "has_email" && !c.email) return false;
    if (emailFilter === "no_email" && c.email) return false;
    if (emailFilter === "verified" && !c.emailVerified) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const paginatedContacts = filteredContacts.slice((page - 1) * pageSize, page * pageSize);

  const totalCount = (contacts || []).length;
  const withEmailCount = (contacts || []).filter((c: any) => c.email).length;
  const verifiedCount = (contacts || []).filter((c: any) => c.emailVerified).length;
  const inPipelineCount = (contacts || []).filter((c: any) => c.kanbanStage?.startsWith("follow_up")).length;
  const closedCount = (contacts || []).filter((c: any) => c.kanbanStage === "closed").length;
  const missingEmailCount = (contacts || []).filter((c: any) => !c.email && c.website).length;

  const toggleSelectContact = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const pageIds = paginatedContacts.map((c: any) => c.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id: number) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data
          .filter((row: any) => row.name || row.Name || row["Full Name"] || row["Contact Name"])
          .map((row: any) => ({
            name: row.name || row.Name || row["Full Name"] || row["Contact Name"] || "",
            website: row.website || row.Website || row["Company Website"] || row.url || row.URL || "",
            socialUrl: row.social_url || row.socialUrl || row["Social URL"] || row.linkedin || row.LinkedIn || "",
            email: row.email || row.Email || row["Email Address"] || "",
            company: row.company || row.Company || row.Organization || row.organization || "",
            title: row.title || row.Title || row["Job Title"] || row.position || row.Position || "",
          }));

        if (parsed.length === 0) {
          toast.error("No valid contacts found in CSV (header must include 'Name')");
          return;
        }
        bulkImportMutation.mutate(parsed);
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
            <button
              onClick={() => {
                setEditCampaignForm({
                  name: campaign?.name || "",
                  missionContext: campaign?.missionContext || "",
                  tone: campaign?.tone || "professional",
                  targetAudience: campaign?.targetAudience || "",
                });
                setShowEditCampaign(true);
              }}
              className="btn-secondary text-sm"
            >
              <Settings className="mr-1 h-4 w-4" />
              Edit Campaign
            </button>
            <Link to={`/kanban?campaign=${campaignId}`} className="btn-secondary text-sm">
              Kanban Board
            </Link>
          </div>
        </div>
      </div>

      {/* Campaign Summary Metrics Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Contacts</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">With Email</p>
          <p className="mt-1 text-xl font-bold text-blue-600">{withEmailCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Verified Email</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{verifiedCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">In Pipeline</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{inPipelineCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Closed / Won</p>
          <p className="mt-1 text-xl font-bold text-purple-600">{closedCount}</p>
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

        {missingEmailCount > 0 && (
          <button
            onClick={() => {
              const targetIds = (contacts || [])
                .filter((c: any) => !c.email && c.website)
                .map((c: any) => c.id);
              if (targetIds.length === 0) {
                toast.error("No contacts with website missing email");
                return;
              }
              bulkLookupMutation.mutate(targetIds);
            }}
            disabled={bulkLookupMutation.isPending}
            className="btn-secondary text-sm text-brand-600 border-brand-200 hover:bg-brand-50"
          >
            {bulkLookupMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-1 h-4 w-4" />
            )}
            Find All Emails ({missingEmailCount})
          </button>
        )}
      </div>

      {/* Edit Campaign Modal */}
      {showEditCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Edit Campaign</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateCampaignMutation.mutate(editCampaignForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Campaign Name *</label>
                <input
                  className="input"
                  value={editCampaignForm.name}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mission Context *</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={editCampaignForm.missionContext}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, missionContext: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tone</label>
                  <select
                    className="select"
                    value={editCampaignForm.tone}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, tone: e.target.value })}
                  >
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="friendly">Friendly</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Target Audience</label>
                  <input
                    className="input"
                    placeholder="e.g. Founders, CTOs"
                    value={editCampaignForm.targetAudience}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, targetAudience: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditCampaign(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateCampaignMutation.isPending}
                  className="btn-primary"
                >
                  {updateCampaignMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold">Edit Contact</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateContactMutation.mutate({
                  id: editingContact.id,
                  data: {
                    name: editingContact.name,
                    company: editingContact.company,
                    website: editingContact.website,
                    socialUrl: editingContact.socialUrl,
                    email: editingContact.email,
                    title: editingContact.title,
                    kanbanStage: editingContact.kanbanStage,
                  },
                });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    className="input"
                    value={editingContact.name || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Company</label>
                  <input
                    className="input"
                    value={editingContact.company || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, company: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Website</label>
                  <input
                    className="input"
                    value={editingContact.website || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, website: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Social URL</label>
                  <input
                    className="input"
                    value={editingContact.socialUrl || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, socialUrl: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    className="input"
                    value={editingContact.email || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Title / Role</label>
                  <input
                    className="input"
                    value={editingContact.title || ""}
                    onChange={(e) => setEditingContact({ ...editingContact, title: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Stage</label>
                <select
                  className="select"
                  value={editingContact.kanbanStage || "todo"}
                  onChange={(e) => setEditingContact({ ...editingContact, kanbanStage: e.target.value })}
                >
                  <option value="todo">To Do</option>
                  <option value="follow_up_1">Follow Up 1</option>
                  <option value="follow_up_2">Follow Up 2</option>
                  <option value="follow_up_3">Follow Up 3</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingContact(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateContactMutation.isPending}
                  className="btn-primary"
                >
                  {updateContactMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scrape Leads Modal */}
      {showScrape && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold">Scrape Leads (Outscraper)</h2>
            <p className="mb-4 text-sm text-gray-500">
              Search for businesses and import them as contacts.
              Keep the limit low while testing — Outscraper bills ~1 credit per result.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!scrapeForm.query.trim()) {
                  toast.error("Enter a search query");
                  return;
                }
                const effectiveRegion =
                  scrapeForm.regionMode === "other"
                    ? scrapeForm.customRegion.trim()
                    : scrapeForm.regionMode;

                scrapeMutation.mutate({
                  query: scrapeForm.query.trim(),
                  limit: Number(scrapeForm.limit) || 20,
                  enrichment: scrapeForm.enrichment,
                  region: effectiveRegion,
                  language: scrapeForm.language,
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

              {/* Region Selection with Box / Preset + Other */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5 space-y-2.5">
                <label className="block text-sm font-medium text-gray-800">
                  Region / Target Location
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Preset Country / Region</label>
                    <select
                      className="select text-sm w-full bg-white"
                      value={scrapeForm.regionMode}
                      onChange={(e) =>
                        setScrapeForm({ ...scrapeForm, regionMode: e.target.value })
                      }
                    >
                      {PRESET_REGIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {scrapeForm.regionMode === "other" ? (
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Custom Region Code / Name</label>
                      <input
                        className="input text-sm bg-white"
                        placeholder="e.g. TH, PH, FR, or city name"
                        value={scrapeForm.customRegion}
                        onChange={(e) =>
                          setScrapeForm({ ...scrapeForm, customRegion: e.target.value })
                        }
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="flex items-end pb-1 text-xs text-gray-400">
                      {scrapeForm.regionMode ? (
                        <span>Filtering to region code: <strong>{scrapeForm.regionMode.toUpperCase()}</strong></span>
                      ) : (
                        <span>Searching globally across all regions</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Limit (max results)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="input"
                    value={scrapeForm.limit}
                    onChange={(e) =>
                      setScrapeForm({ ...scrapeForm, limit: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Language
                  </label>
                  <select
                    className="select w-full text-sm"
                    value={scrapeForm.language}
                    onChange={(e) => setScrapeForm({ ...scrapeForm, language: e.target.value })}
                  >
                    <option value="en">English (en)</option>
                    <option value="id">Indonesian (id)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                    <option value="ja">Japanese (ja)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
            <div className="flex flex-1 items-center gap-2 min-w-[220px]">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, company, email..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full text-sm outline-none placeholder:text-gray-400 bg-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                className="select py-1 px-2.5 text-xs bg-gray-50 border-gray-200"
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Stages</option>
                <option value="todo">To Do</option>
                <option value="follow_up_1">Follow Up 1</option>
                <option value="follow_up_2">Follow Up 2</option>
                <option value="follow_up_3">Follow Up 3</option>
                <option value="closed">Closed</option>
              </select>

              <select
                className="select py-1 px-2.5 text-xs bg-gray-50 border-gray-200"
                value={emailFilter}
                onChange={(e) => {
                  setEmailFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Emails</option>
                <option value="has_email">Has Email</option>
                <option value="no_email">No Email</option>
                <option value="verified">Verified Only</option>
              </select>

              <span className="text-xs text-gray-400">
                {filteredContacts.length} contacts
              </span>
            </div>
          </div>

          {contactsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
            </div>
          ) : paginatedContacts.length > 0 ? (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-10 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          checked={
                            paginatedContacts.length > 0 &&
                            paginatedContacts.every((c: any) => selectedIds.includes(c.id))
                          }
                          onChange={toggleSelectAllVisible}
                          aria-label="Select all visible contacts"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Company & Info
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Stage
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {paginatedContacts.map((contact: any) => (
                      <tr
                        key={contact.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          selectedIds.includes(contact.id) ? "bg-brand-50/40" : ""
                        }`}
                      >
                        <td className="w-10 px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            checked={selectedIds.includes(contact.id)}
                            onChange={() => toggleSelectContact(contact.id)}
                            aria-label={`Select contact ${contact.name}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {contact.name}
                          </div>
                          {contact.title && (
                            <div className="text-xs text-gray-400">{contact.title}</div>
                          )}
                          {contact.socialUrl && (
                            <a
                              href={contact.socialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center text-xs text-blue-500 hover:text-blue-700 mt-0.5"
                            >
                              <ExternalLink className="mr-1 h-3 w-3" />
                              Social
                            </a>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          <div className="font-medium text-gray-800">{contact.company || "-"}</div>
                          {contact.website && (
                            <a
                              href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-xs text-brand-600 hover:text-brand-800 hover:underline mt-0.5"
                              title={`Visit ${contact.website}`}
                            >
                              <Globe className="mr-1 h-3 w-3 text-gray-400" />
                              {contact.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                              <ExternalLink className="ml-0.5 h-2.5 w-2.5 opacity-60" />
                            </a>
                          )}
                          {contact.phone && (
                            <div className="flex items-center text-[11px] text-gray-400 mt-0.5">
                              <Phone className="mr-1 h-2.5 w-2.5" />
                              {contact.phone}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {contact.email ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-900">{contact.email}</span>
                              {contact.emailVerified ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700">
                                  Verified
                                </span>
                              ) : null}
                            </div>
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
                                : contact.kanbanStage?.startsWith("follow_up")
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {contact.kanbanStage?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {contact.email && !contact.emailVerified && (
                              <button
                                onClick={() =>
                                  verifyMutation.mutate({ contactId: contact.id, provider: "reoon" })
                                }
                                disabled={verifyMutation.isPending}
                                className="text-xs text-emerald-600 hover:text-emerald-700"
                                title="Verify email with Reoon"
                              >
                                Verify
                              </button>
                            )}
                            <button
                              onClick={() => generateMutation.mutate(contact.id)}
                              disabled={generateMutation.isPending}
                              className="text-xs text-brand-600 hover:text-brand-700"
                            >
                              Pitch
                            </button>
                            <button
                              onClick={() => setEditingContact({ ...contact })}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Edit Contact"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete contact ${contact.name}?`)) {
                                  deleteContactMutation.mutate(contact.id);
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Delete Contact"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Floating Bulk Action Bar */}
              {selectedIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl bg-gray-900/95 px-5 py-2.5 text-white shadow-2xl backdrop-blur border border-gray-700 animate-in fade-in duration-200">
                  <span className="text-xs font-semibold text-gray-200">
                    {selectedIds.length} selected
                  </span>
                  <div className="h-4 w-px bg-gray-700" />
                  <button
                    onClick={() => bulkGenerateMutation.mutate(selectedIds)}
                    disabled={bulkGenerateMutation.isPending}
                    className="inline-flex items-center text-xs font-medium text-brand-300 hover:text-white"
                  >
                    {bulkGenerateMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="mr-1 h-3.5 w-3.5" />
                    )}
                    Generate Pitches
                  </button>
                  <button
                    onClick={() => bulkLookupMutation.mutate(selectedIds)}
                    disabled={bulkLookupMutation.isPending}
                    className="inline-flex items-center text-xs font-medium text-emerald-300 hover:text-white"
                  >
                    {bulkLookupMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="mr-1 h-3.5 w-3.5" />
                    )}
                    Find Emails
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${selectedIds.length} selected contacts?`)) {
                        bulkDeleteMutation.mutate(selectedIds);
                      }
                    }}
                    disabled={bulkDeleteMutation.isPending}
                    className="inline-flex items-center text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    {bulkDeleteMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-xs text-gray-400 hover:text-gray-200 ml-2"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 text-xs text-gray-500">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn-secondary py-1 px-2 text-xs disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="btn-secondary py-1 px-2 text-xs disabled:opacity-40"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12 text-gray-400">
              {searchTerm || stageFilter !== "all" || emailFilter !== "all"
                ? "No contacts match the selected filters."
                : "No contacts yet. Import a CSV, scrape leads, or add manually."}
            </div>
          )}
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === "messages" && (
        <MessagesTab campaignId={campaignId} />
      )}
    </div>
  );
}

function MessagesTab({ campaignId }: { campaignId: number }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [msgFilter, setMsgFilter] = useState<string>("all");
  const [msgSearch, setMsgSearch] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["campaignMessages", campaignId],
    queryFn: () => api.getCampaignMessages(campaignId),
  });

  const sendMutation = useMutation({
    mutationFn: (msgId: number) => api.sendMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      toast.success("Message sent!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkSendMutation = useMutation({
    mutationFn: (messageIds: number[]) => api.bulkSendMessages(messageIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["contacts", campaignId] });
      const sentCount = data.results?.filter((r: any) => r.success)?.length || 0;
      toast.success(`Bulk sent ${sentCount} messages!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.updateMessage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignMessages", campaignId] });
      setEditingId(null);
      toast.success("Message updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        No messages generated yet. Generate pitches from the Contacts tab.
      </div>
    );
  }

  const draftMessagesWithEmail = (messages || []).filter(
    (m: any) => m.status === "draft" && m.contactEmail
  );

  const filteredMessages = (messages || []).filter((msg: any) => {
    if (msgFilter !== "all" && msg.status !== msgFilter) return false;
    if (msgSearch) {
      const q = msgSearch.toLowerCase();
      const match =
        msg.contactName?.toLowerCase().includes(q) ||
        msg.contactCompany?.toLowerCase().includes(q) ||
        msg.contactEmail?.toLowerCase().includes(q) ||
        msg.subject?.toLowerCase().includes(q) ||
        msg.body?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar for Messages */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-1 items-center gap-2 min-w-[200px]">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search recipient, company, or pitch text..."
            value={msgSearch}
            onChange={(e) => setMsgSearch(e.target.value)}
            className="w-full text-sm outline-none placeholder:text-gray-400 bg-transparent"
          />
          {msgSearch && (
            <button
              onClick={() => setMsgSearch("")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            className="select py-1 px-2.5 text-xs bg-gray-50 border-gray-200"
            value={msgFilter}
            onChange={(e) => setMsgFilter(e.target.value)}
          >
            <option value="all">All Messages ({(messages || []).length})</option>
            <option value="draft">Drafts ({(messages || []).filter((m: any) => m.status === "draft").length})</option>
            <option value="sent">Sent ({(messages || []).filter((m: any) => m.status === "sent").length})</option>
            <option value="opened">Opened ({(messages || []).filter((m: any) => m.status === "opened").length})</option>
            <option value="replied">Replied ({(messages || []).filter((m: any) => m.status === "replied").length})</option>
          </select>
        </div>
      </div>

      {draftMessagesWithEmail.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="text-sm text-blue-900">
            <strong>{draftMessagesWithEmail.length}</strong> draft messages ready to send
          </div>
          <button
            onClick={() => {
              const ids = draftMessagesWithEmail.map((m: any) => m.id);
              bulkSendMutation.mutate(ids);
            }}
            disabled={bulkSendMutation.isPending}
            className="btn-primary text-xs"
          >
            {bulkSendMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Send All Drafts ({draftMessagesWithEmail.length})
          </button>
        </div>
      )}

      {filteredMessages.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          {msgSearch || msgFilter !== "all"
            ? "No messages match your search/filter criteria."
            : "No messages generated yet."}
        </div>
      ) : (
        filteredMessages.map((msg: any) => (
        <div key={msg.id} className="card">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-900">
                {msg.contactName}
              </span>
              <span className="ml-2 text-xs text-gray-400 uppercase">
                {msg.channel}
              </span>
              {msg.contactCompany && (
                <span className="ml-2 text-xs text-gray-400">
                  {msg.contactCompany}
                </span>
              )}
              {msg.contactEmail && (
                <span className="ml-2 text-xs text-gray-500">
                  ({msg.contactEmail})
                </span>
              )}
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
                      setEditSubject(msg.subject || "");
                      setEditBody(msg.body || "");
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
            <div className="space-y-3 pt-2">
              {msg.channel === "email" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Subject</label>
                  <input
                    type="text"
                    className="input text-sm"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Body</label>
                <textarea
                  className="textarea"
                  rows={6}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
                <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                  <span>
                    {msg.channel === "linkedin"
                      ? "Recommended: <300 (connect) or <1000 (InMail)"
                      : msg.channel === "twitter"
                      ? "Recommended: <280 chars"
                      : "Email pitch"}
                  </span>
                  <span>{editBody.length} characters</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateMutation.mutate({
                      id: msg.id,
                      data: { subject: editSubject, body: editBody },
                    })
                  }
                  disabled={updateMutation.isPending}
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
                <p className="mb-2 font-medium text-gray-900">Subject: {msg.subject}</p>
              )}
              <div>{msg.body}</div>
              {msg.sentAt && (
                <div className="mt-3 text-[11px] text-gray-400 border-t border-gray-200/60 pt-2">
                  Sent: {new Date(msg.sentAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      )))}
    </div>
  );
}
