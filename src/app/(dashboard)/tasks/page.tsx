import { getTasksForUser, getSubordinatesForBossDepts } from "@/lib/actions";
import { TaskTable } from "@/components/task-table";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function TasksPage() {
  const [tasks, subordinatesMap, session] = await Promise.all([
    getTasksForUser(),
    getSubordinatesForBossDepts(),
    auth(),
  ]);

  const currentUserId = session?.user?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Manage and view all team tasks
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Link>
        </Button>
      </div>

      <TaskTable
        currentUserId={currentUserId}
        subordinatesMap={subordinatesMap}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          approval: t.approval,
          ownBossApproved: t.ownBossApproved,
          createdBy: t.createdBy,
          assignedTo: t.assignedTo,
          departmentId: t.departmentId,
          creatorDeptId: t.creatorDeptId,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          creator: t.creator ? { fullName: t.creator.fullName } : null,
          assignee: t.assignee ? { id: t.assignee.id, fullName: t.assignee.fullName } : null,
          department: t.department ? { name: t.department.name } : null,
          images: t.images.map((img) => ({ id: img.id })),
        }))}
      />
    </div>
  );
}
