import { randomUUID } from "node:crypto";
import { getValidAccessToken } from "@/lib/calendar/tokens";
import {
  ProviderNotConnectedError,
  ProviderReauthRequiredError,
  type CreateMeetingParams,
  type CreatedMeeting,
  type MeetingProvider,
} from "./types";

interface GoogleEventResponse {
  id: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
}

export const googleMeetProvider: MeetingProvider = {
  async createMeeting(params: CreateMeetingParams): Promise<CreatedMeeting> {
    const accessToken = await getValidAccessToken(params.userId, "google");
    if (!accessToken) throw new ProviderNotConnectedError("Google Calendar");

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("conferenceDataVersion", "1");
    url.searchParams.set("sendUpdates", "all");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: params.title,
        description: [params.description, params.agenda ? `Agenda:\n${params.agenda}` : null]
          .filter(Boolean)
          .join("\n\n"),
        start: { dateTime: params.startAt.toISOString(), timeZone: params.timezone },
        end: { dateTime: params.endAt.toISOString(), timeZone: params.timezone },
        attendees: params.attendees.map((a) => ({ email: a.email, displayName: a.name })),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    });

    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      if (/insufficient|scope/i.test(body)) {
        throw new ProviderReauthRequiredError("Google Calendar");
      }
      throw new Error(`Google Calendar authorization failed (${res.status}): ${body}`);
    }
    if (!res.ok) {
      throw new Error(`Failed to create Google Meet event (${res.status}): ${await res.text()}`);
    }

    const event: GoogleEventResponse = await res.json();
    const joinUrl =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
    if (!joinUrl) {
      throw new Error("Google created the event but didn't return a Meet link.");
    }

    return { providerMeetingId: event.id, joinUrl, calendarEventId: event.id };
  },
};
