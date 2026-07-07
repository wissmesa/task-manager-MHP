import type { TaskPriority } from "@/lib/task-priority";
import type { TaskPlanningStage } from "@/lib/task-planning";
import { EFFORT_OPTIONS, VALUE_OPTIONS, CATEGORY_OPTIONS } from "@/lib/task-attributes";

export type FilterField =
  | "title"
  | "status"
  | "priority"
  | "stage"
  | "coord_approval"
  | "dept_approval"
  | "bundle"
  | "target"
  | "effort"
  | "value"
  | "category"
  | "department"
  | "assignee"
  | "due"
  | "created"
  | "done"
  | "creator";

export type FilterOperator =
  | "is_any_of"
  | "is_none_of"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export type FilterRule = {
  id: string;
  field: FilterField | null;
  operator: FilterOperator;
  values: string[];
};

export type FilterGroup = {
  id: string;
  rules: FilterRule[];
};

export type FilterState = {
  groups: FilterGroup[];
};

export type TaskFilterRow = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: TaskPriority;
  approval: "pending_approval" | "pending_dept_approval" | "approved" | "rejected";
  ownBossApproved: boolean;
  createdBy: string;
  assignedTo: string | null;
  departmentId: string | null;
  creatorDeptId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  planningStage: TaskPlanningStage | null;
  waitingForBundle: boolean;
  devTarget: "task_manager" | "web_app" | "mobile_app" | "both" | null;
  effort: "low" | "mid_low" | "mid_high" | "high" | null;
  value: "anyone" | "specialist" | "senior" | "highest" | null;
  category:
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
    | "family_life_ops"
    | null;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
};

export type FilterContext = {
  currentUserDepartmentId: string | null;
};

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  title: "Title",
  status: "Status",
  priority: "Priority",
  stage: "Stage",
  coord_approval: "Coord.",
  dept_approval: "Dept.",
  bundle: "Bundle",
  target: "Target",
  effort: "Effort",
  value: "Value",
  category: "Category",
  department: "Department",
  assignee: "Assignee",
  due: "Due",
  created: "Created",
  done: "Done",
  creator: "By",
};

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  is_any_of: "is any of",
  is_none_of: "is none of",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

const ALL_FIELDS: FilterField[] = [
  "title",
  "status",
  "priority",
  "stage",
  "coord_approval",
  "dept_approval",
  "bundle",
  "target",
  "effort",
  "value",
  "category",
  "department",
  "assignee",
  "due",
  "created",
  "done",
  "creator",
];

const FIELD_OPERATORS: Record<FilterField, FilterOperator[]> = {
  title: ["contains", "not_contains", "is_empty", "is_not_empty"],
  status: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  priority: ["is_any_of", "is_none_of"],
  stage: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  coord_approval: ["is_any_of", "is_none_of"],
  dept_approval: ["is_any_of", "is_none_of"],
  bundle: ["is_any_of", "is_none_of"],
  target: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  effort: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  value: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  category: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  department: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  assignee: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  due: ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  created: ["is_any_of", "is_none_of"],
  done: ["is_any_of", "is_none_of"],
  creator: ["is_any_of", "is_none_of"],
};

type ApprovalBadge = { label: string };

const BADGE_APPROVED: ApprovalBadge = { label: "Approved" };
const BADGE_PENDING: ApprovalBadge = { label: "Pending" };
const BADGE_REJECTED: ApprovalBadge = { label: "Rejected" };
const BADGE_WAITING: ApprovalBadge = { label: "Waiting" };
const BADGE_NA: ApprovalBadge = { label: "N/A" };

function deriveCoordinatorApproval(task: TaskFilterRow): ApprovalBadge {
  if (task.approval === "pending_approval") return BADGE_PENDING;
  if (task.ownBossApproved) return BADGE_APPROVED;
  if (task.approval === "rejected") return BADGE_REJECTED;
  return BADGE_APPROVED;
}

function deriveDeptApproval(task: TaskFilterRow): ApprovalBadge {
  if (!task.departmentId) return BADGE_NA;

  const isCrossDept = task.departmentId !== task.creatorDeptId;

  if (isCrossDept) {
    switch (task.approval) {
      case "pending_approval":
        return BADGE_WAITING;
      case "pending_dept_approval":
        return BADGE_PENDING;
      case "approved":
        return BADGE_APPROVED;
      case "rejected":
        return task.ownBossApproved ? BADGE_REJECTED : BADGE_WAITING;
      default:
        return BADGE_NA;
    }
  }

  switch (task.approval) {
    case "pending_approval":
      return BADGE_PENDING;
    case "approved":
      return BADGE_APPROVED;
    case "rejected":
      return BADGE_REJECTED;
    default:
      return BADGE_NA;
  }
}

function isTaskOverdue(task: TaskFilterRow): boolean {
  if (!task.dueDate || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate) < today;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createEmptyRule(): FilterRule {
  return { id: createId(), field: null, operator: "is_any_of", values: [] };
}

export function createEmptyGroup(): FilterGroup {
  return { id: createId(), rules: [createEmptyRule()] };
}

export function createDefaultFilterState(): FilterState {
  return { groups: [createEmptyGroup()] };
}

export function getFieldsForTab(
  showStageColumn: boolean,
  includeDevFields = false
): FilterField[] {
  return ALL_FIELDS.filter((field) => {
    if (field === "stage" && !showStageColumn) return false;
    if ((field === "bundle" || field === "target") && !includeDevFields) return false;
    return true;
  });
}

export function getOperatorsForField(field: FilterField | null): FilterOperator[] {
  if (!field) return ["is_any_of"];
  return FIELD_OPERATORS[field];
}

export function getDefaultOperatorForField(field: FilterField | null): FilterOperator {
  return getOperatorsForField(field)[0] ?? "is_any_of";
}

export function operatorNeedsValues(operator: FilterOperator): boolean {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

export function isRuleActive(rule: FilterRule): boolean {
  if (!rule.field) return false;
  if (!operatorNeedsValues(rule.operator)) return true;
  return rule.values.length > 0;
}

export function countActiveRules(state: FilterState): number {
  return state.groups.reduce(
    (count, group) => count + group.rules.filter(isRuleActive).length,
    0
  );
}

export function isGroupActive(group: FilterGroup): boolean {
  return group.rules.some(isRuleActive);
}

type SerializedRule = [FilterField | null, FilterOperator, string[]];
type SerializedState = SerializedRule[][];

export function serializeFilters(state: FilterState): string | null {
  if (state.groups.length === 0) return null;

  const serialized: SerializedState = state.groups.map((group) =>
    group.rules.map((rule) => [rule.field, rule.operator, rule.values] as SerializedRule)
  );

  return JSON.stringify(serialized);
}

export function parseFilters(encoded: string | null): FilterState {
  if (!encoded) return { groups: [] };

  try {
    const parsed = JSON.parse(encoded) as SerializedState;
    if (!Array.isArray(parsed)) return { groups: [] };

    const groups = parsed
      .filter((groupRules) => Array.isArray(groupRules))
      .map((groupRules) => {
        const rules = groupRules
          .filter((ruleTuple) => Array.isArray(ruleTuple))
          .map(([field, operator, values]) => ({
            id: createId(),
            field: field ?? null,
            operator,
            values: Array.isArray(values) ? values : [],
          }));

        return {
          id: createId(),
          rules: rules.length > 0 ? rules : [createEmptyRule()],
        };
      });

    return { groups };
  } catch {
    return { groups: [] };
  }
}

function getTaskFieldValue(task: TaskFilterRow, field: FilterField, context: FilterContext): string | null {
  switch (field) {
    case "title":
      return task.title;
    case "status":
      return task.status;
    case "priority":
      return task.priority;
    case "stage":
      return task.planningStage ?? "standard";
    case "coord_approval":
      return deriveCoordinatorApproval(task).label;
    case "dept_approval":
      return deriveDeptApproval(task).label;
    case "bundle":
      return task.waitingForBundle ? "waiting" : "ready";
    case "target":
      return task.devTarget;
    case "effort":
      return task.effort;
    case "value":
      return task.value;
    case "category":
      return task.category;
    case "department":
      return task.departmentId;
    case "assignee":
      return task.assignedTo ?? "__unassigned__";
    case "creator":
      return task.createdBy;
    case "due":
      if (!task.dueDate) return "no_due";
      if (isTaskOverdue(task)) return "overdue";
      return "has_due";
    case "created": {
      const createdAt = new Date(task.createdAt);
      if (createdAt >= daysAgo(7)) return "last_7d";
      if (createdAt >= daysAgo(30)) return "last_30d";
      if (createdAt >= daysAgo(90)) return "last_90d";
      return "older";
    }
    case "done":
      return task.completedAt ? "completed" : "not_completed";
    default:
      return null;
  }
}

function matchesRule(task: TaskFilterRow, rule: FilterRule, context: FilterContext): boolean {
  if (!rule.field || !isRuleActive(rule)) return true;

  const rawValue = getTaskFieldValue(task, rule.field, context);

  if (rule.operator === "is_empty") {
    if (rule.field === "title") return !rawValue?.trim();
    if (rule.field === "department") return !task.departmentId;
    if (rule.field === "assignee") return !task.assignedTo;
    if (rule.field === "due") return !task.dueDate;
    if (rule.field === "stage") return !task.planningStage;
    if (rule.field === "target") return !task.devTarget;
    if (rule.field === "effort") return !task.effort;
    if (rule.field === "value") return !task.value;
    if (rule.field === "category") return !task.category;
    return rawValue === null || rawValue === "__unassigned__";
  }

  if (rule.operator === "is_not_empty") {
    if (rule.field === "title") return !!rawValue?.trim();
    if (rule.field === "department") return !!task.departmentId;
    if (rule.field === "assignee") return !!task.assignedTo;
    if (rule.field === "due") return !!task.dueDate;
    if (rule.field === "stage") return !!task.planningStage;
    if (rule.field === "target") return !!task.devTarget;
    if (rule.field === "effort") return !!task.effort;
    if (rule.field === "value") return !!task.value;
    if (rule.field === "category") return !!task.category;
    return rawValue !== null && rawValue !== "__unassigned__";
  }

  if (rule.field === "department" && rule.operator === "is_any_of") {
    return rule.values.some((value) => {
      if (value === "my_department") {
        return !!context.currentUserDepartmentId && task.departmentId === context.currentUserDepartmentId;
      }
      return task.departmentId === value;
    });
  }

  if (rule.field === "department" && rule.operator === "is_none_of") {
    return !rule.values.some((value) => {
      if (value === "my_department") {
        return !!context.currentUserDepartmentId && task.departmentId === context.currentUserDepartmentId;
      }
      return task.departmentId === value;
    });
  }

  if (rawValue === null) return false;

  if (rule.field === "title") {
    const haystack = rawValue.toLowerCase();
    const needle = rule.values[0]?.toLowerCase() ?? "";
    if (rule.operator === "contains") return haystack.includes(needle);
    if (rule.operator === "not_contains") return !haystack.includes(needle);
    return false;
  }

  if (rule.field === "created") {
    const createdAt = new Date(task.createdAt);
    const matchesAny = rule.values.some((value) => {
      if (value === "last_7d") return createdAt >= daysAgo(7);
      if (value === "last_30d") return createdAt >= daysAgo(30);
      if (value === "last_90d") return createdAt >= daysAgo(90);
      return false;
    });
    return rule.operator === "is_any_of" ? matchesAny : !matchesAny;
  }

  if (rule.operator === "is_any_of") {
    return rule.values.includes(rawValue);
  }

  if (rule.operator === "is_none_of") {
    return !rule.values.includes(rawValue);
  }

  return true;
}

function matchesGroup(task: TaskFilterRow, group: FilterGroup, context: FilterContext): boolean {
  const activeRules = group.rules.filter(isRuleActive);
  if (activeRules.length === 0) return true;
  return activeRules.every((rule) => matchesRule(task, rule, context));
}

export function applyTaskFilters<T extends TaskFilterRow>(
  tasks: T[],
  state: FilterState,
  context: FilterContext
): T[] {
  const activeGroups = state.groups.filter(isGroupActive);
  if (activeGroups.length === 0) return tasks;
  return tasks.filter((task) => activeGroups.some((group) => matchesGroup(task, group, context)));
}

export const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const PRIORITY_OPTIONS = [
  { value: "P0", label: "P0 — Urgent" },
  { value: "P1", label: "P1 — 1 month" },
  { value: "P2", label: "P2 — 3 months" },
  { value: "P3", label: "P3 — Indefinite" },
];

export const STAGE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "draft", label: "Draft" },
  { value: "brainstorming", label: "Brainstorming" },
  { value: "discussed", label: "Discussed" },
];

export const APPROVAL_OPTIONS = [
  { value: "Approved", label: "Approved" },
  { value: "Pending", label: "Pending" },
  { value: "Rejected", label: "Rejected" },
  { value: "Waiting", label: "Waiting" },
  { value: "N/A", label: "N/A" },
];

export const DUE_OPTIONS = [
  { value: "has_due", label: "Has due date" },
  { value: "no_due", label: "No due date" },
  { value: "overdue", label: "Overdue" },
];

export const CREATED_OPTIONS = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
];

export const DONE_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "not_completed", label: "Not completed" },
];

export const BUNDLE_OPTIONS = [
  { value: "waiting", label: "Waiting for bundle" },
  { value: "ready", label: "Ready" },
];

export const TARGET_OPTIONS = [
  { value: "task_manager", label: "Task Manager" },
  { value: "web_app", label: "Web App" },
  { value: "mobile_app", label: "Mobile App" },
  { value: "both", label: "Both (Web App, Mobile App)" },
];

export const EFFORT_FILTER_OPTIONS = EFFORT_OPTIONS;
export const VALUE_FILTER_OPTIONS = VALUE_OPTIONS;
export const CATEGORY_FILTER_OPTIONS = CATEGORY_OPTIONS;
