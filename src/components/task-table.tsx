"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTaskStatus, updateTaskAssignee } from "@/lib/actions";
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
import { ImageIcon, Loader2, Check } from "lucide-react";

type TaskRow = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  approval: "pending_approval" | "pending_dept_approval" | "approved" | "rejected";
  ownBossApproved: boolean;
  createdBy: string;
  assignedTo: string | null;
  departmentId: string | null;
  creatorDeptId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

interface TaskTableProps {
  tasks: TaskRow[];
  currentUserId: string;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
}

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

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

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

function deriveBossApproval(task: TaskRow): ApprovalBadge {
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

export function TaskTable({ tasks, currentUserId, subordinatesMap }: TaskTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [savingCell, setSavingCell] = useState<string | null>(null);

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

  const filtered = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Boss</TableHead>
              <TableHead>Dept.</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Created by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((task) => {
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
                const subs = task.departmentId
                  ? subordinatesMap[task.departmentId] ?? []
                  : [];

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(task.id)}
                  >
                    <TableCell>
                      <Link
                        href={`/tasks/${task.id}`}
                        onClick={(e) => e.preventDefault()}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        {isPending && loadingId === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {task.title}
                        {task.images.length > 0 && (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Link>
                    </TableCell>
                    <TableCell onClick={(e) => canEditStatus && e.stopPropagation()}>
                      {canEditStatus ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer">
                                <Badge
                                  variant="secondary"
                                  className={`${statusColors[task.status]} hover:opacity-80 transition-opacity`}
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
                          className={statusColors[task.status]}
                        >
                          {statusLabels[task.status]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={priorityColors[task.priority]}
                      >
                        {priorityLabels[task.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const b = deriveBossApproval(task);
                        return (
                          <Badge variant="secondary" className={b.color}>
                            {b.label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const b = deriveDeptApproval(task);
                        return (
                          <Badge variant="secondary" className={b.color}>
                            {b.label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.department?.name ?? "—"}
                    </TableCell>
                    <TableCell onClick={(e) => canEditAssignee && e.stopPropagation()}>
                      {canEditAssignee && subs.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {task.assignee ? (
                                <button className="cursor-pointer">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary/50 transition-all">
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
                                  <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary/50 transition-all border-2 border-dashed border-muted-foreground/30">
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
                            <Avatar className="h-8 w-8 cursor-default">
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
                    <TableCell className="text-muted-foreground">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {task.creator ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="h-8 w-8 cursor-default">
                              <AvatarFallback className="text-xs">
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

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {tasks.length} tasks
      </p>
    </div>
  );
}
