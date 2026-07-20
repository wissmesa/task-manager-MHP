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
import { ImagePlus, Loader2, ClipboardList, X } from "lucide-react";
import { createOngoingResponsibility } from "@/lib/ongoing-actions";
import { uploadImages } from "@/lib/upload-images";

interface Department {
  id: string;
  name: string;
  bossId: string | null;
}

interface OngoingResponsibilityFormProps {
  departments: Department[];
  membersMap: Record<string, { id: string; fullName: string }[]>;
}

export function OngoingResponsibilityForm({
  departments,
  membersMap,
}: OngoingResponsibilityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [departmentId, setDepartmentId] = useState("none");
  const [assignedTo, setAssignedTo] = useState("none");
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
          ? await uploadImages(pendingImages.map((i) => i.file))
          : undefined;
      await createOngoingResponsibility({
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        departmentId,
        assignedTo,
        imageKeys,
      });
      router.push("/responsibilities?tab=ongoing");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create responsibility");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Ongoing Responsibility</CardTitle>
        <CardDescription>
          A standing duty owned permanently by a person, with no repeat schedule.
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
              placeholder="e.g. Make sure all computers are under one main user"
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
              placeholder="What this standing duty involves..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Guidelines or standards for keeping this duty in good shape..."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Steps or guidelines for this responsibility.
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
              <Label>Owner *</Label>
              <Select
                value={assignedTo}
                onValueChange={setAssignedTo}
                disabled={departmentId === "none"}
              >
                <SelectTrigger>
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
                    : "Person permanently responsible for this duty."}
              </p>
            </div>
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
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Create Responsibility
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
