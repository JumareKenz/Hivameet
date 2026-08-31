import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, meetingParticipants, transcriptSegments } from "@/db/schema";
import { generateMeetingIntelligence } from "@/lib/intelligence";
import { chargeForMeeting } from "@/lib/billing/credits";

// Receives webhook events from Attendee (github.com/attendee-labs/attendee),
// the self-hosted bot provider — see src/lib/bot-provider.ts. Payload shapes
// and state/event codes below come from the Attendee source
// (bots/models.py: BotStates, BotEventTypes) and docs.attendee.dev/guides/webhooks.

interface AttendeeWebhookPayload {
  bot_id: string;
  trigger: "bot.state_change" | "transcript.update";
  data: Record<string, unknown>;
}

/**
 * Reproduces Python's `json.dumps(payload, sort_keys=True, ensure_ascii=False,
 * separators=(",", ":"))` — the exact canonical form Attendee signs
 * (bots/webhook_utils.py's sign_payload). Attendee's own delivery sends the
 * body via `requests.post(json=webhook_data)`, which serializes it
 * differently (unsorted keys, spaces) — so the signature never matches the
 * raw bytes actually on the wire. That's a real bug on Attendee's side, not
 * something a receiver can opt out of: the only way to verify is to parse
 * the body and re-derive the same canonical string they signed.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function isSignatureValid(payload: unknown, signatureHeader: string | null): boolean {
  const secret = process.env.ATTENDEE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "ATTENDEE_WEBHOOK_SECRET is not set — accepting bot webhook without verifying its signature."
    );
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(canonicalJson(payload))
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return (
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)
  );
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const payload: AttendeeWebhookPayload = JSON.parse(rawBody);

  if (!isSignatureValid(payload, req.headers.get("x-webhook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

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

      // Use the event's own timestamp rather than server-processing time —
      // matters for billing/duration accuracy under retries or delivery lag.
      const eventCreatedAt = payload.data.created_at
        ? new Date(payload.data.created_at as string)
        : new Date();

      if (newState === "joined_recording" && meeting.status !== "in_progress") {
        await db
          .update(meetings)
          .set({ status: "in_progress", startedAt: eventCreatedAt })
          .where(eq(meetings.id, meeting.id));
      } else if (
        // "meeting_ended" fires when the meeting itself ends (e.g. the host
        // ends it for everyone); "left_meeting" fires whenever the bot exits
        // for any reason (auto-leave as the last participant, being removed,
        // etc.) — in practice the far more common real-world path. Either
        // one means the call is over; the status guard stops both from
        // double-charging if they both fire for the same call.
        (eventType === "meeting_ended" || eventType === "left_meeting") &&
        meeting.status !== "processing" &&
        meeting.status !== "completed"
      ) {
        const endedAt = eventCreatedAt;
        const durationSeconds = meeting.startedAt
          ? Math.max(0, Math.round((endedAt.getTime() - meeting.startedAt.getTime()) / 1000))
          : null;
        await db
          .update(meetings)
          .set({ status: "processing", endedAt, durationSeconds })
          .where(eq(meetings.id, meeting.id));
        if (durationSeconds) {
          await chargeForMeeting(meeting.id).catch((err) =>
            console.error(`Failed to charge for meeting ${meeting.id}`, err)
          );
        }
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
      // Attendee sends an absolute Unix epoch ms timestamp here, not an
      // offset from meeting start — but transcript_segments.start_ms/end_ms
      // (and the transcript player's seek logic) are meeting-relative, so
      // convert. Also avoids overflowing the integer column with a 13-digit
      // epoch value.
      const absoluteTimestampMs = payload.data.timestamp_ms as number;
      const durationMs = payload.data.duration_ms as number;
      const text = (payload.data.transcription as { transcript?: string } | null)?.transcript;
      if (!text) break;

      const meetingStartMs = meeting.startedAt ? meeting.startedAt.getTime() : absoluteTimestampMs;
      const relativeStartMs = Math.max(0, absoluteTimestampMs - meetingStartMs);

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
        startMs: relativeStartMs,
        endMs: relativeStartMs + durationMs,
        text,
      });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
