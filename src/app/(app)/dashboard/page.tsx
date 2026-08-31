import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { getMeetingsForUser } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinMeetingDialog } from "@/components/app/join-meeting-dialog";
import { Users, Clock } from "lucide-react";

const statusVariant: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  awaiting_admission: { label: "Waiting to join", className: "bg-amber-100 text-amber-800" },
  in_progress: { label: "Recording", className: "bg-red-100 text-red-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const meetingList = await getMeetingsForUser(session.user.id);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Everything your notetaker has captured.
          </p>
        </div>
        <JoinMeetingDialog />
      </header>

      <div className="flex-1 px-6 py-6">
        {meetingList.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="font-medium">No meetings yet</p>
              <p className="text-sm text-muted-foreground">
                Connect a calendar in Settings, or paste a meeting link to send
                your notetaker to an active call.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {meetingList.map((m) => {
              const status = statusVariant[m.status] ?? statusVariant.scheduled;
              return (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <Card className="transition-colors hover:bg-muted/40">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate font-medium">{m.title}</h2>
                          <Badge variant="secondary" className={status.className}>
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {m.startedAt && (
                            <span>{format(new Date(m.startedAt), "MMM d, yyyy · h:mm a")}</span>
                          )}
                          {m.durationSeconds && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {Math.round(m.durationSeconds / 60)} min
                            </span>
                          )}
                          {m.participantCount && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {m.participantCount} participants
                            </span>
                          )}
                        </div>
                        {m.executiveSummary && (
                          <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                            {m.executiveSummary}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
