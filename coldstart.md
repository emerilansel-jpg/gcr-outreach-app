# Coldstart — GCR Outreach App

> Dokumen ini berisi konteks lengkap project untuk referensi cepat.
> Dibuat: 2026-08-03 | Terakhir update: 2026-08-03

---

## 1. Project Overview

Full-stack outreach app untuk GCR campaigns. User input daftar nama/website/social media → AI generate personalized pitch → kirim via ManyReach → track reply di Kanban board → lihat analytics.

**Use case utama:** Outreach ke expert/Founding Members untuk GCRindex.org

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React 18 + Vite + TypeScript | Vite 5.4 |
| CSS | TailwindCSS | 3.4 |
| Backend | Hono (Cloudflare Workers) | 4.4 |
| Database | Cloudflare D1 (SQLite) | - |
| ORM | Drizzle ORM | 0.31 |
| AI | Cloudflare Workers AI (Llama 3.1 8B) | - |
| Email Lookup | Hunter.io API | - |
| Email Outreach | ManyReach API | - |
| Charts | Recharts | 2.12 |
| Drag & Drop | @dnd-kit | 6.1 |
| HTTP Client | TanStack React Query | 5.45 |
| CSV Parser | Papa Parse | 5.4 |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Cloudflare                         │
│                                                      │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │  Cloudflare Pages │    │  Cloudflare Workers     │ │
│  │  (Frontend SPA)   │───▶│  (Hono API)            │ │
│  │                    │    │                         │ │
│  │  React + Vite     │    │  Routes:                │ │
│  │  TailwindCSS      │    │  - /api/campaigns       │ │
│  │  Recharts         │    │  - /api/contacts        │ │
│  │  @dnd-kit         │    │  - /api/messages        │ │
│  └──────────────────┘    │  - /api/analytics       │ │
│                           │  - /api/email-lookup    │ │
│                           └───────────┬────────────┘ │
│                                       │               │
│                           ┌───────────▼────────────┐ │
│                           │  Cloudflare D1 (SQLite) │ │
│                           │  - campaigns            │ │
│                           │  - contacts             │ │
│                           │  - messages             │ │
│                           │  - email_enrichments    │ │
│                           └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐    ┌─────────────────────┐
│  External APIs   │    │  External APIs       │
│  - Hunter.io     │    │  - ManyReach         │
│  (email lookup)  │    │  (email sending)     │
└─────────────────┘    └─────────────────────┘
```

---

## 4. File Structure

```
F:\GCR Outreach App\
├── package.json                    # Root workspace config
├── README.md                       # User-facing docs
├── coldstart.md                    # ← This file
├── .gitignore
│
├── backend/                        # Hono API on Cloudflare Workers
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml               # Cloudflare Workers config
│   ├── drizzle.config.ts           # Drizzle ORM config
│   ├── .dev.vars                   # Local dev secrets (gitignored)
│   └── src/
│       ├── index.ts                # Main entry — Hono app + routing
│       ├── db/
│       │   ├── schema.ts           # Drizzle table definitions
│       │   ├── index.ts            # DB connection factory
│       │   └── migrations/
│       │       └── 0001_initial.sql
│       ├── routes/
│       │   ├── campaigns.ts        # CRUD campaigns
│       │   ├── contacts.ts         # CRUD contacts + kanban
│       │   ├── messages.ts         # Generate/send messages
│       │   ├── analytics.ts        # Dashboard stats
│       │   └── email-lookup.ts     # Hunter.io integration
│       └── services/
│           ├── ai.ts               # Cloudflare Workers AI
│           ├── hunter.ts           # Hunter.io API client
│           └── manyreach.ts        # ManyReach API client
│
└── frontend/                       # React SPA
    ├── package.json
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── tsconfig.json
    ├── tsconfig.node.json
    └── src/
        ├── main.tsx                # Entry point (React + Query + Router)
        ├── App.tsx                 # Route definitions
        ├── index.css               # Tailwind + custom CSS
        ├── api/
        │   └── index.ts            # API client functions
        ├── lib/
        │   └── utils.ts            # cn(), formatDate()
        ├── components/
        │   └── Layout.tsx          # Sidebar + outlet
        └── pages/
            ├── DashboardPage.tsx   # Stats cards, campaign list
            ├── CampaignsPage.tsx   # Create/list campaigns
            ├── CampaignDetailPage.tsx  # Contacts, messages, import
            ├── KanbanPage.tsx      # Drag & drop board
            └── AnalyticsPage.tsx   # Charts, funnel
```

---

## 5. Database Schema

### campaigns
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| name | TEXT | Campaign name |
| mission_context | TEXT | Deskripsi misi outreach |
| tone | TEXT | professional/casual/friendly/formal |
| target_audience | TEXT | Optional target description |
| created_at | TEXT | datetime default |
| updated_at | TEXT | datetime default |

### contacts
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| campaign_id | INTEGER FK | References campaigns.id |
| name | TEXT | Contact name |
| website | TEXT | Company/personal website |
| social_url | TEXT | LinkedIn/X URL |
| email | TEXT | Found via Hunter.io |
| email_verified | INTEGER | 0/1 boolean |
| company | TEXT | Company name |
| title | TEXT | Job title |
| status | TEXT | new/contacted/replied/meeting/closed/invalid |
| kanban_stage | TEXT | todo/follow_up_1/follow_up_2/follow_up_3/closed |
| notes | TEXT | User notes |
| created_at | TEXT | |
| updated_at | TEXT | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| contact_id | INTEGER FK | References contacts.id |
| campaign_id | INTEGER FK | References campaigns.id |
| channel | TEXT | email/linkedin/twitter |
| subject | TEXT | Email subject (email only) |
| body | TEXT | Message content |
| status | TEXT | draft/queued/sent/delivered/opened/replied/bounced |
| sent_at | TEXT | |
| opened_at | TEXT | |
| replied_at | TEXT | |
| manyreach_id | TEXT | ManyReach tracking ID |
| created_at | TEXT | |

### email_enrichments
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| contact_id | INTEGER FK | References contacts.id |
| email | TEXT | Found email |
| confidence | INTEGER | Hunter.io confidence score |
| sources | TEXT | JSON array of sources |
| verified_at | TEXT | |
| created_at | TEXT | |

---

## 6. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign + stats |
| PUT | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign + contacts |
| GET | `/api/contacts/campaign/:campaignId` | List contacts in campaign |
| GET | `/api/contacts/:id` | Get contact + messages |
| POST | `/api/contacts` | Add single contact |
| POST | `/api/contacts/bulk/:campaignId` | Bulk import contacts |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact + messages |
| GET | `/api/contacts/kanban/:campaignId` | Kanban board data |
| PUT | `/api/contacts/:id/kanban` | Move contact to stage |
| POST | `/api/messages/generate/:contactId` | AI generate pitch |
| POST | `/api/messages/generate-all/:campaignId` | AI generate all pitches |
| PUT | `/api/messages/:id` | Edit message |
| POST | `/api/messages/send/:id` | Send via ManyReach |
| POST | `/api/messages/bulk-send` | Bulk send |
| POST | `/api/email-lookup/contact/:id` | Hunter.io lookup |
| POST | `/api/email-lookup/bulk` | Bulk email lookup |
| GET | `/api/analytics/overview` | Dashboard stats |
| GET | `/api/analytics/campaign/:id` | Campaign stats |
| POST | `/api/webhooks/manyreach` | Delivery webhook |

---

## 7. Deployment Info

### URLs
| Service | URL |
|---------|-----|
| Frontend (Pages) | https://gcr-outreach-frontend.pages.dev |
| Frontend (Custom) | https://reach.gcrindex.org *(belum aktif — butuh setup DNS)* |
| Backend API | https://gcr-outreach-api.emerilansel.workers.dev |
| GitHub | https://github.com/emerilansel-jpg/gcr-outreach-app |

### Cloudflare Resources
| Resource | Name | ID |
|----------|------|-----|
| Worker | gcr-outreach-api | - |
| D1 Database | gcr-outreach-db | 23825597-76b5-408d-b084-f41ad7866a4b |
| Pages Project | gcr-outreach-frontend | - |
| Account | Emerilansel@gmail.com | d5cb3e4213b6aa69dbc2feb1499af77a |

### Git Config
```
user.name = emerilansel-jpg
user.email = emerilansel@gmail.com
```

---

## 8. Secrets / Environment Variables

### Yang sudah diisi
| Key | Value | Location |
|-----|-------|----------|
| CF_AI_API_TOKEN | Ter-set sebagai **secret** di Worker | Cloudflare secret (2026-08-06) |
| CF_AI_API_TOKEN | cfut_VtFt... (local dev) | backend/.dev.vars (gitignored) |

### Yang belum diisi (perlu user input)
| Key | Purpose | Where to get |
|-----|---------|--------------|
| HUNTER_API_KEY | Email lookup | https://hunter.io (free tier: 50 searches) |
| MANYREACH_API_KEY | Email outreach | https://manyreach.com (user sudah punya akun) |

### Cara isi via CLI (secrets)
```bash
cd "F:\GCR Outreach App\backend"
CLOUDFLARE_API_TOKEN=YOUR_CF_API_TOKEN \
CLOUDFLARE_ACCOUNT_ID=d5cb3e4213b6aa69dbc2feb1499af77a \
npx wrangler secret put HUNTER_API_KEY

npx wrangler secret put MANYREACH_API_KEY
```
> Catatan: vars di wrangler.toml TIDAK boleh sama nama dengan secret. Kalau nama binding sudah ada di `[vars]`, secret tidak bisa dibuat — hapus dulu dari vars lalu redeploy, baru set secret.

### Cloudflare API Tokens
| Token (truncated) | Permissions | Email |
|-------|------------|-------|
| `cfut_VtFt...` | Pages (full) | emerilansel@gmail.com |
| `cfut_lzbh...` | D1 + Workers | emerilansel@gmail.com |

---

## 9. How to Run Locally

```bash
cd "F:\GCR Outreach App"

# Install dependencies (sudah terinstall)
npm install

# Terminal 1 — Backend
cd backend && npm run dev
# → http://localhost:8787

# Terminal 2 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

### How to Deploy
```bash
# Backend
cd backend
CLOUDFLARE_API_TOKEN=... npx wrangler deploy

# Frontend
cd frontend
npx vite build
CLOUDFLARE_API_TOKEN=... npx wrangler pages deploy dist --project-name gcr-outreach-frontend --commit-dirty=true
```

---

## 9b. Custom Domain: reach.gcrindex.org

### Status (2026-08-06)
- ❌ **BELUM aktif** — domain belum connect ke Cloudflare
- Nameserver sekarang: `ns1.hostresolver.com` / `ns1.emu-dns.com` (bukan Cloudflare)
- Domain tidak ada di 3 akun Cloudflare yang dicek
- CORS backend sudah siap mengizinkan `https://reach.gcrindex.org`

### Kenapa belum bisa otomatis
Kedua API token tidak punya permission `Zone:Create`. Plus, mengubah nameserver domain **hanya bisa dilakukan user** di panel registrar — AI tidak punya akses ke sana.

### Langkah yang harus dilakukan user (pilih salah satu)

**Opsi A — Pindah DNS ke Cloudflare (disarankan, SSL otomatis):**
1. Login https://dash.cloudflare.com → **Add a site** → masukkan `gcrindex.org` → pilih **Free plan**
2. Cloudflare akan kasih 2 nameserver (contoh: `ns1.something.ns.cloudflare.com`)
3. Login ke panel registrar domain (emu-dns.com / hostresolver.com) → ganti nameserver ke punya Cloudflare
4. Tunggu ~1-24 jam sampai status Active
5. Di Pages project `gcr-outreach-frontend` → **Custom domains** → add `reach.gcrindex.org`
6. Selesai — akses https://reach.gcrindex.org

**Opsi B — CNAME di DNS provider sekarang (lebih cepat):**
1. Login ke panel DNS `gcrindex.org` (emu-dns.com)
2. Tambah record:
   - Type: **CNAME**
   - Name: `reach`
   - Target: `gcr-outreach-frontend.pages.dev`
   - Proxy: (jika bisa, aktifkan)
3. Tunggu DNS propagate (~5-30 menit)
4. Selesai — akses https://reach.gcrindex.org (tanpa SSL otomatis dari CF Pages jika proxy tidak aktif)

### Catatan CORS
Backend sudah allow origins: `gcr-outreach-frontend.pages.dev`, `reach.gcrindex.org`, `localhost:5173/4173` (backend/src/index.ts)

---

## 10. Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Campaign CRUD | ✅ Done | Create, list, edit, delete |
| Contact Import (CSV) | ✅ Done | Papa Parse, header auto-detect |
| Contact Import (Manual) | ✅ Done | Form with validation |
| Email Lookup (Hunter.io) | ✅ Done | Single + bulk, code ready |
| AI Personalization | ✅ Done | Cloudflare Workers AI (Llama 3.1) |
| Message Preview/Edit | ✅ Done | Draft → Edit → Approve flow |
| Email Send (ManyReach) | ✅ Done | Single + bulk, code ready |
| Social Media (Draft) | ✅ Done | Generate for LinkedIn/X, user copy-paste |
| Kanban Board | ✅ Done | Drag & drop, 5 stages |
| Analytics Dashboard | ✅ Done | Funnel, pie chart, bar chart |
| Deployment | ✅ Done | Cloudflare Pages + Workers + D1 |

---

## 11. Kanban Stages

```
To Do → Follow Up 1 → Follow Up 2 → Follow Up 3 → Closed
```

- **To Do**: Contact baru, belum dihubungi
- **Follow Up 1**: Email pertama terkirim
- **Follow Up 2**: Follow-up kedua
- **Follow Up 3**: Follow-up ketiga
- **Closed**: Sudah reply, meeting, atau deal

---

## 12. Known Issues & TODOs

### Immediate
- [ ] Isi HUNTER_API_KEY di wrangler.toml / Cloudflare secrets
- [ ] Isi MANYREACH_API_KEY di wrangler.toml / Cloudflare secrets
- [ ] Test email lookup flow dengan Hunter.io API key
- [ ] Test email send flow dengan ManyReach API key

### Future Enhancements
- [ ] Multi-user auth (Cloudflare Access atau custom)
- [ ] Auto-send via X API (butuh approval)
- [ ] Auto-send via LinkedIn API (sangat terbatas)
- [ ] Email drip sequences (automated follow-ups)
- [ ] A/B testing untuk message variants
- [ ] Webhook handler untuk real-time reply detection
- [ ] Chrome extension untuk LinkedIn outreach
- [ ] Custom domain untuk frontend — **proses sedang berjalan** (lihat section 9b)

### Technical Debt
- [ ] Code splitting untuk frontend (chunk > 500KB warning)
- [ ] Add error boundaries
- [ ] Add loading skeletons
- [ ] Add form validation with zod
- [ ] Add unit tests
- [ ] Upgrade wrangler to v4

---

## 13. Key Design Decisions

1. **Hono over Express** — Native Cloudflare Workers support, lightweight
2. **@shadcn/ui style** — Custom CSS utility classes (btn-primary, card, input)
3. **@dnd-kit** — Modern drag & drop for kanban (better than react-beautiful-dnd)
4. **Recharts** — Lightweight React charting
5. **Papa Parse** — CSV parsing in browser
6. **Single-user for now** — No auth, schema ready for multi-user
7. **Draft-first social media** — Generate for copy-paste; auto-send ready for future
8. **Cloudflare Workers AI** — Free 10K requests/day, fast, integrated
9. **API URL switch** — Dev: `/api` (Vite proxy), Prod: direct Worker URL

---

## 14. Email Lookup Pricing Comparison (riset 2026-08-06)

> Pertanyaan user: "solusi termurah untuk email/contact lookup (alternatif Apollo.io)?"

| Service | Harga | Credits/bulan | API? | Notes |
|---------|-------|---------------|------|-------|
| **Hunter.io Free** | **$0** | 50/bulan | ✅ | Satu-satunya free tier dengan API |
| **Tomba.io** | ~$44.50/5.000 credits | ~415/bulan (12 bln) | ✅ | Termurah per lookup, verification gratis |
| **Anymail Finder** | $29-49/bulan | 400-1.000 | ✅ | Termurah per bulan, credit rollover |
| **Snov.io** | $39/bulan | 1.000 | ✅ | Brand familiar |
| **Hunter.io Starter** | $49/bulan | 2.000 | ✅ | |
| **Prospeo** | $49/bulan | 2.000 | ✅ | Free tier 100/bln TANPA API |
| **Skrapp.io** | $349/bulan | 50.000 | ⚠️ API hanya Enterprise | Tidak cocok |
| **Apollo.io** | Mahal | - | ❌ **API hanya Custom plan** | Tidak murah |

### Rekomendasi (volume 100-500 lookup/bulan)
1. **$0**: Hunter.io Free — 50 lookup/bulan, cukup untuk testing
2. **Termurah per lookup**: Tomba.io — $44.50/5.000 credits, verification gratis
3. **Termurah per bulan**: Anymail Finder $29/bulan — 400 verified, credit rollover

**Keputusan sekarang**: Tetap pakai integrasi **Hunter.io** yang sudah ada di code (menunggu API key). Kalau mau pindah ke Tomba/Anymail, tinggal tambah service baru di `backend/src/services/`.

---

## 15. Cost Estimate (Cloudflare Free Tier)

| Service | Cost |
|---------|------|
| Cloudflare Workers | Free (100K req/day) |
| Cloudflare D1 | Free (5GB storage, 10M reads/day) |
| Cloudflare Pages | Free |
| Cloudflare Workers AI | Free (10K requests/day) |
| Hunter.io | Free tier (50 searches) or $49/mo |
| ManyReach | Pay-as-you-go credits |
| **Total Minimum** | **$0/mo** |
