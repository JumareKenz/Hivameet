import { getValidAccessToken } from "@/lib/calendar/tokens";
import {
  ProviderNotConnectedError,
  ProviderReauthRequiredError,
  type CreateMeetingParams,
  type CreatedMeeting,
  type MeetingProvider,
} from "./types";

interface GraphEventResponse {
  id: string;
  onlineMeeting?: { joinUrl?: string };
}

export const teamsProvider: MeetingProvider = {
  async createMeeting(params: CreateMeetingParams): Promise<CreatedMeeting> {
    const accessToken = await getValidAccessToken(params.userId, "microsoft-entra-id");
    if (!accessToken) throw new ProviderNotConnectedError("Microsoft (Teams)");

    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: params.title,
        body: {
          contentType: "text",
          content: [params.description, params.agenda ? `Agenda:\n${params.agenda}` : null]
            .filter(Boolean)
            .join("\n\n"),
        },
        start: { dateTime: params.startAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: params.endAt.toISOString(), timeZone: "UTC" },
        attendees: params.attendees.map((a) => ({
          emailAddress: { address: a.email, name: a.name },
          type: "required",
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }),
    });

    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      if (/scope|permission|consent/i.test(body)) {
        throw new ProviderReauthRequiredError("Microsoft (Teams)");
      }
      throw new Error(`Microsoft Graph authorization failed (${res.status}): ${body}`);
    }
    if (!res.ok) {
      throw new Error(`Failed to create Teams meeting (${res.status}): ${await res.text()}`);
    }

    const event: GraphEventResponse = await res.json();
    if (!event.onlineMeeting?.joinUrl) {
      throw new Error("Microsoft created the event but didn't return a Teams join link.");
    }

    return {
      providerMeetingId: event.id,
      joinUrl: event.onlineMeeting.joinUrl,
      calendarEventId: event.id,
    };
  },
};
