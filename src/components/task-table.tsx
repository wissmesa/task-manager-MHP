"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTaskStatus, updateTaskAssignee, updateTaskPriority, updateTaskPlanningStage, updateTaskDueDate, updateTaskWaitingForBundle, updateTaskDevTarget, updateTaskEffort, updateTaskValue, updateTaskCategory, updateTaskClientScope, deleteTask } from "@/lib/actions";
import {
  TASK_EFFORTS,
  TASK_VALUES,
  TASK_CATEGORIES,
  TASK_CLIENT_SCOPES,
  EFFORT_LABELS,
  EFFORT_COLORS,
  EFFORT_ORDER,
  VALUE_LABELS,
  VALUE_SHORT_LABELS,
  VALUE_COLORS,
  VALUE_ORDER,
  CATEGORY_LABELS,
  CATEGORY_COLOR,
  CATEGORY_ORDER,
  CLIENT_SCOPE_LABELS,
  CLIENT_SCOPE_COLORS,
  CLIENT_SCOPE_ORDER,
  type TaskEffort,
  type TaskValue,
  type TaskCategory,
  type TaskClientScope,
} from "@/lib/task-attributes";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  getDueDateLimits,
  formatDateInputValue,
  type TaskPriority,
} from "@/lib/task-priority";
import {
  TASK_PLANNING_STAGES,
  PLANNING_STAGE_LABELS,
  PLANNING_STAGE_COLORS,
  type TaskPlanningStage,
} from "@/lib/task-planning";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown, ArrowRightLeft, Trash2 } from "lucide-react";

type TaskRow = {
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
  devTarget: DevTarget | null;
  effort: TaskEffort | null;
  value: TaskValue | null;
  category: TaskCategory | null;
  clientScope: TaskClientScope | null;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

interface TaskTableProps {
  tasks: TaskRow[];
  totalTasks: number;
  currentUserId: string;
  isAdmin?: boolean;
  canEditDevFields?: boolean;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
  page: number;
  onPageChange: (page: number) => void;
  showStageColumn?: boolean;
  hideStatusColumn?: boolean;
  showMoveAction?: boolean;
}

const DEVELOPMENT_DEPARTMENT = "Development";

type DevTarget = "task_manager" | "web_app" | "mobile_app" | "both";

const DEV_TARGETS: DevTarget[] = ["task_manager", "web_app", "mobile_app", "both"];

const DEV_TARGET_LABELS: Record<DevTarget, string> = {
  task_manager: "Task Manager",
  web_app: "Web App",
  mobile_app: "Mobile App",
  both: "Both (Web App, Mobile App)",
};

const DEV_TARGET_ORDER: Record<DevTarget, number> = {
  task_manager: 0,
  web_app: 1,
  mobile_app: 2,
  both: 3,
};

const planningStageLabels = PLANNING_STAGE_LABELS;
const planningStageColors = PLANNING_STAGE_COLORS;

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const priorityLabels = PRIORITY_LABELS;
const priorityColors = PRIORITY_COLORS;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type ApprovalBadge = { label: string; color: string };

const BADGE_APPROVED: ApprovalBadge = {
  label: "Approved",
  color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};
const BADGE_PENDING: ApprovalBadge = {
  label: "Pending",
  color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};
const BADGE_REJECTED: ApprovalBadge = {
  label: "Rejected",
  color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
};
const BADGE_WAITING: ApprovalBadge = {
  label: "Waiting",
  color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
const BADGE_NA: ApprovalBadge = {
  label: "N/A",
  color: "bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500",
};

function deriveCoordinatorApproval(task: TaskRow): ApprovalBadge {
  if (task.approval === "pending_approval") return BADGE_PENDING;
  if (task.ownBossApproved) return BADGE_APPROVED;
  if (task.approval === "rejected") return BADGE_REJECTED;
  return BADGE_APPROVED;
}

function deriveDeptApproval(task: TaskRow): ApprovalBadge {
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

type SortKey =
  | "title"
  | "stage"
  | "status"
  | "bundle"
  | "target"
  | "effort"
  | "value"
  | "category"
  | "clientScope"
  | "priority"
  | "coord"
  | "dept"
  | "department"
  | "assignee"
  | "due"
  | "created"
  | "done"
  | "by";

type SortState = { key: SortKey; dir: "asc" | "desc" };

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
  cancelled: 3,
};

const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const STAGE_ORDER: Record<string, number> = {
  draft: 0,
  brainstorming: 1,
  discussed: 2,
};

function getSortValue(task: TaskRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return task.title?.toLowerCase() ?? null;
    case "stage":
      return task.planningStage ? STAGE_ORDER[task.planningStage] : null;
    case "status":
      return STATUS_ORDER[task.status] ?? null;
    case "bundle":
      if (task.department?.name !== DEVELOPMENT_DEPARTMENT) return null;
      return task.waitingForBundle ? 0 : 1;
    case "target":
      if (task.department?.name !== DEVELOPMENT_DEPARTMENT || !task.devTarget) return null;
      return DEV_TARGET_ORDER[task.devTarget];
    case "effort":
      return task.effort ? EFFORT_ORDER[task.effort] : null;
    case "value":
      return task.value ? VALUE_ORDER[task.value] : null;
    case "category":
      return task.category ? CATEGORY_ORDER[task.category] : null;
    case "clientScope":
      return task.clientScope ? CLIENT_SCOPE_ORDER[task.clientScope] : null;
    case "priority":
      return PRIORITY_ORDER[task.priority] ?? null;
    case "coord":
      return deriveCoordinatorApproval(task).label;
    case "dept":
      return deriveDeptApproval(task).label;
    case "department":
      return task.department?.name?.toLowerCase() ?? null;
    case "assignee":
      return task.assignee?.fullName.toLowerCase() ?? null;
    case "due":
      return task.dueDate ? new Date(task.dueDate).getTime() : null;
    case "created":
      return new Date(task.createdAt).getTime();
    case "done":
      return task.completedAt ? new Date(task.completedAt).getTime() : null;
    case "by":
      return task.creator?.fullName.toLowerCase() ?? null;
    default:
      return null;
  }
}

export function TaskTable({
  tasks,
  totalTasks,
  currentUserId,
  isAdmin = false,
  canEditDevFields = false,
  subordinatesMap,
  page,
  onPageChange,
  showStageColumn = false,
  hideStatusColumn = false,
  showMoveAction = false,
}: TaskTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);

  const PAGE_SIZE = 20;

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
    onPageChange(1);
  }

  const sortedTasks = useMemo(() => {
    if (!sort) return tasks;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      const av = getSortValue(a, sort.key);
      const bv = getSortValue(b, sort.key);
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir * cmp;
    });
  }, [tasks, sort]);

  function handleRowClick(taskId: string) {
    setLoadingId(taskId);
    startTransition(() => {
      router.push(`/tasks/${taskId}`);
    });
  }

  function handleStatusChange(taskId: string, newStatus: string) {
    setSavingCell(`status-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, newStatus as TaskRow["status"]);
        router.refresh();
      } catch (err) {
        console.error("Failed to update status:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      return;
    }
    setSavingCell(`delete-${taskId}`);
    startTransition(async () => {
      try {
        await deleteTask(taskId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete task");
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handlePriorityChange(taskId: string, newPriority: string) {
    setSavingCell(`priority-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskPriority(taskId, newPriority as TaskRow["priority"]);
        router.refresh();
      } catch (err) {
        console.error("Failed to update priority:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handlePlanningStageChange(taskId: string, newStage: string) {
    const planningStage = newStage === "none" ? null : (newStage as TaskPlanningStage);
    setSavingCell(`stage-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskPlanningStage(taskId, planningStage);
        router.refresh();
      } catch (err) {
        console.error("Failed to update stage:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleDueDateChange(taskId: string, value: string) {
    setSavingCell(`due-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskDueDate(taskId, value || null);
        router.refresh();
      } catch (err) {
        console.error("Failed to update due date:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleBundleChange(taskId: string, waiting: boolean) {
    setSavingCell(`bundle-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskWaitingForBundle(taskId, waiting);
        router.refresh();
      } catch (err) {
        console.error("Failed to update bundle status:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleDevTargetChange(taskId: string, value: string) {
    const devTarget = value === "none" ? null : (value as DevTarget);
    setSavingCell(`target-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskDevTarget(taskId, devTarget);
        router.refresh();
      } catch (err) {
        console.error("Failed to update target:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleEffortChange(taskId: string, value: string) {
    const effort = value === "none" ? null : (value as TaskEffort);
    setSavingCell(`effort-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskEffort(taskId, effort);
        router.refresh();
      } catch (err) {
        console.error("Failed to update effort:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleValueChange(taskId: string, value: string) {
    const taskValue = value === "none" ? null : (value as TaskValue);
    setSavingCell(`value-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskValue(taskId, taskValue);
        router.refresh();
      } catch (err) {
        console.error("Failed to update value:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleCategoryChange(taskId: string, value: string) {
    const category = value === "none" ? null : (value as TaskCategory);
    setSavingCell(`category-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskCategory(taskId, category);
        router.refresh();
      } catch (err) {
        console.error("Failed to update category:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleClientScopeChange(taskId: string, value: string) {
    const clientScope = value === "none" ? null : (value as TaskClientScope);
    setSavingCell(`clientScope-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskClientScope(taskId, clientScope);
        router.refresh();
      } catch (err) {
        console.error("Failed to update client scope:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  function handleAssigneeChange(taskId: string, newAssignee: string) {
    const assignedTo = newAssignee === "unassigned" ? null : newAssignee;
    setSavingCell(`assignee-${taskId}`);
    startTransition(async () => {
      try {
        await updateTaskAssignee(taskId, assignedTo);
        router.refresh();
      } catch (err) {
        console.error("Failed to update assignee:", err);
      } finally {
        setSavingCell(null);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTasks = sortedTasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function SortableHead({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) {
    const active = sort?.key === sortKey;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className="group inline-flex w-full items-center gap-1 hover:text-foreground"
          title={`Sort by ${label}`}
        >
          <span className="truncate">{label}</span>
          {active ? (
            sort?.dir === "asc" ? (
              <ArrowUp className="h-3 w-3 shrink-0" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
          )}
        </button>
      </TableHead>
    );
  }

  function formatShortDate(date: Date) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  function PriorityBadge({
    priority,
    interactive,
  }: {
    priority: TaskPriority;
    interactive?: boolean;
  }) {
    const badge = (
      <Badge
        variant="secondary"
        className={`text-xs ${priorityColors[priority]} ${interactive ? "hover:opacity-80 transition-opacity" : ""}`}
      >
        {priority}
      </Badge>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {interactive ? <button className="cursor-pointer">{badge}</button> : badge}
        </TooltipTrigger>
        <TooltipContent>{priorityLabels[priority]}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <Table containerClassName="overflow-x-hidden" className="table-fixed w-full text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <SortableHead label="Title" sortKey="title" className={showStageColumn ? "w-[13%]" : "w-[18%]"} />
              {showStageColumn && <SortableHead label="Stage" sortKey="stage" className="w-[7%]" />}
              {!hideStatusColumn && <SortableHead label="Status" sortKey="status" className="w-[8%]" />}
              {canEditDevFields && (
                <>
                  <SortableHead label="Bundle" sortKey="bundle" className="w-[7%]" />
                  <SortableHead label="Target" sortKey="target" className="w-[11%]" />
                </>
              )}
              <SortableHead label="Pri." sortKey="priority" className="w-[5%]" />
              <SortableHead label="Effort" sortKey="effort" className="w-[7%]" />
              <SortableHead label="Value" sortKey="value" className="w-[6%]" />
              <SortableHead label="Category" sortKey="category" className="w-[9%]" />
              <SortableHead label="Client/MHP" sortKey="clientScope" className="w-[6%]" />
              <SortableHead label="Department" sortKey="department" className="w-[7%]" />
              <SortableHead label="Assignee" sortKey="assignee" className="w-[5%]" />
              <SortableHead label="Due" sortKey="due" className="w-[7%]" />
              <SortableHead label="Created" sortKey="created" className="w-[5%]" />
              <SortableHead label="Done" sortKey="done" className="w-[5%]" />
              <SortableHead label="By" sortKey="by" className="w-[4%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={(showStageColumn ? 14 : 13) + (canEditDevFields ? 2 : 0) - (hideStatusColumn ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              paginatedTasks.map((task) => {
                // Any user who can view a task may edit it.
                const canEditStatus = true;
                const canEditDueDate = true;
                // Reassignment still needs the department's member list, which is
                // only available to that department's boss (and admins).
                const canEditAssignee = !!task.departmentId;
                const isDevTask = task.department?.name === DEVELOPMENT_DEPARTMENT;
                const canToggleBundle = canEditDevFields && isDevTask;
                const canSetTarget = canEditDevFields && isDevTask;
                const subs = task.departmentId
                  ? subordinatesMap[task.departmentId] ?? []
                  : [];
                // Deletion mirrors the server rule: admin, task owner, or the
                // boss of the task's department (subordinatesMap is keyed by the
                // departments the current user is boss of).
                const canDeleteTask =
                  isAdmin ||
                  task.createdBy === currentUserId ||
                  (!!task.departmentId && subordinatesMap[task.departmentId] != null);

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(task.id)}
                  >
                    <TableCell className="max-w-0 px-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {showMoveAction && canEditStatus && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="Move to another status"
                              >
                                {savingCell === `status-${task.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                              {(["pending", "in_progress", "completed", "cancelled"] as const)
                                .filter((s) => s !== task.status)
                                .map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handleStatusChange(task.id, s)}
                                    className="gap-2"
                                  >
                                    <span className="text-muted-foreground">Move to</span>
                                    <Badge variant="secondary" className={statusColors[s]}>
                                      {statusLabels[s]}
                                    </Badge>
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <Link
                          href={`/tasks/${task.id}`}
                          onClick={(e) => e.preventDefault()}
                          className="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                        >
                          {isPending && loadingId === task.id ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                          ) : null}
                          <span className="truncate">{task.title}</span>
                          {task.images.length > 0 && (
                            <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                        </Link>
                        {canDeleteTask && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                            title="Delete task"
                          >
                            {savingCell === `delete-${task.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    {showStageColumn && (
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.planningStage ? (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${planningStageColors[task.planningStage]} hover:opacity-80 transition-opacity`}
                                  >
                                    {planningStageLabels[task.planningStage]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Standard
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handlePlanningStageChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">Standard task</span>
                                {!task.planningStage && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {TASK_PLANNING_STAGES.map((stage) => (
                                <DropdownMenuItem
                                  key={stage}
                                  onClick={() => handlePlanningStageChange(task.id, stage)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <Badge variant="secondary" className={planningStageColors[stage]}>
                                    {planningStageLabels[stage]}
                                  </Badge>
                                  {task.planningStage === stage && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `stage-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.planningStage ? (
                        <Badge
                          variant="secondary"
                          className={`text-xs ${planningStageColors[task.planningStage]}`}
                        >
                          {planningStageLabels[task.planningStage]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Standard</span>
                      )}
                    </TableCell>
                    )}
                    {!hideStatusColumn && (
                    <TableCell onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${statusColors[task.status]} hover:opacity-80 transition-opacity`}
                                >
                                  {statusLabels[task.status]}
                                </Badge>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {(["pending", "in_progress", "completed", "cancelled"] as const).map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => handleStatusChange(task.id, s)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <Badge variant="secondary" className={statusColors[s]}>
                                    {statusLabels[s]}
                                  </Badge>
                                  {task.status === s && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `status-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={`text-xs ${statusColors[task.status]}`}
                        >
                          {statusLabels[task.status]}
                        </Badge>
                      )}
                    </TableCell>
                    )}
                    {canEditDevFields && (
                    <>
                    <TableCell className="px-1.5" onClick={(e) => canToggleBundle && e.stopPropagation()}>
                      {!isDevTask ? (
                        <span className="text-muted-foreground">—</span>
                      ) : canToggleBundle ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="cursor-pointer"
                            onClick={() => handleBundleChange(task.id, !task.waitingForBundle)}
                            title={
                              task.waitingForBundle
                                ? "Waiting for mobile bundle — click to mark ready"
                                : "Mark as waiting for mobile bundle"
                            }
                          >
                            <Badge
                              variant="secondary"
                              className={`text-xs transition-opacity hover:opacity-80 ${
                                task.waitingForBundle
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {task.waitingForBundle ? "Waiting" : "Ready"}
                            </Badge>
                          </button>
                          {savingCell === `bundle-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.waitingForBundle ? (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        >
                          Waiting
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Ready</span>
                      )}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canSetTarget && e.stopPropagation()}>
                      {!isDevTask ? (
                        <span className="text-muted-foreground">—</span>
                      ) : canSetTarget ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.devTarget ? (
                                  <Badge
                                    variant="secondary"
                                    className="max-w-full whitespace-normal text-left leading-tight text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 hover:opacity-80 transition-opacity"
                                  >
                                    {DEV_TARGET_LABELS[task.devTarget]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Set target
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleDevTargetChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">None</span>
                                {!task.devTarget && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {DEV_TARGETS.map((target) => (
                                <DropdownMenuItem
                                  key={target}
                                  onClick={() => handleDevTargetChange(task.id, target)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span>{DEV_TARGET_LABELS[target]}</span>
                                  {task.devTarget === target && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `target-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.devTarget ? (
                        <Badge
                          variant="secondary"
                          className="max-w-full whitespace-normal text-left leading-tight text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                        >
                          {DEV_TARGET_LABELS[task.devTarget]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    </>
                    )}
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${priorityColors[task.priority]} hover:opacity-80 transition-opacity`}
                                >
                                  {task.priority}
                                </Badge>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {TASK_PRIORITIES.map((p) => (
                                <DropdownMenuItem
                                  key={p}
                                  onClick={() => handlePriorityChange(task.id, p)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <Badge variant="secondary" className={priorityColors[p]}>
                                    {priorityLabels[p]}
                                  </Badge>
                                  {task.priority === p && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `priority-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : (
                        <PriorityBadge priority={task.priority} />
                      )}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.effort ? (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${EFFORT_COLORS[task.effort]} hover:opacity-80 transition-opacity`}
                                  >
                                    {EFFORT_LABELS[task.effort]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Set effort
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleEffortChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">None</span>
                                {!task.effort && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {TASK_EFFORTS.map((eff) => (
                                <DropdownMenuItem
                                  key={eff}
                                  onClick={() => handleEffortChange(task.id, eff)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <Badge variant="secondary" className={EFFORT_COLORS[eff]}>
                                    {EFFORT_LABELS[eff]}
                                  </Badge>
                                  {task.effort === eff && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `effort-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.effort ? (
                        <Badge variant="secondary" className={`text-xs ${EFFORT_COLORS[task.effort]}`}>
                          {EFFORT_LABELS[task.effort]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.value ? (
                                  <Badge
                                    variant="secondary"
                                    title={VALUE_LABELS[task.value]}
                                    className={`text-xs ${VALUE_COLORS[task.value]} hover:opacity-80 transition-opacity`}
                                  >
                                    {VALUE_SHORT_LABELS[task.value]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Set value
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleValueChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">None</span>
                                {!task.value && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {TASK_VALUES.map((val) => (
                                <DropdownMenuItem
                                  key={val}
                                  onClick={() => handleValueChange(task.id, val)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span>{VALUE_LABELS[val]}</span>
                                  {task.value === val && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `value-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.value ? (
                        <Badge
                          variant="secondary"
                          title={VALUE_LABELS[task.value]}
                          className={`text-xs ${VALUE_COLORS[task.value]}`}
                        >
                          {VALUE_SHORT_LABELS[task.value]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.category ? (
                                  <Badge
                                    variant="secondary"
                                    title={CATEGORY_LABELS[task.category]}
                                    className={`max-w-full whitespace-normal text-left leading-tight text-xs ${CATEGORY_COLOR} hover:opacity-80 transition-opacity`}
                                  >
                                    {CATEGORY_LABELS[task.category]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Set cat.
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleCategoryChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">None</span>
                                {!task.category && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {TASK_CATEGORIES.map((cat) => (
                                <DropdownMenuItem
                                  key={cat}
                                  onClick={() => handleCategoryChange(task.id, cat)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span>{CATEGORY_LABELS[cat]}</span>
                                  {task.category === cat && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `category-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.category ? (
                        <Badge
                          variant="secondary"
                          title={CATEGORY_LABELS[task.category]}
                          className={`max-w-full whitespace-normal text-left leading-tight text-xs ${CATEGORY_COLOR}`}
                        >
                          {CATEGORY_LABELS[task.category]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                {task.clientScope ? (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${CLIENT_SCOPE_COLORS[task.clientScope]} hover:opacity-80 transition-opacity`}
                                  >
                                    {CLIENT_SCOPE_LABELS[task.clientScope]}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-muted text-muted-foreground hover:opacity-80 transition-opacity"
                                  >
                                    Set
                                  </Badge>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleClientScopeChange(task.id, "none")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">None</span>
                                {!task.clientScope && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {TASK_CLIENT_SCOPES.map((scope) => (
                                <DropdownMenuItem
                                  key={scope}
                                  onClick={() => handleClientScopeChange(task.id, scope)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <Badge variant="secondary" className={CLIENT_SCOPE_COLORS[scope]}>
                                    {CLIENT_SCOPE_LABELS[scope]}
                                  </Badge>
                                  {task.clientScope === scope && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `clientScope-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.clientScope ? (
                        <Badge variant="secondary" className={`text-xs ${CLIENT_SCOPE_COLORS[task.clientScope]}`}>
                          {CLIENT_SCOPE_LABELS[task.clientScope]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-0 truncate px-1.5 text-muted-foreground">
                      {task.department?.name ?? "—"}
                    </TableCell>
                    <TableCell className="px-1.5" onClick={(e) => canEditAssignee && e.stopPropagation()}>
                      {canEditAssignee && subs.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {task.assignee ? (
                                <button className="cursor-pointer">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Avatar className="h-7 w-7 hover:ring-2 hover:ring-primary/50 transition-all">
                                        <AvatarFallback className="text-xs">
                                          {getInitials(task.assignee.fullName)}
                                        </AvatarFallback>
                                      </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>{task.assignee.fullName}</TooltipContent>
                                  </Tooltip>
                                </button>
                              ) : (
                                <button className="cursor-pointer">
                                  <Avatar className="h-7 w-7 hover:ring-2 hover:ring-primary/50 transition-all border-2 border-dashed border-muted-foreground/30">
                                    <AvatarFallback className="text-xs text-muted-foreground">?</AvatarFallback>
                                  </Avatar>
                                </button>
                              )}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => handleAssigneeChange(task.id, "unassigned")}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="text-muted-foreground">Unassigned</span>
                                {!task.assignedTo && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                              {subs.map((u) => (
                                <DropdownMenuItem
                                  key={u.id}
                                  onClick={() => handleAssigneeChange(task.id, u.id)}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="text-[10px]">
                                        {getInitials(u.fullName)}
                                      </AvatarFallback>
                                    </Avatar>
                                    {u.fullName}
                                  </div>
                                  {task.assignedTo === u.id && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {savingCell === `assignee-${task.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      ) : task.assignee ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="h-7 w-7 cursor-default">
                              <AvatarFallback className="text-xs">
                                {getInitials(task.assignee.fullName)}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>{task.assignee.fullName}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap px-1.5 text-muted-foreground"
                      onClick={(e) => canEditDueDate && e.stopPropagation()}
                    >
                      {canEditDueDate ? (
                        (() => {
                          const { min, max } = getDueDateLimits(task.priority, task.createdAt);
                          const minStr = formatDateInputValue(min);
                          const maxStr = max ? formatDateInputValue(max) : undefined;
                          const windowExpired = max !== null && max < min;

                          return (
                            <div className="flex items-center gap-1">
                              <Input
                                type="date"
                                defaultValue={task.dueDate ? formatDateInputValue(new Date(task.dueDate)) : ""}
                                min={minStr}
                                max={maxStr}
                                disabled={windowExpired}
                                title={
                                  windowExpired
                                    ? "Due date window expired for this priority"
                                    : maxStr
                                      ? `Max: ${maxStr}`
                                      : "No max limit (P3)"
                                }
                                onChange={(e) => handleDueDateChange(task.id, e.target.value)}
                                className="h-7 w-[7.5rem] px-1.5 text-xs"
                              />
                              {savingCell === `due-${task.id}` && (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          );
                        })()
                      ) : task.dueDate ? (
                        formatShortDate(task.dueDate)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5 text-muted-foreground">
                      {formatShortDate(task.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5 text-muted-foreground">
                      {task.completedAt ? formatShortDate(task.completedAt) : "—"}
                    </TableCell>
                    <TableCell className="px-1.5">
                      {task.creator ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="h-7 w-7 cursor-default">
                              <AvatarFallback className="text-[10px]">
                                {getInitials(task.creator.fullName)}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>{task.creator.fullName}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {tasks.length === 0 ? 0 : Math.min((safePage - 1) * PAGE_SIZE + 1, tasks.length)}–{Math.min(safePage * PAGE_SIZE, tasks.length)} of {tasks.length} tasks
          {tasks.length !== totalTasks && ` (${totalTasks} total)`}
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(1)}
              disabled={safePage <= 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(totalPages)}
              disabled={safePage >= totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
