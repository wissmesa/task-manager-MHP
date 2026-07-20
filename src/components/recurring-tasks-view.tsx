"use client";

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  Pencil,
  Plus,
  Repeat,
  Rows3,
  Search,
  Trash2,
  User,
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
  type Occurrence,
  type OccurrenceStatus,
} from "@/lib/recurrence";

interface RecurringTasksViewProps {
  tasks: RecurringTaskDTO[];
  currentUserName: string;
}

interface DeptSummary {
  id: string;
  name: string;
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

function currentOccurrenceOf(task: RecurringTaskDTO): Occurrence | null {
  const occ = generateOccurrences({
    frequency: task.frequency,
    dueWeekday: task.dueWeekday,
    dueDayOfMonth: task.dueDayOfMonth,
    completedKeys: new Set(task.completedKeys),
    count: 1,
    createdAt: task.createdAt,
  });
  return occ[0] ?? null;
}

function currentStatusOf(task: RecurringTaskDTO): OccurrenceStatus {
  return currentOccurrenceOf(task)?.status ?? "pending";
}

/**
 * Sort key so the tasks closest to their deadline show first. Not-yet-completed
 * occurrences are ordered by their due date (overdue first), and already
 * completed periods are pushed to the bottom.
 */
function dueSoonKey(task: RecurringTaskDTO): number {
  const occ = currentOccurrenceOf(task);
  if (!occ) return Number.POSITIVE_INFINITY;
  const due = occ.dueDate.getTime();
  return occ.status === "done" ? due + 1e15 : due;
}

export function RecurringTasksView({ tasks, currentUserName }: RecurringTasksViewProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedDeptId, setSelectedDeptIdState] = useState<string | null>(
    () => searchParams.get("dept")
  );

  // Keep the selected department in the URL (?dept=<id>) without a full
  // navigation, so returning from a task detail lands back on this view.
  const setSelectedDeptId = useCallback(
    (id: string | null) => {
      setSelectedDeptIdState(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("dept", id);
      else params.delete("dept");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname]
  );

  const [search, setSearch] = useState("");
  const [collapsedFreqs, setCollapsedFreqs] = useState<
    Record<RecurringTaskDTO["frequency"], boolean>
  >({ daily: false, weekly: false, monthly: false });
  const [sortByDue, setSortByDue] = useState(false);
  const [layout, setLayout] = useState<"rows" | "board">("rows");

  function toggleFreq(freq: RecurringTaskDTO["frequency"]) {
    setCollapsedFreqs((prev) => ({ ...prev, [freq]: !prev[freq] }));
  }

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
      <Link href="/responsibilities/recurring/new">
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
              <Link href="/responsibilities/recurring/new">
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
    const boardMode = layout === "board";
    return (
      <div
        className={cn(
          boardMode
            ? "flex h-[calc(100vh-6.5rem)] flex-col gap-4 overflow-hidden"
            : "space-y-6"
        )}
      >
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
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={sortByDue ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setSortByDue((v) => !v)}
              title="Show tasks closest to their deadline first"
            >
              <Clock className="h-4 w-4" />
              Due soon first
              {sortByDue && <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setLayout((l) => (l === "rows" ? "board" : "rows"));
                // Re-expand groups so switching layouts never leaves empty
                // collapsed columns/rows behind.
                setCollapsedFreqs({ daily: false, weekly: false, monthly: false });
              }}
              title={
                layout === "rows"
                  ? "Show frequencies as columns"
                  : "Show frequencies as rows"
              }
            >
              {layout === "rows" ? (
                <>
                  <LayoutGrid className="h-4 w-4" />
                  Board
                </>
              ) : (
                <>
                  <Rows3 className="h-4 w-4" />
                  Rows
                </>
              )}
            </Button>
          </div>
        </div>

        {deptTasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tasks match your search.
          </p>
        ) : (
          <div
            className={cn(
              layout === "board"
                ? "grid min-h-0 flex-1 items-stretch gap-4 overflow-hidden sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-6"
            )}
          >
            {FREQUENCIES.map((freq) => {
              const items = deptTasks.filter((t) => t.frequency === freq);
              if (items.length === 0) return null;
              if (sortByDue) {
                items.sort((a, b) => dueSoonKey(a) - dueSoonKey(b));
              }
              const isCollapsed = collapsedFreqs[freq];
              const isBoard = layout === "board";
              return (
                <div
                  key={freq}
                  className={cn(
                    isBoard
                      ? "flex min-h-0 flex-col gap-3 rounded-lg border bg-muted/20 p-3"
                      : "space-y-3"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleFreq(freq)}
                    className="flex w-full shrink-0 items-center gap-2 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isCollapsed && "-rotate-90"
                      )}
                    />
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {FREQUENCY_LABELS[freq]}
                    </h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </button>
                  {!isCollapsed && (
                    <div
                      className={cn(
                        isBoard
                          ? "grid min-h-0 flex-1 auto-rows-min content-start grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2"
                          : cn(
                              "flex items-stretch gap-3",
                              // Beyond 4 tasks, scroll horizontally instead of wrapping rows.
                              items.length > 4 ? "overflow-x-auto pb-2" : "flex-wrap"
                            )
                      )}
                    >
                      {items.map((task) => (
                        <div
                          key={task.id}
                          className={cn(isBoard ? "w-full" : "w-72 shrink-0")}
                        >
                          <RecurringTaskCard
                            task={task}
                            currentUserName={currentUserName}
                          />
                        </div>
                      ))}
                    </div>
                  )}
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
}: {
  task: RecurringTaskDTO;
  currentUserName: string;
}) {
  const [details, setDetails] = useState<Map<string, CompletionInfo>>(
    () => new Map(task.completions.map((c) => [c.periodKey, c]))
  );
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const completed = useMemo(() => new Set(details.keys()), [details]);

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

function RecurringTaskCard({
  task,
  currentUserName,
}: {
  task: RecurringTaskDTO;
  currentUserName: string;
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
    <Card
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/responsibilities/recurring/${task.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/responsibilities/recurring/${task.id}`);
        }
      }}
      className="flex h-full min-w-0 cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
    >
      <CardHeader className="pb-2">
        <div className="flex w-full min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <span className="line-clamp-1 text-sm font-semibold">
              {task.title}
            </span>
            {task.description && (
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {task.description}
              </p>
            )}
            <div className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Repeat className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {describeRecurrence(task.frequency, task.dueWeekday, task.dueDayOfMonth)}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {task.assigneeName ?? "Unassigned"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {task.canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/responsibilities/recurring/${task.id}`);
                }}
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
      <CardContent
        className="flex flex-1 items-start pt-0 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <RecurringOccurrences
          task={task}
          currentUserName={currentUserName}
        />
      </CardContent>
    </Card>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    <div className="w-full max-w-[260px] space-y-2">
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
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAY_HEADERS.map((d) => (
            <div
              key={d}
              className="pb-0.5 text-center text-[9px] font-medium uppercase text-muted-foreground"
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
      <div className="flex h-6 items-center justify-center rounded text-[9px] text-muted-foreground/40">
        {day}
      </div>
    );
  }

  const done = occ.status === "done";
  const onTime = completion
    ? new Date(completion.completedAt).getTime() <= occ.dueDate.getTime()
    : true;
  const clickable = canToggle && occ.status !== "upcoming";

  const lateDone = done && !onTime;
  const cls = done
    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
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
        "group/day relative flex h-6 w-full items-center justify-center gap-0.5 rounded border text-xs transition-all duration-150",
        cls,
        clickable && "cursor-pointer hover:shadow-sm active:scale-95",
        !clickable && "cursor-default",
        busy && "opacity-50",
        occ.isCurrent && "ring-2 ring-primary/40"
      )}
    >
      {lateDone && (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-background" />
      )}
      <span className="text-[9px] font-semibold leading-none">{day}</span>
      {done ? (
        <Check
          className="h-2.5 w-2.5 animate-in zoom-in-50 duration-150"
          strokeWidth={3}
        />
      ) : (
        clickable && (
          <Check
            className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/day:opacity-40"
            strokeWidth={3}
          />
        )
      )}
    </button>
  );

  const dueLabel = occ.dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  let tip: ReactNode;
  if (done) {
    tip = (
      <div className="space-y-0.5 text-center">
        <p className="font-semibold">
          {onTime ? "Completed on time" : "Completed late"}
        </p>
        <p>by {completion?.completedByName ?? "Unknown"}</p>
        {completion && (
          <p className="opacity-80">{formatWhen(completion.completedAt)}</p>
        )}
      </div>
    );
  } else if (occ.status === "overdue") {
    tip = (
      <div className="space-y-0.5 text-center">
        <p className="font-semibold text-red-300">Overdue — not completed</p>
        <p className="opacity-80">Was due {dueLabel}</p>
        {clickable && <p className="opacity-80">Click to mark done</p>}
      </div>
    );
  } else if (occ.status === "pending") {
    tip = (
      <div className="space-y-0.5 text-center">
        <p className="font-semibold">Pending</p>
        <p className="opacity-80">Due {dueLabel}</p>
        {clickable && <p className="opacity-80">Click to mark done</p>}
      </div>
    );
  } else {
    tip = (
      <div className="space-y-0.5 text-center">
        <p className="font-semibold">Upcoming</p>
        <p className="opacity-80">Due {dueLabel}</p>
      </div>
    );
  }

  // Wrap the (possibly disabled) button in a span so hover always triggers the
  // tooltip, even for view-only users or while a toggle is saving.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full">{cell}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}
