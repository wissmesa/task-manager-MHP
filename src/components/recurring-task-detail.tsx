"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  CalendarDays,
  List,
  Loader2,
  Pencil,
  Repeat,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RecurringOccurrences } from "@/components/recurring-tasks-view";
import {
  updateRecurringTask,
  deleteRecurringTask,
  type RecurringTaskDTO,
} from "@/lib/recurring-actions";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  WEEKDAY_LABELS,
  describeRecurrence,
  type RecurrenceFrequency,
} from "@/lib/recurrence";

interface Department {
  id: string;
  name: string;
  bossId: string | null;
}

interface RecurringTaskDetailProps {
  task: RecurringTaskDTO;
  departments: Department[];
  currentUserName: string;
}

type OccView = "strip" | "calendar";

export function RecurringTaskDetail({
  task,
  departments,
  currentUserName,
}: RecurringTaskDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [occView, setOccView] = useState<OccView>("strip");

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [departmentId, setDepartmentId] = useState(task.departmentId);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(task.frequency);
  const [dueWeekday, setDueWeekday] = useState(String(task.dueWeekday ?? 1));
  const [dueDayOfMonth, setDueDayOfMonth] = useState(String(task.dueDayOfMonth ?? 30));
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDepartmentId(task.departmentId);
    setFrequency(task.frequency);
    setDueWeekday(String(task.dueWeekday ?? 1));
    setDueDayOfMonth(String(task.dueDayOfMonth ?? 30));
  }

  async function handleSave() {
    if (!title.trim()) {
      alert("El título es obligatorio");
      return;
    }
    if (frequency !== task.frequency) {
      const ok = confirm(
        "Cambiar la frecuencia reiniciará el historial de completado de esta tarea. ¿Continuar?"
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateRecurringTask(task.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId,
        frequency,
        dueWeekday: frequency === "weekly" ? Number(dueWeekday) : null,
        dueDayOfMonth: frequency === "monthly" ? Number(dueDayOfMonth) : null,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete recurring task "${task.title}"? This removes its history.`)) {
      return;
    }
    try {
      await deleteRecurringTask(task.id);
      router.push("/recurring");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button
          asChild
          variant="ghost"
          className="w-fit gap-2 px-2 text-muted-foreground"
        >
          <Link href="/recurring">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        {task.canManage && !editing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          {editing ? (
            <CardTitle>Edit recurring task</CardTitle>
          ) : (
            <>
              <CardTitle>{task.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {task.departmentName && (
                  <Badge variant="secondary">{task.departmentName}</Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Repeat className="h-3 w-3" />
                  {FREQUENCY_LABELS[task.frequency]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {describeRecurrence(task.frequency, task.dueWeekday, task.dueDayOfMonth)}
                </span>
              </div>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Frequency *</Label>
                  <Select
                    value={frequency}
                    onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {frequency === "weekly" && (
                <div className="space-y-2">
                  <Label>Deadline weekday</Label>
                  <Select value={dueWeekday} onValueChange={setDueWeekday}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {frequency === "monthly" && (
                <div className="space-y-2">
                  <Label>Deadline day of month</Label>
                  <Select value={dueDayOfMonth} onValueChange={setDueDayOfMonth}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          Day {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {frequency !== task.frequency && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Changing the frequency will reset this task&apos;s completion history.
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetForm();
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              <div className="text-xs text-muted-foreground">
                Created by {task.creatorName ?? "Unknown"} ·{" "}
                {new Date(task.createdAt).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Tracking</CardTitle>
            <div className="inline-flex shrink-0 rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setOccView("strip")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  occView === "strip"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" />
                Strip
              </button>
              <button
                type="button"
                onClick={() => setOccView("calendar")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  occView === "calendar"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                Calendar
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <RecurringOccurrences
              task={task}
              currentUserName={currentUserName}
              occView={occView}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
