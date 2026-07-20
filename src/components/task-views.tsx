"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TaskTable } from "@/components/task-table";
import { updateTaskStatus, deleteTask } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type TaskPriority,
} from "@/lib/task-priority";
import {
  PLANNING_STAGE_COLORS,
  PLANNING_STAGE_LABELS,
  type TaskPlanningStage,
} from "@/lib/task-planning";
import {
  EFFORT_COLORS,
  EFFORT_LABELS,
  VALUE_COLORS,
  VALUE_LABELS,
  VALUE_SHORT_LABELS,
  CATEGORY_COLOR,
  CATEGORY_LABELS,
  CLIENT_SCOPE_COLORS,
  CLIENT_SCOPE_LABELS,
  getDepartmentColor,
  type TaskCategory,
  type TaskClientScope,
} from "@/lib/task-attributes";
import { ChevronDown, ChevronRight, ChevronsRight, ImageIcon, Loader2, Trash2 } from "lucide-react";

type DevTarget = "task_manager" | "web_app" | "mobile_app" | "both";

export type TaskViewRow = {
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
  effort: "low" | "mid_low" | "mid_high" | "high" | null;
  value: "anyone" | "specialist" | "senior" | "highest" | null;
  category: TaskCategory | null;
  clientScope: TaskClientScope | null;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

type Status = TaskViewRow["status"];

type SharedTableProps = {
  currentUserId: string;
  isAdmin?: boolean;
  canEditDevFields?: boolean;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
  showStageColumn?: boolean;
};

const STATUS_ORDER: Status[] = ["pending", "in_progress", "completed", "cancelled"];

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_DOT: Record<Status, string> = {
  pending: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

const STATUS_COLUMN_ACCENT: Record<Status, string> = {
  pending: "border-t-yellow-400",
  in_progress: "border-t-blue-400",
  completed: "border-t-green-400",
  cancelled: "border-t-red-400",
};

const DEV_TARGET_LABELS: Record<DevTarget, string> = {
  task_manager: "Task Manager",
  web_app: "Web App",
  mobile_app: "Mobile App",
  both: "Both (Web App, Mobile App)",
};

// Completed and cancelled tasks start collapsed to keep the focus on active work.
const DEFAULT_COLLAPSED: Record<Status, boolean> = {
  pending: false,
  in_progress: false,
  completed: true,
  cancelled: true,
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function groupByStatus(tasks: TaskViewRow[]): Record<Status, TaskViewRow[]> {
  const groups: Record<Status, TaskViewRow[]> = {
    pending: [],
    in_progress: [],
    completed: [],
    cancelled: [],
  };
  for (const task of tasks) groups[task.status].push(task);
  return groups;
}

/** TaskTable wrapper that manages its own pagination for grouped sections. */
function PaginatedTaskTable({
  tasks,
  ...shared
}: SharedTableProps & { tasks: TaskViewRow[] }) {
  const [page, setPage] = useState(1);
  return (
    <TaskTable
      {...shared}
      tasks={tasks}
      totalTasks={tasks.length}
      page={page}
      onPageChange={setPage}
      hideStatusColumn
      showMoveAction
    />
  );
}

export function GroupedTaskTables({
  tasks,
  ...shared
}: SharedTableProps & { tasks: TaskViewRow[] }) {
  const [collapsed, setCollapsed] = useState<Record<Status, boolean>>(DEFAULT_COLLAPSED);
  const groups = groupByStatus(tasks);

  return (
    <div className="space-y-4">
      {STATUS_ORDER.map((status) => {
        const groupTasks = groups[status];
        if (groupTasks.length === 0) return null;
        const isCollapsed = collapsed[status];

        return (
          <div key={status} className="rounded-lg border">
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }))
              }
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="font-medium">{STATUS_LABELS[status]}</span>
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {groupTasks.length}
              </Badge>
            </button>

            {!isCollapsed && (
              <div className="border-t p-3">
                <PaginatedTaskTable {...shared} tasks={groupTasks} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  task,
  onDragStart,
  onDragEnd,
  isDragging,
  isMoving,
  canDelete,
  isDeleting,
  onDelete,
}: {
  task: TaskViewRow;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isMoving: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: (taskId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    startTransition(() => router.push(`/tasks/${task.id}`));
  }

  return (
    <button
      type="button"
      onClick={open}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className={`group w-full cursor-grab rounded-lg border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${isMoving || isDeleting ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
          <span className="line-clamp-2">{task.title}</span>
        </span>
        {(isPending || isMoving) && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
        {canDelete && !isMoving && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onDelete(task.id);
              }
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950"
            title="Delete task"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
              {task.priority}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{PRIORITY_LABELS[task.priority]}</TooltipContent>
        </Tooltip>

        {task.department?.name && (
          <Badge
            variant="secondary"
            className={`text-[10px] ${getDepartmentColor(task.department.name)}`}
          >
            {task.department.name}
          </Badge>
        )}

        {task.planningStage && (
          <Badge
            variant="secondary"
            className={`text-[10px] ${PLANNING_STAGE_COLORS[task.planningStage]}`}
          >
            {PLANNING_STAGE_LABELS[task.planningStage]}
          </Badge>
        )}

        {task.department?.name === "Development" && task.waitingForBundle && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          >
            Waiting
          </Badge>
        )}
        {task.department?.name === "Development" && task.devTarget && (
          <Badge
            variant="secondary"
            className="whitespace-normal text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
          >
            {DEV_TARGET_LABELS[task.devTarget]}
          </Badge>
        )}

        {task.effort && (
          <Badge variant="secondary" className={`text-[10px] ${EFFORT_COLORS[task.effort]}`}>
            {EFFORT_LABELS[task.effort]}
          </Badge>
        )}
        {task.value && (
          <Badge
            variant="secondary"
            title={VALUE_LABELS[task.value]}
            className={`text-[10px] ${VALUE_COLORS[task.value]}`}
          >
            {VALUE_SHORT_LABELS[task.value]}
          </Badge>
        )}
        {task.category && (
          <Badge
            variant="secondary"
            className={`whitespace-normal text-[10px] ${CATEGORY_COLOR}`}
          >
            {CATEGORY_LABELS[task.category]}
          </Badge>
        )}
        {task.clientScope && (
          <Badge
            variant="secondary"
            className={`text-[10px] ${CLIENT_SCOPE_COLORS[task.clientScope]}`}
          >
            {CLIENT_SCOPE_LABELS[task.clientScope]}
          </Badge>
        )}

        {task.images.length > 0 && (
          <ImageIcon className="h-3 w-3 text-muted-foreground" />
        )}
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className="whitespace-nowrap">
              {new Date(task.dueDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          {task.assignee ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(task.assignee.fullName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{task.assignee.fullName}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function KanbanBoard({
  tasks,
  currentUserId,
  isAdmin = false,
  subordinatesMap = {},
}: {
  tasks: TaskViewRow[];
  currentUserId?: string;
  isAdmin?: boolean;
  subordinatesMap?: Record<string, { id: string; fullName: string }[]>;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<Status, boolean>>(DEFAULT_COLLAPSED);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Optimistically hide a deleted card until the server refresh completes.
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  // Optimistic status overrides so the card jumps to the new column immediately.
  const [overrides, setOverrides] = useState<Record<string, Status>>({});

  const effectiveTasks = tasks
    .filter((t) => !deletedIds.includes(t.id))
    .map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id] } : t));
  const groups = groupByStatus(effectiveTasks);

  function canDeleteTask(task: TaskViewRow) {
    return (
      isAdmin ||
      task.createdBy === currentUserId ||
      (!!task.departmentId && subordinatesMap[task.departmentId] != null)
    );
  }

  async function deleteTaskById(taskId: string) {
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      return;
    }
    setDeletingId(taskId);
    setDeletedIds((prev) => [...prev, taskId]);
    try {
      await deleteTask(taskId);
      router.refresh();
    } catch (err) {
      setDeletedIds((prev) => prev.filter((id) => id !== taskId));
      alert(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  }

  function toggle(status: Status) {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  }

  async function moveTask(taskId: string, target: Status) {
    const task = effectiveTasks.find((t) => t.id === taskId);
    if (!task || task.status === target) return;

    setOverrides((prev) => ({ ...prev, [taskId]: target }));
    setMovingId(taskId);
    try {
      await updateTaskStatus(taskId, target);
      router.refresh();
    } catch (err) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      alert(err instanceof Error ? err.message : "Failed to move task");
    } finally {
      setMovingId(null);
    }
  }

  function handleDrop(status: Status) {
    const id = draggingId;
    setDraggingId(null);
    setDragOver(null);
    if (id) moveTask(id, status);
  }

  return (
    <div className="flex h-[calc(100vh-15rem)] items-stretch gap-4 overflow-x-auto pb-2">
      {STATUS_ORDER.map((status) => {
        const groupTasks = groups[status];
        const isCollapsed = collapsed[status];
        const isDropTarget = dragOver === status;

        if (isCollapsed) {
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggle(status)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((prev) => (prev === status ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              title={`Expand ${STATUS_LABELS[status]}`}
              className={`flex w-11 shrink-0 flex-col items-center gap-3 rounded-lg border border-t-4 bg-muted/30 py-3 hover:bg-muted/60 ${STATUS_COLUMN_ACCENT[status]} ${
                isDropTarget ? "ring-2 ring-primary ring-offset-1" : ""
              }`}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {groupTasks.length}
              </Badge>
              <span className="mt-1 text-sm font-medium [writing-mode:vertical-rl]">
                {STATUS_LABELS[status]}
              </span>
            </button>
          );
        }

        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(status);
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the column, not when moving over children.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOver((prev) => (prev === status ? null : prev));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/30 sm:w-80 ${STATUS_COLUMN_ACCENT[status]} ${
              isDropTarget ? "ring-2 ring-primary ring-offset-1" : ""
            }`}
          >
            <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-sm font-medium">{STATUS_LABELS[status]}</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {groupTasks.length}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6 text-muted-foreground"
                onClick={() => toggle(status)}
                title={`Collapse ${STATUS_LABELS[status]}`}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
              {groupTasks.length === 0 ? (
                <p
                  className={`rounded-md border border-dashed px-1 py-6 text-center text-xs text-muted-foreground ${
                    isDropTarget ? "border-primary/50 bg-primary/5" : "border-transparent"
                  }`}
                >
                  {isDropTarget ? "Drop here" : "No tasks"}
                </p>
              ) : (
                groupTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onDragStart={setDraggingId}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOver(null);
                    }}
                    isDragging={draggingId === task.id}
                    isMoving={movingId === task.id}
                    canDelete={canDeleteTask(task)}
                    isDeleting={deletingId === task.id}
                    onDelete={deleteTaskById}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TaskViewModeToggle({
  mode,
  onChange,
}: {
  mode: "list" | "grouped" | "kanban";
  onChange: (mode: "list" | "grouped" | "kanban") => void;
}) {
  const options: { value: "list" | "grouped" | "kanban"; label: string }[] = [
    { value: "list", label: "List" },
    { value: "grouped", label: "Grouped" },
    { value: "kanban", label: "Kanban" },
  ];

  return (
    <div className="inline-flex items-center rounded-md border p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={mode === option.value ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-3"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
