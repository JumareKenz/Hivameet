import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { detectPlatform, dispatchBot, BotProviderNotConfiguredError } from "@/lib/bot-provider";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingUrl } = await req.json();
  if (!meetingUrl || typeof meetingUrl !== "string") {
    return NextResponse.json({ error: "meetingUrl is required" }, { status: 400 });
  }

  const platform = detectPlatform(meetingUrl);
  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId: session.user.id,
      title: "Ad-hoc meeting",
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
    if (err instanceof BotProviderNotConfiguredError) {
      // Keep the meeting record so the flow/UI is visible end-to-end, but
      // surface the missing credential clearly instead of failing silently.
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
