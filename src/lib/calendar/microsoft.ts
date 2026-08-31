import { extractMeetingUrl } from "./extract-link";
import type { NormalizedCalendarEvent } from "./types";

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  onlineMeeting?: { joinUrl?: string };
  location?: { displayName?: string };
  bodyPreview?: string;
  isOrganizer?: boolean;
  attendees?: { emailAddress?: { address?: string } }[];
}

interface GraphEventsResponse {
  value?: GraphEvent[];
}

export async function fetchMicrosoftEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<NormalizedCalendarEvent[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", timeMin.toISOString());
  url.searchParams.set("endDateTime", timeMax.toISOString());
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "50");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Ensures start/end dateTime strings come back in UTC (Graph omits
      // the offset/"Z" suffix and instead returns it in whatever timezone
      // this header requests).
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph calendarView fetch failed (${res.status}): ${await res.text()}`);
  }
  const data: GraphEventsResponse = await res.json();

  return (data.value ?? [])
    .filter((e): e is GraphEvent & { start: { dateTime: string }; end: { dateTime: string } } =>
      Boolean(e.start?.dateTime && e.end?.dateTime)
    )
    .map((e) => {
      const meetingUrl =
        e.onlineMeeting?.joinUrl ?? extractMeetingUrl(e.location?.displayName, e.bodyPreview);
      const attendeeDomains = (e.attendees ?? [])
        .map((a) => a.emailAddress?.address?.split("@")[1]?.toLowerCase())
        .filter((d): d is string => Boolean(d));

      return {
        externalId: e.id,
        title: e.subject ?? "Untitled meeting",
        startTime: new Date(`${e.start.dateTime}Z`),
        endTime: new Date(`${e.end.dateTime}Z`),
        meetingUrl: meetingUrl ?? null,
        isOrganizer: e.isOrganizer === true,
        attendeeDomains,
      };
    });
}
