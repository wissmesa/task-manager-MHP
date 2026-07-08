"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  deleteRecurringTask,
  toggleRecurringCompletion,
  type RecurringTaskDTO,
  type CompletionInfo,
} from "@/lib/recurring-actions";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  describeRecurrence,
  generateOccurrences,
  occurrenceForDate,
  periodsSinceCreation,
  type Occurrence,
  type OccurrenceStatus,
} from "@/lib/recurrence";

type OccView = "strip" | "calendar";

interface RecurringTasksViewProps {
  tasks: RecurringTaskDTO[];
  currentUserName: string;
}

const PERIOD_COUNT: Record<RecurringTaskDTO["frequency"], number> = {
  daily: 14,
  weekly: 8,
  monthly: 6,
};

interface DeptSummary {
  id: string;
  name: string;
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

function currentStatusOf(task: RecurringTaskDTO): OccurrenceStatus {
  const occ = generateOccurrences({
    frequency: task.frequency,
    dueWeekday: task.dueWeekday,
    dueDayOfMonth: task.dueDayOfMonth,
    completedKeys: new Set(task.completedKeys),
    count: 1,
    createdAt: task.createdAt,
  });
  return occ[0]?.status ?? "pending";
}

export function RecurringTasksView({ tasks, currentUserName }: RecurringTasksViewProps) {
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [occView, setOccView] = useState<OccView>("strip");

  const summaries = useMemo<DeptSummary[]>(() => {
    const map = new Map<string, DeptSummary>();
    for (const t of tasks) {
      const key = t.departmentId;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: t.departmentName ?? "No department",
          total: 0,
          done: 0,
          pending: 0,
          overdue: 0,
        });
      }
      const s = map.get(key)!;
      s.total++;
      const st = currentStatusOf(t);
      if (st === "done") s.done++;
      else if (st === "overdue") s.overdue++;
      else s.pending++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const selected = selectedDeptId
    ? summaries.find((s) => s.id === selectedDeptId) ?? null
    : null;

  const deptTasks = useMemo(() => {
    if (!selectedDeptId) return [];
    const q = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        t.departmentId === selectedDeptId &&
        (!q || t.title.toLowerCase().includes(q))
    );
  }, [tasks, selectedDeptId, search]);

  const newButton = (
    <Button asChild>
      <Link href="/recurring/new">
        <Plus className="mr-2 h-4 w-4" />
        New Recurring Task
      </Link>
    </Button>
  );

  if (tasks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Recurring Tasks</h1>
          {newButton}
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Repeat className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No recurring tasks yet. Create one to start tracking ongoing work.
            </p>
            <Button asChild variant="outline">
              <Link href="/recurring/new">
                <Plus className="mr-2 h-4 w-4" />
                New Recurring Task
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Department detail view ──────────────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="w-fit gap-2 px-2 text-muted-foreground"
            onClick={() => {
              setSelectedDeptId(null);
              setSearch("");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            All departments
          </Button>
          {newButton}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{selected.name}</h1>
          <Badge variant="secondary">{selected.total} tasks</Badge>
          <SummaryPills summary={selected} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks in this department..."
              className="pl-9"
            />
          </div>
          <div className="inline-flex shrink-0 rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setOccView("strip")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                occView === "strip"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
              Strip
            </button>
            <button
              type="button"
              onClick={() => setOccView("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                occView === "calendar"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>
          </div>
        </div>

        {deptTasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tasks match your search.
          </p>
        ) : (
          <div className="space-y-6">
            {FREQUENCIES.map((freq) => {
              const items = deptTasks.filter((t) => t.frequency === freq);
              if (items.length === 0) return null;
              return (
                <div key={freq} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {FREQUENCY_LABELS[freq]}
                    </h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div
                    className={cn(
                      "grid gap-3",
                      occView === "calendar"
                        ? "md:grid-cols-2 2xl:grid-cols-3"
                        : "xl:grid-cols-2"
                    )}
                  >
                    {items.map((task) => (
                      <RecurringTaskCard
                        key={task.id}
                        task={task}
                        currentUserName={currentUserName}
                        occView={occView}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Department grid (overview) ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Pick a department to see its ongoing tasks.
          </p>
        </div>
        {newButton}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelectedDeptId(s.id);
                setSearch("");
              }}
              className="text-left"
            >
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.total} recurring {s.total === 1 ? "task" : "tasks"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    This period
                  </p>
                  <SummaryPills summary={s} />
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {s.done}/{s.total} done this period
                    </p>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryPills({ summary }: { summary: DeptSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        {summary.done} done
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        {summary.pending} pending
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
        {summary.overdue} overdue
      </span>
    </div>
  );
}

export function RecurringOccurrences({
  task,
  currentUserName,
  occView,
}: {
  task: RecurringTaskDTO;
  currentUserName: string;
  occView: OccView;
}) {
  const [details, setDetails] = useState<Map<string, CompletionInfo>>(
    () => new Map(task.completions.map((c) => [c.periodKey, c]))
  );
  const [offset, setOffset] = useState(0);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const count = PERIOD_COUNT[task.frequency];

  const maxOffset = useMemo(
    () => Math.max(0, periodsSinceCreation(task.frequency, task.createdAt) - (count - 1)),
    [task.frequency, task.createdAt, count]
  );

  const completed = useMemo(() => new Set(details.keys()), [details]);

  const occurrences = useMemo<Occurrence[]>(
    () =>
      generateOccurrences({
        frequency: task.frequency,
        dueWeekday: task.dueWeekday,
        dueDayOfMonth: task.dueDayOfMonth,
        completedKeys: completed,
        count,
        offset,
        createdAt: task.createdAt,
      }),
    [task.frequency, task.dueWeekday, task.dueDayOfMonth, completed, count, offset]
  );

  function toggle(occ: Occurrence) {
    if (!task.canToggle) return;
    if (occ.status === "upcoming") return;
    if (pending.has(occ.key)) return;

    const nextDone = occ.status !== "done";
    const prevDetail = details.get(occ.key);

    setDetails((prev) => {
      const next = new Map(prev);
      if (nextDone) {
        next.set(occ.key, {
          periodKey: occ.key,
          completedAt: new Date().toISOString(),
          completedByName: currentUserName,
        });
      } else {
        next.delete(occ.key);
      }
      return next;
    });
    setPending((prev) => new Set(prev).add(occ.key));

    startTransition(async () => {
      try {
        await toggleRecurringCompletion(task.id, occ.key, nextDone);
      } catch (err) {
        // revert on failure
        setDetails((prev) => {
          const next = new Map(prev);
          if (nextDone) next.delete(occ.key);
          else if (prevDetail) next.set(occ.key, prevDetail);
          return next;
        });
        alert(err instanceof Error ? err.message : "Failed to update");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(occ.key);
          return next;
        });
      }
    });
  }

  if (occView === "calendar") {
    return (
      <CalendarMonth
        task={task}
        completed={completed}
        details={details}
        pending={pending}
        cursor={monthCursor}
        onPrevMonth={() =>
          setMonthCursor((c) =>
            c.month === 0
              ? { year: c.year - 1, month: 11 }
              : { year: c.year, month: c.month - 1 }
          )
        }
        onNextMonth={() =>
          setMonthCursor((c) =>
            c.month === 11
              ? { year: c.year + 1, month: 0 }
              : { year: c.year, month: c.month + 1 }
          )
        }
        onToggle={toggle}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => setOffset((o) => Math.min(maxOffset, o + count))}
        disabled={offset >= maxOffset}
        aria-label="Older periods"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <TooltipProvider delayDuration={150}>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
          {occurrences.map((occ) => (
            <OccurrenceCell
              key={occ.key}
              occ={occ}
              completion={details.get(occ.key)}
              disabled={!task.canToggle || occ.status === "upcoming"}
              busy={pending.has(occ.key)}
              onToggle={() => toggle(occ)}
            />
          ))}
        </div>
      </TooltipProvider>

      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => setOffset((o) => Math.max(0, o - count))}
        disabled={offset === 0}
        aria-label="Newer periods"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function RecurringTaskCard({
  task,
  currentUserName,
  occView,
}: {
  task: RecurringTaskDTO;
  currentUserName: string;
  occView: OccView;
}) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete recurring task "${task.title}"? This removes its history.`)) {
      return;
    }
    try {
      await deleteRecurringTask(task.id);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link
              href={`/recurring/${task.id}`}
              className="text-sm font-semibold hover:underline"
            >
              {task.title}
            </Link>
            {task.description && (
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="gap-1">
                <Repeat className="h-3 w-3" />
                {FREQUENCY_LABELS[task.frequency]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {describeRecurrence(task.frequency, task.dueWeekday, task.dueDayOfMonth)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {task.canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => router.push(`/recurring/${task.id}`)}
                aria-label="Edit recurring task"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {task.canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                aria-label="Delete recurring task"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <RecurringOccurrences
          task={task}
          currentUserName={currentUserName}
          occView={occView}
        />
      </CardContent>
    </Card>
  );
}

const STATUS_STYLES: Record<Occurrence["status"], { cell: string }> = {
  done: { cell: "border-emerald-500/40 bg-emerald-500/5" },
  overdue: { cell: "border-red-500/40 bg-red-500/5" },
  pending: { cell: "border-amber-500/40 bg-amber-500/5" },
  upcoming: { cell: "border-border bg-muted/30" },
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function OccurrenceCell({
  occ,
  completion,
  disabled,
  busy,
  onToggle,
}: {
  occ: Occurrence;
  completion?: CompletionInfo;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const styles = STATUS_STYLES[occ.status];
  const done = occ.status === "done";
  const onTime = completion
    ? new Date(completion.completedAt).getTime() <= occ.dueDate.getTime()
    : true;

  const cell = (
    <div
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-0.5 rounded border px-1 py-1 text-center",
        styles.cell,
        done && completion && !onTime && "border-amber-500/60 bg-amber-500/5",
        occ.isCurrent && "ring-2 ring-primary/40"
      )}
    >
      <span className="text-[10px] font-medium leading-none">{occ.label}</span>
      <span className="text-[9px] leading-none text-muted-foreground">
        {occ.subLabel}
      </span>
      {done && completion && (
        <span
          className={cn(
            "text-[9px] font-medium leading-none",
            onTime
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {onTime ? "on time" : "late"}
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || busy}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={cn(
          "group/check mt-1 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all duration-150",
          done
            ? onTime
              ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
              : "border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/30"
            : occ.status === "overdue"
              ? "border-red-400/70 text-red-500 hover:bg-red-500/10"
              : occ.status === "pending"
                ? "border-amber-400/70 text-amber-500 hover:bg-amber-500/10"
                : "border-muted-foreground/25 text-muted-foreground",
          !disabled && "hover:scale-110 active:scale-95",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          busy && "opacity-50"
        )}
      >
        {done ? (
          <Check className="h-3.5 w-3.5 animate-in zoom-in-50 duration-150" strokeWidth={3} />
        ) : (
          !disabled && (
            <Check
              className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/check:opacity-40"
              strokeWidth={3}
            />
          )
        )}
      </button>
    </div>
  );

  if (done && completion) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-0.5 text-center">
            <p className="font-semibold">
              {onTime ? "Completed on time" : "Completed late"}
            </p>
            <p>by {completion.completedByName ?? "Unknown"}</p>
            <p className="opacity-80">{formatWhen(completion.completedAt)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return cell;
}

const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function CalendarMonth({
  task,
  completed,
  details,
  pending,
  cursor,
  onPrevMonth,
  onNextMonth,
  onToggle,
}: {
  task: RecurringTaskDTO;
  completed: Set<string>;
  details: Map<string, CompletionInfo>;
  pending: Set<string>;
  cursor: { year: number; month: number };
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToggle: (occ: Occurrence) => void;
}) {
  const { year, month } = cursor;
  const config = {
    frequency: task.frequency,
    dueWeekday: task.dueWeekday,
    dueDayOfMonth: task.dueDayOfMonth,
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const leading = (firstDow + 6) % 7; // Monday-first offset
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const created = new Date(task.createdAt);
  const prevDisabled =
    year < created.getFullYear() ||
    (year === created.getFullYear() && month <= created.getMonth());

  const days: (number | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onPrevMonth}
          disabled={prevDisabled}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_HEADERS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-[10px] font-medium uppercase text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} />;
            const date = new Date(year, month, day);
            const occ = occurrenceForDate(config, date, completed, task.createdAt);
            return (
              <CalendarDay
                key={day}
                day={day}
                occ={occ}
                completion={occ ? details.get(occ.key) : undefined}
                canToggle={task.canToggle}
                busy={occ ? pending.has(occ.key) : false}
                onToggle={() => occ && onToggle(occ)}
              />
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

function CalendarDay({
  day,
  occ,
  completion,
  canToggle,
  busy,
  onToggle,
}: {
  day: number;
  occ: Occurrence | null;
  completion?: CompletionInfo;
  canToggle: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  if (!occ) {
    return (
      <div className="flex h-10 items-center justify-center rounded text-xs text-muted-foreground/40">
        {day}
      </div>
    );
  }

  const done = occ.status === "done";
  const onTime = completion
    ? new Date(completion.completedAt).getTime() <= occ.dueDate.getTime()
    : true;
  const clickable = canToggle && occ.status !== "upcoming";

  const cls = done
    ? onTime
      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : occ.status === "overdue"
      ? "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400"
      : occ.status === "pending"
        ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "border-border bg-muted/40 text-muted-foreground";

  const cell = (
    <button
      type="button"
      onClick={onToggle}
      disabled={!clickable || busy}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={cn(
        "group/day flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md border text-xs transition-all duration-150",
        cls,
        clickable && "cursor-pointer hover:shadow-sm active:scale-95",
        !clickable && "cursor-default",
        busy && "opacity-50",
        occ.isCurrent && "ring-2 ring-primary/40"
      )}
    >
      <span className="text-[11px] font-semibold leading-none">{day}</span>
      {done ? (
        <Check
          className="h-3.5 w-3.5 animate-in zoom-in-50 duration-150"
          strokeWidth={3}
        />
      ) : (
        clickable && (
          <Check
            className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/day:opacity-40"
            strokeWidth={3}
          />
        )
      )}
    </button>
  );

  if (done && completion) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-0.5 text-center">
            <p className="font-semibold">
              {onTime ? "Completed on time" : "Completed late"}
            </p>
            <p>by {completion.completedByName ?? "Unknown"}</p>
            <p className="opacity-80">{formatWhen(completion.completedAt)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return cell;
}
