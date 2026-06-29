"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskTable } from "@/components/task-table";
import { useDashboardUiState } from "@/components/dashboard-ui-state-provider";
import {
  ActiveFilterBadges,
  TaskFiltersPanel,
} from "@/components/task-filters-panel";
import {
  applyTaskFilters,
  countActiveRules,
  createDefaultFilterState,
} from "@/lib/task-filters";
import type { TaskPriority } from "@/lib/task-priority";
import { SlidersHorizontal, X } from "lucide-react";

type TaskRow = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: TaskPriority;
  approval: "pending_approval" | "pending_dept_approval" | "approved" | "rejected";
  ownBossApproved: boolean;
  createdBy: string;
  assignedTo: string | null;
  departmentId: string | null;
  creatorDeptId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  planningStage: "draft" | "brainstorming" | "discussed" | null;
  creator: { fullName: string } | null;
  assignee: { id: string; fullName: string } | null;
  department: { name: string } | null;
  images: { id: string }[];
};

interface TasksViewProps {
  tasks: TaskRow[];
  currentUserId: string;
  currentUserDepartmentId: string | null;
  currentUserDepartmentName: string | null;
  isAdmin?: boolean;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
}

function TasksViewContent({
  tasks,
  currentUserId,
  currentUserDepartmentId,
  currentUserDepartmentName,
  isAdmin = false,
  subordinatesMap,
}: TasksViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    tasksTab: tab,
    setTasksTab,
    tasksPage: page,
    setTasksPage,
    taskFilters: filterState,
    setTaskFilters,
  } = useDashboardUiState();

  const filterContext = useMemo(
    () => ({ currentUserDepartmentId }),
    [currentUserDepartmentId]
  );

  const regularTasks = useMemo(
    () => tasks.filter((task) => !task.planningStage),
    [tasks]
  );
  const planningTasks = useMemo(
    () => tasks.filter((task) => task.planningStage),
    [tasks]
  );

  const filteredRegularTasks = useMemo(
    () => applyTaskFilters(regularTasks, filterState, filterContext),
    [regularTasks, filterState, filterContext]
  );
  const filteredPlanningTasks = useMemo(
    () => applyTaskFilters(planningTasks, filterState, filterContext),
    [planningTasks, filterState, filterContext]
  );

  const optionTasks = tab === "planning" ? planningTasks : regularTasks;

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of optionTasks) {
      if (task.departmentId && task.department?.name) {
        map.set(task.departmentId, task.department.name);
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [optionTasks]);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of optionTasks) {
      if (task.creator) map.set(task.createdBy, task.creator.fullName);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [optionTasks]);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of optionTasks) {
      if (task.assignee) map.set(task.assignee.id, task.assignee.fullName);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [optionTasks]);

  const activeFilterCount = countActiveRules(filterState);

  function handleTabChange(nextTab: string) {
    setTasksTab(nextTab === "planning" ? "planning" : "active");
    setTasksPage(1);
  }

  function handleFilterStateChange(nextState: typeof filterState) {
    setTaskFilters(nextState);
    setTasksPage(1);
  }

  function clearFilters() {
    setTaskFilters({ groups: [] });
    setTasksPage(1);
  }

  function openFilters() {
    if (filterState.groups.length === 0) {
      handleFilterStateChange(createDefaultFilterState());
    }
    setFiltersOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="h-9" onClick={openFilters}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          All Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <ActiveFilterBadges
        filterState={filterState}
        departments={departments}
        assignees={assignees}
        creators={creators}
        currentUserDepartmentName={currentUserDepartmentName}
      />

      <TaskFiltersPanel
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filterState={filterState.groups.length > 0 ? filterState : createDefaultFilterState()}
        onFilterStateChange={handleFilterStateChange}
        showStageColumn={tab === "planning"}
        departments={departments}
        assignees={assignees}
        creators={creators}
        currentUserDepartmentName={currentUserDepartmentName}
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="active">
            Tasks ({filteredRegularTasks.length})
          </TabsTrigger>
          <TabsTrigger value="planning">
            Planning ({filteredPlanningTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <TaskTable
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            subordinatesMap={subordinatesMap}
            tasks={filteredRegularTasks}
            totalTasks={regularTasks.length}
            page={page}
            onPageChange={setTasksPage}
          />
        </TabsContent>

        <TabsContent value="planning">
          <TaskTable
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            subordinatesMap={subordinatesMap}
            tasks={filteredPlanningTasks}
            totalTasks={planningTasks.length}
            page={page}
            onPageChange={setTasksPage}
            showStageColumn
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TasksView(props: TasksViewProps) {
  return <TasksViewContent {...props} />;
}
