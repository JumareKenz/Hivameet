import { notFound } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { getMeetingDetail } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionItemRow } from "@/components/app/action-item-row";
import { TranscriptPanel } from "@/components/app/transcript-panel";
import { AskAiPanel } from "@/components/app/ask-ai-panel";
import { ExportMenu } from "@/components/app/export-menu";
import { Users, Clock, BellRing } from "lucide-react";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const detail = await getMeetingDetail(session!.user.id, id);
  if (!detail) notFound();

  const { meeting, segments, keyInsights, recommendations, actionItems, reminders } = detail;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{meeting.title}</h1>
            <Badge variant="secondary">{meeting.status.replace("_", " ")}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {meeting.startedAt && (
              <span>{format(new Date(meeting.startedAt), "MMM d, yyyy")}</span>
            )}
            {meeting.durationSeconds && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {Math.round(meeting.durationSeconds / 60)} mins
              </span>
            )}
            {meeting.participantCount && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {meeting.participantCount} participants
              </span>
            )}
          </div>
        </div>
        <ExportMenu />
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col overflow-y-auto border-r p-6">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.executiveSummary ? (
                <p className="text-sm">{meeting.executiveSummary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {meeting.status === "processing"
                    ? "Still processing this meeting — check back shortly."
                    : "No summary yet."}
                </p>
              )}
            </CardContent>
          </Card>

          {keyInsights.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {keyInsights.map((i) => (
                    <li key={i.id}>{i.content}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {recommendations.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {recommendations.map((i) => (
                    <li key={i.id}>{i.content}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                Next Steps &amp; Action Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No action items extracted.</p>
              ) : (
                actionItems.map((a) => (
                  <ActionItemRow
                    key={a.id}
                    id={a.id}
                    text={a.text}
                    assignee={a.assignee}
                    dueDate={a.dueDate}
                    completed={a.completed}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                  Reminders
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {reminders.map((r) => (
                  <p key={r.id} className="flex items-start gap-2 text-sm">
                    <BellRing className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    {r.text}
                    {r.triggerAt && (
                      <span className="text-muted-foreground">
                        · {format(new Date(r.triggerAt), "EEE, MMM d")}
                      </span>
                    )}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col overflow-hidden">
          <TranscriptPanel
            audioUrl={meeting.audioUrl}
            durationSeconds={meeting.durationSeconds}
            segments={segments}
          />
          <AskAiPanel meetingId={meeting.id} />
        </div>
      </div>
    </div>
  );
}
