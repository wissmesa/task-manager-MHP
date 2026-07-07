export type TaskEffort = "low" | "mid_low" | "mid_high" | "high";
export type TaskValue = "anyone" | "specialist" | "senior" | "highest";

export const TASK_EFFORTS: TaskEffort[] = ["low", "mid_low", "mid_high", "high"];
export const TASK_VALUES: TaskValue[] = ["anyone", "specialist", "senior", "highest"];

export const EFFORT_LABELS: Record<TaskEffort, string> = {
  low: "Low",
  mid_low: "Mid-Low",
  mid_high: "Mid-High",
  high: "High",
};

export const EFFORT_COLORS: Record<TaskEffort, string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  mid_low: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400",
  mid_high: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
};

export const EFFORT_ORDER: Record<TaskEffort, number> = {
  low: 0,
  mid_low: 1,
  mid_high: 2,
  high: 3,
};

/** Full descriptive labels (used in dropdowns and detail view). */
export const VALUE_LABELS: Record<TaskValue, string> = {
  anyone: "$ — Anyone",
  specialist: "$$ — Specialist/Manager",
  senior: "$$$ — Senior/Cross-functional",
  highest: "$$$$ — Highest Leverage",
};

/** Compact labels (used inside narrow table columns / cards). */
export const VALUE_SHORT_LABELS: Record<TaskValue, string> = {
  anyone: "$",
  specialist: "$$",
  senior: "$$$",
  highest: "$$$$",
};

export const VALUE_COLORS: Record<TaskValue, string> = {
  anyone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  specialist: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  senior: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  highest: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export const VALUE_ORDER: Record<TaskValue, number> = {
  anyone: 0,
  specialist: 1,
  senior: 2,
  highest: 3,
};

export const EFFORT_OPTIONS = TASK_EFFORTS.map((value) => ({
  value,
  label: EFFORT_LABELS[value],
}));

export const VALUE_OPTIONS = TASK_VALUES.map((value) => ({
  value,
  label: VALUE_LABELS[value],
}));
