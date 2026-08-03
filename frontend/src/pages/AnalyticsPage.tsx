import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, Users, Send, Eye, Reply } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function AnalyticsPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.getCampaigns,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const funnelData = [
    { name: "Total Contacts", value: analytics?.totalContacts || 0, icon: Users },
    { name: "Emails Sent", value: analytics?.sent || 0, icon: Send },
    { name: "Opened", value: analytics?.opened || 0, icon: Eye },
    { name: "Replied", value: analytics?.replied || 0, icon: Reply },
  ];

  const pieData = [
    { name: "Sent", value: analytics?.sent || 0 },
    { name: "Opened", value: analytics?.opened || 0 },
    { name: "Replied", value: analytics?.replied || 0 },
    { name: "Bounced", value: analytics?.bounced || 0 },
  ].filter((d) => d.value > 0);

  const campaignData = (campaigns || []).map((c: any) => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + "..." : c.name,
    contacts: c.contactCount,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-gray-500">
          Track your outreach performance
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Open Rate"
          value={`${analytics?.openRate || 0}%`}
          change={Number(analytics?.openRate) > 20 ? "+good" : "needs work"}
          color={Number(analytics?.openRate) > 20 ? "text-green-600" : "text-amber-600"}
        />
        <MetricCard
          label="Reply Rate"
          value={`${analytics?.replyRate || 0}%`}
          change={Number(analytics?.replyRate) > 10 ? "+good" : "needs work"}
          color={Number(analytics?.replyRate) > 10 ? "text-green-600" : "text-amber-600"}
        />
        <MetricCard
          label="Total Sent"
          value={analytics?.sent || 0}
          color="text-blue-600"
        />
        <MetricCard
          label="Total Replied"
          value={analytics?.replied || 0}
          color="text-purple-600"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funnel Chart */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Conversion Funnel
          </h2>
          <div className="space-y-3">
            {funnelData.map((step, i) => {
              const Icon = step.icon;
              const maxVal = funnelData[0].value || 1;
              const width = (step.value / maxVal) * 100;
              return (
                <div key={step.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <Icon className="h-4 w-4" />
                      {step.name}
                    </span>
                    <span className="font-medium text-gray-900">{step.value}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${width}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Message Status Breakdown
          </h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-gray-400">
              No data yet
            </div>
          )}
        </div>

        {/* Campaign Bar Chart */}
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Contacts per Campaign
          </h2>
          {campaignData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campaignData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="contacts" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-gray-400">
              No campaign data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  color,
}: {
  label: string;
  value: string | number;
  change?: string;
  color: string;
}) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
      {change && (
        <p className="mt-1 text-xs text-gray-400">{change}</p>
      )}
    </div>
  );
}
