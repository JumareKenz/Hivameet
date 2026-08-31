import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  meetings,
  meetingParticipants,
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

  const [segments, participants, meetingInsights, tasks, meetingReminders] =
    await Promise.all([
      db.query.transcriptSegments.findMany({
        where: eq(transcriptSegments.meetingId, meetingId),
        orderBy: [transcriptSegments.startMs],
      }),
      db.query.meetingParticipants.findMany({
        where: eq(meetingParticipants.meetingId, meetingId),
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

  return {
    meeting,
    participants,
    segments: segments.map((s) => ({
      ...s,
      speaker: s.participantId
        ? participantsById.get(s.participantId)?.displayName ??
          participantsById.get(s.participantId)?.speakerLabel ??
          "Unknown speaker"
        : "Unknown speaker",
    })),
    keyInsights: meetingInsights.filter((i) => i.type === "key_insight"),
    recommendations: meetingInsights.filter((i) => i.type === "recommendation"),
    actionItems: tasks,
    reminders: meetingReminders,
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
