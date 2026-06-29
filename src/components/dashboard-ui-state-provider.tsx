"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { FilterState } from "@/lib/task-filters";

type TasksTab = "active" | "planning";

type DashboardUiStateContextValue = {
  tasksTab: TasksTab;
  setTasksTab: (tab: TasksTab) => void;
  tasksPage: number;
  setTasksPage: (page: number) => void;
  taskFilters: FilterState;
  setTaskFilters: (filters: FilterState) => void;
};

const DashboardUiStateContext = createContext<DashboardUiStateContextValue | null>(null);

export function DashboardUiStateProvider({ children }: { children: ReactNode }) {
  const [tasksTab, setTasksTab] = useState<TasksTab>("active");
  const [tasksPage, setTasksPage] = useState(1);
  const [taskFilters, setTaskFilters] = useState<FilterState>({ groups: [] });

  const value = useMemo(
    () => ({
      tasksTab,
      setTasksTab,
      tasksPage,
      setTasksPage,
      taskFilters,
      setTaskFilters,
    }),
    [tasksTab, tasksPage, taskFilters]
  );

  return (
    <DashboardUiStateContext.Provider value={value}>
      {children}
    </DashboardUiStateContext.Provider>
  );
}

export function useDashboardUiState() {
  const context = useContext(DashboardUiStateContext);
  if (!context) {
    throw new Error("useDashboardUiState must be used within DashboardUiStateProvider");
  }
  return context;
}
