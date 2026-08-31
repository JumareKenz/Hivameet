import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncUserCalendar } from "@/lib/calendar/sync";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncUserCalendar(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
