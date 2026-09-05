"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AskAiPanel({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: `/api/meetings/${meetingId}/chat` }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[min(32rem,calc(100dvh-8rem))] w-[26rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold">Ask Hiva about the meeting</h3>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 px-4 py-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask about decisions, action items, or anything discussed in this meeting.
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <span className="font-medium">{m.role === "user" ? "You" : "Hiva"}: </span>
                    {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {error && (
            <p className="px-4 pb-1 text-xs text-destructive">
              Couldn&apos;t get a response — check that an AI provider is configured.
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              sendMessage({ text: input });
              setInput("");
            }}
            className="flex items-center gap-2 border-t p-3"
          >
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about this meeting..."
              disabled={busy}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      <Button
        onClick={() => setOpen((o) => !o)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
        aria-label={open ? "Close Ask Hiva" : "Ask Hiva about the meeting"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </>
  );
}
