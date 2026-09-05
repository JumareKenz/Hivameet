import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { auth } from "@/auth";
import { getCalendarItems, type CalendarItem } from "@/lib/calendar/agenda";
import { Badge } from "@/components/ui/badge";
import { CreateMeetingDialog } from "@/components/app/create-meeting-dialog";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week" | "day" | "agenda";
const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  awaiting_admission: "bg-gold-100 text-gold-600",
  in_progress: "bg-red-100 text-red-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-brand-100 text-brand-700",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  awaiting_admission: "Waiting to join",
  in_progress: "Recording",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function calendarHref(view: ViewMode, date: Date) {
  return `/calendar?view=${view}&date=${format(date, "yyyy-MM-dd")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const view: ViewMode = (["month", "week", "day", "agenda"] as const).includes(sp.view as ViewMode)
    ? (sp.view as ViewMode)
    : "month";
  const anchor = sp.date ? parseISO(sp.date) : new Date();

  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "day") {
    rangeStart = startOfDay(anchor);
    rangeEnd = addDays(rangeStart, 1);
  } else if (view === "week") {
    rangeStart = startOfWeek(anchor);
    rangeEnd = addDays(endOfWeek(anchor), 1);
  } else {
    // Month and agenda both browse a month at a time, so they share a range.
    rangeStart = startOfWeek(startOfMonth(anchor));
    rangeEnd = addDays(endOfWeek(endOfMonth(anchor)), 1);
  }

  const items = await getCalendarItems(session.user.id, rangeStart, rangeEnd);

  const prevHref = calendarHref(
    view,
    view === "day" ? addDays(anchor, -1) : view === "week" ? addWeeks(anchor, -1) : addMonths(anchor, -1)
  );
  const nextHref = calendarHref(
    view,
    view === "day" ? addDays(anchor, 1) : view === "week" ? addWeeks(anchor, 1) : addMonths(anchor, 1)
  );
  const todayHref = calendarHref(view, new Date());

  const title =
    view === "day"
      ? format(anchor, "EEEE, MMMM d, yyyy")
      : view === "week"
        ? `${format(startOfWeek(anchor), "MMM d")} – ${format(endOfWeek(anchor), "MMM d, yyyy")}`
        : format(anchor, "MMMM yyyy");

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Hivameet meetings and your connected calendars, in one place.
          </p>
        </div>
        <CreateMeetingDialog />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={prevHref}
            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={nextHref}
            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href={todayHref} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            Today
          </Link>
          <span className="ml-2 font-heading text-base font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={calendarHref(v.value, anchor)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                v.value === view ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        {view === "month" && <MonthGrid anchor={anchor} items={items} />}
        {view === "week" && <WeekColumns anchor={anchor} items={items} />}
        {view === "day" && <DayList anchor={anchor} items={items} />}
        {view === "agenda" && <AgendaList anchor={anchor} items={items} />}
      </div>
    </div>
  );
}

function ItemChip({ item }: { item: CalendarItem }) {
  const style = item.status ? (STATUS_STYLES[item.status] ?? STATUS_STYLES.scheduled) : "bg-muted text-muted-foreground";
  return (
    <span className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium", style)}>
      {format(item.startTime, "h:mm a")} · {item.title}
    </span>
  );
}

function MonthGrid({ anchor, items }: { anchor: Date; items: CalendarItem[] }) {
  const gridStart = startOfWeek(startOfMonth(anchor));
  const gridEnd = endOfWeek(endOfMonth(anchor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdayLabels = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 6) }).map((d) =>
    format(d, "EEE")
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 gap-px bg-border">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((day) => {
          const dayItems = items
            .filter((it) => isSameDay(it.startTime, day))
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
          const inMonth = isSameMonth(day, anchor);
          const visible = dayItems.slice(0, 3);
          const overflow = dayItems.length - visible.length;
          return (
            <Link
              key={day.toISOString()}
              href={calendarHref("day", day)}
              className={cn(
                "flex min-h-[112px] flex-col gap-1 bg-background p-1.5 transition-colors hover:bg-muted/40",
                !inMonth && "bg-muted/20 text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "self-start rounded-full px-1.5 text-xs font-medium",
                  isToday(day) && "bg-brand-600 text-white"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-1">
                {visible.map((it) => (
                  <ItemChip key={it.id} item={it} />
                ))}
                {overflow > 0 && <span className="px-1 text-[11px] text-muted-foreground">+{overflow} more</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const content = (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md border transition-colors hover:bg-muted/40",
        compact ? "px-1.5 py-1.5" : "px-2.5 py-2"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{item.title}</span>
        {item.status && (
          <Badge variant="secondary" className={cn("shrink-0", STATUS_STYLES[item.status] ?? STATUS_STYLES.scheduled)}>
            {STATUS_LABELS[item.status] ?? item.status}
          </Badge>
        )}
        {!item.meetingId && (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {item.source === "google" ? "Google" : "Microsoft"}
          </Badge>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {format(item.startTime, "h:mm a")} – {format(item.endTime, "h:mm a")}
      </span>
    </div>
  );

  if (item.meetingId) return <Link href={`/meetings/${item.meetingId}`}>{content}</Link>;
  if (item.meetingUrl)
    return (
      <a href={item.meetingUrl} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  return content;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
      <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
      {message}
    </div>
  );
}

function WeekColumns({ anchor, items }: { anchor: Date; items: CalendarItem[] }) {
  const days = eachDayOfInterval({ start: startOfWeek(anchor), end: endOfWeek(anchor) });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((day) => {
        const dayItems = items
          .filter((it) => isSameDay(it.startTime, day))
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        return (
          <div key={day.toISOString()} className="flex flex-col gap-2 rounded-lg border p-2">
            <Link href={calendarHref("day", day)} className="flex items-baseline justify-between hover:underline">
              <span className="text-xs font-medium text-muted-foreground">{format(day, "EEE")}</span>
              <span className={cn("text-sm font-semibold", isToday(day) && "text-brand-600")}>
                {format(day, "d")}
              </span>
            </Link>
            <div className="flex flex-col gap-1.5">
              {dayItems.length === 0 && <span className="text-xs text-muted-foreground/60">Nothing scheduled</span>}
              {dayItems.map((it) => (
                <EventRow key={it.id} item={it} compact />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayList({ anchor, items }: { anchor: Date; items: CalendarItem[] }) {
  const dayItems = items
    .filter((it) => isSameDay(it.startTime, anchor))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  if (dayItems.length === 0) return <EmptyState message="Nothing scheduled for this day." />;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-2">
      {dayItems.map((it) => (
        <EventRow key={it.id} item={it} />
      ))}
    </div>
  );
}

function AgendaList({ anchor, items }: { anchor: Date; items: CalendarItem[] }) {
  const monthItems = items.filter((it) => isSameMonth(it.startTime, anchor));
  if (monthItems.length === 0) return <EmptyState message="Nothing scheduled this month." />;

  const byDay = new Map<string, CalendarItem[]>();
  for (const it of monthItems) {
    const key = format(it.startTime, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(it);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      {days.map((key) => {
        const day = parseISO(key);
        const dayItems = byDay.get(key)!.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        return (
          <div key={key}>
            <h3 className={cn("mb-2 text-sm font-semibold", isToday(day) && "text-brand-600")}>
              {format(day, "EEEE, MMMM d")}
            </h3>
            <div className="flex flex-col gap-2">
              {dayItems.map((it) => (
                <EventRow key={it.id} item={it} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
