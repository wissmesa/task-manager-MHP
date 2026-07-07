"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TaskTable } from "@/components/task-table";
import {
  GroupedTaskTables,
  KanbanBoard,
  TaskViewModeToggle,
} from "@/components/task-views";
import { useDashboardUiState } from "@/components/dashboard-ui-state-provider";
import {
  ActiveFilterBadges,
  TaskFiltersPanel,
} from "@/components/task-filters-panel";
import {
  applyTaskFilters,
  countActiveRules,
  createDefaultFilterState,
  parseFilters,
  serializeFilters,
} from "@/lib/task-filters";
import type { TaskPriority } from "@/lib/task-priority";
import { Check, Link2, Search, SlidersHorizontal, X } from "lucide-react";

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
  waitingForBundle: boolean;
  devTarget: "task_manager" | "web_app" | "mobile_app" | "both" | null;
  effort: "low" | "mid_low" | "mid_high" | "high" | null;
  value: "anyone" | "specialist" | "senior" | "highest" | null;
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
  canEditDevFields?: boolean;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
}

function TasksViewContent({
  tasks,
  currentUserId,
  currentUserDepartmentId,
  currentUserDepartmentName,
  isAdmin = false,
  canEditDevFields = false,
  subordinatesMap,
}: TasksViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [search, setSearch] = useState("");
  const {
    tasksTab: tab,
    setTasksTab,
    tasksPage: page,
    setTasksPage,
    taskFilters: filterState,
    setTaskFilters,
    tasksViewMode: viewMode,
    setTasksViewMode: setViewMode,
  } = useDashboardUiState();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didInitFromUrl = useRef(false);

  // On first mount, hydrate filters from the URL so shared/bookmarked links work.
  useEffect(() => {
    if (didInitFromUrl.current) return;
    didInitFromUrl.current = true;

    const encoded = searchParams.get("filters");
    if (!encoded) return;

    const parsed = parseFilters(encoded);
    if (parsed.groups.length > 0) {
      setTaskFilters(parsed);
      setTasksPage(1);
    }
    // Only runs once on mount; provider setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterContext = useMemo(
    () => ({ currentUserDepartmentId }),
    [currentUserDepartmentId]
  );

  const searchedTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => task.title.toLowerCase().includes(query));
  }, [tasks, search]);

  const regularTasks = useMemo(
    () => searchedTasks.filter((task) => !task.planningStage),
    [searchedTasks]
  );
  const planningTasks = useMemo(
    () => searchedTasks.filter((task) => task.planningStage),
    [searchedTasks]
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

    const params = new URLSearchParams(searchParams.toString());
    if (params.has("filters")) {
      params.delete("filters");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }

  async function saveFiltersToUrl() {
    const serialized = serializeFilters(filterState);
    const params = new URLSearchParams(searchParams.toString());

    if (serialized) params.set("filters", serialized);
    else params.delete("filters");

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl, { scroll: false });

    try {
      if (typeof window !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${window.location.origin}${nextUrl}`);
      }
    } catch {
      // Clipboard access can fail silently (e.g. no permission); the URL is still updated.
    }

    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2500);
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
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setTasksPage(1);
            }}
            placeholder="Search tasks..."
            className="h-9 pl-8"
          />
        </div>

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
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={saveFiltersToUrl}
            title="Guarda los filtros en la URL y copia el enlace"
          >
            {urlSaved ? (
              <Check className="mr-1 h-4 w-4 text-green-600" />
            ) : (
              <Link2 className="mr-1 h-4 w-4" />
            )}
            {urlSaved ? "Link copied!" : "Save to URL"}
          </Button>
        )}

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}

        <div className="ml-auto">
          <TaskViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
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
        canEditDevFields={canEditDevFields}
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
          {viewMode === "kanban" ? (
            <KanbanBoard tasks={filteredRegularTasks} />
          ) : viewMode === "grouped" ? (
            <GroupedTaskTables
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canEditDevFields={canEditDevFields}
              subordinatesMap={subordinatesMap}
              tasks={filteredRegularTasks}
            />
          ) : (
            <TaskTable
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canEditDevFields={canEditDevFields}
              subordinatesMap={subordinatesMap}
              tasks={filteredRegularTasks}
              totalTasks={regularTasks.length}
              page={page}
              onPageChange={setTasksPage}
            />
          )}
        </TabsContent>

        <TabsContent value="planning">
          {viewMode === "kanban" ? (
            <KanbanBoard tasks={filteredPlanningTasks} />
          ) : viewMode === "grouped" ? (
            <GroupedTaskTables
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canEditDevFields={canEditDevFields}
              subordinatesMap={subordinatesMap}
              tasks={filteredPlanningTasks}
              showStageColumn
            />
          ) : (
            <TaskTable
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canEditDevFields={canEditDevFields}
              subordinatesMap={subordinatesMap}
              tasks={filteredPlanningTasks}
              totalTasks={planningTasks.length}
              page={page}
              onPageChange={setTasksPage}
              showStageColumn
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TasksView(props: TasksViewProps) {
  return (
    <Suspense fallback={null}>
      <TasksViewContent {...props} />
    </Suspense>
  );
}
