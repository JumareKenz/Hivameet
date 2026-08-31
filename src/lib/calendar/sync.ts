import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, joinRules, meetings } from "@/db/schema";
import { getValidAccessToken } from "./tokens";
import { fetchGoogleEvents } from "./google";
import { fetchMicrosoftEvents } from "./microsoft";
import type { NormalizedCalendarEvent } from "./types";
import { detectPlatform, dispatchBot, BotProviderNotConfiguredError } from "@/lib/bot-provider";

// Mirrors the product spec's "T-1 minute" bot admission: dispatch once a
// calendar event is due within the next minute. CATCH_UP_WINDOW_MS also
// bounds how late we'll still dispatch for (e.g. after the scheduler was
// down), so we don't fire bots into meetings that ended long ago.
const DISPATCH_LEAD_MS = 60_000;
const CATCH_UP_WINDOW_MS = 5 * 60_000;
const QUERY_LOOKAHEAD_MS = 6 * 60_000;

const CALENDAR_PROVIDERS = ["google", "microsoft-entra-id"] as const;

function isEligible(
  event: NormalizedCalendarEvent,
  mode: string,
  selfDomain: string | null
): boolean {
  switch (mode) {
    case "manual_only":
      return false;
    case "hosted_by_me":
      return event.isOrganizer;
    case "internal_only":
      return Boolean(selfDomain) && event.attendeeDomains.every((d) => d === selfDomain);
    default: // "everything"
      return true;
  }
}

/** Syncs one user's calendar(s) and dispatches the bot to any meeting that's due. */
export async function syncUserCalendar(userId: string) {
  const [user, rules] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.joinRules.findFirst({ where: eq(joinRules.userId, userId) }),
  ]);
  if (!user || !rules?.autoJoinEnabled || rules.mode === "manual_only") {
    return { scanned: 0, dispatched: 0 };
  }

  const selfDomain = user.email.split("@")[1]?.toLowerCase() ?? null;
  const now = Date.now();
  const timeMin = new Date(now - CATCH_UP_WINDOW_MS);
  const timeMax = new Date(now + QUERY_LOOKAHEAD_MS);

  const events: NormalizedCalendarEvent[] = [];
  for (const provider of CALENDAR_PROVIDERS) {
    const accessToken = await getValidAccessToken(userId, provider).catch((err) => {
      console.error(`[calendar-sync] failed to get ${provider} token for user ${userId}`, err);
      return null;
    });
    if (!accessToken) continue;

    try {
      const providerEvents =
        provider === "google"
          ? await fetchGoogleEvents(accessToken, timeMin, timeMax)
          : await fetchMicrosoftEvents(accessToken, timeMin, timeMax);
      events.push(...providerEvents);
    } catch (err) {
      console.error(`[calendar-sync] failed to fetch ${provider} calendar for user ${userId}`, err);
    }
  }

  let dispatched = 0;
  for (const event of events) {
    if (!event.meetingUrl) continue;
    if (event.startTime.getTime() > now + DISPATCH_LEAD_MS) continue; // not due yet
    if (event.startTime.getTime() < now - CATCH_UP_WINDOW_MS) continue; // too stale
    if (!isEligible(event, rules.mode, selfDomain)) continue;

    const existing = await db.query.meetings.findFirst({
      where: and(eq(meetings.userId, userId), eq(meetings.calendarEventId, event.externalId)),
    });
    if (existing) continue;

    const [meeting] = await db
      .insert(meetings)
      .values({
        userId,
        title: event.title,
        platform: detectPlatform(event.meetingUrl),
        meetingUrl: event.meetingUrl,
        calendarEventId: event.externalId,
        status: "awaiting_admission",
      })
      .returning();

    try {
      const { providerSessionId } = await dispatchBot({
        meetingUrl: event.meetingUrl,
        botDisplayName: user.botDisplayName ?? "Hivameet Notetaker",
        webhookUrl: `${process.env.APP_BASE_URL}/api/bot-webhook`,
      });
      await db
        .update(meetings)
        .set({ botProviderSessionId: providerSessionId })
        .where(eq(meetings.id, meeting.id));
      dispatched++;
    } catch (err) {
      if (!(err instanceof BotProviderNotConfiguredError)) {
        console.error(`[calendar-sync] failed to dispatch bot for event ${event.externalId}`, err);
      }
      await db.update(meetings).set({ status: "failed" }).where(eq(meetings.id, meeting.id));
    }
  }

  return { scanned: events.length, dispatched };
}

/** Runs syncUserCalendar for every user with auto-join enabled. Called by the scheduler. */
export async function syncAllUsersCalendars() {
  const enabledUsers = await db
    .select({ userId: joinRules.userId })
    .from(joinRules)
    .where(eq(joinRules.autoJoinEnabled, true));

  let totalScanned = 0;
  let totalDispatched = 0;
  const failedUserIds: string[] = [];

  for (const { userId } of enabledUsers) {
    try {
      const result = await syncUserCalendar(userId);
      totalScanned += result.scanned;
      totalDispatched += result.dispatched;
    } catch (err) {
      console.error(`[calendar-sync] sync failed for user ${userId}`, err);
      failedUserIds.push(userId);
    }
  }

  return {
    usersScanned: enabledUsers.length,
    totalScanned,
    totalDispatched,
    failedUserIds,
  };
}
