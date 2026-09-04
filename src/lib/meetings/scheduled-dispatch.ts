import { and, eq, lte, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { meetings, users } from "@/db/schema";
import { dispatchBot, BotProviderNotConfiguredError } from "@/lib/bot-provider";
import { hasEnoughCreditsToJoin } from "@/lib/billing/credits";

// Same timing convention as src/lib/calendar/sync.ts: dispatch once a
// meeting is due within the next minute, but not if it's more than 5
// minutes stale (e.g. the process was down) — see that file for the
// reasoning. Kept as a separate constant here rather than importing, since
// this dispatch source (Hivameet-created meetings) and calendar sync
// (externally-discovered events) are conceptually independent, even though
// they currently share the same values.
const DISPATCH_LEAD_MS = 60_000;
const CATCH_UP_WINDOW_MS = 5 * 60_000;

/**
 * Dispatches the bot to any Hivameet-created meeting (src/lib/meeting-providers)
 * whose scheduled start time has arrived, mirroring how calendar-sync dispatches
 * for externally-discovered events. Called from the same in-process scheduler
 * (src/instrumentation.ts) every 60s.
 */
export async function dispatchDueScheduledMeetings() {
  const now = Date.now();
  const due = await db.query.meetings.findMany({
    where: and(
      eq(meetings.status, "scheduled"),
      eq(meetings.creationSource, "hivameet_created"),
      eq(meetings.autoRecord, true),
      isNull(meetings.botProviderSessionId),
      lte(meetings.scheduledStartAt, new Date(now + DISPATCH_LEAD_MS)),
      gte(meetings.scheduledStartAt, new Date(now - CATCH_UP_WINDOW_MS))
    ),
  });

  let dispatched = 0;
  for (const meeting of due) {
    if (!meeting.meetingUrl) continue;
    if (!(await hasEnoughCreditsToJoin(meeting.userId))) continue; // retried next tick

    const user = await db.query.users.findFirst({ where: eq(users.id, meeting.userId) });
    if (!user) continue;

    try {
      const { providerSessionId } = await dispatchBot({
        meetingUrl: meeting.meetingUrl,
        botDisplayName: user.botDisplayName ?? "Hivameet Notetaker",
        webhookUrl: `${process.env.APP_BASE_URL}/api/bot-webhook`,
      });
      await db
        .update(meetings)
        .set({ status: "awaiting_admission", botProviderSessionId: providerSessionId })
        .where(eq(meetings.id, meeting.id));
      dispatched++;
    } catch (err) {
      const failureReason =
        err instanceof BotProviderNotConfiguredError
          ? err.message
          : "The bot couldn't be dispatched to this meeting.";
      console.error(`[scheduled-dispatch] failed to dispatch meeting ${meeting.id}`, err);
      await db
        .update(meetings)
        .set({ status: "failed", failureReason })
        .where(eq(meetings.id, meeting.id));
    }
  }

  return { scanned: due.length, dispatched };
}
