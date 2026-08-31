const CONFERENCE_LINK_PATTERNS = [
  /https?:\/\/[a-z0-9.-]*zoom\.us\/(j|my)\/[a-zA-Z0-9?=&_.-]+/i,
  /https?:\/\/meet\.google\.com\/[a-z0-9-]+/i,
  /https?:\/\/teams\.(microsoft|live)\.com\/[^\s"'<>]+/i,
];

/** Scans free-text calendar fields (location, description/body) for a Zoom/Meet/Teams link. */
export function extractMeetingUrl(...texts: (string | null | undefined)[]): string | null {
  const combined = texts.filter(Boolean).join(" ");
  for (const pattern of CONFERENCE_LINK_PATTERNS) {
    const match = combined.match(pattern);
    if (match) return match[0];
  }
  return null;
}
