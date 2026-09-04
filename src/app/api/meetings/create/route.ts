import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, meetingInvitees } from "@/db/schema";
import {
  getMeetingProvider,
  ProviderNotConnectedError,
  ProviderReauthRequiredError,
  type CreatableMeetingPlatform,
} from "@/lib/meeting-providers";

const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  agenda: z.string().trim().max(5000).nullable().optional(),
  platform: z.enum(["google_meet", "ms_teams", "zoom"]),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().trim().min(1),
  attendees: z
    .array(z.object({ email: z.string().email(), name: z.string().trim().optional() }))
    .max(50)
    .default([]),
  autoRecord: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createMeetingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt <= startAt) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const provider = getMeetingProvider(input.platform as CreatableMeetingPlatform);

  try {
    const created = await provider.createMeeting({
      userId: session.user.id,
      title: input.title,
      description: input.description ?? null,
      agenda: input.agenda ?? null,
      startAt,
      endAt,
      timezone: input.timezone,
      attendees: input.attendees,
    });

    const [meeting] = await db
      .insert(meetings)
      .values({
        userId: session.user.id,
        title: input.title,
        description: input.description ?? null,
        agenda: input.agenda ?? null,
        platform: input.platform,
        meetingUrl: created.joinUrl,
        hostUrl: created.hostUrl ?? null,
        creationSource: "hivameet_created",
        providerMeetingId: created.providerMeetingId,
        calendarEventId: created.calendarEventId ?? null,
        status: "scheduled",
        timezone: input.timezone,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        autoRecord: input.autoRecord,
      })
      .returning();

    if (input.attendees.length > 0) {
      await db.insert(meetingInvitees).values(
        input.attendees.map((a) => ({ meetingId: meeting.id, email: a.email, name: a.name }))
      );
    }

    return NextResponse.json({
      meetingId: meeting.id,
      joinUrl: created.joinUrl,
      hostUrl: created.hostUrl ?? null,
    });
  } catch (err) {
    if (err instanceof ProviderNotConnectedError) {
      return NextResponse.json({ error: err.message }, { status: 424 });
    }
    if (err instanceof ProviderReauthRequiredError) {
      return NextResponse.json({ error: err.message, reauthRequired: true }, { status: 424 });
    }
    console.error("Failed to create meeting", err);
    return NextResponse.json({ error: "Couldn't create the meeting" }, { status: 502 });
  }
}
