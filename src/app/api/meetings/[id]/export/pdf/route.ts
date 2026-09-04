import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { creditTransactions } from "@/db/schema";
import { getMeetingDetail } from "@/lib/data";
import { renderToBuffer } from "@react-pdf/renderer";
import { MeetingReport } from "@/lib/pdf/meeting-report";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: meetingId } = await params;
  const detail = await getMeetingDetail(session.user.id, meetingId);
  if (!detail) {
    return new Response("Not found", { status: 404 });
  }

  const charge = await db.query.creditTransactions.findFirst({
    where: and(
      eq(creditTransactions.meetingId, meetingId),
      eq(creditTransactions.type, "meeting_charge")
    ),
  });

  const buffer = await renderToBuffer(
    MeetingReport({
      meeting: detail.meeting,
      keyInsights: detail.keyInsights,
      recommendations: detail.recommendations,
      decisions: detail.decisions,
      risks: detail.risks,
      openQuestions: detail.openQuestions,
      actionItems: detail.actionItems,
      reminders: detail.reminders,
      participants: detail.participants,
      chargeKobo: charge ? Math.abs(charge.amountKobo) : null,
    })
  );

  const safeFilename = detail.meeting.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename || "meeting"}-hivameet-report.pdf"`,
    },
  });
}
