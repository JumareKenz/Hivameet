import { extractMeetingUrl } from "./extract-link";
import type { NormalizedCalendarEvent } from "./types";

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  location?: string;
  description?: string;
  organizer?: { email?: string; self?: boolean };
  attendees?: { email?: string; self?: boolean }[];
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
}

export async function fetchGoogleEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<NormalizedCalendarEvent[]> {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Google Calendar events fetch failed (${res.status}): ${await res.text()}`);
  }
  const data: GoogleEventsResponse = await res.json();

  return (data.items ?? [])
    .filter((e): e is GoogleEvent & { start: { dateTime: string }; end: { dateTime: string } } =>
      Boolean(e.start?.dateTime && e.end?.dateTime) // skip all-day events, which have `date` instead
    )
    .map((e) => {
      const conferenceUri = e.conferenceData?.entryPoints?.find(
        (p) => p.entryPointType === "video"
      )?.uri;
      const meetingUrl = e.hangoutLink ?? conferenceUri ?? extractMeetingUrl(e.location, e.description);
      const attendeeDomains = (e.attendees ?? [])
        .filter((a) => !a.self && a.email)
        .map((a) => a.email!.split("@")[1]?.toLowerCase())
        .filter((d): d is string => Boolean(d));

      return {
        externalId: e.id,
        title: e.summary ?? "Untitled meeting",
        startTime: new Date(e.start.dateTime),
        endTime: new Date(e.end.dateTime),
        meetingUrl: meetingUrl ?? null,
        isOrganizer: e.organizer?.self === true,
        attendeeDomains,
      };
    });
}
