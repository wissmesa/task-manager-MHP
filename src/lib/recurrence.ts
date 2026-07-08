export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type OccurrenceStatus = "done" | "overdue" | "pending" | "upcoming";

export interface Occurrence {
  /** Stable identifier for the period, stored in tm_recurring_task_completions.period_key */
  key: string;
  /** Short label shown in the calendar cell */
  label: string;
  /** Secondary label (deadline info) */
  subLabel: string;
  /** Deadline for this occurrence */
  dueDate: Date;
  status: OccurrenceStatus;
  isCurrent: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Monday-based start of the week for a local date */
function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

/** ISO-8601 week number and year for a date */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 +
    Math.round(
      (d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
  return { year: d.getUTCFullYear(), week };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Deterministic period key for a given date + frequency. */
export function periodKeyFor(frequency: RecurrenceFrequency, date: Date): string {
  if (frequency === "daily") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  if (frequency === "weekly") {
    const { year, week } = getISOWeek(date);
    return `${year}-W${pad(week)}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Lightweight validation so toggle actions never store arbitrary strings. */
export function isValidPeriodKey(frequency: RecurrenceFrequency, key: string): boolean {
  if (frequency === "daily") return /^\d{4}-\d{2}-\d{2}$/.test(key);
  if (frequency === "weekly") return /^\d{4}-W\d{2}$/.test(key);
  return /^\d{4}-\d{2}$/.test(key);
}

interface GenerateOptions {
  frequency: RecurrenceFrequency;
  dueWeekday?: number | null;
  dueDayOfMonth?: number | null;
  completedKeys: Set<string>;
  count: number;
  /** Shift the window back by this many periods (for paging into the past). */
  offset?: number;
  now?: Date;
  /** Task creation date; occurrences whose deadline is before this are inactive. */
  createdAt?: Date | string;
}

function statusFor(
  dueDate: Date,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
  done: boolean
): { status: OccurrenceStatus; isCurrent: boolean } {
  const isCurrent = now.getTime() >= periodStart.getTime() && now.getTime() <= periodEnd.getTime();
  if (done) return { status: "done", isCurrent };
  if (now.getTime() > dueDate.getTime()) return { status: "overdue", isCurrent };
  if (now.getTime() < periodStart.getTime()) return { status: "upcoming", isCurrent };
  return { status: "pending", isCurrent };
}

/** Start of the period that contains `date`, for a given frequency. */
function periodStartFor(frequency: RecurrenceFrequency, date: Date): Date {
  if (frequency === "daily") return startOfDay(date);
  if (frequency === "weekly") return startOfWeekMonday(date);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Builds the list of occurrences (oldest → newest) to render as a calendar strip.
 * The newest occurrence is the current period shifted back by `offset`.
 */
export function generateOccurrences(opts: GenerateOptions): Occurrence[] {
  const now = opts.now ?? new Date();
  const offset = opts.offset ?? 0;
  const requested = Math.max(1, opts.count);
  const createdAt = opts.createdAt ? new Date(opts.createdAt) : undefined;
  // Never generate periods before the task existed.
  const count = createdAt
    ? Math.max(
        0,
        Math.min(
          requested,
          periodsSinceCreation(opts.frequency, createdAt, now) - offset + 1
        )
      )
    : requested;
  const out: Occurrence[] = [];
  if (count === 0) return out;

  if (opts.frequency === "daily") {
    const newest = startOfDay(now);
    newest.setDate(newest.getDate() - offset);
    for (let i = count - 1; i >= 0; i--) {
      const day = new Date(newest);
      day.setDate(newest.getDate() - i);
      const periodStart = startOfDay(day);
      const periodEnd = endOfDay(day);
      const dueDate = periodEnd;
      const key = periodKeyFor("daily", day);
      const { status, isCurrent } = statusFor(
        dueDate,
        periodStart,
        periodEnd,
        now,
        opts.completedKeys.has(key)
      );
      out.push({
        key,
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        subLabel: fmtShort(day),
        dueDate,
        status,
        isCurrent,
      });
    }
    return out;
  }

  if (opts.frequency === "weekly") {
    const weekday = opts.dueWeekday ?? 1; // default Monday
    const newestMonday = startOfWeekMonday(now);
    newestMonday.setDate(newestMonday.getDate() - offset * 7);
    for (let i = count - 1; i >= 0; i--) {
      const monday = new Date(newestMonday);
      monday.setDate(newestMonday.getDate() - i * 7);
      const periodStart = startOfDay(monday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const periodEnd = endOfDay(sunday);
      // dueWeekday is 0=Sun..6=Sat; offset within a Monday-start week
      const dueOffset = (weekday + 6) % 7;
      const dueDay = new Date(monday);
      dueDay.setDate(monday.getDate() + dueOffset);
      const dueDate = endOfDay(dueDay);
      const key = periodKeyFor("weekly", monday);
      const { status, isCurrent } = statusFor(
        dueDate,
        periodStart,
        periodEnd,
        now,
        opts.completedKeys.has(key)
      );
      out.push({
        key,
        label: fmtShort(dueDay),
        subLabel: `by ${WEEKDAY_SHORT[weekday]}`,
        dueDate,
        status,
        isCurrent,
      });
    }
    return out;
  }

  // monthly
  const dayOfMonth = opts.dueDayOfMonth ?? 1;
  const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const periodStart = startOfDay(first);
    const lastDay = daysInMonth(year, month);
    const periodEnd = endOfDay(new Date(year, month, lastDay));
    const clampedDue = Math.min(dayOfMonth, lastDay);
    const dueDate = endOfDay(new Date(year, month, clampedDue));
    const key = periodKeyFor("monthly", first);
    const { status, isCurrent } = statusFor(
      dueDate,
      periodStart,
      periodEnd,
      now,
      opts.completedKeys.has(key)
    );
    out.push({
      key,
      label: `${first.toLocaleDateString("en-US", { month: "short" })} '${String(year).slice(2)}`,
      subLabel: `by ${clampedDue}`,
      dueDate,
      status,
      isCurrent,
    });
  }
  return out;
}

interface OccurrenceConfig {
  frequency: RecurrenceFrequency;
  dueWeekday?: number | null;
  dueDayOfMonth?: number | null;
}

/**
 * Returns the Occurrence anchored to a specific calendar date, or null if that
 * date is not a checkable anchor for the frequency (used by the month calendar view).
 * - daily: every date is an anchor.
 * - weekly: only the deadline weekday of each week.
 * - monthly: only the deadline day of the month.
 */
export function occurrenceForDate(
  config: OccurrenceConfig,
  date: Date,
  completedKeys: Set<string>,
  createdAt?: Date | string,
  now: Date = new Date()
): Occurrence | null {
  const created = createdAt ? new Date(createdAt) : undefined;
  // Hide any period that starts before the task was created.
  if (
    created &&
    periodStartFor(config.frequency, date).getTime() <
      periodStartFor(config.frequency, created).getTime()
  ) {
    return null;
  }
  if (config.frequency === "daily") {
    const periodStart = startOfDay(date);
    const periodEnd = endOfDay(date);
    const dueDate = periodEnd;
    const key = periodKeyFor("daily", date);
    const { status, isCurrent } = statusFor(
      dueDate,
      periodStart,
      periodEnd,
      now,
      completedKeys.has(key)
    );
    return {
      key,
      label: fmtShort(date),
      subLabel: "by end of day",
      dueDate,
      status,
      isCurrent,
    };
  }

  if (config.frequency === "weekly") {
    const weekday = config.dueWeekday ?? 1;
    if (date.getDay() !== weekday) return null;
    const monday = startOfWeekMonday(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const periodStart = startOfDay(monday);
    const periodEnd = endOfDay(sunday);
    const dueDate = endOfDay(date);
    const key = periodKeyFor("weekly", monday);
    const { status, isCurrent } = statusFor(
      dueDate,
      periodStart,
      periodEnd,
      now,
      completedKeys.has(key)
    );
    return {
      key,
      label: `${fmtShort(monday)} – ${fmtShort(sunday)}`,
      subLabel: `by ${WEEKDAY_SHORT[weekday]}`,
      dueDate,
      status,
      isCurrent,
    };
  }

  // monthly
  const dayOfMonth = config.dueDayOfMonth ?? 1;
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = daysInMonth(year, month);
  const clampedDue = Math.min(dayOfMonth, lastDay);
  if (date.getDate() !== clampedDue) return null;
  const periodStart = startOfDay(new Date(year, month, 1));
  const periodEnd = endOfDay(new Date(year, month, lastDay));
  const dueDate = endOfDay(new Date(year, month, clampedDue));
  const key = periodKeyFor("monthly", date);
  const { status, isCurrent } = statusFor(
    dueDate,
    periodStart,
    periodEnd,
    now,
    completedKeys.has(key)
  );
  return {
    key,
    label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    subLabel: `by ${clampedDue}`,
    dueDate,
    status,
    isCurrent,
  };
}

/**
 * How many whole periods have elapsed between the task creation date and now.
 * Used to cap how far back the user can navigate.
 */
export function periodsSinceCreation(
  frequency: RecurrenceFrequency,
  createdAt: Date | string,
  now: Date = new Date()
): number {
  const created = new Date(createdAt);
  if (frequency === "daily") {
    const a = startOfDay(now).getTime();
    const b = startOfDay(created).getTime();
    return Math.max(0, Math.round((a - b) / (24 * 60 * 60 * 1000)));
  }
  if (frequency === "weekly") {
    const a = startOfWeekMonday(now).getTime();
    const b = startOfWeekMonday(created).getTime();
    return Math.max(0, Math.round((a - b) / (7 * 24 * 60 * 60 * 1000)));
  }
  return Math.max(
    0,
    (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth())
  );
}

/** Human summary of the recurrence deadline for a task, e.g. "Every Monday". */
export function describeRecurrence(
  frequency: RecurrenceFrequency,
  dueWeekday?: number | null,
  dueDayOfMonth?: number | null
): string {
  if (frequency === "daily") return "Every day";
  if (frequency === "weekly") {
    const wd = dueWeekday ?? 1;
    return `Every ${WEEKDAY_LABELS[wd]}`;
  }
  const d = dueDayOfMonth ?? 1;
  return `By day ${d} of each month`;
}
