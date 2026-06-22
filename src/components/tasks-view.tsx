"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskTable } from "@/components/task-table";
import type { TaskPriority } from "@/lib/task-priority";

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
  planningStage: "draft" | "brainstorming" | "discussed" | null;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

interface TasksViewProps {
  tasks: TaskRow[];
  currentUserId: string;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
}

export function TasksView({ tasks, currentUserId, subordinatesMap }: TasksViewProps) {
  const regularTasks = tasks.filter((t) => !t.planningStage);
  const planningTasks = tasks.filter((t) => t.planningStage);

  return (
    <Tabs defaultValue="active">
      <TabsList>
        <TabsTrigger value="active">
          Tasks ({regularTasks.length})
        </TabsTrigger>
        <TabsTrigger value="planning">
          Planning ({planningTasks.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="active">
        <TaskTable
          currentUserId={currentUserId}
          subordinatesMap={subordinatesMap}
          tasks={regularTasks}
        />
      </TabsContent>

      <TabsContent value="planning">
        <TaskTable
          currentUserId={currentUserId}
          subordinatesMap={subordinatesMap}
          tasks={planningTasks}
          showStageColumn
        />
      </TabsContent>
    </Tabs>
  );
}
