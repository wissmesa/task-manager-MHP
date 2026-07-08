import { RecurringTaskForm } from "@/components/recurring-task-form";
import { getPublicDepartments } from "@/lib/actions";

export default async function NewRecurringTaskPage() {
  const deptList = await getPublicDepartments();

  return (
    <div className="mx-auto max-w-2xl">
      <RecurringTaskForm departments={deptList} />
    </div>
  );
}
