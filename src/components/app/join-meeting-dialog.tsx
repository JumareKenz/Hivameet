"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { toast } from "sonner";

export function JoinMeetingDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleJoin() {
    startTransition(async () => {
      const res = await fetch("/api/meetings/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't dispatch the bot");
        return;
      }
      toast.success("Bot is on its way to the meeting");
      setOpen(false);
      setUrl("");
      router.push(`/meetings/${data.meetingId}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Join a meeting
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send your notetaker to a meeting</DialogTitle>
          <DialogDescription>
            Paste a Google Meet, Zoom, or Microsoft Teams link. The bot joins
            within about a minute.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meeting-url">Meeting link</Label>
          <Input
            id="meeting-url"
            placeholder="https://meet.google.com/abc-defg-hij"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleJoin} disabled={!url || pending}>
            {pending ? "Dispatching..." : "Join now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
