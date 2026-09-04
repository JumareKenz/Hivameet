import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { getMeetingDetail } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionItemRow } from "@/components/app/action-item-row";
import { TranscriptPanel } from "@/components/app/transcript-panel";
import { AskAiPanel } from "@/components/app/ask-ai-panel";
import { ExportMenu } from "@/components/app/export-menu";
import { DeleteMeetingButton } from "@/components/app/delete-meeting-button";
import { cn } from "@/lib/utils";
import {
  Users,
  Clock,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  Video,
  ExternalLink,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  awaiting_admission: { label: "Waiting to join", className: "bg-gold-100 text-gold-600" },
  in_progress: { label: "Recording", className: "bg-red-100 text-red-800" },
  processing: { label: "Analyzing", className: "bg-blue-100 text-blue-800" },
  completed: { label: "Ready", className: "bg-brand-100 text-brand-700" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-gold-100 text-gold-600",
  low: "bg-muted text-muted-foreground",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-gold-100 text-gold-600",
  low: "bg-muted text-muted-foreground",
};

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const detail = await getMeetingDetail(session.user.id, id);
  if (!detail) notFound();

  const {
    meeting,
    segments,
    invitees,
    keyInsights,
    recommendations,
    actionItems,
    overview,
    discussionPoints,
    decisions,
    risks,
    openQuestions,
    topics,
  } = detail;

  const status = STATUS_LABELS[meeting.status] ?? STATUS_LABELS.scheduled;
  const isUpcoming = meeting.status === "scheduled" && meeting.scheduledStartAt;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg font-semibold">{meeting.title}</h1>
            <Badge variant="secondary" className={status.className}>
              {status.label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(meeting.startedAt ?? meeting.scheduledStartAt) && (
              <span>
                {format(new Date(meeting.startedAt ?? meeting.scheduledStartAt!), "MMM d, yyyy · h:mm a")}
              </span>
            )}
            {meeting.durationSeconds && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {Math.round(meeting.durationSeconds / 60)} mins
              </span>
            )}
            {(meeting.participantCount || invitees.length > 0) && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {meeting.participantCount || invitees.length} participant
                {(meeting.participantCount || invitees.length) === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUpcoming && meeting.meetingUrl && (
            <a href={meeting.meetingUrl} target="_blank" rel="noreferrer">
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Video className="h-4 w-4" />
                Join meeting
                <ExternalLink className="h-3 w-3" />
              </button>
            </a>
          )}
          <ExportMenu meetingId={meeting.id} />
          <DeleteMeetingButton
            meetingId={meeting.id}
            meetingTitle={meeting.title}
            redirectTo="/dashboard"
          />
        </div>
      </header>

      {meeting.status === "failed" && meeting.failureReason && (
        <div className="flex items-center gap-2 border-b bg-destructive/5 px-6 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{meeting.failureReason}</span>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col overflow-y-auto border-r">
          <Tabs defaultValue="summary" className="flex flex-1 flex-col">
            <TabsList className="mx-6 mt-4 w-fit">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="decisions">Decisions &amp; Actions</TabsTrigger>
              <TabsTrigger value="risks">Risks &amp; Questions</TabsTrigger>
              <TabsTrigger value="discussion">Discussion</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="flex flex-col gap-4 p-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {meeting.executiveSummary ? (
                    <div className="flex flex-col gap-3 text-sm leading-relaxed">
                      {meeting.executiveSummary.split("\n\n").map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {meeting.status === "processing"
                        ? "Your meeting intelligence report is being generated — check back shortly."
                        : "No summary yet."}
                    </p>
                  )}
                </CardContent>
              </Card>

              {overview && (overview.purpose || overview.majorTopics.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                      Meeting Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {overview.purpose && <p className="text-sm">{overview.purpose}</p>}
                    {overview.majorTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {overview.majorTopics.map((t) => (
                          <Badge key={t} variant="secondary" className="bg-muted font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {keyInsights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wide text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Key Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1.5 pl-4 text-sm">
                      {keyInsights.map((i) => (
                        <li key={i.id}>{i.content}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="decisions" className="flex flex-col gap-4 p-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                    Decisions Made
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {decisions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No clear decisions were made in this meeting.
                    </p>
                  ) : (
                    <div className="flex flex-col divide-y">
                      {decisions.map((d, i) => (
                        <div key={i} className="py-3 first:pt-0 last:pb-0">
                          <p className="text-sm font-medium">{d.decision}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{d.context}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {d.owner && <span>Owner: {d.owner}</span>}
                            {d.implications && <span>Implications: {d.implications}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
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
                      <div key={a.id} className="flex items-center gap-2">
                        <ActionItemRow
                          id={a.id}
                          text={a.text}
                          assignee={a.assignee ?? "Owner not specified"}
                          dueDate={a.dueDate}
                          completed={a.completed}
                        />
                        <Badge
                          variant="secondary"
                          className={cn("shrink-0 font-normal", PRIORITY_STYLES[a.priority])}
                        >
                          {a.priority}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="risks" className="flex flex-col gap-4 p-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wide text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Risks &amp; Concerns
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {risks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None identified.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {risks.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Badge
                            variant="secondary"
                            className={cn("mt-0.5 shrink-0 font-normal", SEVERITY_STYLES[r.severity])}
                          >
                            {r.severity}
                          </Badge>
                          <p className="text-sm">
                            {r.description}
                            {!r.wasExplicit && (
                              <span className="ml-1.5 text-xs italic text-muted-foreground">
                                (AI-inferred)
                              </span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wide text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Open Questions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {openQuestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing was left unresolved.
                    </p>
                  ) : (
                    <ul className="list-disc space-y-1.5 pl-4 text-sm">
                      {openQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      {recommendations.map((r, i) => (
                        <div key={i} className="text-sm">
                          <p>{r.text}</p>
                          {r.rationale && (
                            <p className="text-xs text-muted-foreground">{r.rationale}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="discussion" className="flex flex-col gap-4 p-6 pt-4">
              {topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t, i) => (
                    <Badge key={i} variant="secondary" className="bg-muted font-normal">
                      {t.label}
                    </Badge>
                  ))}
                </div>
              )}
              {discussionPoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">No discussion breakdown available.</p>
              ) : (
                discussionPoints.map((d, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">{d.topic}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <p>{d.summary}</p>
                      {d.viewpoints.length > 0 && (
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {d.viewpoints.map((v, vi) => (
                            <li key={vi}>{v}</li>
                          ))}
                        </ul>
                      )}
                      {d.conclusion && (
                        <p className="text-xs font-medium text-brand-600">→ {d.conclusion}</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
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
