import { generateText, Output } from "ai";
import { getChatModel } from "@/lib/ai/model";
import { z } from "zod";
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

const meetingIntelligenceSchema = z.object({
  executiveSummary: z
    .string()
    .describe("2-3 sentence high-level overview of the meeting"),
  keyInsights: z
    .array(z.string())
    .describe("Critical decisions, consensus points, and discussion blockers"),
  recommendations: z
    .array(z.string())
    .describe("Strategic suggestions based on the discussion context"),
  actionItems: z
    .array(
      z.object({
        text: z.string(),
        assignee: z.string().nullable().describe("Name of the owner, if stated"),
        dueDate: z
          .string()
          .nullable()
          .describe("ISO 8601 date if a deadline was mentioned, else null"),
      })
    )
    .describe("Concrete tasks with an owner and/or deadline where known"),
  reminders: z
    .array(
      z.object({
        text: z.string(),
        triggerAt: z
          .string()
          .nullable()
          .describe("ISO 8601 datetime for a follow-up/milestone flag, if implied"),
      })
    )
    .describe("Follow-up flags and milestone triggers worth resurfacing later"),
});

/**
 * Runs after a meeting's transcript is complete: extracts the executive
 * summary, insights, recommendations, action items, and reminders described
 * in the product spec, and persists them.
 */
export async function generateMeetingIntelligence(meetingId: string) {
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
        executiveSummary:
          "No speech was transcribed for this meeting. This usually means live captions weren't enabled during the call — Hivameet currently relies on them for Google Meet and Microsoft Teams.",
      })
      .where(eq(meetings.id, meetingId));
    return null;
  }

  const transcript = segments
    .map((s) => {
      const speaker = s.participantId
        ? participantsById.get(s.participantId)?.displayName ??
          participantsById.get(s.participantId)?.speakerLabel
        : "Unknown";
      const ts = new Date(s.startMs).toISOString().substring(11, 19);
      return `[${ts}] ${speaker}: ${s.text}`;
    })
    .join("\n");

  const { output: object } = await generateText({
    model: getChatModel(),
    output: Output.object({ schema: meetingIntelligenceSchema }),
    system:
      "You are Hivameet's meeting intelligence engine. Extract a concise, " +
      "accurate summary and structured follow-ups from a meeting transcript. " +
      "Only include action items and reminders that are actually implied by " +
      "the discussion — do not invent details.",
    prompt: `Meeting transcript:\n\n${transcript}`,
  });

  await db
    .update(meetings)
    .set({ executiveSummary: object.executiveSummary, status: "completed" })
    .where(eq(meetings.id, meetingId));

  await db.delete(insights).where(eq(insights.meetingId, meetingId));
  if (object.keyInsights.length > 0) {
    await db.insert(insights).values(
      object.keyInsights.map((content, i) => ({
        meetingId,
        type: "key_insight" as const,
        content,
        sortOrder: i,
      }))
    );
  }
  if (object.recommendations.length > 0) {
    await db.insert(insights).values(
      object.recommendations.map((content, i) => ({
        meetingId,
        type: "recommendation" as const,
        content,
        sortOrder: i,
      }))
    );
  }

  await db.delete(actionItems).where(eq(actionItems.meetingId, meetingId));
  if (object.actionItems.length > 0) {
    await db.insert(actionItems).values(
      object.actionItems.map((a) => ({
        meetingId,
        text: a.text,
        assignee: a.assignee,
        dueDate: a.dueDate ? new Date(a.dueDate) : null,
      }))
    );
  }

  await db.delete(reminders).where(eq(reminders.meetingId, meetingId));
  if (object.reminders.length > 0) {
    await db.insert(reminders).values(
      object.reminders.map((r) => ({
        meetingId,
        text: r.text,
        triggerAt: r.triggerAt ? new Date(r.triggerAt) : null,
      }))
    );
  }

  return object;
}
