import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  Users,
  Send,
  Eye,
  Reply,
  Megaphone,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.getCampaigns,
  });

  if (analyticsLoading || campaignsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Overview of your outreach campaigns
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Contacts"
          value={analytics?.totalContacts || 0}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          label="Emails Sent"
          value={analytics?.sent || 0}
          icon={Send}
          color="bg-green-500"
        />
        <StatCard
          label="Open Rate"
          value={`${analytics?.openRate || 0}%`}
          icon={Eye}
          color="bg-amber-500"
        />
        <StatCard
          label="Reply Rate"
          value={`${analytics?.replyRate || 0}%`}
          icon={Reply}
          color="bg-purple-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="flex gap-3">
          <Link to="/campaigns" className="btn-primary">
            <Megaphone className="mr-2 h-4 w-4" />
            New Campaign
          </Link>
          <Link to="/kanban" className="btn-secondary">
            <TrendingUp className="mr-2 h-4 w-4" />
            View Kanban
          </Link>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
          <Link
            to="/campaigns"
            className="flex items-center text-sm text-brand-600 hover:text-brand-700"
          >
            View all <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <div className="space-y-3">
            {campaigns.slice(0, 5).map((campaign: any) => (
              <Link
                key={campaign.id}
                to={`/campaigns/${campaign.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-100 p-4 transition-colors hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{campaign.name}</p>
                  <p className="text-sm text-gray-500">{campaign.missionContext}</p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {campaign.contactCount} contacts
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-gray-400">
            No campaigns yet. Create your first one!
          </p>
        )}
      </div>
    </div>
  );
}
