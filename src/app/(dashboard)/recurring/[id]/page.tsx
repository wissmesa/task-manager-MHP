import { notFound } from "next/navigation";
import { RecurringTaskDetail } from "@/components/recurring-task-detail";
import { getRecurringTaskById } from "@/lib/recurring-actions";
import { getPublicDepartments } from "@/lib/actions";
import { auth } from "@/lib/auth";

export default async function RecurringTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [task, departments, session] = await Promise.all([
    getRecurringTaskById(id),
    getPublicDepartments(),
    auth(),
  ]);

  if (!task) notFound();

  return (
    <RecurringTaskDetail
      task={task}
      departments={departments}
      currentUserName={session?.user?.name ?? "You"}
    />
  );
}
