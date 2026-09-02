// Thin abstraction over the meeting-bot provider (the headless participant
// that joins Zoom/Meet/Teams, records, and streams us transcript/webhook
// events).
//
// Provider: Attendee (https://github.com/attendee-labs/attendee) — open
// source, self-hostable Django app (Docker + Postgres + Redis). Run it as
// its own service (see README) and point ATTENDEE_BASE_URL at it; Hivameet
// only talks to its REST API, same as it would talk to a hosted vendor.
// API reference verified against the project's README/source as of writing:
// POST {base}/api/v1/bots to join, X-Webhook-Signature (HMAC-SHA256, base64
// secret) on inbound webhooks. Swap this file for another provider by
// implementing the same shape.

export class BotProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "No meeting-bot provider is configured. Set ATTENDEE_BASE_URL and " +
        "ATTENDEE_API_KEY in .env.local to let the bot actually join calls " +
        "(see README for self-hosting Attendee)."
    );
    this.name = "BotProviderNotConfiguredError";
  }
}

interface DispatchBotParams {
  meetingUrl: string;
  botDisplayName: string;
  webhookUrl: string;
}

interface DispatchBotResult {
  providerSessionId: string;
}

export function detectPlatform(url: string): "google_meet" | "zoom" | "ms_teams" | "unknown" {
  if (/meet\.google\.com/.test(url)) return "google_meet";
  if (/zoom\.(us|com)/.test(url)) return "zoom";
  if (/teams\.(microsoft|live)\.com/.test(url)) return "ms_teams";
  return "unknown";
}

export async function dispatchBot({
  meetingUrl,
  botDisplayName,
  webhookUrl,
}: DispatchBotParams): Promise<DispatchBotResult> {
  const baseUrl = process.env.ATTENDEE_BASE_URL;
  const apiKey = process.env.ATTENDEE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new BotProviderNotConfiguredError();
  }

  const res = await fetch(`${baseUrl}/api/v1/bots`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botDisplayName,
      webhooks: [
        {
          url: webhookUrl,
          triggers: ["bot.state_change", "transcript.update"],
        },
      ],
      // Google Meet/Teams bots default to native closed captions and would
      // work without this, but explicit Whisper transcription (via Groq's
      // OpenAI-compatible API, configured as this project's "OpenAI"
      // credential — see README) gives more accurate transcripts than
      // captions everywhere, and is required at all for Zoom's native SDK
      // path, which otherwise defaults to Deepgram.
      transcription_settings: {
        openai: { model: process.env.ATTENDEE_OPENAI_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo" },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Attendee bot dispatch failed (${res.status}): ${body}`);
  }

  const data: { id: string } = await res.json();
  return { providerSessionId: data.id };
}
