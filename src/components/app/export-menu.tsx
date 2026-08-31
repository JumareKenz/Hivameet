"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const destinations = ["Slack", "Notion", "Asana", "Google Docs", "Email"];

export function ExportMenu() {
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
