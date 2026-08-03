# GCR Outreach App

Full-stack outreach app for GCR campaigns, hosted on Cloudflare.

## Features

- **Campaign Management** — Create campaigns with mission context, tone, and target audience
- **Contact Import** — CSV upload or manual add; bulk import supported
- **Email Lookup** — Hunter.io integration to find professional emails
- **AI Personalization** — Cloudflare Workers AI (Llama 3.1) generates personalized pitches
- **Email Outreach** — ManyReach API integration for cold email sending
- **Kanban Board** — Drag & drop contact management across follow-up stages
- **Analytics Dashboard** — Open rate, reply rate, conversion funnel

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| Backend | Hono (Cloudflare Workers) |
| Database | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM |
| AI | Cloudflare Workers AI (Llama 3.1) |
| Email Lookup | Hunter.io |
| Email Outreach | ManyReach |
| UI | @dnd-kit (drag & drop), Recharts (charts) |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Edit `backend/wrangler.toml`:

```toml
[vars]
HUNTER_API_KEY = "your-hunter-api-key"
MANYREACH_API_KEY = "your-manyreach-api-key"
CF_AI_API_TOKEN = "your-cloudflare-ai-api-token"
```

### 3. Create D1 Database

```bash
cd backend
npx wrangler d1 create gcr-outreach-db
```

Update the `database_id` in `wrangler.toml` with the output.

### 4. Run Migrations

```bash
npx wrangler d1 migrations apply gcr-outreach-db --local
```

### 5. Start Development

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open http://localhost:5173

## Project Structure

```
gcr-outreach-app/
├── frontend/           # React + Vite SPA
│   ├── src/
│   │   ├── api/        # API client
│   │   ├── components/ # Layout
│   │   ├── pages/      # Dashboard, Campaigns, Kanban, Analytics
│   │   └── lib/        # Utilities
├── backend/            # Hono API on Cloudflare Workers
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── services/   # AI, Hunter.io, ManyReach
│   │   └── db/         # Schema & migrations
```

## Deployment

### Backend (Cloudflare Workers)

```bash
cd backend
npx wrangler d1 migrations apply gcr-outreach-db --remote
npx wrangler deploy
```

### Frontend (Cloudflare Pages)

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name gcr-outreach-frontend
```

## Kanban Stages

1. **To Do** — New contacts, not yet contacted
2. **Follow Up 1** — First outreach sent
3. **Follow Up 2** — Second follow-up
4. **Follow Up 3** — Third follow-up
5. **Closed** — Replied, meeting booked, or deal closed
