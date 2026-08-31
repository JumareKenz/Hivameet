// Thin abstraction over the meeting-bot provider (the headless participant
// that joins Zoom/Meet/Teams, records, and streams us transcript/webhook
// events). Recall.ai is the default implementation because it already
// handles bot admission, transcription hand-off, and per-platform quirks
// across Meet/Zoom/Teams — building that ourselves is a project on its own.
// Swap `dispatchBot` for another provider by implementing the same shape.

export class BotProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "No meeting-bot provider is configured. Set RECALL_API_KEY in .env.local " +
        "(see https://www.recall.ai) to let the bot actually join calls."
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
  if (/zoom\.us/.test(url)) return "zoom";
  if (/teams\.(microsoft|live)\.com/.test(url)) return "ms_teams";
  return "unknown";
}

export async function dispatchBot({
  meetingUrl,
  botDisplayName,
  webhookUrl,
}: DispatchBotParams): Promise<DispatchBotResult> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) {
    throw new BotProviderNotConfiguredError();
  }

  const res = await fetch("https://us-east-1.recall.ai/api/v1/bot/", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botDisplayName,
      recording_config: {
        transcript: { provider: { meeting_captions: {} } },
        realtime_endpoints: [
          {
            type: "webhook",
            url: webhookUrl,
            events: ["transcript.data", "bot.status_change"],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall.ai bot dispatch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { providerSessionId: data.id };
}
