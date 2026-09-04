import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  meetings,
  meetingParticipants,
  meetingInvitees,
  transcriptSegments,
  insights,
  actionItems,
  reminders,
  joinRules,
  creditTransactions,
} from "@/db/schema";

export async function getMeetingsForUser(userId: string) {
  return db.query.meetings.findMany({
    where: eq(meetings.userId, userId),
    orderBy: [desc(meetings.startedAt), desc(meetings.createdAt)],
  });
}

export async function getMeetingDetail(userId: string, meetingId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.userId, userId)),
  });
  if (!meeting) return null;

  const [segments, participants, invitees, meetingInsights, tasks, meetingReminders] =
    await Promise.all([
      db.query.transcriptSegments.findMany({
        where: eq(transcriptSegments.meetingId, meetingId),
        orderBy: [transcriptSegments.startMs],
      }),
      db.query.meetingParticipants.findMany({
        where: eq(meetingParticipants.meetingId, meetingId),
      }),
      db.query.meetingInvitees.findMany({
        where: eq(meetingInvitees.meetingId, meetingId),
      }),
      db.query.insights.findMany({
        where: eq(insights.meetingId, meetingId),
        orderBy: [insights.type, insights.sortOrder],
      }),
      db.query.actionItems.findMany({
        where: eq(actionItems.meetingId, meetingId),
      }),
      db.query.reminders.findMany({
        where: eq(reminders.meetingId, meetingId),
      }),
    ]);

  const participantsById = new Map(participants.map((p) => [p.id, p]));
  const report = meeting.intelligenceReport;

  // Recommendations used to live only in the insights table (type =
  // "recommendation"). New meetings store them in intelligenceReport
  // instead (with an optional rationale) — read both so meetings generated
  // before this change still render theirs.
  const legacyRecommendations = meetingInsights
    .filter((i) => i.type === "recommendation")
    .map((i) => ({ text: i.content, rationale: null as string | null }));

  return {
    meeting,
    participants,
    invitees,
    segments: segments.map((s) => ({
      ...s,
      speaker: s.participantId
        ? participantsById.get(s.participantId)?.displayName ??
          participantsById.get(s.participantId)?.speakerLabel ??
          "Unknown speaker"
        : "Unknown speaker",
    })),
    keyInsights: meetingInsights.filter((i) => i.type === "key_insight"),
    actionItems: tasks,
    reminders: meetingReminders,
    overview: report?.overview ?? null,
    discussionPoints: report?.discussionPoints ?? [],
    decisions: report?.decisions ?? [],
    recommendations: report?.recommendations ?? legacyRecommendations,
    risks: report?.risks ?? [],
    openQuestions: report?.openQuestions ?? [],
    topics: report?.topics ?? [],
  };
}

export async function getCreditTransactions(userId: string, limit = 25) {
  return db.query.creditTransactions.findMany({
    where: eq(creditTransactions.userId, userId),
    orderBy: [desc(creditTransactions.createdAt)],
    limit,
  });
}

export async function getJoinRules(userId: string) {
  const rules = await db.query.joinRules.findFirst({
    where: eq(joinRules.userId, userId),
  });
  return (
    rules ?? {
      userId,
      mode: "hosted_by_me" as const,
      autoJoinEnabled: false,
      updatedAt: new Date(),
    }
  );
}
