import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Link } from "react-router-dom";
import { Plus, Trash2, Users, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    missionContext: "",
    tone: "professional",
    targetAudience: "",
  });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.getCampaigns,
  });

  const createMutation = useMutation({
    mutationFn: api.createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setShowCreate(false);
      setForm({ name: "", missionContext: "", tone: "professional", targetAudience: "" });
      toast.success("Campaign created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-gray-500">Manage your outreach campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg">
            <h2 className="mb-4 text-lg font-semibold">Create New Campaign</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Campaign Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. GCR Expert Outreach 2024"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Mission Context
                </label>
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder="Describe your outreach mission... (e.g. We're looking for expert members for GCRindex.org founding team)"
                  value={form.missionContext}
                  onChange={(e) =>
                    setForm({ ...form, missionContext: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tone
                </label>
                <select
                  className="select"
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })}
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Target Audience (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. AI/ML researchers, Tech founders"
                  value={form.targetAudience}
                  onChange={(e) =>
                    setForm({ ...form, targetAudience: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn-primary"
                >
                  {createMutation.isPending ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-4">
          {campaigns.map((campaign: any) => (
            <div key={campaign.id} className="card flex items-center justify-between">
              <Link to={`/campaigns/${campaign.id}`} className="flex-1">
                <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                <p className="mt-1 text-sm text-gray-500 line-clamp-1">
                  {campaign.missionContext}
                </p>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {campaign.contactCount} contacts
                  </span>
                  <span className="capitalize">{campaign.tone}</span>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link
                  to={`/campaigns/${campaign.id}`}
                  className="btn-secondary text-xs"
                >
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
                <button
                  onClick={() => {
                    if (confirm("Delete this campaign?")) {
                      deleteMutation.mutate(campaign.id);
                    }
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <MegaphoneIcon />
          <p className="mt-4 text-gray-500">No campaigns yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary mt-4"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Campaign
          </button>
        </div>
      )}
    </div>
  );
}

function MegaphoneIcon() {
  return (
    <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  );
}
