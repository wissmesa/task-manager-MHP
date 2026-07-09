import { notFound } from "next/navigation";
import { RecurringTaskDetail } from "@/components/recurring-task-detail";
import {
  getRecurringTaskById,
  getDepartmentMembersMap,
  getRecurringTaskComments,
  getRecurringTaskActivity,
} from "@/lib/recurring-actions";
import { getPublicDepartments } from "@/lib/actions";
import { auth } from "@/lib/auth";

const ADMIN_EMAIL = "luis@bluepaperclip.com";

export default async function RecurringTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [task, departments, membersMap, comments, activity, session] =
    await Promise.all([
      getRecurringTaskById(id),
      getPublicDepartments(),
      getDepartmentMembersMap(),
      getRecurringTaskComments(id),
      getRecurringTaskActivity(id),
      auth(),
    ]);

  if (!task) notFound();

  return (
    <RecurringTaskDetail
      task={task}
      departments={departments}
      membersMap={membersMap}
      currentUserName={session?.user?.name ?? "You"}
      currentUserId={session?.user?.id ?? ""}
      isAdmin={session?.user?.email === ADMIN_EMAIL}
      comments={comments}
      activity={activity}
    />
  );
}
