"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AskAiPanel({ meetingId }: { meetingId: string }) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: `/api/meetings/${meetingId}/chat` }),
  });
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col border-t">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ask AI about this meeting
        </h3>
      </div>
      {messages.length > 0 && (
        <ScrollArea className="max-h-56">
          <div className="flex flex-col gap-3 px-4 py-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium">{m.role === "user" ? "You" : "AI"}: </span>
                {m.parts.map((part, i) =>
                  part.type === "text" ? <span key={i}>{part.text}</span> : null
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="flex items-center gap-2 p-4 pt-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about decisions or notes..."
          disabled={status !== "ready"}
        />
        <Button type="submit" size="icon" disabled={status !== "ready" || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
