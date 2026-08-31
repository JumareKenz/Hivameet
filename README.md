# Hivameet

An AI meeting assistant that joins Google Meet, Zoom, and Microsoft Teams calls,
transcribes and diarizes the discussion, and turns it into an executive summary,
key insights, action items, and reminders.

Self-hosted — no Vercel required.

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4 + shadcn/ui
- **Postgres** via Docker Compose, **Drizzle ORM**
- **Auth.js** (Google / Microsoft calendar OAuth, plus a dev-only demo login)
- **AI SDK** (`ai` + `@ai-sdk/anthropic`) for meeting intelligence extraction and "Ask AI about this meeting"
- Meeting-bot orchestration abstracted behind `src/lib/bot-provider.ts` (Recall.ai by default — swap providers there)

## Getting started

```bash
docker compose up -d        # starts Postgres on localhost:5433
cp .env.example .env.local  # then fill in secrets (see below)
npm install
npm run db:push             # push the Drizzle schema
npm run db:seed             # seed a demo user + sample meeting
npm run dev
```

Visit http://localhost:3000 and sign in — until real OAuth credentials are
set, use the "Continue as demo user" button (dev-only) to explore the app
against the seeded meeting.

## Environment variables

See `.env.example`. Notably:

- `DATABASE_URL` — Postgres connection string (docker-compose default included)
- `AUTH_SECRET` — generated automatically on first bootstrap of this repo
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` — calendar OAuth, required for real auto-join
- `ANTHROPIC_API_KEY` — powers meeting summarization, action-item extraction, and Ask AI
- `RECALL_API_KEY` / `RECALL_WEBHOOK_SECRET` — the headless bot provider that actually joins calls (see `src/lib/bot-provider.ts`); without it, "Join a meeting" records the request but the bot won't really join
- `DEEPGRAM_API_KEY` — reserved for a dedicated diarized-STT provider if you move off the bot provider's built-in transcription

## Project layout

- `src/app/(app)/` — authenticated app shell (dashboard, meeting detail, settings)
- `src/app/api/meetings/join` — dispatches the bot to an ad-hoc meeting link
- `src/app/api/bot-webhook` — receives bot status + live transcript events
- `src/lib/intelligence.ts` — LLM pass that turns a transcript into summary/insights/action items/reminders
- `src/db/schema.ts` — Drizzle schema (Auth.js tables + meetings/transcripts/insights/action items/reminders)

## Not yet wired up

- Calendar auto-join (Google/Outlook sync + scheduling) is scaffolded in Settings but the sync job itself isn't implemented
- Export destinations (Slack, Notion, Asana, Google Docs, Email) are stubbed in the UI
