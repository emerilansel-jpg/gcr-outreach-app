# Coldstart — GCR Outreach App

> Dokumen ini berisi konteks lengkap project untuk referensi cepat.
> Dibuat: 2026-08-03 | Terakhir update: 2026-09-15

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
| AI | Cloudflare Workers AI (built-in `AI` binding, model `@cf/meta/llama-3.2-3b-instruct`) | - |
| Email Lookup / Discovery | **Outscraper** (domain-based, enrichment "emails-and-contacts") — primary; Anymail Finder optional fallback | - |
| Email Verification | **Reoon** (primary) + **ManyReach** (fallback, consumes Data Tokens) | - |
| Email Outreach (Send) | ManyReach API | - |
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
│                           │  - /api/leads           │ │
│                           └───────────┬────────────┘ │
│                                       │               │
│                          ┌────────────┴────────────┐  │
│                          │   Cloudflare D1 (SQLite) │  │
│                          │   - campaigns            │  │
│                          │   - contacts             │  │
│                          │   - messages             │  │
│                          │   - email_enrichments    │  │
│                          │   - outscraper_jobs      │  │
│                          └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**External APIs (called from Worker):**
- `emailverifier.reoon.com/api/v1/verify` — Reoon verification
- `api.app.outscraper.com` — Outscraper (Google Maps scrape + emails-and-contacts enrichment)
- `api.manyreach.com/api/v2` — ManyReach (send + verifyEmails)

---

## 4. Key Files

```
backend/
├── src/
│   ├── index.ts              # Hono app + route mounting
│   ├── routes/
│   │   ├── campaigns.ts      # CRUD + DELETE cascade (messages → email_enrichments → contacts → campaign)
│   │   ├── contacts.ts       # CRUD + bulk + kanban (GET /kanban/:campaignId, PUT /:id/kanban)
│   │   ├── messages.ts       # generate, generate-all, send (ManyReach), bulk-send
│   │   ├── analytics.ts      # overview + per-campaign stats
│   │   ├── email-lookup.ts   # contact/:id (Outscraper primary + Anymail fallback), /anymail, /bulk, /verify/:id
│   │   └── leads.ts          # Outscraper Google Maps scrape (async + poll), /jobs/:campaignId
│   ├── services/
│   │   ├── ai.ts             # generatePersonalizedPitch (Workers AI binding + REST fallback)
│   │   ├── outscraper.ts     # searchMaps, getJobResult, findEmailsByDomain (emails-and-contacts)
│   │   ├── reoon.ts          # verifyEmail
│   │   ├── manyreach.ts      # createCampaign, addProspect, startCampaign, verifyEmails
│   │   ├── anymailfinder.ts  # findPersonEmail, findCompanyEmails, verifyEmail (fallback)
│   │   └── hunter.ts         # TOMBSTONE (removed, kept for reference)
│   └── db/
│       ├── schema.ts         # Drizzle tables (timestamps use sql`(datetime('now'))`)
│       └── index.ts          # D1 client + migrations runner
├── wrangler.toml             # Cloudflare Worker config (vars + D1 + AI binding)
├── .dev.vars                 # Local dev secrets (gitignored)
└── package.json

frontend/
├── src/
│   ├── api/index.ts          # Typed API client (campaigns, contacts, messages, email-lookup, leads, analytics)
│   ├── pages/
│   │   ├── CampaignsPage.tsx # List + create campaign
│   │   └── CampaignDetailPage.tsx # Contacts table + Kanban + actions (Find Email, Verify, Generate Pitch, Scrape, Send)
│   └── ...
├── wrangler.toml             # Cloudflare Pages config
└── package.json
```

---

## 5. Database Schema (Drizzle)

```sql
-- campaigns
id, name, mission_context, tone, target_audience,
manyreach_campaign_id, created_at, updated_at

-- contacts
id, campaign_id, name, website, social_url, email,
email_verified, company, title, status, kanban_stage,
notes, phone, address, rating, reviews, place_id,
source (manual|csv|scrape), created_at, updated_at

-- messages
id, contact_id, campaign_id, channel, subject, body,
status (draft|sent|opened|replied|bounced), sent_at,
opened_at, replied_at, manyreach_id, created_at

-- email_enrichments
id, contact_id, email, confidence, sources (JSON),
verified_at, created_at

-- outscraper_jobs
id, campaign_id, query, limit, enrichment, job_id,
status (pending|success|failed), result_url, leads_count,
created_at, completed_at
```

---

## 6. API Routes (mounted under `/api`)

| Route | Method | Description |
|-------|--------|-------------|
| `/campaigns` | GET | List campaigns |
| `/campaigns` | POST | Create campaign |
| `/campaigns/:id` | GET | Single campaign |
| `/campaigns/:id` | PUT | Update campaign |
| `/campaigns/:id` | DELETE | Cascade delete (messages → enrichments → contacts → campaign) |
| `/contacts/campaign/:campaignId` | GET | All contacts for campaign |
| `/contacts/kanban/:campaignId` | GET | Kanban board grouped by stage |
| `/contacts` | POST | Create contact |
| `/contacts/bulk/:campaignId` | POST | Bulk add contacts |
| `/contacts/:id` | GET | Single contact |
| `/contacts/:id` | PUT | Update contact |
| `/contacts/:id/kanban` | PUT | Move kanban stage |
| `/contacts/:id` | DELETE | Delete contact |
| `/messages/generate/:contactId` | POST | Generate pitch (AI) |
| `/messages/generate-all/:campaignId` | POST | Bulk generate |
| `/messages/send/:id` | POST | Send via ManyReach |
| `/messages/bulk-send` | POST | Bulk send |
| `/analytics/overview` | GET | Global stats |
| `/analytics/campaign/:id` | GET | Campaign stats |
| `/email-lookup/contact/:id` | POST | **Find Email** — Outscraper domain-based (primary) + Anymail fallback |
| `/email-lookup/contact/:id/anymail` | POST | Explicit Anymail-only lookup |
| `/email-lookup/bulk` | POST | Bulk find email |
| `/email-lookup/verify/:id` | POST | Verify email — provider: `reoon` \| `manyreach` \| `anymail` |
| `/leads/scrape/:campaignId` | POST | Scrape leads (Outscraper Google Maps) |
| `/leads/jobs/:campaignId` | GET | List scrape jobs |

---

## 7. Provider Behavior & Secrets (Worker env)

| Secret | Required | Purpose |
|--------|----------|---------|
| `REOON_API_KEY` | **Yes** | Primary email verifier (best accuracy) |
| `OUTSCRAPER_API_KEY` | **Yes** | Find Email (domain-based) + Scrape Leads (Google Maps) |
| `MANYREACH_API_KEY` | **Yes** | Send emails + verifyEmails fallback (Data Tokens) |
| `ANYMAIL_API_KEY` | No | Optional fallback for Find Email + verify |
| `CF_AI_API_TOKEN` | No | Fallback REST call to Workers AI (not used when binding present) |
| `ACCOUNT_ID` | Yes (var) | Workers AI account ID for REST fallback |

**Current status (2026-08-28):**
- ✅ `REOON_API_KEY` — set, active, returns `verified/safeToSend` (if account enables verification; free tier may return `disabled`)
- ✅ `OUTSCRAPER_API_KEY` — set, active; Find Email works (emails-and-contacts async job); Scrape Leads works
- ✅ `MANYREACH_API_KEY` — set, active; Org: "Nell VH's Company"; **0 Data Tokens** → verifyEmails returns `INSUFFICIENT_DATA_TOKENS`; send works
- ⚠️ `ANYMAIL_API_KEY` — **not set** (user chose to leave off until notification checked)

---

## 8. Email Flow Summary

### Find Email (tombol "Find Email")
1. Ambil `website` kontak → ekstrak domain.
2. **Outscraper** `emails-and-contacts` scraper (async, polling sampai `Success`).
3. Kalau nemu email → simpan ke `email_enrichments` + update `contacts.email`.
4. Kalau **tidak nemu** DAN `ANYMAIL_API_KEY` ada → fallback ke Anymail Finder.
5. Kalau tetap tidak nemu → `404 "No email found"`.

### Verify Email (tombol "Verify (Reoon)" / "(ManyReach)")
1. Pilih provider via UI (Reoon / ManyReach).
2. Reoon: kalau `verified && safeToSend` → mark `emailVerified=1`.
3. ManyReach: kalau token 0 → `INSUFFICIENT_DATA_TOKENS` (graceful error).
4. Anymail (fallback): hanya kalau paksa provider `anymail` + key ada.

### Send Email (tombol "Send")
1. Pastikan `manyreachCampaignId` (auto-create kalau belum).
2. `addProspect` ke ManyReach campaign → dapat `prospectId`.
3. Update message status `sent`, `manyreachId`, contact kanban → `follow_up_1`.

---

## 9. Deployment

### Backend (Cloudflare Worker)
```bash
cd backend
# Set secrets (one-time)
wrangler secret put REOON_API_KEY
wrangler secret put OUTSCRAPER_API_KEY
wrangler secret put MANYREACH_API_KEY
# optional
wrangler secret put ANYMAIL_API_KEY
wrangler secret put CF_AI_API_TOKEN

# Deploy
wrangler deploy
```

### Frontend (Cloudflare Pages)
```bash
cd frontend
npm run build
wrangler pages deploy dist --project-name gcr-outreach-frontend
```

**Custom domain:** `reach.gcrindex.org` → CNAME ke `gcr-outreach-frontend.pages.dev` (Spaceship DNS), TLS Cloudflare otomatis.

---

## 10. Catatan Pembaruan & Status Pengerjaan

### Selesai (Update 2026-09-09)
1. **Peningkatan Filter Scrape Leads:**
   - Menambahkan kotak pilihan **Region / Negara Tujuan** dengan daftar preset (Indonesia, Singapura, Malaysia, US, UK, Australia, Jerman, Belanda, Jepang) dan opsi **"Other"** untuk memasukkan kode/nama wilayah sendiri secara manual.
   - Menambahkan pilihan bahasa pencarian (Inggris, Indonesia, Spanyol, Prancis, Jerman, Jepang).
   - Mengubah limit default menjadi 20 bisnis dan otomatis mencari email bisnis.

2. **Perbaikan Generator Pesan AI (AI Pitch):**
   - Memperbaiki instruksi AI agar pesan ditulis **dari pihak GCR Index ditujukan kepada prospek**, bukan berpura-pura menjadi karyawan/staf dari perusahaan yang di-scrape.
   - Menghilangkan kalimat canggung/meta seperti *"kami mengakui staf Anda"*.

3. **Perbaikan Tab Messages:**
   - Memperbaiki jalur komunikasi data (`GET /api/messages/campaign/:id`) agar semua pesan pitch yang sudah dibuat oleh AI bisa langsung tampil rapi di tab **Messages**.
   - Menambahkan fitur auto-refresh saat pesan baru selesai digenerate.

4. **Update Integrasi ManyReach:**
   - Memasang API Key ManyReach terbaru (`64d7a8eb...`) ke server Cloudflare.
   - Menguji alur penambahan kontak (prospect) ke campaign ManyReach (berhasil terhubung).
   - Menghapus tombol verifikasi ManyReach dari tampilan agar tidak membingungkan, dan memusatkan verifikasi email sepenuhnya ke **Reoon**.
   - *Catatan teknis:* Untuk pengiriman email massal aktual via ManyReach, akun pengirim (sender email) di dashboard ManyReach perlu di-reconnect terlebih dahulu.

### Selesai (Sesi Sebelumnya 2026-08-28)
- [x] Perbaikan pembuatan campaign (redeploy API).
- [x] Pembangunan endpoint kontak lengkap (tambah, edit, hapus, import CSV, dan board Kanban).
- [x] Peralihan model AI ke `@cf/meta/llama-3.2-3b-instruct` menggunakan Cloudflare Workers AI Binding.
- [x] Fitur pencarian email otomatis via Outscraper.
- [x] Verifikasi email akurat via Reoon API.
- [x] Pemasangan custom domain `reach.gcrindex.org`.

### Rencana Selanjutnya
- [ ] Menghubungkan ulang (reconnect) akun email pengirim di dashboard ManyReach agar siap kirim email.
- [ ] Pengiriman pesan otomatis via LinkedIn / Twitter/X (opsional).
- [ ] Sistem follow-up email bertahap otomatis (drip sequence).
- [ ] Webhook untuk mendeteksi balasan email secara otomatis ke board Kanban.

---

## 11. Quick Commands

```bash
# Backend typecheck + deploy
cd backend && npx tsc --noEmit && npx wrangler deploy

# Frontend build + deploy
cd frontend && npm run build && npx wrangler pages deploy dist --project-name gcr-outreach-frontend

# View worker logs
cd backend && npx wrangler tail

# Run migrations (auto on deploy; manual if needed)
cd backend && npx wrangler d1 migrations apply gcr-outreach-db --remote

# Check D1 data
cd backend && npx wrangler d1 execute gcr-outreach-db --remote --command="SELECT * FROM campaigns"
```

---

## 12. Important Notes

- **AI binding** (`env.AI`) di `wrangler.toml` → tidak perlu `CF_AI_API_TOKEN` untuk jalan normal. REST fallback hanya dipakai kalau binding gagal/absent.
- **Outscraper emails-and-contacts** selalu **async** (job + polling). Timeout default 60s, polling 3s.
- **ManyReach verifyEmails** pakai **Data Tokens** (bukan sending credits). 0 token = `INSUFFICIENT_DATA_TOKENS`.
- **Reoon** free tier bisa balik `status: "disabled"` — bukan error, artinya akun belum enable verifikasi.
- **Timestamps** di D1 disimpan sebagai ISO string via `sql\`(datetime('now'))\`` (bukan string literal).
- **FK cascade** di `DELETE /campaigns/:id` sekarang urut benar: messages → email_enrichments → contacts → campaign.

---

## 13. Environment Variables (Frontend)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` (prod) | `https://gcr-outreach-api.emerilansel.workers.dev/api` |
| `VITE_API_URL` (dev) | `/api` (via Vite proxy) |

---

*Generated & maintained by ZCode. Update whenever secrets, schema, or provider logic changes.*
---

## 2026-09-15 — Repository Audit & UX/Bug Analysis (PM Mode)
- **Status:** COMPLETED
- **Files touched:** `C:/Users/Noiro/Documents/Project Github Emeril/gcr-outreach-app/` (cloned), `coldstart/coldstart.md`
- **Decisions:** 
  - Clone target: `https://github.com/emerilansel-jpg/gcr-outreach-app.git` into subfolder `gcr-outreach-app`
  - Scoring: 6.2/10
  - Identified 7 backend/logic bugs (Kanban stage mismatch, broken analytics SQL, FK cascade deletes, prompt missing company, ManyReach icebreaker template missing)
  - Identified 7 UX improvements (Bulk action buttons, search/filter/pagination, contact edit/delete, subject editing, responsive sidebar)
- **Next:** Implement Phase 1 bug fixes, followed by Phase 2 UX enhancements.

---

## 2026-09-15 — Implementation Improvement Execution (PM Mode)
- **Status:** COMPLETED
- **Files touched:**
  - `backend/src/routes/contacts.ts`: Fixed KANBAN_STAGES sync (`todo`, `follow_up_1`, `follow_up_2`, `follow_up_3`, `closed`), added cascade delete (messages + email enrichments).
  - `backend/src/routes/analytics.ts`: Fixed SQL queries in `GET /campaign/:id` to filter by message status (`sent`, `opened`, `replied`), and `GET /kanban/:campaignId` to filter by stage.
  - `backend/src/routes/campaigns.ts`: Added cascade delete for `outscraper_jobs` table on campaign deletion.
  - `backend/src/routes/leads.ts`: Fixed `skipped` counter increment during duplicate placeId detection.
  - `backend/src/services/ai.ts`: Fixed prompt formatting to properly include `Company: ${contact.company}` and `Current Role/Position: ${contact.title}`.
  - `backend/src/services/manyreach.ts`: Fixed campaign template body to use `{icebreaker}` for personalized pitch delivery.
  - `frontend/src/pages/CampaignDetailPage.tsx`: Added Bulk Find Emails button, Bulk Send Drafts button, search & filter toolbar (by text, stage, email status), table pagination, Edit Contact modal, Delete Contact action, and subject line editing in MessagesTab.
  - `frontend/src/pages/KanbanPage.tsx`: Converted campaign switching to SPA searchParams (no full page reload) with safe fallback to `campaigns[0].id`.
  - `frontend/src/components/Layout.tsx`: Added responsive mobile header, toggle hamburger drawer, and backdrop overlay for screens < 768px.
- **Decisions:** Implemented minimal, non-breaking diffs conforming to existing patterns and types.
- **Next:** User test / deploy to Cloudflare when ready.

---

## 2026-09-15 — Cloudflare Deployment (PM Mode)
- **Status:** COMPLETED
- **Token used:** `cfut_***` (Account: `d5cb3e4213b6aa69dbc2feb1499af77a` / emerilansel@gmail.com)
- **Backend Worker Deploy:** `https://gcr-outreach-api.emerilansel.workers.dev` (vID: `aea0ec1c-a71b-49e0-b573-6dc560d4966d`)
- **Frontend Pages Deploy:** `https://gcr-outreach-frontend.pages.dev` / `https://reach.gcrindex.org` (deploy preview: `https://064f3f9c.gcr-outreach-frontend.pages.dev`)
- **Verification:** Worker health check 200 OK, Pages index 200 OK.

---

## 2026-09-16 — UX & Codebase Audit + Improvement Plan (PM Mode)
- **Status:** COMPLETED
- **Branch:** `main` synced with `origin/main` (commit `3b3e692`); previous local work preserved in `backup-local-work`.
- **UX Audit Score:** 6.8 / 10
- **Critical Bugs Identified:**
  1. Inverted Pitch logic on KanbanCard (`!contact.email` blocks pitching verified emails).
  2. Broken drag-and-drop to empty Kanban columns (missing `useDroppable`).
  3. ManyReach campaign never starts (`startCampaign` never invoked after prospect addition).
  4. Worker timeout on `generate-all/:campaignId` (sequential LLM calls exceed 30s Worker limit).
  5. ManyReach webhook handler is a no-op stub (delivery, open, reply events not tracked).
  6. Broken analytics query for `withEmail` (`isNotNull` check omitted, dropped from payload).
  7. Outscraper scrape drops async responses without polling `getJobResult`.
- **UX Improvements Identified:**
  1. Multi-row checkbox selection for table actions (generate, find emails, delete).
  2. Company website & phone clickability in contact rows.
  3. Modal scrollability & mobile keyboard overflow protection (`max-h-[90vh] overflow-y-auto`).
  4. Search & status filtering inside Messages tab.
  5. Campaign editing capability (metadata update without recreate).
  6. Campaign-level drill-down in Analytics dashboard.
- **Roadmap:** Phase 1 (Bugfixes & DND stability), Phase 2 (Multi-select bulk UX & Messages tab filters), Phase 3 (Webhooks & async jobs).

---

## 2026-09-16 — Implementation Execution (PM Mode)
- **Status:** COMPLETED
- **Files touched:**
  - `frontend/src/pages/KanbanPage.tsx`: Removed inverted `!contact.email` check on pitch button; added `useDroppable` to `KanbanColumn` for empty column drop support; added safe campaign parameter syncing with `useEffect`.
  - `backend/src/routes/analytics.ts`: Fixed `withEmail` query condition (`isNotNull` and `ne("")`); included `withEmail` in `/campaign/:id` response.
  - `backend/src/services/manyreach.ts` & `backend/src/routes/messages.ts`: Added `startCampaign` invocation when messages are queued so ManyReach campaigns activate; added `POST /api/messages/bulk-generate` for server-side batching of selected contact IDs.
  - `backend/src/services/outscraper.ts` & `backend/src/routes/leads.ts`: Added automatic async job polling fallback (`getJobResult`) when Outscraper queues sync scrape requests.
  - `backend/src/routes/contacts.ts`: Added `POST /api/contacts/bulk-delete` with child cascade cleanup.
  - `frontend/src/api/index.ts`: Added `bulkGeneratePitches` and `bulkDeleteContacts`.
  - `frontend/src/pages/CampaignDetailPage.tsx`: Added multi-row checkbox selection with floating action bar (generate pitches, find emails, delete); added campaign summary metrics strip (5 cards); added Edit Campaign modal; added company website link with external icon and phone display in table; added modal scroll guards (`max-h-[90vh] overflow-y-auto`); added search & status filter toolbar in Messages tab with character counter.
  - `backend/src/index.ts`: Implemented ManyReach webhook handler (`POST /api/webhooks/manyreach`) updating message timestamps and advancing contact stages.
- **Verification:** Both backend (`npx tsc --noEmit`) and frontend (`npm run build`) passed with zero errors.
