import { googleMeetProvider } from "./google-meet";
import { teamsProvider } from "./teams";
import { zoomProvider } from "./zoom";
import type { MeetingProvider } from "./types";

export type CreatableMeetingPlatform = "google_meet" | "ms_teams" | "zoom";

const registry: Record<CreatableMeetingPlatform, MeetingProvider> = {
  google_meet: googleMeetProvider,
  ms_teams: teamsProvider,
  zoom: zoomProvider,
};

export function getMeetingProvider(platform: CreatableMeetingPlatform): MeetingProvider {
  return registry[platform];
}

export * from "./types";
