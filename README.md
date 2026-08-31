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
- Meeting-bot orchestration abstracted behind `src/lib/bot-provider.ts`, talking to a self-hosted **[Attendee](https://github.com/attendee-labs/attendee)** instance (open source, joins Zoom/Meet/Teams) — swap providers there if needed

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
- `ATTENDEE_BASE_URL` / `ATTENDEE_API_KEY` / `ATTENDEE_WEBHOOK_SECRET` — the self-hosted bot provider that actually joins calls (see below); without it, "Join a meeting" records the request but the bot won't really join

## Self-hosting the meeting bot (Attendee)

The bot that actually joins calls — [Attendee](https://github.com/attendee-labs/attendee) — is a
separate service you run alongside Hivameet, not a dependency inside this repo.
It's a Django app with its own Postgres + Redis, self-contained in one Docker
image.

```bash
git clone https://github.com/attendee-labs/attendee.git ../attendee
cd ../attendee
docker compose -f dev.docker-compose.yaml build   # ~5 min
docker compose -f dev.docker-compose.yaml run --rm attendee-app-local python init_env.py > .env
docker compose -f dev.docker-compose.yaml up
# in another terminal, once it's up:
docker compose -f dev.docker-compose.yaml exec attendee-app-local python manage.py migrate
```

Then, at http://localhost:8000: create an account, confirm it (the link is
printed to the `docker compose up` logs), and generate an API key from the
sidebar. Put that key in Hivameet's `.env.local` as `ATTENDEE_API_KEY`
(`ATTENDEE_BASE_URL` already defaults to `http://localhost:8000`).

Two more things need to be configured **inside Attendee's own Settings UI**,
not Hivameet's:
- **Zoom OAuth credentials** (client id/secret from a Zoom Marketplace app) — required to join Zoom meetings specifically
- **A Deepgram API key** — required for transcription on all platforms

Register a webhook (Settings → Webhooks in Attendee's UI, or per-bot — see
`src/lib/bot-provider.ts`) pointing at `{APP_BASE_URL}/api/bot-webhook` with
the `bot.state_change` and `transcript.update` triggers, and copy its secret
into `ATTENDEE_WEBHOOK_SECRET`.

Note: Attendee's default Celery-based bot launcher is fine for local dev, but
their docs call out that bots get killed on container restart and can share
audio devices under load — for real production use they recommend
`LAUNCH_BOT_METHOD=kubernetes`. The webhook payload shapes in
`src/app/api/bot-webhook/route.ts` are sourced from Attendee's own
`bots/models.py` state/event enums as of this writing — worth a quick diff
against their current source if events stop matching after an Attendee
upgrade.

## Calendar auto-join

`src/lib/calendar/` polls Google Calendar / Microsoft Graph once a minute for
every user with auto-join enabled, and dispatches the bot ~1 minute before a
meeting starts (matching the product spec). It runs in-process via
`src/instrumentation.ts`, which starts a `setInterval` when the Next.js server
boots — no external cron or sidecar needed for a normal self-hosted single
instance. Set `DISABLE_CALENDAR_SYNC=true` if you'd rather drive it from an
external scheduler hitting `POST /api/calendar/sync` instead (e.g. running
multiple instances).

How it decides what to join:
- Pulls events in the next ~6 minutes from each connected calendar (Google needs `AUTH_GOOGLE_ID`/`_SECRET`, Microsoft needs `AUTH_MICROSOFT_ENTRA_ID_ID`/`_SECRET` — both already requested with calendar read scopes at login)
- Extracts a Zoom/Meet/Teams link from the event's conferencing data, location, or description
- Filters by the join rule in Settings (`everything` / `hosted_by_me` / `internal_only` / `manual_only`)
- Dedupes on `(userId, calendarEventId)` so retried/overlapping ticks can't double-dispatch
- Still dispatches up to 5 minutes late (in case the process was down), never earlier than ~1 minute before start

Settings → Calendar connections shows whether Google/Microsoft is actually
connected (auto-join is a no-op without one) and has a "Sync now" button
that calls the same logic on demand for testing.

**Untested**: there's no real Google/Microsoft OAuth app configured in this
environment, so this has been verified for correctness against the Calendar
v3 / Graph API docs and by exercising the "no calendar connected" path
end-to-end — not against a live calendar with a meeting actually starting.

## Project layout

- `src/app/(app)/` — authenticated app shell (dashboard, meeting detail, settings)
- `src/app/api/meetings/join` — dispatches the bot to an ad-hoc meeting link
- `src/app/api/bot-webhook` — receives bot status + live transcript events from Attendee
- `src/app/api/calendar/sync` — manual trigger for one user's calendar sync
- `src/lib/calendar/` — Google/Microsoft calendar polling, token refresh, and the auto-join sync job
- `src/instrumentation.ts` — starts the in-process calendar sync scheduler on server boot
- `src/lib/intelligence.ts` — LLM pass that turns a transcript into summary/insights/action items/reminders
- `src/db/schema.ts` — Drizzle schema (Auth.js tables + meetings/transcripts/insights/action items/reminders)

## Not yet wired up

- Export destinations (Slack, Notion, Asana, Google Docs, Email) are stubbed in the UI
- The Attendee webhook payload/event handling is written against its documented shape but hasn't been exercised against a live Attendee instance yet
