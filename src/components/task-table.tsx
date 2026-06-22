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
import { ImageIcon, Loader2, Check, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

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
  currentUserId: string;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
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

export function TaskTable({
  tasks,
  currentUserId,
  subordinatesMap,
  showStageColumn = false,
}: TaskTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.creator) map.set(t.createdBy, t.creator.fullName);
      if (t.assignee) map.set(t.assignee.id, t.assignee.fullName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

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

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (personFilter !== "all") {
        const matchesCreator = t.createdBy === personFilter;
        const matchesAssignee = t.assignedTo === personFilter;
        if (!matchesCreator && !matchesAssignee) return false;
      }
      if (query) {
        const titleMatch = t.title.toLowerCase().includes(query);
        const creatorMatch = t.creator?.fullName.toLowerCase().includes(query);
        const assigneeMatch = t.assignee?.fullName.toLowerCase().includes(query);
        const deptMatch = t.department?.name.toLowerCase().includes(query);
        if (!titleMatch && !creatorMatch && !assigneeMatch && !deptMatch) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, personFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTasks = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setCurrentPage(1);
    };
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={handleFilterChange(setPriorityFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={personFilter} onValueChange={handleFilterChange(setPersonFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Person" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All People</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table containerClassName="overflow-x-hidden" className="table-fixed w-full text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className={showStageColumn ? "w-[24%]" : "w-[31%]"}>Title</TableHead>
              {showStageColumn && <TableHead className="w-[7%]">Stage</TableHead>}
              <TableHead className="w-[8%]">Status</TableHead>
              <TableHead className="w-[5%]">Pri.</TableHead>
              <TableHead className="w-[7%]">Coord.</TableHead>
              <TableHead className="w-[7%]">Dept.</TableHead>
              <TableHead className="w-[10%]">Department</TableHead>
              <TableHead className="w-[5%]">Assignee</TableHead>
              <TableHead className="w-[7%]">Due</TableHead>
              <TableHead className="w-[7%]">Created</TableHead>
              <TableHead className="w-[7%]">Done</TableHead>
              <TableHead className="w-[5%]">By</TableHead>
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
          Showing {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} tasks
          {filtered.length !== tasks.length && ` (${tasks.length} total)`}
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(totalPages)}
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
