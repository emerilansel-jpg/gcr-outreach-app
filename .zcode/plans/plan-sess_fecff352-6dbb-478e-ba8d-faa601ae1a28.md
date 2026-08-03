
# GCR Outreach App — Implementation Plan

## Overview
Full-stack outreach app hosted on Cloudflare. User inputs contact list + mission context → AI generates personalized pitches → send via ManyReach → track replies on Kanban board → analytics dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| Backend API | Hono (lightweight, Cloudflare Workers native) |
| Database | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM |
| AI Personalization | Cloudflare Workers AI (Llama 3.1) |
| Email Lookup | Hunter.io API |
| Email Outreach | ManyReach API |
| UI Components | @shadcn/ui (Radix + Tailwind) |
| Hosting | Cloudflare Pages + Workers |

---

## Database Schema (D1 + Drizzle)

### campaigns
- `id`, `name`, `mission_context` (deskripsi misi), `tone` (professional/casual), `target_audience`, timestamps

### contacts
- `id`, `campaign_id`, `name`, `website`, `social_url`, `email`, `email_verified`, `company`, `title`, `status` (new/contacted/replied/meeting/closed), `kanban_stage` (todo/follow_up_1/follow_up_2/follow_up_3/closed), `notes`, timestamps

### messages
- `id`, `contact_id`, `campaign_id`, `channel` (email/linkedin/twitter), `subject`, `body`, `status` (draft/queued/sent/delivered/opened/replied/bounced), `sent_at`, `opened_at`, `replied_at`, `manyreach_id`, timestamps

### email_enrichments
- `id`, `contact_id`, `email`, `confidence` (Hunter.io score), `sources` (JSON), `verified_at`, timestamps

---

## Project Structure

```
gcr-outreach-app/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── App.tsx, main.tsx
│   │   ├── api/               # API client functions
│   │   ├── components/
│   │   │   ├── Layout.tsx     # Sidebar + top nav
│   │   │   ├── Dashboard/     # StatsCards, CampaignList, RecentActivity
│   │   │   ├── Campaign/      # CampaignCreate, CampaignDetail, MissionContextForm
│   │   │   ├── Contacts/      # ContactList, ContactImport (CSV), ContactDetail, EnrichEmail
│   │   │   ├── Messages/      # MessagePreview (AI draft), MessageEditor, SendControls
│   │   │   ├── Kanban/        # KanbanBoard, KanbanColumn, KanbanCard (drag & drop)
│   │   │   └── Analytics/     # MetricsChart, CampaignReport
│   │   ├── pages/             # Dashboard, Campaigns, Contacts, Kanban, Messages, Analytics
│   │   ├── hooks/             # useApi, useKanban
│   │   └── lib/utils.ts
│   ├── package.json, vite.config.ts, tailwind.config.ts
├── backend/                   # Hono API on Cloudflare Workers
│   ├── src/
│   │   ├── index.ts           # Worker entry + Hono app
│   │   ├── routes/            # campaigns, contacts, messages, kanban, analytics, email-lookup, outreach
│   │   ├── services/
│   │   │   ├── ai.ts          # Cloudflare Workers AI integration
│   │   │   ├── hunter.ts      # Hunter.io API client
│   │   │   ├── manyreach.ts   # ManyReach API client
│   │   │   └── email-tracker.ts
│   │   ├── db/
│   │   │   ├── schema.ts      # Drizzle schema
│   │   │   ├── index.ts       # DB connection
│   │   │   └── migrations/
│   │   └── middleware/cors.ts
│   ├── wrangler.toml
│   ├── drizzle.config.ts
└── package.json               # Root workspace
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign |
| POST | `/api/campaigns/:id/contacts/import` | CSV bulk import |
| GET | `/api/campaigns/:id/contacts` | List contacts |
| POST | `/api/contacts/:id/lookup-email` | Hunter.io email lookup |
| POST | `/api/contacts/bulk-lookup` | Bulk email lookup |
| POST | `/api/contacts/:id/generate` | AI generate personalized pitch |
| POST | `/api/campaigns/:id/generate-all` | AI generate all pitches |
| PUT | `/api/messages/:id` | Edit message |
| POST | `/api/messages/:id/send` | Send via ManyReach |
| POST | `/api/messages/bulk-send` | Bulk send |
| GET | `/api/campaigns/:id/kanban` | Get kanban board |
| PUT | `/api/contacts/:id/kanban` | Move contact stage |
| GET | `/api/analytics/overview` | Dashboard stats |
| GET | `/api/analytics/campaign/:id` | Campaign stats |
| POST | `/api/webhooks/manyreach` | Delivery webhooks |

---

## UI Pages

### 1. Dashboard
- Stats cards: Total Contacts, Emails Sent, Open Rate, Reply Rate
- Campaign list with quick stats
- Recent activity feed

### 2. Campaign Management
- Create campaign with mission context & tone
- List all campaigns
- Campaign detail with contacts, messages, stats

### 3. Contacts
- CSV upload / manual add / bulk paste
- Contact list with email lookup status
- Contact detail with messages & kanban stage

### 4. AI Message Generation
- Preview AI-generated personalized pitch per contact
- Edit message before approving
- Batch generate for all contacts in campaign

### 5. Kanban Board
- **Columns**: Todo → Follow Up 1 → Follow Up 2 → Follow Up 3 → Closed
- **Drag & Drop** between stages
- Auto-move on reply detection

### 6. Analytics
- Conversion funnel: Sent → Opened → Replied → Meeting
- Timeline chart of outreach activity
- Per-campaign breakdown

---

## Implementation Steps (12 steps)

### Phase 1: Foundation
1. **Project setup** — Init monorepo, install deps, configure TypeScript/Tailwind/Vite
2. **Database schema** — Drizzle schema, migrations, D1 setup, seed data
3. **Backend API skeleton** — Hono routes, CORS, basic CRUD for campaigns/contacts

### Phase 2: Core Features
4. **Campaign management UI** — Create/list/edit campaigns with mission context form
5. **Contact import** — CSV upload (Papa Parse), manual add, contact list view
6. **Email lookup integration** — Hunter.io API client, bulk lookup, enrichment display

### Phase 3: AI & Outreach
7. **AI personalization** — Cloudflare Workers AI (Llama 3.1), generate personalized pitches per contact
8. **Email outreach** — ManyReach API integration, send queue, delivery tracking

### Phase 4: Kanban & Analytics
9. **Kanban board** — @dnd-kit drag & drop, stage management, auto-move on reply
10. **Analytics dashboard** — Stats cards, Recharts charts, conversion funnel

### Phase 5: Polish & Deploy
11. **UI polish** — Loading states, error handling, responsive design, toast notifications
12. **Deploy to Cloudflare** — Wrangler deploy for backend, Cloudflare Pages for frontend

---

## Key Design Decisions

1. **Hono over Express** — Native Cloudflare Workers support, lightweight
2. **@shadcn/ui** — Beautiful, accessible components, Tailwind-native
3. **@dnd-kit** — Modern drag & drop for kanban board
4. **Recharts** — Lightweight React charting for analytics
5. **Papa Parse** — CSV parsing in browser for contact import
6. **Single-user for now** — No auth, but schema ready for multi-user expansion
7. **Draft-first social media** — Generate messages for user to copy-paste; auto-send API ready for future

---

## Estimated Cost

| Service | Cost |
|---------|------|
| Cloudflare Workers | Free (100K req/day) |
| Cloudflare D1 | Free (5GB, 10M reads/day) |
| Cloudflare Pages | Free |
| Cloudflare Workers AI | Free (10K req/day) |
| Hunter.io | Free tier (50 searches) or $49/mo |
| ManyReach | Pay-as-you-go credits |
| **Total Minimum** | **$0/mo** |

---

## Future Enhancements (post-v1)
- Multi-user auth (Cloudflare Access)
- Auto-send via X/LinkedIn API
- Email drip sequences
- A/B message testing
- Chrome extension for LinkedIn outreach
