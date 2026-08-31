import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { actionItems, meetings } from "@/db/schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const item = await db.query.actionItems.findFirst({
    where: eq(actionItems.id, id),
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, item.meetingId),
  });
  if (!meeting || meeting.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(actionItems)
    .set({
      completed: typeof body.completed === "boolean" ? body.completed : item.completed,
      assignee: typeof body.assignee === "string" ? body.assignee : item.assignee,
      dueDate: body.dueDate ? new Date(body.dueDate) : item.dueDate,
    })
    .where(eq(actionItems.id, id))
    .returning();

  return NextResponse.json(updated);
}
