"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  ImagePlus,
  Loader2,
  Pencil,
  Repeat,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import { RecurringOccurrences } from "@/components/recurring-tasks-view";
import {
  TaskDiscussion,
  type CommentItem,
  type ActivityItem,
} from "@/components/task-discussion";
import {
  updateRecurringTask,
  deleteRecurringTask,
  addRecurringTaskComment,
  deleteRecurringTaskComment,
  type RecurringTaskDTO,
} from "@/lib/recurring-actions";
import { uploadImages } from "@/lib/upload-images";
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
  membersMap: Record<string, { id: string; fullName: string }[]>;
  currentUserName: string;
  currentUserId: string;
  isAdmin: boolean;
  comments: CommentItem[];
  activity: ActivityItem[];
}

export function RecurringTaskDetail({
  task,
  departments,
  membersMap,
  currentUserName,
  currentUserId,
  isAdmin,
  comments,
  activity,
}: RecurringTaskDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [departmentId, setDepartmentId] = useState(task.departmentId);
  const [assignedTo, setAssignedTo] = useState(task.assignedTo ?? "none");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(task.frequency);
  const [dueWeekday, setDueWeekday] = useState(String(task.dueWeekday ?? 1));
  const [dueDayOfMonth, setDueDayOfMonth] = useState(String(task.dueDayOfMonth ?? 30));
  const [saving, setSaving] = useState(false);

  // Instruction images: existing (removable) + newly picked (uploaded on save).
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<
    { file: File; preview: string }[]
  >([]);
  const instructionsFileRef = useRef<HTMLInputElement>(null);

  const members = membersMap[departmentId] ?? [];
  const visibleImages = task.images.filter(
    (img) => !removedImageIds.includes(img.id)
  );

  function resetForm() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setInstructions(task.instructions ?? "");
    setDepartmentId(task.departmentId);
    setAssignedTo(task.assignedTo ?? "none");
    setFrequency(task.frequency);
    setDueWeekday(String(task.dueWeekday ?? 1));
    setDueDayOfMonth(String(task.dueDayOfMonth ?? 30));
    setRemovedImageIds([]);
    pendingImages.forEach((i) => URL.revokeObjectURL(i.preview));
    setPendingImages([]);
  }

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
      const imageKeys =
        pendingImages.length > 0
          ? await uploadImages(pendingImages.map((i) => i.file))
          : undefined;
      await updateRecurringTask(task.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        departmentId,
        assignedTo: assignedTo === "none" ? null : assignedTo,
        frequency,
        dueWeekday: frequency === "weekly" ? Number(dueWeekday) : null,
        dueDayOfMonth: frequency === "monthly" ? Number(dueDayOfMonth) : null,
        imageKeys,
        removedImageIds: removedImageIds.length > 0 ? removedImageIds : undefined,
      });
      pendingImages.forEach((i) => URL.revokeObjectURL(i.preview));
      setPendingImages([]);
      setRemovedImageIds([]);
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
      router.push("/responsibilities?tab=recurring");
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
          <Link href={`/responsibilities?tab=recurring&dept=${task.departmentId}`}>
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
              <CardTitle className="break-words">{task.title}</CardTitle>
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
                {task.assigneeName && (
                  <Badge variant="outline" className="gap-1">
                    <User className="h-3 w-3" />
                    {task.assigneeName}
                  </Badge>
                )}
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

                {(visibleImages.length > 0 || pendingImages.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {visibleImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.imageUrl}
                          alt={img.originalName}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRemovedImageIds((prev) => [...prev, img.id])
                          }
                          className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          title="Remove image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
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
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Responsible</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a person..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.fullName}
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
                <p className="whitespace-pre-wrap break-words text-sm">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 text-sm font-semibold">Instructions</p>
                {task.instructions ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {task.instructions}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No instructions provided.
                  </p>
                )}
                {task.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.images.map((img) => (
                      <Dialog key={img.id}>
                        <DialogTrigger asChild>
                          <button
                            type="button"
                            className="h-24 w-24 overflow-hidden rounded-md border bg-background transition-shadow hover:shadow-md"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.imageUrl}
                              alt={img.originalName}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] max-w-6xl p-2 sm:max-w-6xl sm:p-3">
                          <DialogTitle className="sr-only">
                            {img.originalName}
                          </DialogTitle>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt={img.originalName}
                            className="mx-auto h-auto max-h-[85vh] w-full rounded-lg object-contain"
                          />
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                )}
              </div>
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <RecurringOccurrences task={task} currentUserName={currentUserName} />
          </CardContent>
        </Card>
      )}

      {!editing && (
        <TaskDiscussion
          taskId={task.id}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          comments={comments}
          activity={activity}
          onAddComment={addRecurringTaskComment}
          onDeleteComment={deleteRecurringTaskComment}
          onUploadImages={uploadImages}
        />
      )}
    </div>
  );
}
