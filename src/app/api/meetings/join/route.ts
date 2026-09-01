import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { detectPlatform, dispatchBot, BotProviderNotConfiguredError } from "@/lib/bot-provider";
import { hasEnoughCreditsToJoin } from "@/lib/billing/credits";

const platformLabels: Record<ReturnType<typeof detectPlatform>, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  ms_teams: "Teams",
  unknown: "Meeting",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingUrl, title } = await req.json();
  if (!meetingUrl || typeof meetingUrl !== "string") {
    return NextResponse.json({ error: "meetingUrl is required" }, { status: 400 });
  }

  if (!(await hasEnoughCreditsToJoin(session.user.id))) {
    return NextResponse.json(
      { error: "Not enough credits to join a meeting. Top up in Billing." },
      { status: 402 }
    );
  }

  const platform = detectPlatform(meetingUrl);
  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const meetingTitle =
    typeof title === "string" && title.trim()
      ? title.trim()
      : `${platformLabels[platform]} call — ${format(new Date(), "MMM d, yyyy")}`;

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId: session.user.id,
      title: meetingTitle,
      platform,
      meetingUrl,
      status: "awaiting_admission",
    })
    .returning();

  try {
    const { providerSessionId } = await dispatchBot({
      meetingUrl,
      botDisplayName: session.user.name
        ? `${session.user.name.split(" ")[0]}'s AI Assistant`
        : "Hivameet Notetaker",
      webhookUrl: `${baseUrl}/api/bot-webhook`,
    });

    await db
      .update(meetings)
      .set({ botProviderSessionId: providerSessionId })
      .where(eq(meetings.id, meeting.id));
  } catch (err) {
    // Keep the meeting record so the failed attempt stays visible on the
    // dashboard instead of vanishing, but don't leave it stuck showing
    // "awaiting admission" forever when no bot was actually dispatched.
    await db.update(meetings).set({ status: "failed" }).where(eq(meetings.id, meeting.id));

    if (err instanceof BotProviderNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, meetingId: meeting.id },
        { status: 424 }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to dispatch bot", meetingId: meeting.id },
      { status: 502 }
    );
  }

  return NextResponse.json({ meetingId: meeting.id });
}
