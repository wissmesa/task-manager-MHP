import { getTaskById, getBossForUser, getDepartmentSubordinates, getUserDepartmentInfo } from "@/lib/actions";
import { TaskDetail } from "@/components/task-detail";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [task, session] = await Promise.all([
    getTaskById(id),
    auth(),
  ]);

  if (!task) notFound();

  const currentUserId = session?.user?.id ?? "";

  const [creatorBossId, creatorDeptInfo] = await Promise.all([
    getBossForUser(task.createdBy),
    getUserDepartmentInfo(task.createdBy),
  ]);
  const isBossOfCreator = creatorBossId === currentUserId;
  const creatorDeptId = creatorDeptInfo?.departmentId ?? null;

  let isBossOfDepartment = false;
  let subordinates: { id: string; fullName: string; email: string }[] = [];

  if (task.departmentId) {
    const dept = task.department;
    const isCreator = task.createdBy === currentUserId;
    if (dept && (dept.bossId === currentUserId || isCreator)) {
      if (dept.bossId === currentUserId) isBossOfDepartment = true;
      subordinates = await getDepartmentSubordinates(task.departmentId);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <TaskDetail
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          approval: task.approval,
          ownBossApproved: task.ownBossApproved,
          approvedBy: task.approvedBy,
          approvedAt: task.approvedAt,
          dueDate: task.dueDate,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          createdBy: task.createdBy,
          creatorDeptId,
          assignedTo: task.assignedTo,
          departmentId: task.departmentId,
          departmentName: task.department?.name ?? null,
          creator: task.creator
            ? { fullName: task.creator.fullName, email: task.creator.email }
            : null,
          assignee: task.assignee
            ? { fullName: task.assignee.fullName, email: task.assignee.email }
            : null,
          images: task.images.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            originalName: img.originalName,
          })),
        }}
        currentUserId={currentUserId}
        isBossOfCreator={isBossOfCreator}
        isBossOfDepartment={isBossOfDepartment}
        subordinates={subordinates}
      />
    </div>
  );
}
