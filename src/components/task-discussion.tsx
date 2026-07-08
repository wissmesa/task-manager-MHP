"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskComment, deleteTaskComment } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trash2, MessageSquare, History, ArrowRight } from "lucide-react";

export interface CommentItem {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  userId: string;
  author: { id: string; fullName: string; email: string } | null;
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

export function TaskDiscussion({
  taskId,
  currentUserId,
  isAdmin,
  comments,
  activity,
}: TaskDiscussionProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleSubmit() {
    const content = draft.trim();
    if (!content) return;
    startSubmit(async () => {
      try {
        await addTaskComment(taskId, content);
        setDraft("");
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
      await deleteTaskComment(commentId);
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Press ⌘/Ctrl + Enter to send
                </span>
                <Button size="sm" onClick={handleSubmit} disabled={submitting || !draft.trim()}>
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
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                          {c.content}
                        </p>
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
