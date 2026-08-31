"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function ActionItemRow({
  id,
  text,
  assignee,
  dueDate,
  completed: initialCompleted,
}: {
  id: string;
  text: string;
  assignee: string | null;
  dueDate: Date | null;
  completed: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !completed;
    setCompleted(next);
    startTransition(async () => {
      await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
    });
  }

  return (
    <label className="flex items-start gap-2 py-1 text-sm cursor-pointer">
      <Checkbox checked={completed} onCheckedChange={toggle} className="mt-0.5" />
      <span className={cn("flex-1", completed && "text-muted-foreground line-through")}>
        {text}
        {(assignee || dueDate) && (
          <span className="ml-1 text-muted-foreground">
            ({assignee}
            {assignee && dueDate && " · "}
            {dueDate && format(new Date(dueDate), "MMM d")})
          </span>
        )}
      </span>
    </label>
  );
}
