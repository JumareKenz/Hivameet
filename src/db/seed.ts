import { db } from "./index";
import {
  users,
  joinRules,
  meetings,
  meetingParticipants,
  transcriptSegments,
  insights,
  actionItems,
  reminders,
} from "./schema";

async function main() {
  console.log("Seeding database...");

  const [user] = await db
    .insert(users)
    .values({
      email: "demo@hivameet.dev",
      name: "Alex Rivera",
      botDisplayName: "Alex's AI Assistant",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: "Alex Rivera" },
    })
    .returning();

  await db
    .insert(joinRules)
    .values({ userId: user.id, mode: "hosted_by_me", autoJoinEnabled: true })
    .onConflictDoUpdate({
      target: joinRules.userId,
      set: { mode: "hosted_by_me", autoJoinEnabled: true },
    });

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId: user.id,
      title: "Weekly Product Sync",
      platform: "google_meet",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      status: "completed",
      startedAt: new Date("2026-08-31T15:00:00Z"),
      endedAt: new Date("2026-08-31T15:42:00Z"),
      durationSeconds: 42 * 60,
      participantCount: 4,
      executiveSummary:
        "The team finalized the Q4 API rollout timeline, moving launch to Oct 15. Added DevOps resources to mitigate delays.",
    })
    .returning();

  const [sarah, david] = await db
    .insert(meetingParticipants)
    .values([
      { meetingId: meeting.id, speakerLabel: "Speaker 1", displayName: "Sarah Chen" },
      { meetingId: meeting.id, speakerLabel: "Speaker 2", displayName: "David Miller" },
    ])
    .returning();

  await db.insert(transcriptSegments).values([
    {
      meetingId: meeting.id,
      participantId: sarah.id,
      startMs: 12_000,
      endMs: 18_500,
      text: "Let's lock down the Q4 roadmap. I want to make sure we're aligned on the API rollout timeline before we finalize anything.",
    },
    {
      meetingId: meeting.id,
      participantId: david.id,
      startMs: 105_000,
      endMs: 118_000,
      text: "We need to allocate two extra backend engineers to DevOps, otherwise the migration slips past October.",
    },
    {
      meetingId: meeting.id,
      participantId: sarah.id,
      startMs: 130_000,
      endMs: 141_000,
      text: "Agreed. David, speak with DevOps by Friday and confirm we can get the headcount reassigned this sprint.",
    },
  ]);

  await db.insert(insights).values([
    {
      meetingId: meeting.id,
      type: "key_insight",
      content: "Backend migration was delayed 2 weeks due to unresolved schema conflicts.",
      sortOrder: 0,
    },
    {
      meetingId: meeting.id,
      type: "key_insight",
      content: "Resource bottleneck identified in the DevOps team ahead of the Q4 rollout.",
      sortOrder: 1,
    },
    {
      meetingId: meeting.id,
      type: "recommendation",
      content: "Reassign two backend engineers to DevOps for the remainder of the sprint to protect the Oct 15 launch date.",
      sortOrder: 0,
    },
  ]);

  await db.insert(actionItems).values([
    {
      meetingId: meeting.id,
      text: "Finalize API docs",
      assignee: "Alex",
      dueDate: new Date("2026-09-05"),
      completed: false,
    },
    {
      meetingId: meeting.id,
      text: "Meet DevOps team to confirm headcount reassignment",
      assignee: "David",
      dueDate: new Date("2026-09-04"),
      completed: false,
    },
  ]);

  await db.insert(reminders).values([
    {
      meetingId: meeting.id,
      text: "Update executive team on Q4 rollout timeline",
      triggerAt: new Date("2026-09-07T09:00:00Z"),
      sent: false,
    },
  ]);

  console.log(`Seeded user ${user.email} with meeting "${meeting.title}" (${meeting.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
