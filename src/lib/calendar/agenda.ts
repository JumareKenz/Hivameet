import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { getValidAccessToken } from "./tokens";
import { fetchGoogleEvents } from "./google";
import { fetchMicrosoftEvents } from "./microsoft";
import type { NormalizedCalendarEvent } from "./types";

export interface CalendarItem {
  /** Stable within one render: the Hivameet meeting id if one exists, else "<source>:<externalId>". */
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  /** A Hivameet meeting row backs this item — link to /meetings/[id] instead of the raw join URL. */
  meetingId: string | null;
  status: (typeof meetings.$inferSelect)["status"] | null;
  platform: (typeof meetings.$inferSelect)["platform"] | null;
  meetingUrl: string | null;
  source: "hivameet" | "google" | "microsoft";
  isOrganizer: boolean;
}

function effectiveStart(m: typeof meetings.$inferSelect): Date {
  return m.scheduledStartAt ?? m.startedAt ?? m.createdAt;
}

function effectiveEnd(m: typeof meetings.$inferSelect): Date {
  if (m.scheduledEndAt) return m.scheduledEndAt;
  if (m.endedAt) return m.endedAt;
  const start = effectiveStart(m);
  return new Date(start.getTime() + 60 * 60_000); // assume 1h when we truly have nothing else
}

/**
 * Builds the unified list of calendar items for a user within [rangeStart,
 * rangeEnd): Hivameet's own meetings (created in-app, joined ad hoc, or
 * already synced from a calendar) merged with a *live* fetch of the
 * connected Google/Microsoft calendars for the same range. Live-fetching
 * rather than reading a persisted copy keeps this honest — no separate
 * "calendar events" table that could drift from the calendar itself.
 */
export async function getCalendarItems(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalendarItem[]> {
  const rows = await db.query.meetings.findMany({
    where: and(
      eq(meetings.userId, userId),
      or(
        and(gte(meetings.scheduledStartAt, rangeStart), lte(meetings.scheduledStartAt, rangeEnd)),
        and(gte(meetings.startedAt, rangeStart), lte(meetings.startedAt, rangeEnd)),
        // Fallback for ad-hoc/legacy meetings with neither timestamp set —
        // place them by creation time instead.
        and(
          isNull(meetings.scheduledStartAt),
          isNull(meetings.startedAt),
          gte(meetings.createdAt, rangeStart),
          lte(meetings.createdAt, rangeEnd)
        )
      )
    ),
  });

  const items: CalendarItem[] = rows.map((m) => ({
    id: m.id,
    title: m.title,
    startTime: effectiveStart(m),
    endTime: effectiveEnd(m),
    meetingId: m.id,
    status: m.status,
    platform: m.platform,
    meetingUrl: m.meetingUrl,
    source: "hivameet",
    isOrganizer: m.creationSource === "hivameet_created",
  }));

  const syncedExternalIds = new Set(rows.map((m) => m.calendarEventId).filter((id): id is string => Boolean(id)));

  const externalEvents: NormalizedCalendarEvent[] = [];
  for (const provider of ["google", "microsoft-entra-id"] as const) {
    const accessToken = await getValidAccessToken(userId, provider).catch(() => null);
    if (!accessToken) continue;
    try {
      const events =
        provider === "google"
          ? await fetchGoogleEvents(accessToken, rangeStart, rangeEnd)
          : await fetchMicrosoftEvents(accessToken, rangeStart, rangeEnd);
      externalEvents.push(...events.map((e) => ({ ...e, source: provider })));
    } catch (err) {
      console.error(`[calendar-agenda] failed to fetch ${provider} events for user ${userId}`, err);
    }
  }

  for (const event of externalEvents as (NormalizedCalendarEvent & { source: "google" | "microsoft-entra-id" })[]) {
    // Already represented by a Hivameet meeting row (synced or dispatched) — don't show it twice.
    if (syncedExternalIds.has(event.externalId)) continue;
    items.push({
      id: `${event.source}:${event.externalId}`,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      meetingId: null,
      status: null,
      platform: null,
      meetingUrl: event.meetingUrl,
      source: event.source === "microsoft-entra-id" ? "microsoft" : "google",
      isOrganizer: event.isOrganizer,
    });
  }

  items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return items;
}
