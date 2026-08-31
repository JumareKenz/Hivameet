"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SyncCalendarButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSync() {
    startTransition(async () => {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed");
        return;
      }
      if (data.dispatched > 0) {
        toast.success(`Dispatched the bot to ${data.dispatched} meeting(s)`);
        router.refresh();
      } else {
        toast.info(`Synced — scanned ${data.scanned} upcoming event(s), nothing due yet`);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={pending}>
      <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {pending ? "Syncing..." : "Sync now"}
    </Button>
  );
}
