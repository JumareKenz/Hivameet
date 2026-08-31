export interface NormalizedCalendarEvent {
  externalId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  meetingUrl: string | null;
  isOrganizer: boolean;
  /** Lowercased email domains of attendees other than the user themself. */
  attendeeDomains: string[];
}
