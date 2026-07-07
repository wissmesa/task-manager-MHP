"use client";

import { useState, useRef } from "react";
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
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_DESCRIPTIONS,
  type TaskPriority,
} from "@/lib/task-priority";

interface Department {
  id: string;
  name: string;
  bossId: string | null;
}

interface LocalImage {
  file: File;
  preview: string;
}

interface TaskFormProps {
  departments: Department[];
  currentUserId: string;
  subordinatesMap: Record<string, { id: string; fullName: string }[]>;
}

const DEV_TARGET_OPTIONS = [
  { value: "task_manager", label: "Task Manager" },
  { value: "web_app", label: "Web App" },
  { value: "mobile_app", label: "Mobile App" },
  { value: "both", label: "Both (Web App, Mobile App)" },
];

export function TaskForm({ departments, currentUserId, subordinatesMap }: TaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [departmentId, setDepartmentId] = useState("none");
  const [assignedTo, setAssignedTo] = useState("unassigned");
  const [planningStage, setPlanningStage] = useState("none");
  const [devTarget, setDevTarget] = useState("none");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDept = departments.find((d) => d.id === departmentId);
  const isBossOfSelected = selectedDept?.bossId === currentUserId;
  const subordinates = isBossOfSelected ? (subordinatesMap[departmentId] ?? []) : [];
  const isDevelopmentDept = selectedDept?.name === "Development";

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    const newImages: LocalImage[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!departmentId || departmentId === "none") {
      alert("Debes seleccionar un departamento para crear la tarea");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("title", (e.currentTarget.elements.namedItem("title") as HTMLInputElement).value);
      formData.set("description", (e.currentTarget.elements.namedItem("description") as HTMLTextAreaElement).value);
      formData.set("priority", priority);

      formData.set("departmentId", departmentId);
      if (assignedTo && assignedTo !== "unassigned") {
        formData.set("assignedTo", assignedTo);
      }
      if (planningStage !== "none") {
        formData.set("planningStage", planningStage);
      }
      if (isDevelopmentDept && devTarget !== "none") {
        formData.set("devTarget", devTarget);
      }

      images.forEach((img) => formData.append("files", img.file));

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create task");
      }

      router.push("/tasks");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create task");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Task</CardTitle>
        <CardDescription>
          Fill out the form to create a new task request
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Fix bug in payments module"
              required
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe in detail what needs to be done..."
              rows={5}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PRIORITY_DESCRIPTIONS[priority]}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Department *</Label>
              <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setAssignedTo("unassigned"); setDevTarget("none"); }}>
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
          </div>

          {isDevelopmentDept && (
            <div className="space-y-2">
              <Label>Target</Label>
              <Select value={devTarget} onValueChange={setDevTarget}>
                <SelectTrigger className="w-full sm:w-[320px]">
                  <SelectValue placeholder="Select target..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {DEV_TARGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where this task applies: Task Manager, Web App, Mobile App, or both.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Planning Stage</Label>
            <Select value={planningStage} onValueChange={setPlanningStage}>
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard task (ready to work)</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="brainstorming">Brainstorming</SelectItem>
                <SelectItem value="discussed">Fully discussed</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Draft, brainstorming, and fully discussed tasks appear in the Planning tab.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select a person..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value={currentUserId}>Myself</SelectItem>
                {subordinates
                  .filter((u) => u.id !== currentUserId)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Attached Images</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to select images or drag them here
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-lg border bg-muted"
                  >
                    <img
                      src={img.preview}
                      alt={img.file.name}
                      className="aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                      <p className="truncate text-xs text-white">
                        {img.file.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Create Task
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
