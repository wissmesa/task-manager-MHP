import { Suspense } from "react";
import { RecurringTasksView } from "@/components/recurring-tasks-view";
import { getRecurringTasksForUser } from "@/lib/recurring-actions";
import { auth } from "@/lib/auth";

export default async function RecurringTasksPage() {
  const [tasks, session] = await Promise.all([
    getRecurringTasksForUser(),
    auth(),
  ]);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <RecurringTasksView tasks={tasks} currentUserName={session?.user?.name ?? "You"} />
      </Suspense>
    </div>
  );
}
