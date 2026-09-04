// Provider-agnostic abstraction for *creating* a real meeting (Google
// Calendar event + Meet link, Graph event + Teams meeting, Zoom meeting).
// Deliberately separate from src/lib/bot-provider.ts, which handles the bot
// *joining* an already-existing meeting URL — creation and joining use
// different provider APIs and different credentials entirely.

export interface CreateMeetingParams {
  userId: string;
  title: string;
  description: string | null;
  agenda: string | null;
  startAt: Date;
  endAt: Date;
  /** IANA timezone, e.g. "Africa/Lagos". */
  timezone: string;
  attendees: { email: string; name?: string }[];
}

export interface CreatedMeeting {
  providerMeetingId: string;
  joinUrl: string;
  /** Host-only start link, if the provider has a distinct one (e.g. Zoom's start_url). Never shown to invitees. */
  hostUrl?: string | null;
  /** The calendar event id backing this meeting, if the provider creates one (Google/Microsoft do; Zoom's REST API doesn't). */
  calendarEventId?: string | null;
}

export interface MeetingProvider {
  createMeeting(params: CreateMeetingParams): Promise<CreatedMeeting>;
}

/** The user hasn't connected this provider at all (no OAuth account / no app-level credentials configured). */
export class ProviderNotConnectedError extends Error {
  constructor(providerLabel: string) {
    super(`${providerLabel} isn't connected.`);
    this.name = "ProviderNotConnectedError";
  }
}

/**
 * The user's connection exists but lacks the scope/permission needed to
 * create a meeting (e.g. they connected before Hivameet requested calendar
 * write access). The caller should prompt a reconnect, not treat this as a
 * generic failure.
 */
export class ProviderReauthRequiredError extends Error {
  constructor(providerLabel: string) {
    super(`${providerLabel} needs to be reconnected to create meetings — your existing connection doesn't have permission yet.`);
    this.name = "ProviderReauthRequiredError";
  }
}
