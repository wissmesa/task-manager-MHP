"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, Repeat } from "lucide-react";
import { RecurringTasksView } from "@/components/recurring-tasks-view";
import { OngoingResponsibilitiesView } from "@/components/ongoing-responsibilities-view";
import type { RecurringTaskDTO } from "@/lib/recurring-actions";
import type { OngoingResponsibilityDTO } from "@/lib/ongoing-actions";

interface ResponsibilitiesViewProps {
  recurringTasks: RecurringTaskDTO[];
  ongoingItems: OngoingResponsibilityDTO[];
  currentUserName: string;
}

type TabValue = "recurring" | "ongoing";

export function ResponsibilitiesView({
  recurringTasks,
  ongoingItems,
  currentUserName,
}: ResponsibilitiesViewProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const initialTab: TabValue =
    searchParams.get("tab") === "ongoing" ? "ongoing" : "recurring";
  const [tab, setTab] = useState<TabValue>(initialTab);

  const handleTabChange = useCallback(
    (value: string) => {
      const next = (value === "ongoing" ? "ongoing" : "recurring") as TabValue;
      setTab(next);
      // Switching tabs resets any department drill-down so we never land on a
      // stale department selection from the other tab.
      const params = new URLSearchParams();
      params.set("tab", next);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname]
  );

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Responsibilities</h1>
        <p className="text-sm text-muted-foreground">
          Assign a clear owner to every standing duty, recurring or not.
        </p>
      </div>

      <TabsList>
        <TabsTrigger value="recurring" className="gap-2">
          <Repeat className="h-4 w-4" />
          Recurring
        </TabsTrigger>
        <TabsTrigger value="ongoing" className="gap-2">
          <ClipboardList className="h-4 w-4" />
          Ongoing
        </TabsTrigger>
      </TabsList>

      <TabsContent value="recurring" className="mt-0">
        <RecurringTasksView
          tasks={recurringTasks}
          currentUserName={currentUserName}
        />
      </TabsContent>

      <TabsContent value="ongoing" className="mt-0">
        <OngoingResponsibilitiesView
          items={ongoingItems}
          currentUserName={currentUserName}
        />
      </TabsContent>
    </Tabs>
  );
}
