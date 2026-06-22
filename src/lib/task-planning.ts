export const TASK_PLANNING_STAGES = ["draft", "brainstorming", "discussed"] as const;
export type TaskPlanningStage = (typeof TASK_PLANNING_STAGES)[number];

export const PLANNING_STAGE_LABELS: Record<TaskPlanningStage, string> = {
  draft: "Draft",
  brainstorming: "Brainstorming",
  discussed: "Fully discussed",
};

export const PLANNING_STAGE_COLORS: Record<TaskPlanningStage, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  brainstorming: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  discussed: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

export function isTaskPlanningStage(value: string): value is TaskPlanningStage {
  return TASK_PLANNING_STAGES.includes(value as TaskPlanningStage);
}
