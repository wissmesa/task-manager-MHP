"use client";

import { useRef, useState } from "react";
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
import { ImagePlus, Loader2, Repeat, X } from "lucide-react";
import { createRecurringTask } from "@/lib/recurring-actions";
import { uploadRecurringImages } from "@/lib/upload-images";
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
  membersMap: Record<string, { id: string; fullName: string }[]>;
}

export function RecurringTaskForm({ departments, membersMap }: RecurringTaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [departmentId, setDepartmentId] = useState("none");
  const [assignedTo, setAssignedTo] = useState("none");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("weekly");
  const [dueWeekday, setDueWeekday] = useState("1"); // Monday
  const [dueDayOfMonth, setDueDayOfMonth] = useState("30");
  const [pendingImages, setPendingImages] = useState<
    { file: File; preview: string }[]
  >([]);
  const instructionsFileRef = useRef<HTMLInputElement>(null);

  const members = departmentId !== "none" ? (membersMap[departmentId] ?? []) : [];

  function handleInstructionFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPendingImages((prev) => [...prev, ...picked]);
    if (instructionsFileRef.current) instructionsFileRef.current.value = "";
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

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
    if (assignedTo === "none") {
      alert("Debes asignar un responsable");
      return;
    }

    setLoading(true);
    try {
      const imageKeys =
        pendingImages.length > 0
          ? await uploadRecurringImages(pendingImages.map((i) => i.file))
          : undefined;
      await createRecurringTask({
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        departmentId,
        assignedTo,
        frequency,
        dueWeekday: frequency === "weekly" ? Number(dueWeekday) : null,
        dueDayOfMonth: frequency === "monthly" ? Number(dueDayOfMonth) : null,
        imageKeys,
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

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions on how to complete this task..."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Steps or guidelines to complete this task.
            </p>

            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((img, i) => (
                  <div
                    key={img.preview}
                    className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.preview}
                      alt={img.file.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(i)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      title="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={instructionsFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleInstructionFiles}
            />
            <button
              type="button"
              onClick={() => instructionsFileRef.current?.click()}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ImagePlus className="h-4 w-4" />
              Add photos
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v);
                  setAssignedTo("none");
                }}
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

          <div className="space-y-2">
            <Label>Responsible *</Label>
            <Select
              value={assignedTo}
              onValueChange={setAssignedTo}
              disabled={departmentId === "none"}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select a person..." />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {departmentId === "none"
                ? "Select a department first."
                : members.length === 0
                  ? "This department has no members yet."
                  : "Person responsible for keeping this task on track."}
            </p>
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
