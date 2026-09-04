import { ProviderNotConnectedError, type CreateMeetingParams, type CreatedMeeting, type MeetingProvider } from "./types";

// Zoom meeting *creation* uses a Server-to-Server OAuth app — a completely
// different Zoom app/credential type than the Meeting SDK app configured in
// Attendee for the bot to *join* calls (see src/lib/bot-provider.ts and
// README's Zoom section). Server-to-Server auth is account-level, not
// per-user: every Hivameet-created Zoom meeting is created under the one
// Zoom account these credentials belong to, not each user's own Zoom
// account. That's a real product tradeoff, not an oversight — per-user
// creation would need a separate user-OAuth Zoom app (authorization_code
// grant) if that's ever required.

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getServerToServerToken(): Promise<string> {
  const accountId = process.env.ZOOM_S2S_ACCOUNT_ID;
  const clientId = process.env.ZOOM_S2S_CLIENT_ID;
  const clientSecret = process.env.ZOOM_S2S_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new ProviderNotConnectedError("Zoom");
  }

  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basicAuth}` } }
  );
  if (!res.ok) {
    throw new Error(`Zoom Server-to-Server auth failed (${res.status}): ${await res.text()}`);
  }
  const data: { access_token: string; expires_in: number } = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url: string;
}

export const zoomProvider: MeetingProvider = {
  async createMeeting(params: CreateMeetingParams): Promise<CreatedMeeting> {
    const token = await getServerToServerToken();
    const durationMinutes = Math.max(
      1,
      Math.round((params.endAt.getTime() - params.startAt.getTime()) / 60_000)
    );

    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: params.title,
        type: 2, // scheduled meeting
        start_time: params.startAt.toISOString(),
        duration: durationMinutes,
        timezone: params.timezone,
        agenda: [params.description, params.agenda].filter(Boolean).join("\n\n") || undefined,
        settings: {
          join_before_host: true,
          waiting_room: false,
          meeting_invitees: params.attendees.map((a) => ({ email: a.email })),
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create Zoom meeting (${res.status}): ${await res.text()}`);
    }

    const meeting: ZoomMeetingResponse = await res.json();
    return {
      providerMeetingId: String(meeting.id),
      joinUrl: meeting.join_url,
      hostUrl: meeting.start_url,
      calendarEventId: null, // Zoom's REST API doesn't back this with a calendar event
    };
  },
};
