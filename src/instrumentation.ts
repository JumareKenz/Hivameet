export async function register() {
  // Only run in the long-lived Node.js server process, once per server start.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_CALENDAR_SYNC === "true") return;

  const { startCalendarSyncScheduler } = await import("./lib/calendar/scheduler");
  startCalendarSyncScheduler();
}
