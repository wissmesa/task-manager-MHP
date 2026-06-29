"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTaskStatus, updateTaskAssignee, updateTaskPriority, updateTaskPlanningStage, updateTaskDueDate } from "@/lib/actions";
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
import { ImageIcon, Loader2, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

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
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

interface TaskTableProps {
  tasks: TaskRow[];
  totalTasks: number;
  currentUserId: string;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
  page: number;
  onPageChange: (page: number) => void;
  showStageColumn?: boolean;
}

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
  subordinatesMap,
  page,
  onPageChange,
  showStageColumn = false,
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
              <SortableHead label="Title" sortKey="title" className={showStageColumn ? "w-[24%]" : "w-[31%]"} />
              {showStageColumn && <SortableHead label="Stage" sortKey="stage" className="w-[7%]" />}
              <SortableHead label="Status" sortKey="status" className="w-[8%]" />
              <SortableHead label="Pri." sortKey="priority" className="w-[5%]" />
              <SortableHead label="Coord." sortKey="coord" className="w-[7%]" />
              <SortableHead label="Dept." sortKey="dept" className="w-[7%]" />
              <SortableHead label="Department" sortKey="department" className="w-[10%]" />
              <SortableHead label="Assignee" sortKey="assignee" className="w-[5%]" />
              <SortableHead label="Due" sortKey="due" className="w-[7%]" />
              <SortableHead label="Created" sortKey="created" className="w-[7%]" />
              <SortableHead label="Done" sortKey="done" className="w-[7%]" />
              <SortableHead label="By" sortKey="by" className="w-[5%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showStageColumn ? 12 : 11} className="h-24 text-center text-muted-foreground">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              paginatedTasks.map((task) => {
                const isBossOfTaskDept =
                  !!task.departmentId && !!subordinatesMap[task.departmentId];
                const isBossOfCreatorDept =
                  !!task.creatorDeptId && !!subordinatesMap[task.creatorDeptId];
                const canEditStatus =
                  task.createdBy === currentUserId ||
                  task.assignedTo === currentUserId ||
                  isBossOfTaskDept ||
                  isBossOfCreatorDept;
                const canEditAssignee =
                  (task.createdBy === currentUserId || isBossOfTaskDept) && task.departmentId;
                const canEditDueDate =
                  task.assignedTo === currentUserId || isBossOfTaskDept;
                const subs = task.departmentId
                  ? subordinatesMap[task.departmentId] ?? []
                  : [];

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(task.id)}
                  >
                    <TableCell className="max-w-0 px-2">
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
                    <TableCell className="px-1.5">
                      {(() => {
                        const b = deriveCoordinatorApproval(task);
                        return (
                          <Badge variant="secondary" className={`text-xs ${b.color}`}>
                            {b.label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="px-1.5">
                      {(() => {
                        const b = deriveDeptApproval(task);
                        return (
                          <Badge variant="secondary" className={`text-xs ${b.color}`}>
                            {b.label}
                          </Badge>
                        );
                      })()}
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
