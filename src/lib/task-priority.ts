export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  P0: "P0 — Urgent",
  P1: "P1 — 1 month",
  P2: "P2 — 3 months",
  P3: "P3 — Indefinite",
};

export const PRIORITY_DESCRIPTIONS: Record<TaskPriority, string> = {
  P0: "Max 7 business days",
  P1: "Next 20 business days (~1 month)",
  P2: "Next 90 business days (~3 months)",
  P3: "No deadline",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  P0: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  P1: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  P2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  P3: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export const PRIORITY_EMOJI: Record<TaskPriority, string> = {
  P0: "🔴",
  P1: "🟠",
  P2: "🔵",
  P3: "⚪",
};

const BUSINESS_DAYS_BY_PRIORITY: Record<TaskPriority, number | null> = {
  P0: 7,
  P1: 20,
  P2: 90,
  P3: null,
};

export function isTaskPriority(value: string): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

export function addBusinessDays(from: Date, businessDays: number): Date {
  const result = new Date(from);
  let added = 0;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }

  return result;
}

export function calculateDueDateFromPriority(
  priority: TaskPriority,
  from: Date = new Date()
): Date | null {
  const businessDays = BUSINESS_DAYS_BY_PRIORITY[priority];
  if (businessDays === null) return null;
  return addBusinessDays(from, businessDays);
}

export function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDueDateLimits(
  priority: TaskPriority,
  createdAt: Date,
  today: Date = new Date()
): { min: Date; max: Date | null } {
  const min = new Date(today);
  min.setHours(0, 0, 0, 0);

  const max = calculateDueDateFromPriority(priority, new Date(createdAt));
  if (max) max.setHours(0, 0, 0, 0);

  return { min, max };
}

export function isDueDateWithinPriorityLimit(
  dueDate: Date,
  priority: TaskPriority,
  createdAt: Date,
  today: Date = new Date()
): boolean {
  const { min, max } = getDueDateLimits(priority, createdAt, today);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < min) return false;
  if (max && due > max) return false;
  return true;
}
