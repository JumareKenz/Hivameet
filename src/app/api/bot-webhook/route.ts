import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, meetingParticipants, transcriptSegments } from "@/db/schema";
import { generateMeetingIntelligence } from "@/lib/intelligence";

// Receives events from the meeting-bot provider (Recall.ai by default — see
// src/lib/bot-provider.ts). Payload shape below matches Recall.ai's
// `transcript.data` / `bot.status_change` webhook events; adjust field names
// here once RECALL_API_KEY is live and you can see real payloads, since this
// hasn't been verified against traffic yet.
//
// TODO before production: verify the `x-recall-signature` header against
// RECALL_WEBHOOK_SECRET before trusting the body.

export async function POST(req: Request) {
  const payload = await req.json();
  const providerSessionId: string | undefined = payload?.data?.bot?.id ?? payload?.bot_id;

  if (!providerSessionId) {
    return NextResponse.json({ error: "Missing bot id" }, { status: 400 });
  }

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.botProviderSessionId, providerSessionId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "Unknown meeting" }, { status: 404 });
  }

  switch (payload.event) {
    case "bot.status_change": {
      const status = payload?.data?.status?.code;
      if (status === "in_call_recording") {
        await db
          .update(meetings)
          .set({ status: "in_progress", startedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      } else if (status === "call_ended" || status === "done") {
        await db
          .update(meetings)
          .set({ status: "processing", endedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
        try {
          await generateMeetingIntelligence(meeting.id);
        } catch (err) {
          console.error("Failed to generate meeting intelligence", err);
          await db
            .update(meetings)
            .set({ status: "failed" })
            .where(eq(meetings.id, meeting.id));
        }
      }
      break;
    }
    case "transcript.data": {
      const words = payload?.data?.words ?? [];
      const speakerLabel: string = payload?.data?.speaker ?? "Unknown speaker";
      if (words.length === 0) break;

      let participant = await db.query.meetingParticipants.findFirst({
        where: eq(meetingParticipants.meetingId, meeting.id),
      });
      if (!participant || participant.speakerLabel !== speakerLabel) {
        const existing = await db.query.meetingParticipants.findMany({
          where: eq(meetingParticipants.meetingId, meeting.id),
        });
        participant = existing.find((p) => p.speakerLabel === speakerLabel);
        if (!participant) {
          [participant] = await db
            .insert(meetingParticipants)
            .values({ meetingId: meeting.id, speakerLabel })
            .returning();
        }
      }

      const text = words.map((w: { text: string }) => w.text).join(" ");
      await db.insert(transcriptSegments).values({
        meetingId: meeting.id,
        participantId: participant.id,
        startMs: Math.round((payload.data.words[0]?.start_timestamp?.relative ?? 0) * 1000),
        endMs: Math.round(
          (payload.data.words.at(-1)?.end_timestamp?.relative ?? 0) * 1000
        ),
        text,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
