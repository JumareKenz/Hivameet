"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PLATFORMS = [
  {
    value: "google_meet",
    label: "Google Meet",
    blurb: "Auto-generated Meet link",
    dot: "bg-[#00832d]",
  },
  {
    value: "zoom",
    label: "Zoom",
    blurb: "Instant Zoom meeting",
    dot: "bg-[#2d8cff]",
  },
  {
    value: "ms_teams",
    label: "Microsoft Teams",
    blurb: "Teams calendar invite",
    dot: "bg-[#5b5fc7]",
  },
] as const;

type Platform = (typeof PLATFORMS)[number]["value"];

function defaultDateTime(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm for <input type="datetime-local">
}

export function CreateMeetingDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("google_meet");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agenda, setAgenda] = useState("");
  const [startAt, setStartAt] = useState(() => defaultDateTime(30));
  const [endAt, setEndAt] = useState(() => defaultDateTime(60));
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [autoRecord, setAutoRecord] = useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addAttendee() {
    const email = attendeeInput.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("That doesn't look like a valid email");
      return;
    }
    if (!attendees.includes(email)) setAttendees([...attendees, email]);
    setAttendeeInput("");
  }

  function reset() {
    setTitle("");
    setDescription("");
    setAgenda("");
    setStartAt(defaultDateTime(30));
    setEndAt(defaultDateTime(60));
    setAttendees([]);
    setAttendeeInput("");
    setAutoRecord(true);
    setPlatform("google_meet");
  }

  function handleCreate() {
    if (!title.trim()) {
      toast.error("Give the meeting a title");
      return;
    }
    startTransition(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/meetings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          agenda: agenda.trim() || null,
          platform,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          timezone,
          attendees: attendees.map((email) => ({ email })),
          autoRecord,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't create the meeting");
        return;
      }
      toast.success("Meeting created", {
        description: autoRecord
          ? "Hivameet will join automatically when it starts."
          : "Auto-record is off — join it manually when you're ready.",
      });
      setOpen(false);
      reset();
      router.push(`/meetings/${data.meetingId}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Create meeting
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a meeting</DialogTitle>
          <DialogDescription>
            Hivameet creates the real meeting and can join it automatically when it starts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPlatform(p.value)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors",
                  platform === p.value
                    ? "border-primary bg-accent ring-1 ring-primary"
                    : "border-border hover:bg-muted/60"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                  <span className="text-sm font-medium">{p.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">{p.blurb}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              placeholder="Weekly Product Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="meeting-start">Starts</Label>
              <Input
                id="meeting-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="meeting-end">Ends</Label>
              <Input
                id="meeting-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="meeting-description">Description</Label>
            <Textarea
              id="meeting-description"
              placeholder="What's this meeting about?"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="meeting-agenda">Agenda (optional)</Label>
            <Textarea
              id="meeting-agenda"
              placeholder={"1. Review last week's actions\n2. ..."}
              rows={2}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="meeting-attendees">Invitees</Label>
            <div className="flex gap-2">
              <Input
                id="meeting-attendees"
                type="email"
                placeholder="name@company.com"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAttendee();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addAttendee}>
                Add
              </Button>
            </div>
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => setAttendees(attendees.filter((a) => a !== email))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-start gap-2.5">
              <Video className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Auto-record with Hivameet</p>
                <p className="text-xs text-muted-foreground">
                  The bot joins automatically when this meeting starts.
                </p>
              </div>
            </div>
            <Switch checked={autoRecord} onCheckedChange={setAutoRecord} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? "Creating..." : "Create meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
