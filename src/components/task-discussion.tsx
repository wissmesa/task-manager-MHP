"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskComment, deleteTaskComment } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Trash2,
  MessageSquare,
  History,
  ArrowRight,
  ImagePlus,
  X,
} from "lucide-react";

export interface CommentImage {
  id: string;
  imageUrl: string;
  originalName: string;
}

export interface CommentItem {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  userId: string;
  author: { id: string; fullName: string; email: string } | null;
  images?: CommentImage[];
}

export interface ActivityItem {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date | string;
  user: { id: string; fullName: string } | null;
}

interface TaskDiscussionProps {
  taskId: string;
  currentUserId: string;
  isAdmin: boolean;
  comments: CommentItem[];
  activity: ActivityItem[];
  /** Optional custom server actions (defaults to regular task actions). */
  onAddComment?: (
    taskId: string,
    content: string,
    imageKeys?: { s3Key: string; originalName: string }[]
  ) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  /**
   * When provided, comments support photo attachments. Receives the picked
   * files, uploads them, and returns their stored S3 keys.
   */
  onUploadImages?: (
    files: File[]
  ) => Promise<{ s3Key: string; originalName: string }[]>;
}

const ACTION_LABELS: Record<string, string> = {
  created: "created this task",
  status_changed: "changed the status",
  priority_changed: "changed the priority",
  planning_stage_changed: "changed the planning stage",
  assignee_changed: "changed the assignee",
  due_date_changed: "changed the due date",
  effort_changed: "changed the effort",
  value_changed: "changed the value",
  category_changed: "changed the category",
  target_changed: "changed the target",
  bundle_changed: "changed the bundle status",
  title_changed: "changed the title",
  description_changed: "updated the description",
  instructions_changed: "updated the instructions",
  frequency_changed: "changed the frequency",
  department_changed: "changed the department",
  approved: "approved the task",
  coordinator_approved: "approved the task (coordinator)",
  rejected: "rejected the task",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDateTime(value: Date | string) {
  const d = new Date(value);
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(value: Date | string) {
  const d = new Date(value).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(value);
}

interface LocalCommentImage {
  file: File;
  preview: string;
}

export function TaskDiscussion({
  taskId,
  currentUserId,
  isAdmin,
  comments,
  activity,
  onAddComment,
  onDeleteComment,
  onUploadImages,
}: TaskDiscussionProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<LocalCommentImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeComment = onDeleteComment ?? deleteTaskComment;
  const canAttach = !!onUploadImages;

  async function addComment(
    id: string,
    content: string,
    imageKeys?: { s3Key: string; originalName: string }[]
  ) {
    if (onAddComment) return onAddComment(id, content, imageKeys);
    return addTaskComment(id, content);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPendingImages((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSubmit() {
    const content = draft.trim();
    if (!content && pendingImages.length === 0) return;
    startSubmit(async () => {
      try {
        let imageKeys: { s3Key: string; originalName: string }[] | undefined;
        if (pendingImages.length > 0 && onUploadImages) {
          imageKeys = await onUploadImages(pendingImages.map((i) => i.file));
        }
        await addComment(taskId, content, imageKeys);
        setDraft("");
        pendingImages.forEach((i) => URL.revokeObjectURL(i.preview));
        setPendingImages([]);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to add comment");
      }
    });
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    setDeletingId(commentId);
    try {
      await removeComment(commentId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete comment");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <Tabs defaultValue="comments">
          <TabsList>
            <TabsTrigger value="comments" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Comments
              {comments.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Comments */}
          <TabsContent value="comments" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
                }}
              />

              {canAttach && pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingImages.map((img, i) => (
                    <div
                      key={img.preview}
                      className="group relative h-16 w-16 overflow-hidden rounded-md border bg-muted"
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

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {canAttach && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        title="Attach photos"
                      >
                        <ImagePlus className="h-4 w-4" />
                        Add photos
                      </button>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Press ⌘/Ctrl + Enter to send
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || (!draft.trim() && pendingImages.length === 0)}
                >
                  {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Comment
                </Button>
              </div>
            </div>

            {comments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No comments yet. Be the first to comment.
              </p>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => {
                  const canDelete = isAdmin || c.userId === currentUserId;
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          {getInitials(c.author?.fullName ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {c.author?.fullName ?? "Unknown"}
                          </span>
                          <span className="text-xs text-muted-foreground" title={formatDateTime(c.createdAt)}>
                            {relativeTime(c.createdAt)}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              disabled={deletingId === c.id}
                              className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                              title="Delete comment"
                            >
                              {deletingId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                        {c.content && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                            {c.content}
                          </p>
                        )}
                        {c.images && c.images.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {c.images.map((img) => (
                              <Dialog key={img.id}>
                                <DialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-20 w-20 overflow-hidden rounded-md border bg-muted transition-shadow hover:shadow-md"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={img.imageUrl}
                                      alt={img.originalName}
                                      className="h-full w-full object-cover"
                                    />
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl p-0">
                                  <DialogTitle className="sr-only">
                                    {img.originalName}
                                  </DialogTitle>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={img.imageUrl}
                                    alt={img.originalName}
                                    className="h-auto w-full rounded-lg"
                                  />
                                </DialogContent>
                              </Dialog>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="mt-4">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No history recorded yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5">
                        <span className="font-medium">{a.user?.fullName ?? "Someone"}</span>
                        <span className="text-muted-foreground">
                          {ACTION_LABELS[a.action] ?? a.action}
                        </span>
                        <span className="text-xs text-muted-foreground" title={formatDateTime(a.createdAt)}>
                          · {relativeTime(a.createdAt)}
                        </span>
                      </div>
                      {(a.oldValue || a.newValue) && a.action !== "created" && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {a.oldValue && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground line-through">
                              {a.oldValue}
                            </span>
                          )}
                          {a.oldValue && a.newValue && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                          {a.newValue && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-foreground">
                              {a.newValue}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
