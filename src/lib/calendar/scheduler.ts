import { syncAllUsersCalendars } from "./sync";
import { dispatchDueScheduledMeetings } from "@/lib/meetings/scheduled-dispatch";

const INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 5_000;

let started = false;
let running = false;

/**
 * Starts the in-process calendar auto-join poller. Self-hosted deployments
 * run a single long-lived Next.js process (`next start`), so an in-process
 * interval is simpler ops than wiring up an external cron — no crontab or
 * sidecar container required. Set DISABLE_CALENDAR_SYNC=true to turn it off
 * (e.g. if you're running multiple instances and want a single external
 * scheduler hitting POST /api/calendar/sync instead).
 */
export function startCalendarSyncScheduler() {
  if (started) return;
  started = true;

  const tick = async () => {
    if (running) return; // skip if the previous tick is still running
    running = true;
    try {
      const result = await syncAllUsersCalendars();
      if (result.totalDispatched > 0) {
        console.log(
          `[calendar-sync] dispatched ${result.totalDispatched} bot(s) across ${result.usersScanned} user(s) with auto-join enabled`
        );
      }
    } catch (err) {
      console.error("[calendar-sync] tick failed", err);
    }

    try {
      const scheduled = await dispatchDueScheduledMeetings();
      if (scheduled.dispatched > 0) {
        console.log(`[scheduled-dispatch] dispatched ${scheduled.dispatched} Hivameet-created meeting(s)`);
      }
    } catch (err) {
      console.error("[scheduled-dispatch] tick failed", err);
    } finally {
      running = false;
    }
  };

  setInterval(tick, INTERVAL_MS);
  setTimeout(tick, INITIAL_DELAY_MS);
}
