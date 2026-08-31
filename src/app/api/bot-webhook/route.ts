import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, meetingParticipants, transcriptSegments } from "@/db/schema";
import { generateMeetingIntelligence } from "@/lib/intelligence";

// Receives webhook events from Attendee (github.com/attendee-labs/attendee),
// the self-hosted bot provider — see src/lib/bot-provider.ts. Payload shapes
// and state/event codes below come from the Attendee source
// (bots/models.py: BotStates, BotEventTypes) and docs.attendee.dev/guides/webhooks.

interface AttendeeWebhookPayload {
  bot_id: string;
  trigger: "bot.state_change" | "transcript.update";
  data: Record<string, unknown>;
}

function isSignatureValid(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ATTENDEE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "ATTENDEE_WEBHOOK_SECRET is not set — accepting bot webhook without verifying its signature."
    );
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(rawBody)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return (
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)
  );
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!isSignatureValid(rawBody, req.headers.get("x-webhook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: AttendeeWebhookPayload = JSON.parse(rawBody);

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.botProviderSessionId, payload.bot_id),
  });
  if (!meeting) {
    return NextResponse.json({ error: "Unknown meeting" }, { status: 404 });
  }

  switch (payload.trigger) {
    case "bot.state_change": {
      const newState = payload.data.new_state as string;
      const eventType = payload.data.event_type as string;

      if (newState === "joined_recording") {
        await db
          .update(meetings)
          .set({ status: "in_progress", startedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      } else if (eventType === "meeting_ended") {
        await db
          .update(meetings)
          .set({ status: "processing", endedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      } else if (eventType === "post_processing_completed") {
        try {
          await generateMeetingIntelligence(meeting.id);
        } catch (err) {
          console.error("Failed to generate meeting intelligence", err);
          await db
            .update(meetings)
            .set({ status: "failed" })
            .where(eq(meetings.id, meeting.id));
        }
      } else if (eventType === "fatal_error" || eventType === "could_not_join_meeting") {
        await db
          .update(meetings)
          .set({ status: "failed" })
          .where(eq(meetings.id, meeting.id));
      }
      break;
    }

    case "transcript.update": {
      const speakerUuid = payload.data.speaker_uuid as string;
      const speakerName = payload.data.speaker_name as string;
      const timestampMs = payload.data.timestamp_ms as number;
      const durationMs = payload.data.duration_ms as number;
      const text = (payload.data.transcription as { transcript?: string } | null)?.transcript;
      if (!text) break;

      let participant = (
        await db.query.meetingParticipants.findMany({
          where: eq(meetingParticipants.meetingId, meeting.id),
        })
      ).find((p) => p.speakerLabel === speakerUuid);

      if (!participant) {
        [participant] = await db
          .insert(meetingParticipants)
          .values({
            meetingId: meeting.id,
            speakerLabel: speakerUuid,
            displayName: speakerName,
          })
          .returning();
      }

      await db.insert(transcriptSegments).values({
        meetingId: meeting.id,
        participantId: participant.id,
        startMs: timestampMs,
        endMs: timestampMs + durationMs,
        text,
      });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
