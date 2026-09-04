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

  const nextText = typeof body.text === "string" ? body.text : item.text;
  const nextAssignee = typeof body.assignee === "string" ? body.assignee : item.assignee;
  const nextDueDate = body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : item.dueDate;
  const nextPriority = ["low", "medium", "high"].includes(body.priority) ? body.priority : item.priority;

  // Toggling "completed" isn't editing the AI's extraction, just tracking
  // status — only flag userEdited when the actual content changed, so the
  // UI can honestly distinguish "AI-extracted" from "user-confirmed/edited".
  const contentChanged =
    nextText !== item.text ||
    nextAssignee !== item.assignee ||
    nextDueDate?.getTime() !== item.dueDate?.getTime() ||
    nextPriority !== item.priority;

  const [updated] = await db
    .update(actionItems)
    .set({
      completed: typeof body.completed === "boolean" ? body.completed : item.completed,
      text: nextText,
      assignee: nextAssignee,
      dueDate: nextDueDate,
      priority: nextPriority,
      userEdited: item.userEdited || contentChanged,
    })
    .where(eq(actionItems.id, id))
    .returning();

  return NextResponse.json(updated);
}
