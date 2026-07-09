"use server";

import { db } from "@/db";
import {
  recurringTasks,
  recurringTaskCompletions,
  departments,
  userDepartment,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, inArray, or, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isValidPeriodKey, type RecurrenceFrequency } from "@/lib/recurrence";

const ADMIN_EMAIL = "luis@bluepaperclip.com";

type SessionUser = { id: string; email?: string | null };

export interface RecurringTaskDTO {
  id: string;
  title: string;
  description: string | null;
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
    },
  });
  if (!r) return null;

  const canToggleFlag = await canToggle(session.user, r);
  if (!canToggleFlag) return null; // no view access
  const canManageFlag = await canManage(session.user, r);

  return {
    id: r.id,
    title: r.title,
    description: r.description,
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
    canToggle: canToggleFlag,
    canManage: canManageFlag,
  };
}

export async function updateRecurringTask(
  id: string,
  input: {
    title: string;
    description?: string;
    departmentId: string;
    frequency: RecurrenceFrequency;
    dueWeekday?: number | null;
    dueDayOfMonth?: number | null;
    assignedTo?: string | null;
  }
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const task = await db.query.recurringTasks.findFirst({
    where: eq(recurringTasks.id, id),
    columns: { id: true, departmentId: true, createdBy: true, frequency: true },
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

  revalidatePath("/recurring");
  revalidatePath(`/recurring/${id}`);
}

export async function createRecurringTask(input: {
  title: string;
  description?: string;
  departmentId: string;
  frequency: RecurrenceFrequency;
  dueWeekday?: number | null;
  dueDayOfMonth?: number | null;
  assignedTo?: string | null;
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
      departmentId: input.departmentId,
      createdBy: session.user.id,
      assignedTo: input.assignedTo || null,
      frequency: input.frequency,
      dueWeekday,
      dueDayOfMonth,
    })
    .returning();

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
