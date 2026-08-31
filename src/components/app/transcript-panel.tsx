"use client";

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptPanel({
  audioUrl,
  durationSeconds,
  segments,
}: {
  audioUrl: string | null;
  durationSeconds: number | null;
  segments: { id: string; startMs: number; text: string; speaker: string }[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  function seekTo(ms: number) {
    if (!audioRef.current) {
      setCurrentMs(ms);
      return;
    }
    audioRef.current.currentTime = ms / 1000;
    audioRef.current.play();
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  const total = durationSeconds ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b p-4">
        {audioUrl ? (
          <div className="flex items-center gap-3">
            <Button size="icon" variant="outline" onClick={togglePlay}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatMs(currentMs)} / {formatMs(total * 1000)}
            </span>
            <audio
              ref={audioRef}
              src={audioUrl}
              className="hidden"
              onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Button size="icon" variant="outline" disabled>
              <Play className="h-4 w-4" />
            </Button>
            <span>
              Audio not available yet
              {total > 0 ? ` · ${formatMs(total * 1000)} total` : ""}
            </span>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transcript yet. It will appear here once the recording is processed.
            </p>
          ) : (
            segments.map((s) => (
              <button
                key={s.id}
                onClick={() => seekTo(s.startMs)}
                className={cn(
                  "flex gap-3 text-left rounded-md p-1.5 -m-1.5 hover:bg-muted",
                  Math.abs(currentMs - s.startMs) < 3000 && "bg-muted"
                )}
              >
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground pt-0.5">
                  {formatMs(s.startMs)}
                </span>
                <div>
                  <p className="text-sm font-medium">{s.speaker}</p>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
