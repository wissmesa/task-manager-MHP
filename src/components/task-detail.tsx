"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask, approveTask, rejectTask, assignTaskToUser, deleteTask } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  CalendarCheck,
  User,
  UserCheck,
  Flag,
  Loader2,
  Pencil,
  X,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Building2,
} from "lucide-react";
import Link from "next/link";

interface TaskImage {
  id: string;
  imageUrl: string;
  originalName: string;
}

interface Subordinate {
  id: string;
  fullName: string;
  email: string;
}

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  approval: "pending_approval" | "pending_dept_approval" | "approved" | "rejected";
  ownBossApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  createdBy: string;
  creatorDeptId: string | null;
  creator: { fullName: string; email: string } | null;
  assignee: { fullName: string; email: string } | null;
  assignedTo: string | null;
  departmentId: string | null;
  departmentName: string | null;
  images: TaskImage[];
}

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const approvalLabels: Record<string, string> = {
  pending_approval: "Pending Coordinator Approval",
  pending_dept_approval: "Pending Dept. Approval",
  approved: "Approved",
  rejected: "Rejected",
};

const approvalColors: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  pending_dept_approval: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
};

interface TaskDetailProps {
  task: TaskData;
  currentUserId: string;
  isBossOfCreator: boolean;
  isBossOfDepartment: boolean;
  subordinates: Subordinate[];
}

export function TaskDetail({
  task,
  currentUserId,
  isBossOfCreator,
  isBossOfDepartment,
  subordinates,
}: TaskDetailProps) {
  const router = useRouter();
  const isOwner = currentUserId === task.createdBy;
  const canEdit = isOwner || isBossOfDepartment;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isApproving, startApproving] = useTransition();
  const [isAssigning, startAssigning] = useTransition();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [editAssignee, setEditAssignee] = useState(task.assignedTo || "unassigned");
  const [selectedSubordinate, setSelectedSubordinate] = useState(task.assignedTo || "unassigned");

  function handleCancel() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "");
    setEditAssignee(task.assignedTo || "unassigned");
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        assignedTo: editAssignee === "unassigned" ? null : editAssignee,
        dueDate: dueDate || null,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setSaving(false);
    }
  }

  function handleAssign(userId: string) {
    if (userId === "unassigned") return;
    setSelectedSubordinate(userId);
    startAssigning(async () => {
      try {
        await assignTaskToUser(task.id, userId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to assign task");
        setSelectedSubordinate(task.assignedTo || "unassigned");
      }
    });
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      router.push("/tasks");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete task");
      setDeleting(false);
    }
  }

  const canAssign = isBossOfDepartment && task.approval === "approved" && !task.assignedTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tasks">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>

        {canEdit && !editing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        )}
      </div>

      {isBossOfCreator && task.approval === "pending_approval" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <ShieldCheck className="h-5 w-5" />
              <span>This task is awaiting your approval as the creator&apos;s coordinator.</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                disabled={isApproving}
                onClick={() => {
                  startApproving(async () => {
                    await approveTask(task.id);
                    router.refresh();
                  });
                }}
              >
                {isApproving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
                disabled={isApproving}
                onClick={() => {
                  startApproving(async () => {
                    await rejectTask(task.id);
                    router.refresh();
                  });
                }}
              >
                {isApproving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isBossOfDepartment && task.approval === "pending_dept_approval" && (
        <Card className="border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-300">
              <Building2 className="h-5 w-5" />
              <span>This task was approved by the creator&apos;s coordinator and is awaiting your department approval.</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                disabled={isApproving}
                onClick={() => {
                  startApproving(async () => {
                    await approveTask(task.id);
                    router.refresh();
                  });
                }}
              >
                {isApproving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
                disabled={isApproving}
                onClick={() => {
                  startApproving(async () => {
                    await rejectTask(task.id);
                    router.refresh();
                  });
                }}
              >
                {isApproving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canAssign && (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
              <UserCheck className="h-5 w-5" />
              <span>Task approved. Assign a team member to execute it.</span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={selectedSubordinate}
                onValueChange={handleAssign}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select person..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned" disabled>Select person...</SelectItem>
                  {subordinates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAssigning && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 space-y-1">
              {editing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-bold h-auto py-1"
                  required
                />
              ) : (
                <CardTitle className="text-2xl">{task.title}</CardTitle>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={statusColors[status]}>
                  {statusLabels[status]}
                </Badge>
                <Badge variant="secondary" className={priorityColors[priority]}>
                  <Flag className="mr-1 h-3 w-3" />
                  {priorityLabels[priority]}
                </Badge>
                {(() => {
                  const bossColor = task.approval === "pending_approval"
                    ? approvalColors.pending_approval
                    : task.ownBossApproved
                      ? approvalColors.approved
                      : task.approval === "rejected"
                        ? approvalColors.rejected
                        : approvalColors.approved;
                  const bossLabel = task.approval === "pending_approval"
                    ? "Coordinator: Pending"
                    : task.ownBossApproved
                      ? "Coordinator: Approved"
                      : task.approval === "rejected"
                        ? "Coordinator: Rejected"
                        : "Coordinator: Approved";
                  return (
                    <Badge variant="secondary" className={bossColor}>
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {bossLabel}
                    </Badge>
                  );
                })()}
                {task.departmentId && (() => {
                  const isCrossDept = task.departmentId !== task.creatorDeptId;
                  let deptColor: string;
                  let deptLabel: string;

                  if (isCrossDept) {
                    switch (task.approval) {
                      case "pending_approval":
                        deptColor = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
                        deptLabel = "Dept: Waiting";
                        break;
                      case "pending_dept_approval":
                        deptColor = approvalColors.pending_dept_approval;
                        deptLabel = "Dept: Pending";
                        break;
                      case "approved":
                        deptColor = approvalColors.approved;
                        deptLabel = "Dept: Approved";
                        break;
                      case "rejected":
                        deptColor = task.ownBossApproved
                          ? approvalColors.rejected
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
                        deptLabel = task.ownBossApproved ? "Dept: Rejected" : "Dept: Waiting";
                        break;
                      default:
                        deptColor = "bg-slate-50 text-slate-400";
                        deptLabel = "Dept: N/A";
                    }
                  } else {
                    switch (task.approval) {
                      case "pending_approval":
                        deptColor = approvalColors.pending_approval;
                        deptLabel = "Dept: Pending";
                        break;
                      case "approved":
                        deptColor = approvalColors.approved;
                        deptLabel = "Dept: Approved";
                        break;
                      case "rejected":
                        deptColor = approvalColors.rejected;
                        deptLabel = "Dept: Rejected";
                        break;
                      default:
                        deptColor = "bg-slate-50 text-slate-400";
                        deptLabel = "Dept: N/A";
                    }
                  }

                  return (
                    <Badge variant="secondary" className={deptColor}>
                      <Building2 className="mr-1 h-3 w-3" />
                      {deptLabel}
                    </Badge>
                  );
                })()}
              </div>
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                >
                  {saving ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {editing && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              {subordinates.length > 0 && (
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={editAssignee} onValueChange={setEditAssignee}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue placeholder="Select a person..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {subordinates.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />
            </>
          )}

          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>
                {task.creator?.fullName ?? "Unknown"}{" "}
                {task.creator?.email && (
                  <span className="text-xs">({task.creator.email})</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                Created on{" "}
                {new Date(task.createdAt).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            {task.departmentName && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>{task.departmentName}</span>
              </div>
            )}
            {task.assignee && (
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                <span>{task.assignee.fullName}</span>
              </div>
            )}
            {!editing && task.dueDate && (
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                <span>
                  Due{" "}
                  {new Date(task.dueDate).toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            {task.completedAt && (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="h-4 w-4" />
                <span>
                  Completed on{" "}
                  {new Date(task.completedAt).toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 font-semibold">Description</h3>
            {editing ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe in detail what needs to be done..."
                rows={5}
              />
            ) : task.description ? (
              <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                {task.description}
              </p>
            ) : (
              <p className="italic text-muted-foreground">
                No description provided.
              </p>
            )}
          </div>

          {task.images.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-3 font-semibold">
                  Attached Images ({task.images.length})
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {task.images.map((img) => (
                    <Dialog key={img.id}>
                      <DialogTrigger asChild>
                        <button className="group overflow-hidden rounded-lg border bg-muted transition-shadow hover:shadow-md">
                          <img
                            src={img.imageUrl}
                            alt={img.originalName}
                            className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="px-2 py-1.5">
                            <p className="truncate text-xs text-muted-foreground">
                              {img.originalName}
                            </p>
                          </div>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl p-0">
                        <DialogTitle className="sr-only">
                          {img.originalName}
                        </DialogTitle>
                        <img
                          src={img.imageUrl}
                          alt={img.originalName}
                          className="h-auto w-full rounded-lg"
                        />
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
