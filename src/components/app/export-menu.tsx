"use client";

import { ChevronDown, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const destinations = ["Slack", "Notion", "Asana", "Google Docs", "Email"];

export function ExportMenu({ meetingId }: { meetingId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            Export <ChevronDown className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `/api/meetings/${meetingId}/export/pdf`;
          }}
        >
          <FileDown className="h-4 w-4" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {destinations.map((d) => (
          <DropdownMenuItem
            key={d}
            onClick={() =>
              toast.info(`${d} export isn't wired up yet`, {
                description: "Connect it from Settings once integrations are configured.",
              })
            }
          >
            {d}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
