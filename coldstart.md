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
| AI | Cloudflare Workers AI (built-in `AI` binding, model `@cf/meta/llama-3.2-3b-instruct`) | - |
| Email Lookup | Anymail Finder API (discovery + verify) | - |
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
│  - Anymail Finder│    │  - ManyReach         │
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
│       │   └── email-lookup.ts     # Anymail Finder integration
│       └── services/
│           ├── ai.ts               # Cloudflare Workers AI
│           ├── anymailfinder.ts    # Anymail Finder API client
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
| created_at | TEXT | `datetime('now')` default (real timestamp) |
| updated_at | TEXT | `datetime('now')` default (real timestamp) |

### contacts
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| campaign_id | INTEGER FK | References campaigns.id |
| name | TEXT | Contact name |
| website | TEXT | Company/personal website |
| social_url | TEXT | LinkedIn/X URL |
| email | TEXT | Found via Anymail Finder |
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
| confidence | INTEGER | Anymail Finder confidence score |
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
| POST | `/api/email-lookup/contact/:id` | Anymail Finder lookup |
| POST | `/api/email-lookup/bulk` | Bulk email lookup |
| POST | `/api/email-lookup/verify/:id` | Verify email (Reoon → Anymail → ManyReach) |
| POST | `/api/leads/scrape/:campaignId` | Outscraper scrape leads → contacts |
| GET | `/api/leads/jobs/:campaignId` | Scrape history |
| GET | `/api/analytics/overview` | Dashboard stats |
| GET | `/api/analytics/campaign/:id` | Campaign stats |
| POST | `/api/webhooks/manyreach` | Delivery webhook |

---

## 7. Deployment Info

### URLs
| Service | URL |
|---------|-----|
| Frontend (Pages) | https://gcr-outreach-frontend.pages.dev |
| Frontend (Custom) | https://reach.gcrindex.org *(AKTIF — DNS CNAME di Spaceship → Pages)* |
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
| ANYMAIL_API_KEY | Ter-set sebagai **secret** (email lookup + verify) | Cloudflare secret |
| MANYREACH_API_KEY | Ter-set sebagai **secret** (send + verify fallback) | Cloudflare secret |
| REOON_API_KEY | Ter-set sebagai **secret** (email verifier) | Cloudflare secret (2026-08-27) |
| OUTSCRAPER_API_KEY | Ter-set sebagai **secret** (lead scraping) | Cloudflare secret (2026-08-27) |

### Yang belum diisi (perlu user input)
| Key | Purpose | Where to get |
|-----|---------|--------------|
| ANYMAIL_API_KEY | Email lookup (discovery) + verify | https://anymailfinder.com (user punya akun, 100 free credits) |
| MANYREACH_API_KEY | Email outreach + verify (fallback) | https://manyreach.com (user sudah punya akun) |

### Cara isi via CLI (secrets)
```bash
cd "F:\GCR Outreach App\backend"
CLOUDFLARE_API_TOKEN=YOUR_CF_API_TOKEN \
CLOUDFLARE_ACCOUNT_ID=d5cb3e4213b6aa69dbc2feb1499af77a \
npx wrangler secret put ANYMAIL_API_KEY

npx wrangler secret put MANYREACH_API_KEY

npx wrangler secret put CF_AI_API_TOKEN
```
> Catatan: vars di wrangler.toml TIDAK boleh sama nama dengan secret. Secret wajib di-set
> via `npx wrangler secret put` (HUNTER_API_KEY sudah dihapus, tidak dipakai lagi).
> Untuk dev lokal, taruh di `backend/.dev.vars`.

### ⚠️ ManyReach API — fakta integrasi (diuji live 2026-08-18)
Key user **VALID** (org "Nell VH's Company", saldo credit **295.895**). Tapi kode lama SALAH di 3 hal:
1. **Base URL** — kode pakai `api.manyreach.com/v1` → benar: `api.manyreach.com/api/v2` (V2) / `api.manyreach.com/api` (V1). `/v1` balik 404.
2. **Auth** — kode pakai `Authorization: Bearer` → benar V2: header **`X-API-Key`**; V1 pakai query `?apikey=`.
3. **Model** — ManyReach adalah platform **drip-campaign** (campaign → prospect → sequence), BUKAN API "kirim 1 email sekali jalan". Tidak ada endpoint `POST /messages/send`.

**Model yang diimplementasikan sekarang** (`backend/src/services/manyreach.ts`):
- `createCampaign()` → 1 ManyReach campaign per GCR campaign (disimpan di `campaigns.manyreach_campaign_id`).
- `addProspect()` → tiap contact = 1 prospect (pitch personal di field `icebreaker`).
- `startCampaign()` → mulai sending (butuh sender terhubung di akun MR, else 422).
- `getCampaignStatus()` → `GET /api/v2/campaigns/{id}/stats`.
- `verifyEmails()` → `POST /api/v2/validation/emails` (verifikasi, fallback email-lookup).

**Penting — currency beda:** verifikasi email ManyReach makan **Data Tokens** (TERPISAH dari credit pengiriman). Saldo token user = **0** → verify via ManyReach balik `402 INSUFFICIENT_DATA_TOKENS`. Makanya verify **Anymail primary**, ManyReach fallback graceful.

**Next step user (send belum bisa test end-to-end):** ManyReach campaign butuh **sender/email terhubung & aktif** di dashboard MR sebelum `startCampaign` (else 422). User harus hubungkan sender di manyreach.com dulu.

### ℹ️ Hunter.io — DIHAPUS (2026-08-20)
Hunter.io tidak dipakai lagi. Akun user pernah **ter-restrict** (`429 restricted_account`) sehingga lookup mati.
Diganti penuh dengan **Anymail Finder** (discovery + verify, akun aktif, 100 free credits, signup via Gmail OK).
- `services/hunter.ts` jadi tombstone (tidak diimpor). `HUNTER_API_KEY` secret sudah di-`delete`.
- Semua jalur lookup/verify sekarang: Anymail Finder (primary) → ManyReach (fallback verify).
- Banyak catatan lama soal "Tomba/Anymail sebagai pengganti Hunter" di bawah sudah tidak relevan —
  Anymail resmi jadi pengganti dan sudah terintegrasi.

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

### Status (2026-08-20) — ✅ AKTIF
- Domain `reach.gcrindex.org` **LIVE** → HTTPS 200, serve frontend yang sama dengan `pages.dev`.
- DNS di **Spaceship** (registrar `gcrindex.org`): CNAME `reach` → `gcr-outreach-frontend.pages.dev`.
- Custom domain didaftarkan di Cloudflare Pages project (`gcr-outreach-frontend`) via Cloudflare API;
  TLS cert otomatis terbit dari Cloudflare setelah CNAME aktif.
- **Tidak perlu rebuild/deploy ulang frontend** — custom domain menyerahkan deployment Pages yang ada.
- CORS backend sudah mengizinkan `reach.gcrindex.org` (backend/src/index.ts).

### Cara kerja (CNAME di registrar eksternal = Spaceship, bukan Cloudflare)
1. Di panel DNS Spaceship untuk `gcrindex.org`, tambah:
   - Type: **CNAME**, Name: `reach`, Target: `gcr-outreach-frontend.pages.dev`, TTL: Auto.
2. Di Cloudflare Pages project `gcr-outreach-frontend` → daftarkan custom domain `reach.gcrindex.org`
   (provisioning TLS). Bisa lewat dashboard **Custom domains** atau Cloudflare API
   (`POST /accounts/{acct}/pages/projects/gcr-outreach-frontend/domains`).
3. Setelah CNAME propagate, Cloudflare verifikasi + terbitkan sertifikat; site langsung jalan.

### Catatan
- Frontend produksi hardcode panggil `https://gcr-outreach-api.emerilansel.workers.dev`
  (lihat `frontend/src/api/index.ts`, `import.meta.env.PROD`). API CORS allow `reach.gcrindex.org`.
- Kalau mau API juga pakai subdomain `gcrindex.org` (mis. `api.gcrindex.org`), perlu tambah
  custom domain di worker + ubah `API_URL` di frontend + redeploy frontend. Opsional.

---

## 10. Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Campaign CRUD | ✅ Done | Create, list, edit, delete |
| Contact Import (CSV) | ✅ Done | Papa Parse, header auto-detect |
| Contact Import (Manual) | ✅ Done | Form with validation |
| Email Lookup (Anymail Finder) | ✅ Done | Single + bulk, deployed |
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
- [x] Fix remote D1 schema: `manyreach_campaign_id` column missing (added migration `0002_add_manyreach_campaign_id.sql`, applied 2026-08-20)
- [x] Hapus `HUNTER_API_KEY` sepenuhnya (secret deleted, code di-remove, ganti Anymail Finder)
- [x] Set `ANYMAIL_API_KEY` sebagai **secret** (email lookup + verify)
- [x] Set `MANYREACH_API_KEY` sebagai **secret** (email send + verify fallback)
- [x] Test email lookup flow via Anymail (Patrick/Tony/Brian → email ditemukan, confidence 100)
- [ ] Test email send flow dengan ManyReach API key (butuh sender/email terhubung di dashboard MR)

### Bug fixes — sesi 2026-08-20
- [x] **DELETE campaign gagal (500)** kalau punya contact yg sudah di-enrich → FK `email_enrichments.contact_id` / `messages.contact_id` ke `contacts.id`. Route delete sekarang hapus urut: messages → email_enrichments → contacts → campaign (`backend/src/routes/campaigns.ts`).
- [x] **`created_at`/`updated_at` tersimpan sebagai string literal** `"(datetime('now'))"` (Drizzle `.default()` mengutipnya). Diubah ke `.default(sql\`(datetime('now'))\`)` di `backend/src/db/schema.ts` → sekarang simpan timestamp beneran (mis. `2026-08-20 09:23:42`). Teruji.
- [x] **Hunter dihapus total** — secret `HUNTER_API_KEY` di-delete, `services/hunter.ts` jadi tombstone, semua jalur lookup/verify pakai Anymail Finder (+ ManyReach fallback verify). `wrangler.toml` & Env bindings dibersihkan.
- [x] **Custom domain `reach.gcrindex.org` AKTIF** — CNAME di Spaceship → Pages, TLS Cloudflare otomatis (lihat section 9b).

### Future Enhancements
- [ ] Multi-user auth (Cloudflare Access atau custom)
- [ ] Auto-send via X API (butuh approval)
- [ ] Auto-send via LinkedIn API (sangat terbatas)
- [ ] Email drip sequences (automated follow-ups)
- [ ] A/B testing untuk message variants
- [ ] Webhook handler untuk real-time reply detection
- [ ] Chrome extension untuk LinkedIn outreach
- [x] Custom domain untuk frontend — **SELESAI** (`reach.gcrindex.org`, lihat section 9b)

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
| **Anymail Finder (free)** | **$0** | 100 credits | ✅ | Free tier, cuma charge kalau ketemu verified |
| **Tomba.io** | ~$44.50/5.000 credits | ~415/bulan (12 bln) | ✅ | Termurah per lookup, verification gratis |
| **Anymail Finder** | $29-49/bulan | 400-1.000 | ✅ | Termurah per bulan, credit rollover |
| **Snov.io** | $39/bulan | 1.000 | ✅ | Brand familiar |
| **Prospeo** | $49/bulan | 2.000 | ✅ | Free tier 100/bln TANPA API |
| **Skrapp.io** | $349/bulan | 50.000 | ⚠️ API hanya Enterprise | Tidak cocok |
| **Apollo.io** | Mahal | - | ❌ **API hanya Custom plan** | Tidak murah |

### Rekomendasi (volume 100-500 lookup/bulan)
1. **$0**: Anymail Finder — 100 free credits (cuma charge kalau ketemu verified)
2. **Termurah per bulan**: Anymail Finder $29/bulan — 400 verified, credit rollover
3. **Runner-up**: Snov.io ($30/1k), Apollo free (50/bulan, API gated paid)

**Keputusan final (2026-08-20):** Pakai **Anymail Finder** sebagai satu-satunya email-discovery +
verification (Hunter dihapus total, Tomba dibatalkan karena blokir Gmail-signup). Sending tetap ManyReach.

> **Update 2026-08-20 — Anymail Finder sebagai pengganti Hunter (DONE & DEPLOYED):**
> Akun Hunter user **pernah restricted**, jadi lookup via Hunter mati → **Hunter dihapus sepenuhnya**.
> **Tomba.io DIBATALKAN** — melarang registrasi pakai domain mail Google (gmail), akun user Gmail.
> Dipilih **Anymail Finder** (mengizinkan signup Gmail, no phone, pay-per-verified, $29/mo,
> 100 free credits). **SUDAH DIIMPLEMENTASI & TERUJI LIVE 2026-08-20:**
> - `backend/src/services/anymailfinder.ts` — `findPersonEmail` (POST /v5.1/find-email/person),
>   `findCompanyEmails` (POST /v5.1/find-email/company), `verifyEmail` (POST /v5.1/verify-email),
>   `getAccount` (GET /v5.1/account). Auth: `Authorization: Bearer`. Base `api.anymailfinder.com`.
> - `email-lookup.ts`: route `POST /contact/:id` + `/bulk` + `/contact/:id/anymail` pakai Anymail.
>   Verifikasi: Anymail primary → ManyReach fallback. `HUNTER_API_KEY` secret sudah di-delete.
> - `ANYMAIL_API_KEY` di-set sebagai **secret** Cloudflare + binding di `index.ts`.
> - Test end-to-end: lookup "Patrick Collison / stripe.com" → `patrick@stripe.com` (confidence 100),
>   "Tony Xu / doordash.com" → `tony@doordash.com`, "Brian Chesky / airbnb.com" → `brian.chesky@airbnb.com`. ✅
> - **Billing:** 1 credit cuma kalau ketemu email terverifikasi; not-found/invalid gratis.
> - **Catatan:** Anymail = *finder + verifier* (field `email_status`), BUKAN verifikasi SMTP terpisah.
>   Jalur verifikasi cadangan: ManyReach (butuh Data Token, saldo user 0 → graceful 402).

### 🆕 2026-08-27 — Outscraper (lead scraping) + Reoon (email verifier) DONE & DEPLOYED

Dua tool baru dari user diintegrasikan penuh, teruji live hari ini.

**1. Outscraper — Lead / business scraping (Google Maps search)**
- Service: `backend/src/services/outscraper.ts` — `searchMaps()` (sync) + `getJobResult()` (async poll) + `parseBusiness()`.
- Auth: header **`X-API-KEY`** (bukan query `?api_key=` — SDK current pakai header; terverifikasi live). Base `https://api.app.outscraper.com`.
- Endpoint: `GET /maps/search-v3`. Params: `query` (array), `organizationsPerQueryLimit` (= limit),
  `language`, `region`, `dropDuplicates`, `enrichment` (e.g. `["emails"]`), `async`.
- Response `data` bisa **flat array** (1 query) ATAU **array-of-arrays** (multi query) — parser tangani keduanya.
- Field confirmed (live): `name`, `website`, `phone`, `address`, `city`, `state`, `subtypes`, `rating`, `reviews`, `latitude/longitude`, `place_id`, `business_status`. Enrichment tambah `emails`.
- **Penting billing:** ~1 credit per row + ekstra untuk enrichment. Limit kecil saat testing.
- **Rekomendasi limit saat testing (2026-08-27):** pakai **1–3** (jangan 20+). Tanpa enrichment `limit:3` ≈ 3 kredit; DENGAN enrichment tiap email yang ketemu nambah kredit lagi. Default UI modal di-set **3** (masih bisa diubah manual sampai 100) biar aman saat klik "Scrape". Naikkan ke 10–20 hanya kalau sudah yakin hasilnya pas.
- Route: `backend/src/routes/leads.ts`
  - `POST /api/leads/scrape/:campaignId` → cari leads, map ke `contacts` (source=`scrape`, simpan phone/address/rating/reviews/place_id), dedupe by `placeId`, tulis history ke `outscraper_jobs`.
  - `GET /api/leads/jobs/:campaignId` → scrape history.
- Frontend: tombol **"Scrape Leads"** di CampaignDetailPage (modal: query, limit, checkbox enrich emails).

**2. Reoon Email Verifier — verifikasi SMTP**
- Service: `backend/src/services/reoon.ts` — `verifyEmail()`.
- Endpoint: `GET https://emailverifier.reoon.com/api/v1/verify`. Auth: query param **`key`** (BUKAN `api_key` — `api_key` ditolak, terverifikasi live). Params: `email`, `key`, `mode` (`power`|`quick`), `hard_validation`, `timeout`.
- Response: `status` (`deliverable`|`invalid`|`risky`|`unknown`), `is_deliverable`, `is_safe_to_send`, `overall_score` (0-100), `is_valid_syntax`, `mx_records`, `is_catch_all`. Error envelope: `{status:"error", reason:...}`.
- **Logika verifikasi:** `emailVerified=1` HANYA kalau `is_deliverable && is_safe_to_send`. `catch_all` (deliverable tapi safeToSend=false) → `verified:false` (tidak aman dikirim).
- Route: `POST /api/email-lookup/verify/:id` sekarang 3 provider, urutan: **Reoon → Anymail → ManyReach**. Bisa paksa `provider` via body.
- Frontend: tombol **"Verify"** (Reoon) muncul di tiap contact yang punya email, di tabel Contacts.

**Schema changes (migration `0003_outscraper_reoon.sql`, APPLIED live 2026-08-27):**
- `contacts`: + `source` (manual|csv|scrape), + `phone`, `address`, `rating`, `reviews`, `place_id`.
- `outscraper_jobs`: tabel baru (campaign_id, outscraper_job_id, query, status, result_limit, found, results).

**Secrets (Cloudflare Worker, di-set 2026-08-27):**
- `REOON_API_KEY` ✅ — `MOCxT0DcJz2u45L9TPJlUg4LFrjhaXCi`
- `OUTSCRAPER_API_KEY` ✅ — `NjM1OGZlNWRlZDBiNDMyNjkxYTU3NTA2YjYyOWYwOGZ8ZTJmOTg1YzM3NQ`
- (juga taruh di `backend/.dev.vars` untuk dev lokal, gitignored)
- Catatan `wrangler secret put` di v3.114 butuh flag `--name <worker>` (bukan `--account-id`).

**Live test results (2026-08-27):**
- Scrape "coffee shops jakarta" limit 3 → 3 contacts terimport (phone/address/rating/placeId tersimpan). ✅
- Reoon verify `team@stripe.com` → `status: catch_all, verified: false, confidence: 71, safeToSend: false`. ✅
- Reoon verify `test@gmail.com` (test awal) → `status: invalid`. ✅
- Deploy: Worker `gcr-outreach-api` (version terbaru) + Frontend Pages `reach.gcrindex.org` (HTTP 200). ✅

---

## 15. Cost Estimate (Cloudflare Free Tier)

| Service | Cost |
|---------|------|
| Cloudflare Workers | Free (100K req/day) |
| Cloudflare D1 | Free (5GB storage, 10M reads/day) |
| Cloudflare Pages | Free |
| Cloudflare Workers AI | Free (10K requests/day) |
| Anymail Finder | Free tier (100 credits) or $29/mo |
| ManyReach | Pay-as-you-go credits |
| **Total Minimum** | **$0/mo** |
