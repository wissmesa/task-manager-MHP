"use client";

import { useRef, useState, useTransition } from "react";
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
  CircleDot,
  ImagePlus,
  Loader2,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  TaskDiscussion,
  type CommentItem,
  type ActivityItem,
} from "@/components/task-discussion";
import {
  updateOngoingResponsibility,
  deleteOngoingResponsibility,
  toggleOngoingActive,
  addOngoingResponsibilityComment,
  deleteOngoingResponsibilityComment,
  type OngoingResponsibilityDTO,
} from "@/lib/ongoing-actions";
import { uploadImages } from "@/lib/upload-images";
import { cn } from "@/lib/utils";

interface Department {
  id: string;
  name: string;
  bossId: string | null;
}

interface OngoingResponsibilityDetailProps {
  responsibility: OngoingResponsibilityDTO;
  departments: Department[];
  membersMap: Record<string, { id: string; fullName: string }[]>;
  currentUserId: string;
  isAdmin: boolean;
  comments: CommentItem[];
  activity: ActivityItem[];
}

export function OngoingResponsibilityDetail({
  responsibility,
  departments,
  membersMap,
  currentUserId,
  isAdmin,
  comments,
  activity,
}: OngoingResponsibilityDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(responsibility.title);
  const [description, setDescription] = useState(responsibility.description ?? "");
  const [instructions, setInstructions] = useState(responsibility.instructions ?? "");
  const [departmentId, setDepartmentId] = useState(responsibility.departmentId);
  const [assignedTo, setAssignedTo] = useState(responsibility.assignedTo ?? "none");
  const [saving, setSaving] = useState(false);

  const [isActive, setIsActive] = useState(responsibility.isActive);
  const [togglingActive, startToggleActive] = useTransition();

  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<
    { file: File; preview: string }[]
  >([]);
  const instructionsFileRef = useRef<HTMLInputElement>(null);

  const members = membersMap[departmentId] ?? [];
  const visibleImages = responsibility.images.filter(
    (img) => !removedImageIds.includes(img.id)
  );

  function resetForm() {
    setTitle(responsibility.title);
    setDescription(responsibility.description ?? "");
    setInstructions(responsibility.instructions ?? "");
    setDepartmentId(responsibility.departmentId);
    setAssignedTo(responsibility.assignedTo ?? "none");
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
    setSaving(true);
    try {
      const imageKeys =
        pendingImages.length > 0
          ? await uploadImages(pendingImages.map((i) => i.file))
          : undefined;
      await updateOngoingResponsibility(responsibility.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        departmentId,
        assignedTo: assignedTo === "none" ? null : assignedTo,
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

  function handleToggleActive() {
    const next = !isActive;
    setIsActive(next);
    startToggleActive(async () => {
      try {
        await toggleOngoingActive(responsibility.id, next);
        router.refresh();
      } catch (err) {
        setIsActive(!next);
        alert(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete responsibility "${responsibility.title}"? This removes its history.`
      )
    ) {
      return;
    }
    try {
      await deleteOngoingResponsibility(responsibility.id);
      router.push("/responsibilities?tab=ongoing");
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
          <Link href={`/responsibilities?tab=ongoing&dept=${responsibility.departmentId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        {responsibility.canManage && !editing && (
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
            <CardTitle>Edit responsibility</CardTitle>
          ) : (
            <>
              <CardTitle>{responsibility.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {responsibility.departmentName && (
                  <Badge variant="secondary">{responsibility.departmentName}</Badge>
                )}
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
                {responsibility.assigneeName && (
                  <Badge variant="outline" className="gap-1">
                    <User className="h-3 w-3" />
                    {responsibility.assigneeName}
                  </Badge>
                )}
                {responsibility.canToggle && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={handleToggleActive}
                    disabled={togglingActive}
                  >
                    {togglingActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isActive ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {isActive ? "Mark inactive" : "Mark active"}
                  </Button>
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
                  placeholder="Guidelines or standards for this responsibility..."
                  rows={5}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Steps or guidelines for this responsibility.
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
                  <Label>Owner</Label>
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
              </div>

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
              {responsibility.description ? (
                <p className="whitespace-pre-wrap text-sm">
                  {responsibility.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 text-sm font-semibold">Instructions</p>
                {responsibility.instructions ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {responsibility.instructions}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No instructions provided.
                  </p>
                )}
                {responsibility.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {responsibility.images.map((img) => (
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
                Created by {responsibility.creatorName ?? "Unknown"} ·{" "}
                {new Date(responsibility.createdAt).toLocaleDateString("en-US", {
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
        <TaskDiscussion
          taskId={responsibility.id}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          comments={comments}
          activity={activity}
          onAddComment={addOngoingResponsibilityComment}
          onDeleteComment={deleteOngoingResponsibilityComment}
          onUploadImages={uploadImages}
        />
      )}
    </div>
  );
}
