import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  meetings,
  transcriptSegments,
  meetingParticipants,
  insights,
  actionItems,
  reminders,
} from "@/db/schema";
import { generateStructuredWithFallback } from "@/lib/ai/model";
import { meetingIntelligenceSchema, chunkExtractionSchema, type MeetingIntelligence, type ChunkExtraction } from "./schema";
import { chunkTranscript, SINGLE_PASS_CHAR_LIMIT } from "./chunking";
import { buildSystemPrompt, wrapTranscript } from "./prompts";

export type { MeetingIntelligence } from "./schema";

function formatSegmentLine(startMs: number, speaker: string, text: string): string {
  const ts = new Date(startMs).toISOString().substring(11, 19);
  return `[${ts}] ${speaker}: ${text}`;
}

async function extractChunk(chunkText: string, chunkIndex: number, totalChunks: number): Promise<ChunkExtraction> {
  return generateStructuredWithFallback({
    schema: chunkExtractionSchema,
    system: buildSystemPrompt(
      "an analyst extracting structured facts from ONE PORTION of a longer meeting transcript " +
        `(part ${chunkIndex + 1} of ${totalChunks}). You are not writing a final summary — just ` +
        "extracting what's actually in this portion. Another pass will merge your extraction with " +
        "the other portions into the final report, so don't worry about repeating context from " +
        "outside this excerpt."
    ),
    prompt: wrapTranscript(chunkText),
  });
}

async function consolidate(chunks: ChunkExtraction[], meetingTitle: string): Promise<MeetingIntelligence> {
  const combined = JSON.stringify(chunks);
  return generateStructuredWithFallback({
    schema: meetingIntelligenceSchema,
    system: buildSystemPrompt(
      "an executive analyst producing the final meeting report from several partial extractions " +
        `of the meeting "${meetingTitle}", each covering a different time range of the same meeting. ` +
        "Merge and deduplicate across them — if the same decision, risk, or topic appears in more than " +
        "one extraction, report it once. Write one coherent executive summary and overview considering " +
        "the meeting as a whole, not per-chunk. Keep the earliest approxTimestampMs when the same topic " +
        "reappears across extractions."
    ),
    prompt:
      "Here are the partial extractions, in chronological order, as a JSON array:\n\n" +
      combined +
      "\n\nProduce the final, consolidated meeting report from these. Your output is a single JSON " +
      "object matching the required report schema — not an array, and not one of the input extractions " +
      "verbatim.",
    // The final report can be larger than any single chunk's extraction
    // once everything is merged — give it more room than the per-chunk pass.
    maxOutputTokens: 16384,
  });
}

async function extractDirect(transcript: string): Promise<MeetingIntelligence> {
  return generateStructuredWithFallback({
    schema: meetingIntelligenceSchema,
    system: buildSystemPrompt("an executive analyst producing a complete meeting report from a transcript"),
    prompt: wrapTranscript(transcript),
    maxOutputTokens: 12288,
  });
}

/**
 * Runs after a meeting's transcript is complete: extracts the full
 * structured report (executive summary, overview, discussion points,
 * decisions, action items, insights, recommendations, risks, open
 * questions, topic map) and persists it. Long transcripts are chunked and
 * consolidated (map-reduce) rather than sent as one giant prompt, so
 * nothing past a context window gets silently dropped and chunk-boundary
 * duplicates get merged rather than repeated.
 */
export async function generateMeetingIntelligence(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meetingId),
    orderBy: [transcriptSegments.startMs],
  });
  const participants = await db.query.meetingParticipants.findMany({
    where: eq(meetingParticipants.meetingId, meetingId),
  });
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  if (segments.length === 0) {
    // The bot joined and recorded, but nothing was transcribed — most often
    // because meeting captions were never enabled, not a real failure. Mark
    // it completed with an honest summary rather than "failed" with no
    // explanation: the call itself succeeded, there's just no content to
    // extract insights from.
    await db
      .update(meetings)
      .set({
        status: "completed",
        failureReason: null,
        executiveSummary:
          "No speech was transcribed for this meeting. This usually means live captions weren't enabled during the call — Hivameet currently relies on them for Google Meet and Microsoft Teams.",
      })
      .where(eq(meetings.id, meetingId));
    return null;
  }

  const lines = segments.map((s) => {
    const speaker = s.participantId
      ? participantsById.get(s.participantId)?.displayName ??
        participantsById.get(s.participantId)?.speakerLabel ??
        "Unknown"
      : "Unknown";
    return formatSegmentLine(s.startMs, speaker, s.text);
  });
  const fullTranscript = lines.join("\n");

  const report: MeetingIntelligence =
    fullTranscript.length <= SINGLE_PASS_CHAR_LIMIT
      ? await extractDirect(fullTranscript)
      : await consolidate(
          await Promise.all(
            chunkTranscript(lines).map((chunk, i, all) => extractChunk(chunk, i, all.length))
          ),
          meeting.title
        );

  await persistReport(meetingId, report);
  return report;
}

async function persistReport(meetingId: string, report: MeetingIntelligence) {
  await db
    .update(meetings)
    .set({
      status: "completed",
      failureReason: null,
      executiveSummary: report.executiveSummary,
      intelligenceReport: {
        overview: report.overview,
        discussionPoints: report.discussionPoints,
        decisions: report.decisions,
        recommendations: report.recommendations,
        risks: report.risks,
        openQuestions: report.openQuestions,
        topics: report.topics,
      },
    })
    .where(eq(meetings.id, meetingId));

  await db.delete(insights).where(eq(insights.meetingId, meetingId));
  if (report.keyInsights.length > 0) {
    await db.insert(insights).values(
      report.keyInsights.map((content, i) => ({
        meetingId,
        type: "key_insight" as const,
        content,
        sortOrder: i,
      }))
    );
  }

  await db.delete(actionItems).where(eq(actionItems.meetingId, meetingId));
  if (report.actionItems.length > 0) {
    await db.insert(actionItems).values(
      report.actionItems.map((a) => ({
        meetingId,
        text: a.text,
        assignee: a.assignee,
        dueDate: a.dueDate ? new Date(a.dueDate) : null,
        priority: a.priority,
      }))
    );
  }

  // Reminders aren't part of the new structured schema (they were a thin,
  // rarely-populated feature in the old one) — clear any stale rows from a
  // prior run so a re-generated report doesn't show stale reminders that no
  // longer reflect the current transcript.
  await db.delete(reminders).where(eq(reminders.meetingId, meetingId));
}
