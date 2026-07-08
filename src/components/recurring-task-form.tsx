"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  CardDescription,
} from "@/components/ui/card";
import { Loader2, Repeat } from "lucide-react";
import { createRecurringTask } from "@/lib/recurring-actions";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  WEEKDAY_LABELS,
  type RecurrenceFrequency,
} from "@/lib/recurrence";

interface Department {
  id: string;
  name: string;
  bossId: string | null;
}

interface RecurringTaskFormProps {
  departments: Department[];
}

export function RecurringTaskForm({ departments }: RecurringTaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("none");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("weekly");
  const [dueWeekday, setDueWeekday] = useState("1"); // Monday
  const [dueDayOfMonth, setDueDayOfMonth] = useState("30");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!title.trim()) {
      alert("El título es obligatorio");
      return;
    }
    if (departmentId === "none") {
      alert("Debes seleccionar un departamento");
      return;
    }

    setLoading(true);
    try {
      await createRecurringTask({
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId,
        frequency,
        dueWeekday: frequency === "weekly" ? Number(dueWeekday) : null,
        dueDayOfMonth: frequency === "monthly" ? Number(dueDayOfMonth) : null,
      });
      router.push("/recurring");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create recurring task");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Recurring Task</CardTitle>
        <CardDescription>
          Ongoing task tracked per department with a completion check for each period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Send weekly report"
              required
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done each period..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => setDepartmentId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
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
              <p className="text-xs text-muted-foreground">
                Must be done by this day each week.
              </p>
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
              <p className="text-xs text-muted-foreground">
                Must be done before this day each month (clamped to the last day for short months).
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Repeat className="mr-2 h-4 w-4" />
                  Create Recurring Task
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
