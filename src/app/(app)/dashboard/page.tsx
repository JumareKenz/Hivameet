import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { getMeetingsForUser } from "@/lib/data";
import { getBalanceKobo } from "@/lib/billing/credits";
import { MIN_BALANCE_TO_JOIN_KOBO } from "@/lib/billing/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinMeetingDialog } from "@/components/app/join-meeting-dialog";
import { Users, Clock, Video, AlertTriangle } from "lucide-react";

const statusVariant: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  awaiting_admission: { label: "Waiting to join", className: "bg-gold-100 text-gold-600" },
  in_progress: { label: "Recording", className: "bg-red-100 text-red-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", className: "bg-brand-100 text-brand-700" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [meetingList, balanceKobo] = await Promise.all([
    getMeetingsForUser(session.user.id),
    getBalanceKobo(session.user.id),
  ]);
  const lowBalance = balanceKobo < MIN_BALANCE_TO_JOIN_KOBO;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-semibold">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Everything your notetaker has captured.
          </p>
        </div>
        <JoinMeetingDialog />
      </header>

      {lowBalance && (
        <div className="flex items-center gap-2 border-b bg-gold-50 px-6 py-2.5 text-sm text-gold-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {balanceKobo <= 0 ? "You're out of credits." : "Your balance is running low."}{" "}
            <Link href="/billing" className="font-medium underline underline-offset-2">
              Top up
            </Link>{" "}
            to keep auto-join active.
          </span>
        </div>
      )}

      <div className="flex-1 px-6 py-6">
        {meetingList.length === 0 ? (
          <Card className="mx-auto max-w-md border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
                <Video className="h-5 w-5 text-brand-600" />
              </div>
              <p className="font-heading font-medium">No meetings yet</p>
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
                        {m.status === "failed" && m.failureReason && (
                          <p className="mt-2 line-clamp-1 text-sm text-destructive">
                            {m.failureReason}
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
