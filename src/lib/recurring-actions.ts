"use server";

import { db } from "@/db";
import {
  recurringTasks,
  recurringTaskCompletions,
  recurringTaskActivity,
  recurringTaskComments,
  recurringTaskImages,
  recurringCommentImages,
  departments,
  userDepartment,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, inArray, or, asc, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  isValidPeriodKey,
  describeRecurrence,
  type RecurrenceFrequency,
} from "@/lib/recurrence";
import {
  sendRecurringTaskAssignedEmail,
  sendRecurringTaskCommentEmail,
} from "@/lib/mail";
import { getSignedImageUrl } from "@/lib/s3";

/** An image attachment as stored (S3 key). */
export interface ImageKeyInput {
  s3Key: string;
  originalName: string;
}

/** An image attachment resolved for display (signed URL). */
export interface ResolvedImage {
  id: string;
  imageUrl: string;
  originalName: string;
}

async function resolveImageUrls(
  images: { id: string; imageUrl: string; originalName: string }[]
): Promise<ResolvedImage[]> {
  return Promise.all(
    images.map(async (img) => ({
      id: img.id,
      imageUrl: await getSignedImageUrl(img.imageUrl),
      originalName: img.originalName,
    }))
  );
}

function recurringTaskUrl(id: string): string {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${baseUrl}/recurring/${id}`;
}

/** Notify the assigned user that a recurring task was assigned to them. */
async function notifyRecurringAssignee(input: {
  taskId: string;
  assigneeId: string;
  assignerId: string;
  assignerName: string;
  departmentId: string;
  title: string;
  frequency: RecurrenceFrequency;
  dueWeekday: number | null;
  dueDayOfMonth: number | null;
}): Promise<void> {
  // Don't email people about tasks they assigned to themselves.
  if (input.assigneeId === input.assignerId) return;

  const assignee = await db.query.users.findFirst({
    where: eq(users.id, input.assigneeId),
    columns: { email: true, fullName: true },
  });
  if (!assignee?.email) return;

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, input.departmentId),
    columns: { name: true },
  });

  await sendRecurringTaskAssignedEmail(assignee.email, assignee.fullName, {
    taskTitle: input.title,
    creatorName: input.assignerName,
    departmentName: dept?.name ?? null,
    recurrence: describeRecurrence(
      input.frequency,
      input.dueWeekday,
      input.dueDayOfMonth
    ),
    taskUrl: recurringTaskUrl(input.taskId),
  });
}

const ADMIN_EMAIL = "luis@bluepaperclip.com";

type SessionUser = { id: string; email?: string | null };

export interface RecurringTaskDTO {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  departmentId: string;
  departmentName: string | null;
  frequency: RecurrenceFrequency;
  dueWeekday: number | null;
  dueDayOfMonth: number | null;
  isActive: boolean;
  createdBy: string;
  creatorName: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: string;
  completedKeys: string[];
  completions: CompletionInfo[];
  images: ResolvedImage[];
  canToggle: boolean;
  canManage: boolean;
}

export interface CompletionInfo {
  periodKey: string;
  completedAt: string;
  completedByName: string | null;
}

/**
 * Members of every department, keyed by departmentId. Used to pick a
 * responsible person for a recurring task (informational only).
 */
export async function getDepartmentMembersMap(): Promise<
  Record<string, { id: string; fullName: string }[]>
> {
  const session = await auth();
  if (!session?.user) return {};

  const rows = await db.query.userDepartment.findMany({
    with: { user: { columns: { id: true, fullName: true } } },
  });

  const map: Record<string, { id: string; fullName: string }[]> = {};
  for (const r of rows) {
    if (!r.user) continue;
    (map[r.departmentId] ??= []).push({
      id: r.user.id,
      fullName: r.user.fullName,
    });
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
  return map;
}

async function recordRecurringActivity(entry: {
  recurringTaskId: string;
  userId: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  try {
    await db.insert(recurringTaskActivity).values({
      recurringTaskId: entry.recurringTaskId,
      userId: entry.userId,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    });
  } catch (err) {
    console.error("Failed to record recurring task activity:", err);
  }
}

async function getUserName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { fullName: true },
  });
  return u?.fullName ?? null;
}

async function getDepartmentName(deptId: string | null): Promise<string | null> {
  if (!deptId) return null;
  const d = await db.query.departments.findFirst({
    where: eq(departments.id, deptId),
    columns: { name: true },
  });
  return d?.name ?? null;
}

async function getUserContext(userId: string) {
  const myDept = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: { department: { columns: { name: true } } },
  });
  const isExecutive = myDept?.department?.name?.toLowerCase() === "executive";
  return { myDept, isExecutive };
}

/** Toggle permission: admin, assignee, creator, same-department member, dept boss, executive. */
async function canToggle(
  user: SessionUser,
  task: { departmentId: string; assignedTo: string | null; createdBy: string }
): Promise<boolean> {
  if (user.email === ADMIN_EMAIL) return true;
  if (task.assignedTo === user.id) return true;
  if (task.createdBy === user.id) return true;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, user.id),
    with: { department: { columns: { name: true } } },
  });
  if (ud) {
    if (ud.departmentId === task.departmentId) return true;
    if (ud.department?.name?.toLowerCase() === "executive") return true;
  }

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, task.departmentId),
    columns: { bossId: true },
  });
  if (dept?.bossId === user.id) return true;

  return false;
}

/** Delete permission (stricter): admin, creator, dept boss, executive. */
async function canManage(
  user: SessionUser,
  task: { departmentId: string; createdBy: string }
): Promise<boolean> {
  if (user.email === ADMIN_EMAIL) return true;
  if (task.createdBy === user.id) return true;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, user.id),
    with: { department: { columns: { name: true } } },
  });
  if (ud?.department?.name?.toLowerCase() === "executive") return true;

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, task.departmentId),
    columns: { bossId: true },
  });
  if (dept?.bossId === user.id) return true;

  return false;
}

export async function getRecurringTasksForUser(): Promise<RecurringTaskDTO[]> {
  const session = await auth();
  if (!session?.user) return [];
  const userId = session.user.id;

  const { myDept, isExecutive } = await getUserContext(userId);
  const isAdmin = session.user.email === ADMIN_EMAIL;
  const canSeeAll = isExecutive || isAdmin;

  const bossDepts = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.bossId, userId));
  const bossDeptIds = new Set(bossDepts.map((d) => d.id));
  const myDeptId = myDept?.departmentId ?? null;

  const withRels = {
    creator: { columns: { fullName: true } },
    assignee: { columns: { fullName: true } },
    department: { columns: { name: true } },
    completions: {
      columns: { periodKey: true, completedAt: true },
      with: { completedByUser: { columns: { fullName: true } } },
    },
  } as const;

  let rows;
  if (canSeeAll) {
    rows = await db.query.recurringTasks.findMany({
      with: withRels,
      orderBy: [desc(recurringTasks.createdAt)],
    });
  } else {
    const conditions = [
      eq(recurringTasks.createdBy, userId),
      eq(recurringTasks.assignedTo, userId),
    ];
    if (myDeptId) conditions.push(eq(recurringTasks.departmentId, myDeptId));
    if (bossDeptIds.size > 0) {
      conditions.push(inArray(recurringTasks.departmentId, [...bossDeptIds]));
    }

    rows = await db.query.recurringTasks.findMany({
      where: or(...conditions),
      with: withRels,
      orderBy: [desc(recurringTasks.createdAt)],
    });
  }

  const canToggleTask = (r: (typeof rows)[number]) =>
    isAdmin ||
    isExecutive ||
    r.assignedTo === userId ||
    r.createdBy === userId ||
    (myDeptId != null && r.departmentId === myDeptId) ||
    bossDeptIds.has(r.departmentId);

  const canManageTask = (r: (typeof rows)[number]) =>
    isAdmin || isExecutive || r.createdBy === userId || bossDeptIds.has(r.departmentId);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    instructions: r.instructions,
    departmentId: r.departmentId,
    departmentName: r.department?.name ?? null,
    frequency: r.frequency,
    dueWeekday: r.dueWeekday,
    dueDayOfMonth: r.dueDayOfMonth,
    isActive: r.isActive,
    createdBy: r.createdBy,
    creatorName: r.creator?.fullName ?? null,
    assignedTo: r.assignedTo,
    assigneeName: r.assignee?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    completedKeys: r.completions.map((c) => c.periodKey),
    completions: r.completions.map((c) => ({
      periodKey: c.periodKey,
      completedAt: c.completedAt.toISOString(),
      completedByName: c.completedByUser?.fullName ?? null,
    })),
    // Instruction images are only needed on the detail view, skip signing here.
    images: [],
    canToggle: canToggleTask(r),
    canManage: canManageTask(r),
  }));
}

export async function getRecurringTaskById(
  id: string
): Promise<RecurringTaskDTO | null> {
  const session = await auth();
  if (!session?.user) return null;

  const r = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, id),
    with: {
      creator: { columns: { fullName: true } },
      assignee: { columns: { fullName: true } },
      department: { columns: { name: true } },
      completions: {
        columns: { periodKey: true, completedAt: true },
        with: { completedByUser: { columns: { fullName: true } } },
      },
      images: {
        columns: { id: true, imageUrl: true, originalName: true },
      },
    },
  });
  if (!r) return null;

  const canToggleFlag = await canToggle(session.user, r);
  if (!canToggleFlag) return null; // no view access
  const canManageFlag = await canManage(session.user, r);

  const resolvedImages = await resolveImageUrls(r.images);

  return {
    id: r.id,
    title: r.title,
    description: r.description,
    instructions: r.instructions,
    departmentId: r.departmentId,
    departmentName: r.department?.name ?? null,
    frequency: r.frequency,
    dueWeekday: r.dueWeekday,
    dueDayOfMonth: r.dueDayOfMonth,
    isActive: r.isActive,
    createdBy: r.createdBy,
    creatorName: r.creator?.fullName ?? null,
    assignedTo: r.assignedTo,
    assigneeName: r.assignee?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    completedKeys: r.completions.map((c) => c.periodKey),
    completions: r.completions.map((c) => ({
      periodKey: c.periodKey,
      completedAt: c.completedAt.toISOString(),
      completedByName: c.completedByUser?.fullName ?? null,
    })),
    images: resolvedImages,
    canToggle: canToggleFlag,
    canManage: canManageFlag,
  };
}

export async function updateRecurringTask(
  id: string,
  input: {
    title: string;
    description?: string;
    instructions?: string;
    departmentId: string;
    frequency: RecurrenceFrequency;
    dueWeekday?: number | null;
    dueDayOfMonth?: number | null;
    assignedTo?: string | null;
    imageKeys?: ImageKeyInput[];
    removedImageIds?: string[];
  }
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const task = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, id),
    columns: {
      id: true,
      title: true,
      description: true,
      instructions: true,
      departmentId: true,
      createdBy: true,
      frequency: true,
      assignedTo: true,
    },
  });
  if (!task) throw new Error("Recurring task not found");

  const allowed = await canManage(session.user, task);
  if (!allowed) throw new Error("You don't have permission to edit this task");

  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!input.departmentId) throw new Error("Department is required");
  if (!["daily", "weekly", "monthly"].includes(input.frequency)) {
    throw new Error("Invalid frequency");
  }

  let dueWeekday: number | null = null;
  let dueDayOfMonth: number | null = null;
  if (input.frequency === "weekly") {
    dueWeekday = input.dueWeekday ?? 1;
    if (dueWeekday < 0 || dueWeekday > 6) throw new Error("Invalid weekday");
  }
  if (input.frequency === "monthly") {
    dueDayOfMonth = input.dueDayOfMonth ?? 1;
    if (dueDayOfMonth < 1 || dueDayOfMonth > 31) throw new Error("Invalid day of month");
  }

  await db
    .update(recurringTasks)
    .set({
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      departmentId: input.departmentId,
      assignedTo: input.assignedTo || null,
      frequency: input.frequency,
      dueWeekday,
      dueDayOfMonth,
      updatedAt: new Date(),
    })
    .where(eq(recurringTasks.id, id));

  // Changing frequency invalidates existing period keys, so reset completions.
  if (task.frequency !== input.frequency) {
    await db
      .delete(recurringTaskCompletions)
      .where(eq(recurringTaskCompletions.recurringTaskId, id));
  }

  // Remove instruction images the user deleted.
  if (input.removedImageIds && input.removedImageIds.length > 0) {
    await db
      .delete(recurringTaskImages)
      .where(
        and(
          eq(recurringTaskImages.recurringTaskId, id),
          inArray(recurringTaskImages.id, input.removedImageIds)
        )
      );
  }

  // Add newly attached instruction images.
  if (input.imageKeys && input.imageKeys.length > 0) {
    await db.insert(recurringTaskImages).values(
      input.imageKeys.map((img) => ({
        recurringTaskId: id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  // Record the change history.
  const uid = session.user.id;
  const newAssigneeId = input.assignedTo || null;
  const newDescription = input.description?.trim() || null;
  const newInstructions = input.instructions?.trim() || null;
  if (task.title !== title) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "title_changed",
      oldValue: task.title,
      newValue: title,
    });
  }
  if ((task.description ?? null) !== newDescription) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "description_changed",
    });
  }
  if ((task.instructions ?? null) !== newInstructions) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "instructions_changed",
    });
  }
  if (task.departmentId !== input.departmentId) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "department_changed",
      oldValue: (await getDepartmentName(task.departmentId)) ?? undefined,
      newValue: (await getDepartmentName(input.departmentId)) ?? undefined,
    });
  }
  if ((task.assignedTo ?? null) !== newAssigneeId) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "assignee_changed",
      oldValue: (await getUserName(task.assignedTo)) ?? "Unassigned",
      newValue: (await getUserName(newAssigneeId)) ?? "Unassigned",
    });
  }
  if (task.frequency !== input.frequency) {
    await recordRecurringActivity({
      recurringTaskId: id,
      userId: uid,
      action: "frequency_changed",
      oldValue: task.frequency,
      newValue: input.frequency,
    });
  }

  // Notify the new responsible only when the assignee actually changed.
  const newAssignee = input.assignedTo || null;
  if (newAssignee && newAssignee !== task.assignedTo) {
    await notifyRecurringAssignee({
      taskId: id,
      assigneeId: newAssignee,
      assignerId: session.user.id,
      assignerName: session.user.name ?? session.user.email ?? "Someone",
      departmentId: input.departmentId,
      title,
      frequency: input.frequency,
      dueWeekday,
      dueDayOfMonth,
    });
  }

  revalidatePath("/recurring");
  revalidatePath(`/recurring/${id}`);
}

export async function createRecurringTask(input: {
  title: string;
  description?: string;
  instructions?: string;
  departmentId: string;
  frequency: RecurrenceFrequency;
  dueWeekday?: number | null;
  dueDayOfMonth?: number | null;
  assignedTo?: string | null;
  imageKeys?: ImageKeyInput[];
}): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!input.departmentId) throw new Error("Department is required");
  if (!input.assignedTo) throw new Error("A responsible person is required");
  if (!["daily", "weekly", "monthly"].includes(input.frequency)) {
    throw new Error("Invalid frequency");
  }

  let dueWeekday: number | null = null;
  let dueDayOfMonth: number | null = null;

  if (input.frequency === "weekly") {
    dueWeekday = input.dueWeekday ?? 1;
    if (dueWeekday < 0 || dueWeekday > 6) throw new Error("Invalid weekday");
  }
  if (input.frequency === "monthly") {
    dueDayOfMonth = input.dueDayOfMonth ?? 1;
    if (dueDayOfMonth < 1 || dueDayOfMonth > 31) throw new Error("Invalid day of month");
  }

  const [row] = await db
    .insert(recurringTasks)
    .values({
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      departmentId: input.departmentId,
      createdBy: session.user.id,
      assignedTo: input.assignedTo || null,
      frequency: input.frequency,
      dueWeekday,
      dueDayOfMonth,
    })
    .returning();

  if (input.imageKeys && input.imageKeys.length > 0) {
    await db.insert(recurringTaskImages).values(
      input.imageKeys.map((img) => ({
        recurringTaskId: row.id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  await recordRecurringActivity({
    recurringTaskId: row.id,
    userId: session.user.id,
    action: "created",
    newValue: "Recurring task created",
  });

  if (input.assignedTo) {
    await notifyRecurringAssignee({
      taskId: row.id,
      assigneeId: input.assignedTo,
      assignerId: session.user.id,
      assignerName: session.user.name ?? session.user.email ?? "Someone",
      departmentId: input.departmentId,
      title,
      frequency: input.frequency,
      dueWeekday,
      dueDayOfMonth,
    });
  }

  revalidatePath("/recurring");
  return row.id;
}

export async function toggleRecurringCompletion(
  recurringTaskId: string,
  periodKey: string,
  done: boolean
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const task = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, recurringTaskId),
    columns: { id: true, frequency: true, departmentId: true, assignedTo: true, createdBy: true },
  });
  if (!task) throw new Error("Recurring task not found");
  if (!isValidPeriodKey(task.frequency, periodKey)) {
    throw new Error("Invalid period");
  }

  const allowed = await canToggle(session.user, task);
  if (!allowed) throw new Error("You don't have permission to update this task");

  if (done) {
    await db
      .insert(recurringTaskCompletions)
      .values({
        recurringTaskId,
        periodKey,
        completedBy: session.user.id,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(recurringTaskCompletions)
      .where(
        and(
          eq(recurringTaskCompletions.recurringTaskId, recurringTaskId),
          eq(recurringTaskCompletions.periodKey, periodKey)
        )
      );
  }

  revalidatePath("/recurring");
}

export async function deleteRecurringTask(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const task = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, id),
    columns: { id: true, departmentId: true, createdBy: true },
  });
  if (!task) return;

  const allowed = await canManage(session.user, task);
  if (!allowed) throw new Error("You don't have permission to delete this task");

  await db.delete(recurringTasks).where(eq(recurringTasks.id, id));
  revalidatePath("/recurring");
}

// ── Comments & activity ──────────────────────────────────────────────────────

export interface RecurringCommentItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  author: { id: string; fullName: string; email: string } | null;
  images: ResolvedImage[];
}

export interface RecurringActivityItem {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; fullName: string } | null;
}

export async function getRecurringTaskComments(
  recurringTaskId: string
): Promise<RecurringCommentItem[]> {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.recurringTaskComments.findMany({
    where: eq(recurringTaskComments.recurringTaskId, recurringTaskId),
    with: {
      user: { columns: { id: true, fullName: true, email: true } },
      images: { columns: { id: true, imageUrl: true, originalName: true } },
    },
    orderBy: [asc(recurringTaskComments.createdAt)],
  });

  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      userId: c.userId,
      author: c.user
        ? { id: c.user.id, fullName: c.user.fullName, email: c.user.email }
        : null,
      images: await resolveImageUrls(c.images),
    }))
  );
}

export async function addRecurringTaskComment(
  recurringTaskId: string,
  content: string,
  imageKeys?: ImageKeyInput[]
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const trimmed = content.trim();
  const hasImages = !!imageKeys && imageKeys.length > 0;
  if (!trimmed && !hasImages) throw new Error("Comment cannot be empty");
  if (trimmed.length > 5000) throw new Error("Comment is too long");

  const task = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, recurringTaskId),
    columns: {
      id: true,
      title: true,
      departmentId: true,
      assignedTo: true,
      createdBy: true,
    },
  });
  if (!task) throw new Error("Recurring task not found");

  // Anyone who can view the task may comment.
  const allowed = await canToggle(session.user, task);
  if (!allowed) throw new Error("You don't have access to this task");

  const [comment] = await db
    .insert(recurringTaskComments)
    .values({
      recurringTaskId,
      userId: session.user.id,
      content: trimmed,
    })
    .returning();

  if (hasImages) {
    await db.insert(recurringCommentImages).values(
      imageKeys!.map((img) => ({
        commentId: comment.id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  // Notify everyone involved with the task about the new comment:
  //  - the assignee (person in charge) and the task creator,
  //  - the supervisor (boss) of each involved area (commenter's, assignee's,
  //    creator's and the task's department),
  //  - always excluding whoever wrote the comment.
  await notifyRecurringComment({
    task,
    commenterId: session.user.id,
    commenterName: session.user.name ?? session.user.email ?? "Someone",
    content: trimmed,
    hasImages,
  });

  revalidatePath(`/recurring/${recurringTaskId}`);
}

/**
 * Emails the assignee, the creator and the supervisor of every involved area
 * (excluding whoever wrote the comment) so everyone stays informed.
 */
async function notifyRecurringComment(input: {
  task: {
    id: string;
    title: string;
    departmentId: string;
    assignedTo: string | null;
    createdBy: string;
  };
  commenterId: string;
  commenterName: string;
  content: string;
  hasImages: boolean;
}): Promise<void> {
  const { task, commenterId } = input;

  // People directly involved (used both as recipients and to resolve areas).
  const involvedUserIds = [...new Set(
    [commenterId, task.assignedTo, task.createdBy].filter(
      (id): id is string => !!id
    )
  )];

  // Departments of the involved people + the task's own department.
  const departmentIds = new Set<string>([task.departmentId]);
  if (involvedUserIds.length > 0) {
    const memberships = await db.query.userDepartment.findMany({
      where: inArray(userDepartment.userId, involvedUserIds),
      columns: { departmentId: true },
    });
    memberships.forEach((m) => departmentIds.add(m.departmentId));
  }

  // Supervisors (bosses) of every involved area.
  const bossIds: string[] = [];
  if (departmentIds.size > 0) {
    const depts = await db.query.departments.findMany({
      where: inArray(departments.id, [...departmentIds]),
      columns: { bossId: true },
    });
    depts.forEach((d) => {
      if (d.bossId) bossIds.push(d.bossId);
    });
  }

  // Final recipients: assignee + creator + supervisors, minus the commenter.
  const recipientIds = [...new Set(
    [task.assignedTo, task.createdBy, ...bossIds].filter(
      (id): id is string => !!id && id !== commenterId
    )
  )];
  if (recipientIds.length === 0) return;

  const recipients = await db.query.users.findMany({
    where: inArray(users.id, recipientIds),
    columns: { email: true, fullName: true },
  });

  await Promise.all(
    recipients
      .filter((r) => !!r.email)
      .map((r) =>
        sendRecurringTaskCommentEmail(r.email, r.fullName, {
          taskTitle: task.title,
          commenterName: input.commenterName,
          commentContent: input.content,
          hasImages: input.hasImages,
          taskUrl: recurringTaskUrl(task.id),
        })
      )
  );
}

export async function deleteRecurringTaskComment(commentId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const comment = await db.query.recurringTaskComments.findFirst({
    where: eq(recurringTaskComments.id, commentId),
    columns: { id: true, userId: true, recurringTaskId: true },
  });
  if (!comment) throw new Error("Comment not found");

  const isAdmin = session.user.email === ADMIN_EMAIL;
  if (!isAdmin && comment.userId !== session.user.id) {
    throw new Error("You can only delete your own comments");
  }

  await db
    .delete(recurringTaskComments)
    .where(eq(recurringTaskComments.id, commentId));

  revalidatePath(`/recurring/${comment.recurringTaskId}`);
}

export async function getRecurringTaskActivity(
  recurringTaskId: string
): Promise<RecurringActivityItem[]> {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.recurringTaskActivity.findMany({
    where: eq(recurringTaskActivity.recurringTaskId, recurringTaskId),
    with: { user: { columns: { id: true, fullName: true } } },
    orderBy: [desc(recurringTaskActivity.createdAt)],
  });

  return rows.map((a) => ({
    id: a.id,
    action: a.action,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    createdAt: a.createdAt.toISOString(),
    user: a.user ? { id: a.user.id, fullName: a.user.fullName } : null,
  }));
}
