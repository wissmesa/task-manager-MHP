import { RecurringTaskForm } from "@/components/recurring-task-form";
import { getPublicDepartments } from "@/lib/actions";
import { getDepartmentMembersMap } from "@/lib/recurring-actions";

export default async function NewRecurringTaskPage() {
  const [deptList, membersMap] = await Promise.all([
    getPublicDepartments(),
    getDepartmentMembersMap(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <RecurringTaskForm departments={deptList} membersMap={membersMap} />
    </div>
  );
}
