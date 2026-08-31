import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getChatModel } from "@/lib/ai/model";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, transcriptSegments, meetingParticipants } from "@/db/schema";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: meetingId } = await params;
  const { messages }: { messages: UIMessage[] } = await req.json();

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  const [segments, participants] = await Promise.all([
    db.query.transcriptSegments.findMany({
      where: eq(transcriptSegments.meetingId, meetingId),
      orderBy: [transcriptSegments.startMs],
    }),
    db.query.meetingParticipants.findMany({
      where: eq(meetingParticipants.meetingId, meetingId),
    }),
  ]);
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const transcript = segments
    .map((s) => {
      const speaker = s.participantId
        ? participantsById.get(s.participantId)?.displayName ??
          participantsById.get(s.participantId)?.speakerLabel
        : "Unknown";
      const ts = new Date(s.startMs).toISOString().substring(11, 19);
      return `[${ts}] ${speaker}: ${s.text}`;
    })
    .join("\n");

  const result = streamText({
    model: getChatModel(),
    system:
      `You answer questions about the meeting "${meeting.title}" using only ` +
      `the transcript below. Cite the timestamp when it helps. If the answer ` +
      `isn't in the transcript, say so plainly.\n\nTranscript:\n${transcript}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
