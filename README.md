# Hivameet

An AI meeting assistant that joins Google Meet, Zoom, and Microsoft Teams calls,
transcribes and diarizes the discussion, and turns it into an executive summary,
key insights, action items, and reminders. Part of the **Hiva** product family —
branded with the shared Hiva identity (forest green `#04402c` / gold `#be8c43`,
Inter typeface) and self-serve credit billing at ₦1,000/hour.

Self-hosted — no Vercel required. Live at **https://meet.hiva.chat**.

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4 + shadcn/ui, themed with the Hiva brand palette (`src/app/globals.css`)
- **Postgres** via Docker Compose, **Drizzle ORM**
- **Auth.js** (Google / Microsoft calendar OAuth, plus a dev-only demo login)
- **AI SDK** (`ai` + `@ai-sdk/anthropic`) for meeting intelligence extraction and "Ask AI about this meeting"
- Meeting-bot orchestration abstracted behind `src/lib/bot-provider.ts`, talking to a self-hosted **[Attendee](https://github.com/attendee-labs/attendee)** instance (open source, joins Zoom/Meet/Teams) — swap providers there if needed
- Self-serve credit billing (`src/lib/billing/`) — ₦1,000/hour, metered by the minute

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

## Branding

Assets and colors are sourced from the canonical Hiva design system (verified
against `services/ai/librechat/client/src/style.css` and the super_admin
frontend's `tailwind.config.js` on this box, not invented):

- Logo/icon/favicon set copied into `public/brand/` from `/opt/hiva/services/ai/librechat/client/public/assets/`
- Brand ramp defined in `src/app/globals.css`'s `@theme inline` block: `brand-*` (forest green, `#04402c` primary) and `gold-*` (`#be8c43` accent)
- Light mode primary = brand green, dark mode primary = gold, sidebar is a permanent dark-green brand rail in both — matching the convention in Hiva's other products
- Font is Inter (`next/font/google`), matching every other Hiva frontend

## Production deployment (meet.hiva.chat)

Runs as a systemd service, reverse-proxied by the same nginx already serving
the rest of `hiva.chat`:

- **`/etc/systemd/system/hivameet.service`** — `next start -p 3200`, `NODE_ENV=production`, `Restart=always`, enabled on boot. Logs: `journalctl -u hivameet -f`
- **`/etc/nginx/sites-available/meet.hiva.chat.conf`** — Cloudflare Flexible pattern (plain HTTP origin on port 80, CF terminates TLS), same as `super-admin.hiva.chat.conf`. `proxy_buffering off` so the Ask-AI SSE stream isn't held back.
- **`.env.production.local`** — overrides `AUTH_URL`/`APP_BASE_URL` to `https://meet.hiva.chat` for the production instance only; everything else (secrets, `DATABASE_URL`) still comes from `.env.local`
- DNS for `meet.hiva.chat` was already provisioned on Cloudflare (proxied) before this deploy — no DNS changes were needed, only the origin-side nginx config

To deploy a change: `npm run build && systemctl restart hivameet`.

**Still needed before it's actually usable in production**: real
`AUTH_GOOGLE_ID`/`AUTH_MICROSOFT_ENTRA_ID_ID` OAuth credentials (with
`https://meet.hiva.chat/api/auth/callback/{google,microsoft-entra-id}`
registered as the redirect URI), `ANTHROPIC_API_KEY`, and a running Attendee
instance — none are configured yet, and the dev-only demo login is correctly
disabled in production, so nobody can sign in until at least one OAuth
provider is set.

## Self-serve credits

₦1,000 buys one hour of meeting time (`src/lib/billing/pricing.ts`), charged
by the minute when a meeting actually completes (`chargeForMeeting`, called
from the bot webhook's `meeting_ended` event). New accounts get a free
1-hour signup bonus (`auth.ts`'s `events.createUser`). Auto-join and manual
"Join a meeting" both refuse to dispatch the bot below a 5-minute balance
floor.

Checkout is wired to **Paystack** (`src/lib/billing/paystack.ts`), following
the same pattern already used elsewhere on this box for the Hiva platform's
credit ledger (`chatbot_platform`'s `payment_client.py`/`billing.py`): a
hosted Initialize Transaction checkout, and crediting only happens from
`POST /api/billing/webhooks/paystack` after verifying Paystack's
`x-paystack-signature` (HMAC-SHA512) — never from the checkout request
itself. Only the fixed `CREDIT_PACKAGES` prices can be purchased, and the
webhook dedupes by Paystack's transaction `reference` so a retried webhook
delivery can't double-credit.

**Not yet live**: `PAYSTACK_SECRET_KEY` isn't set, so checkout currently
returns a clear "not configured" error rather than pretending to charge.
Get a key from the Paystack dashboard (Settings → API Keys & Webhooks),
register `{APP_BASE_URL}/api/billing/webhooks/paystack` as a webhook there
(the `charge.success` event), and set `PAYSTACK_SECRET_KEY` in `.env.local`.
Deliberately did not reuse the `PAYSTACK_SECRET_KEY` already configured for
the other Hiva products on this box (`/opt/hiva/.env`) — mixing Hivameet's
transactions into that account without asking felt like the wrong call to
make unilaterally; get a dedicated key or confirm sharing that one first.

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
- `PAYSTACK_SECRET_KEY` isn't set yet, so real credit purchases aren't live (see Self-serve credits above)
- No real OAuth/Anthropic/Attendee credentials are configured in production yet (see Production deployment above)
