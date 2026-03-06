import { TaskForm } from "@/components/task-form";
import { getPublicDepartments, getSubordinatesForBossDepts } from "@/lib/actions";
import { auth } from "@/lib/auth";

export default async function NewTaskPage() {
  const [deptList, subordinatesMap, session] = await Promise.all([
    getPublicDepartments(),
    getSubordinatesForBossDepts(),
    auth(),
  ]);

  const currentUserId = session?.user?.id ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      <TaskForm
        departments={deptList}
        currentUserId={currentUserId}
        subordinatesMap={subordinatesMap}
      />
    </div>
  );
}
