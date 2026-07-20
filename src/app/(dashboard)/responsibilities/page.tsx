import { Suspense } from "react";
import { ResponsibilitiesView } from "@/components/responsibilities-view";
import { getRecurringTasksForUser } from "@/lib/recurring-actions";
import { getOngoingResponsibilitiesForUser } from "@/lib/ongoing-actions";
import { auth } from "@/lib/auth";

export default async function ResponsibilitiesPage() {
  const [recurringTasks, ongoingItems, session] = await Promise.all([
    getRecurringTasksForUser(),
    getOngoingResponsibilitiesForUser(),
    auth(),
  ]);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ResponsibilitiesView
          recurringTasks={recurringTasks}
          ongoingItems={ongoingItems}
          currentUserName={session?.user?.name ?? "You"}
        />
      </Suspense>
    </div>
  );
}
