"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TaskTable } from "@/components/task-table";
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
import { ChevronDown, ChevronRight, ChevronsRight, ImageIcon, Loader2 } from "lucide-react";

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

function KanbanCard({ task }: { task: TaskViewRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    startTransition(() => router.push(`/tasks/${task.id}`));
  }

  return (
    <button
      type="button"
      onClick={open}
      className="w-full rounded-lg border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
          <span className="line-clamp-2">{task.title}</span>
        </span>
        {isPending && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
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

        {task.images.length > 0 && (
          <ImageIcon className="h-3 w-3 text-muted-foreground" />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{task.department?.name ?? "—"}</span>
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

export function KanbanBoard({ tasks }: { tasks: TaskViewRow[] }) {
  const groups = groupByStatus(tasks);
  const [collapsed, setCollapsed] = useState<Record<Status, boolean>>(DEFAULT_COLLAPSED);

  function toggle(status: Status) {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  }

  return (
    <div className="flex items-stretch gap-4 overflow-x-auto pb-2">
      {STATUS_ORDER.map((status) => {
        const groupTasks = groups[status];
        const isCollapsed = collapsed[status];

        if (isCollapsed) {
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggle(status)}
              title={`Expand ${STATUS_LABELS[status]}`}
              className={`flex w-11 shrink-0 flex-col items-center gap-3 rounded-lg border border-t-4 bg-muted/30 py-3 hover:bg-muted/60 ${STATUS_COLUMN_ACCENT[status]}`}
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
            className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/30 sm:w-80 ${STATUS_COLUMN_ACCENT[status]}`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
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
            <div className="flex-1 space-y-2 px-2 pb-3">
              {groupTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  No tasks
                </p>
              ) : (
                groupTasks.map((task) => <KanbanCard key={task.id} task={task} />)
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
