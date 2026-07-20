"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteOngoingResponsibility,
  toggleOngoingActive,
  type OngoingResponsibilityDTO,
} from "@/lib/ongoing-actions";

interface OngoingResponsibilitiesViewProps {
  items: OngoingResponsibilityDTO[];
  currentUserName: string;
}

interface DeptSummary {
  id: string;
  name: string;
  total: number;
  active: number;
  inactive: number;
}

export function OngoingResponsibilitiesView({
  items,
}: OngoingResponsibilitiesViewProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedDeptId, setSelectedDeptIdState] = useState<string | null>(
    () => searchParams.get("dept")
  );
  const [search, setSearch] = useState("");

  // Keep the selected department in the URL (?dept=<id>) without a full
  // navigation, so returning from a detail lands back on this view.
  const setSelectedDeptId = useCallback(
    (id: string | null) => {
      setSelectedDeptIdState(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("dept", id);
      else params.delete("dept");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname]
  );

  const summaries = useMemo<DeptSummary[]>(() => {
    const map = new Map<string, DeptSummary>();
    for (const t of items) {
      const key = t.departmentId;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: t.departmentName ?? "No department",
          total: 0,
          active: 0,
          inactive: 0,
        });
      }
      const s = map.get(key)!;
      s.total++;
      if (t.isActive) s.active++;
      else s.inactive++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const selected = selectedDeptId
    ? summaries.find((s) => s.id === selectedDeptId) ?? null
    : null;

  const deptItems = useMemo(() => {
    if (!selectedDeptId) return [];
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (t) =>
          t.departmentId === selectedDeptId &&
          (!q || t.title.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [items, selectedDeptId, search]);

  const newButton = (
    <Button asChild>
      <Link href="/responsibilities/ongoing/new">
        <Plus className="mr-2 h-4 w-4" />
        New Responsibility
      </Link>
    </Button>
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No ongoing responsibilities yet. Create one to assign a clear owner
            to a standing duty.
          </p>
          <Button asChild variant="outline">
            <Link href="/responsibilities/ongoing/new">
              <Plus className="mr-2 h-4 w-4" />
              New Responsibility
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Department detail view ──────────────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="w-fit gap-2 px-2 text-muted-foreground"
            onClick={() => {
              setSelectedDeptId(null);
              setSearch("");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            All departments
          </Button>
          {newButton}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{selected.name}</h1>
          <Badge variant="secondary">
            {selected.total} {selected.total === 1 ? "duty" : "duties"}
          </Badge>
          <SummaryPills summary={selected} />
        </div>

        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search responsibilities in this department..."
            className="pl-9"
          />
        </div>

        {deptItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No responsibilities match your search.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deptItems.map((item) => (
              <OngoingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Department grid (overview) ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ongoing Responsibilities
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a department to see its standing duties and their owners.
          </p>
        </div>
        {newButton}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSelectedDeptId(s.id);
              setSearch("");
            }}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.total} {s.total === 1 ? "responsibility" : "responsibilities"}
                </p>
              </CardHeader>
              <CardContent>
                <SummaryPills summary={s} />
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryPills({ summary }: { summary: DeptSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CircleDot className="h-3 w-3" />
        {summary.active} active
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {summary.inactive} inactive
      </span>
    </div>
  );
}

function OngoingCard({ item }: { item: OngoingResponsibilityDTO }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(item.isActive);
  const [toggling, startToggle] = useTransition();

  function handleToggleActive(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !isActive;
    setIsActive(next);
    startToggle(async () => {
      try {
        await toggleOngoingActive(item.id, next);
        router.refresh();
      } catch (err) {
        setIsActive(!next);
        alert(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !confirm(
        `Delete responsibility "${item.title}"? This removes its history.`
      )
    ) {
      return;
    }
    try {
      await deleteOngoingResponsibility(item.id);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/responsibilities/ongoing/${item.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/responsibilities/ongoing/${item.id}`);
        }
      }}
      className={cn(
        "flex h-full min-w-0 cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        !isActive && "opacity-70"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex w-full min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <span className="line-clamp-2 text-sm font-semibold">
              {item.title}
            </span>
            {item.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            )}
            <div className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.assigneeName ?? "Unassigned"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                aria-label="Delete responsibility"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="mt-auto flex items-center justify-between gap-2 pt-0 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            isActive
              ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
              : "border-muted-foreground/40 text-muted-foreground"
          )}
        >
          <CircleDot className="h-3 w-3" />
          {isActive ? "Active" : "Inactive"}
        </Badge>
        <div className="flex items-center gap-1">
          {item.canToggle && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {toggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isActive ? "Pause" : "Resume"}
            </Button>
          )}
          {item.canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/responsibilities/ongoing/${item.id}`);
              }}
              aria-label="Edit responsibility"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
