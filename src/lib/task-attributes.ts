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

// Category — "Client" categories (C–F) are intentionally excluded.
export type TaskCategory =
  | "ceo_strategy"
  | "b2b_acquisition"
  | "product_engineering"
  | "b2c_sales_leasing"
  | "data_reporting"
  | "hr_people_culture"
  | "finance_legal"
  | "partnerships_integrations"
  | "office_environment"
  | "personal_inner_game"
  | "family_life_ops";

export const TASK_CATEGORIES: TaskCategory[] = [
  "ceo_strategy",
  "b2b_acquisition",
  "product_engineering",
  "b2c_sales_leasing",
  "data_reporting",
  "hr_people_culture",
  "finance_legal",
  "partnerships_integrations",
  "office_environment",
  "personal_inner_game",
  "family_life_ops",
];

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  ceo_strategy: "CEO / Strategy",
  b2b_acquisition: "New Client Acquisition (B2B)",
  product_engineering: "Product & Engineering",
  b2c_sales_leasing: "B2C Sales & Leasing Ops",
  data_reporting: "Data & Reporting",
  hr_people_culture: "HR / People / Culture",
  finance_legal: "Finance & Legal",
  partnerships_integrations: "Partnerships & Integrations",
  office_environment: "Office / Environment",
  personal_inner_game: "Personal / Inner Game",
  family_life_ops: "Family & Life Ops",
};

export const CATEGORY_COLOR =
  "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";

export const CATEGORY_ORDER: Record<TaskCategory, number> = TASK_CATEGORIES.reduce(
  (acc, cat, index) => {
    acc[cat] = index;
    return acc;
  },
  {} as Record<TaskCategory, number>
);

export const CATEGORY_OPTIONS = TASK_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

// ── Department colors ─────────────────────────────────────────────────────────

/** Known departments get a fixed color; unknown ones fall back to a hash. */
const DEPARTMENT_COLORS: Record<string, string> = {
  development: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  executive: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  data: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  sales_b2b: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  sales_b2c: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

/** Palette used for any department without a fixed color. */
const DEPARTMENT_FALLBACK_COLORS: string[] = [
  "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
];

/** Returns Tailwind classes for a department badge, consistent per name. */
export function getDepartmentColor(name: string | null | undefined): string {
  if (!name) {
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (DEPARTMENT_COLORS[key]) return DEPARTMENT_COLORS[key];

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return DEPARTMENT_FALLBACK_COLORS[hash % DEPARTMENT_FALLBACK_COLORS.length];
}
