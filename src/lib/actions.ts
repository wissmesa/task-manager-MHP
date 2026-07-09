"use server";

import { db } from "@/db";
import { tasks, taskImages, users, userHierarchy, departments, userDepartment, taskActivity, taskComments, taskCommentImages } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc, asc, inArray, and, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSignedImageUrl } from "@/lib/s3";
import { sendTaskCreatedEmail, sendStatusChangeEmail } from "@/lib/mail";
import {
  isDueDateWithinPriorityLimit,
  PRIORITY_LABELS,
  type TaskPriority,
} from "@/lib/task-priority";
import { PLANNING_STAGE_LABELS } from "@/lib/task-planning";
import {
  TASK_EFFORTS,
  TASK_VALUES,
  TASK_CATEGORIES,
  EFFORT_LABELS,
  VALUE_LABELS,
  CATEGORY_LABELS,
  type TaskEffort,
  type TaskValue,
  type TaskCategory,
} from "@/lib/task-attributes";

const ASSIGNABLE_ROLES = ["MHP_LORD", "SALES_DIRECTOR", "DIRECTOR"] as const;
const ADMIN_EMAIL = "luis@bluepaperclip.com";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (user.email !== ADMIN_EMAIL) throw new Error("Forbidden");
  return user;
}

function isAdminUser(user: { email?: string | null }) {
  return user.email === ADMIN_EMAIL;
}

async function isExecutiveMember(userId: string) {
  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: { department: { columns: { name: true } } },
  });
  return ud?.department?.name?.toLowerCase() === "executive";
}

async function verifyTaskOwner(taskId: string, userId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true },
  });
  if (!task || task.createdBy !== userId) {
    throw new Error("Only the task creator can edit this task");
  }
}

export async function getBossForUser(userId: string) {
  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: {
      department: { columns: { bossId: true } },
    },
  });
  return ud?.department?.bossId ?? null;
}

// ── Activity log ──────────────────────────────────────────────────────────────

type ActivityEntry = {
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
};

/** Records a single change on a task's history. Never throws to the caller. */
async function recordActivity(taskId: string, userId: string, entry: ActivityEntry) {
  try {
    await db.insert(taskActivity).values({
      taskId,
      userId,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    });
  } catch (err) {
    console.error("Failed to record task activity", err);
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const DEV_TARGET_LABELS: Record<string, string> = {
  task_manager: "Task Manager",
  web_app: "Web App",
  mobile_app: "Mobile App",
  both: "Both (Web App, Mobile App)",
};

async function getUserName(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Unassigned";
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { fullName: true },
  });
  return u?.fullName ?? "Unknown";
}

async function getDepartmentName(departmentId: string | null | undefined): Promise<string> {
  if (!departmentId) return "No department";
  const d = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId),
    columns: { name: true },
  });
  return d?.name ?? "No department";
}

// ── Assignable users ────────────────────────────────────────────────────────

export async function getAssignableUsers() {
  const session = await auth();
  if (!session?.user) return [];

  const result = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        inArray(users.role, [...ASSIGNABLE_ROLES]),
        eq(users.isActive, true)
      )
    )
    .orderBy(users.fullName);

  return result;
}

export async function getPublicDepartments() {
  const session = await auth();
  if (!session?.user) return [];

  return db
    .select({ id: departments.id, name: departments.name, bossId: departments.bossId })
    .from(departments)
    .orderBy(departments.name);
}

export async function getSubordinatesForBossDepts() {
  const session = await auth();
  if (!session?.user) return {};

  // Executive members and the admin can reassign across every department, so
  // they get the member list of all departments. Bosses get only their own.
  const myDept = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, session.user.id),
    with: { department: { columns: { name: true } } },
  });
  const isExecutive = myDept?.department?.name?.toLowerCase() === "executive";
  const canReassignAll = isExecutive || session.user.email === ADMIN_EMAIL;

  const targetDepts = canReassignAll
    ? await db.select({ id: departments.id }).from(departments)
    : await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.bossId, session.user.id));

  if (targetDepts.length === 0) return {};

  const result: Record<string, { id: string; fullName: string }[]> = {};

  for (const dept of targetDepts) {
    const members = await db.query.userDepartment.findMany({
      where: eq(userDepartment.departmentId, dept.id),
      with: {
        user: { columns: { id: true, fullName: true } },
      },
    });

    result[dept.id] = members.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
    }));
  }

  return result;
}

export async function getDepartmentSubordinates(departmentId: string) {
  const session = await auth();
  if (!session?.user) return [];

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId),
    columns: { bossId: true },
  });

  const members = await db.query.userDepartment.findMany({
    where: eq(userDepartment.departmentId, departmentId),
    with: {
      user: { columns: { id: true, fullName: true, email: true } },
    },
  });

  return members.map((m) => ({
    id: m.user.id,
    fullName: m.user.fullName,
    email: m.user.email,
  }));
}

// ── Task CRUD ───────────────────────────────────────────────────────────────

export async function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed" | "cancelled"
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, assignedTo: true, departmentId: true, title: true, status: true },
  });
  if (!task) throw new Error("Task not found");

  // Any authenticated user who can view the task may edit it.

  const now = new Date();
  const updateData: Record<string, unknown> = { status, updatedAt: now };

  if (status === "completed") {
    updateData.completedAt = now;
  } else if (task.status === "completed") {
    updateData.completedAt = null;
  }

  await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, taskId));

  if (task.status !== status) {
    await recordActivity(taskId, user.id, {
      action: "status_changed",
      field: "status",
      oldValue: STATUS_LABELS[task.status] ?? task.status,
      newValue: STATUS_LABELS[status] ?? status,
    });
  }

  if (status === "in_progress" || status === "completed" || status === "cancelled") {
    const [creatorUser, changerUser] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, task.createdBy), columns: { email: true, fullName: true } }),
      db.query.users.findFirst({ where: eq(users.id, user.id), columns: { fullName: true } }),
    ]);

    if (creatorUser) {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      await sendStatusChangeEmail(creatorUser.email, creatorUser.fullName, {
        taskTitle: task.title,
        taskUrl: `${baseUrl}/tasks/${taskId}`,
        newStatus: status,
        changedByName: changerUser?.fullName || "Someone",
      });
    }
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskPriority(
  taskId: string,
  priority: TaskPriority
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, assignedTo: true, departmentId: true, priority: true },
  });
  if (!task) throw new Error("Task not found");

  // Any authenticated user who can view the task may edit it.

  await db
    .update(tasks)
    .set({
      priority,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  if (task.priority !== priority) {
    await recordActivity(taskId, user.id, {
      action: "priority_changed",
      field: "priority",
      oldValue: PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority,
      newValue: PRIORITY_LABELS[priority] ?? priority,
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

async function isDevelopmentMember(userId: string, userEmail: string | null | undefined) {
  if (userEmail === ADMIN_EMAIL) return true;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: { department: { columns: { name: true } } },
  });

  return ud?.department?.name === "Development";
}

export async function updateTaskWaitingForBundle(taskId: string, waitingForBundle: boolean) {
  const user = await requireAuth();

  const isDev = await isDevelopmentMember(user.id, user.email);
  if (!isDev) {
    throw new Error("Only the Development department can change the bundle status");
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { departmentId: true, waitingForBundle: true },
    with: { department: { columns: { name: true } } },
  });
  if (!task) throw new Error("Task not found");

  if (task.department?.name !== "Development") {
    throw new Error("Bundle status only applies to Development tasks");
  }

  await db
    .update(tasks)
    .set({ waitingForBundle, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.waitingForBundle !== waitingForBundle) {
    await recordActivity(taskId, user.id, {
      action: "bundle_changed",
      field: "waitingForBundle",
      oldValue: task.waitingForBundle ? "Waiting for bundle" : "Ready",
      newValue: waitingForBundle ? "Waiting for bundle" : "Ready",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

const DEV_TARGET_VALUES = ["task_manager", "web_app", "mobile_app", "both"] as const;
type DevTarget = (typeof DEV_TARGET_VALUES)[number];

export async function updateTaskDevTarget(taskId: string, devTarget: DevTarget | null) {
  const user = await requireAuth();

  const isDev = await isDevelopmentMember(user.id, user.email);
  if (!isDev) {
    throw new Error("Only the Development department can change the task target");
  }

  if (devTarget !== null && !DEV_TARGET_VALUES.includes(devTarget)) {
    throw new Error("Invalid task target");
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { departmentId: true, devTarget: true },
    with: { department: { columns: { name: true } } },
  });
  if (!task) throw new Error("Task not found");

  if (task.department?.name !== "Development") {
    throw new Error("Task target only applies to Development tasks");
  }

  await db
    .update(tasks)
    .set({ devTarget, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.devTarget !== devTarget) {
    await recordActivity(taskId, user.id, {
      action: "target_changed",
      field: "devTarget",
      oldValue: task.devTarget ? DEV_TARGET_LABELS[task.devTarget] ?? task.devTarget : "Not specified",
      newValue: devTarget ? DEV_TARGET_LABELS[devTarget] ?? devTarget : "Not specified",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Shared guard for editable task attributes (effort, value, category).
 * Any authenticated user who can view the task may edit it.
 */
async function assertCanEditTaskAttributes(taskId: string) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, effort: true, value: true, category: true },
  });
  if (!task) throw new Error("Task not found");

  return { user, task };
}

export async function updateTaskEffort(taskId: string, effort: TaskEffort | null) {
  if (effort !== null && !TASK_EFFORTS.includes(effort)) {
    throw new Error("Invalid effort value");
  }

  const { user, task } = await assertCanEditTaskAttributes(taskId);

  await db
    .update(tasks)
    .set({ effort, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.effort !== effort) {
    await recordActivity(taskId, user.id, {
      action: "effort_changed",
      field: "effort",
      oldValue: task.effort ? EFFORT_LABELS[task.effort] ?? task.effort : "Not specified",
      newValue: effort ? EFFORT_LABELS[effort] ?? effort : "Not specified",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskValue(taskId: string, value: TaskValue | null) {
  if (value !== null && !TASK_VALUES.includes(value)) {
    throw new Error("Invalid value");
  }

  const { user, task } = await assertCanEditTaskAttributes(taskId);

  await db
    .update(tasks)
    .set({ value, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.value !== value) {
    await recordActivity(taskId, user.id, {
      action: "value_changed",
      field: "value",
      oldValue: task.value ? VALUE_LABELS[task.value] ?? task.value : "Not specified",
      newValue: value ? VALUE_LABELS[value] ?? value : "Not specified",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskCategory(taskId: string, category: TaskCategory | null) {
  if (category !== null && !TASK_CATEGORIES.includes(category)) {
    throw new Error("Invalid category");
  }

  const { user, task } = await assertCanEditTaskAttributes(taskId);

  await db
    .update(tasks)
    .set({ category, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.category !== category) {
    await recordActivity(taskId, user.id, {
      action: "category_changed",
      field: "category",
      oldValue: task.category ? CATEGORY_LABELS[task.category] ?? task.category : "Not specified",
      newValue: category ? CATEGORY_LABELS[category] ?? category : "Not specified",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskPlanningStage(
  taskId: string,
  planningStage: "draft" | "brainstorming" | "discussed" | null
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, assignedTo: true, departmentId: true, planningStage: true },
  });
  if (!task) throw new Error("Task not found");

  // Any authenticated user who can view the task may edit it.

  await db
    .update(tasks)
    .set({ planningStage, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.planningStage !== planningStage) {
    await recordActivity(taskId, user.id, {
      action: "planning_stage_changed",
      field: "planningStage",
      oldValue: task.planningStage ? PLANNING_STAGE_LABELS[task.planningStage] : "Standard task",
      newValue: planningStage ? PLANNING_STAGE_LABELS[planningStage] : "Standard task",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskAssignee(
  taskId: string,
  assignedTo: string | null
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, departmentId: true, title: true, description: true, priority: true, dueDate: true, assignedTo: true },
  });
  if (!task) throw new Error("Task not found");

  // Reassignment is restricted to department bosses, Executive members and admin.
  let allowed = isAdminUser(user);

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    const ud = await db.query.userDepartment.findFirst({
      where: eq(userDepartment.userId, user.id),
      with: { department: { columns: { name: true } } },
    });
    if (ud?.department?.name?.toLowerCase() === "executive") allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to change the assignee");
  }

  await db
    .update(tasks)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (task.assignedTo !== assignedTo) {
    const [oldName, newName] = await Promise.all([
      getUserName(task.assignedTo),
      getUserName(assignedTo),
    ]);
    await recordActivity(taskId, user.id, {
      action: "assignee_changed",
      field: "assignedTo",
      oldValue: oldName,
      newValue: newName,
    });
  }

  if (assignedTo) {
    const [assigneeUser, creatorUser, deptInfo] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, assignedTo), columns: { email: true, fullName: true } }),
      db.query.users.findFirst({ where: eq(users.id, task.createdBy), columns: { fullName: true } }),
      task.departmentId
        ? db.query.departments.findFirst({ where: eq(departments.id, task.departmentId), columns: { name: true } })
        : null,
    ]);

    if (assigneeUser) {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      sendTaskCreatedEmail(assigneeUser.email, assigneeUser.fullName, {
        taskTitle: task.title,
        taskDescription: task.description,
        priority: task.priority,
        creatorName: creatorUser?.fullName || "Someone",
        departmentName: deptInfo?.name ?? null,
        dueDate: task.dueDate
          ? new Date(task.dueDate).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" })
          : null,
        taskUrl: `${baseUrl}/tasks/${taskId}`,
        reason: "assigned",
      });
    }
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTask(
  taskId: string,
  data: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    assignedTo: string | null;
    departmentId?: string | null;
  }
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, departmentId: true, status: true, title: true, description: true, priority: true, assignedTo: true },
  });
  if (!task) throw new Error("Task not found");

  // Any authenticated user who can view the task may edit it, including the
  // department. When the department changes we drop the current assignee, since
  // that person belongs to the previous department. Only Executive members (and
  // admin) may pick a new assignee inside the destination department; everyone
  // else can only move the task away, leaving it unassigned.
  const deptChanged =
    data.departmentId !== undefined && data.departmentId !== task.departmentId;

  let effectiveAssignedTo = data.assignedTo;
  if (deptChanged) {
    const canAssignInNewDept = isAdminUser(user) || (await isExecutiveMember(user.id));
    if (canAssignInNewDept && data.assignedTo && data.departmentId) {
      // Validate the chosen assignee actually belongs to the new department.
      const membership = await db.query.userDepartment.findFirst({
        where: and(
          eq(userDepartment.userId, data.assignedTo),
          eq(userDepartment.departmentId, data.departmentId)
        ),
        columns: { userId: true },
      });
      effectiveAssignedTo = membership ? data.assignedTo : null;
    } else {
      effectiveAssignedTo = null;
    }
  }

  const now = new Date();
  const updatePayload: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    priority: data.priority,
    status: data.status,
    assignedTo: effectiveAssignedTo,
    updatedAt: now,
  };

  if (data.status === "completed" && task.status !== "completed") {
    updatePayload.completedAt = now;
  } else if (data.status !== "completed" && task.status === "completed") {
    updatePayload.completedAt = null;
  }

  if (data.departmentId !== undefined) {
    updatePayload.departmentId = data.departmentId;

    // Dev-only fields only make sense for the Development department.
    // If the task is moved to any other department (or none), clear them.
    let newDeptName: string | null = null;
    if (data.departmentId) {
      const newDept = await db.query.departments.findFirst({
        where: eq(departments.id, data.departmentId),
        columns: { name: true },
      });
      newDeptName = newDept?.name ?? null;
    }
    if (newDeptName !== "Development") {
      updatePayload.waitingForBundle = false;
      updatePayload.devTarget = null;
    }
  }

  await db
    .update(tasks)
    .set(updatePayload)
    .where(eq(tasks.id, taskId));

  // Record field-level history for the changes made in the edit form.
  if (task.title !== data.title) {
    await recordActivity(taskId, user.id, {
      action: "title_changed",
      field: "title",
      oldValue: task.title,
      newValue: data.title,
    });
  }
  if ((task.description ?? "") !== (data.description ?? "")) {
    await recordActivity(taskId, user.id, {
      action: "description_changed",
      field: "description",
      oldValue: task.description ?? "(empty)",
      newValue: data.description ?? "(empty)",
    });
  }
  if (task.priority !== data.priority) {
    await recordActivity(taskId, user.id, {
      action: "priority_changed",
      field: "priority",
      oldValue: PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority,
      newValue: PRIORITY_LABELS[data.priority] ?? data.priority,
    });
  }
  if (task.status !== data.status) {
    await recordActivity(taskId, user.id, {
      action: "status_changed",
      field: "status",
      oldValue: STATUS_LABELS[task.status] ?? task.status,
      newValue: STATUS_LABELS[data.status] ?? data.status,
    });
  }
  if (task.assignedTo !== effectiveAssignedTo) {
    const [oldName, newName] = await Promise.all([
      getUserName(task.assignedTo),
      getUserName(effectiveAssignedTo),
    ]);
    await recordActivity(taskId, user.id, {
      action: "assignee_changed",
      field: "assignedTo",
      oldValue: oldName,
      newValue: newName,
    });
  }
  if (deptChanged) {
    const [oldName, newName] = await Promise.all([
      getDepartmentName(task.departmentId),
      getDepartmentName(data.departmentId),
    ]);
    await recordActivity(taskId, user.id, {
      action: "department_changed",
      field: "departmentId",
      oldValue: oldName,
      newValue: newName,
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskDueDate(taskId: string, dueDateStr: string | null) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { assignedTo: true, departmentId: true, priority: true, createdAt: true, dueDate: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = isAdminUser(user) || task.assignedTo === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("Only the assignee or department manager can set the due date");
  }

  const dueDate = dueDateStr?.trim() ? new Date(`${dueDateStr.trim()}T12:00:00`) : null;

  if (dueDate) {
    const priority = task.priority as TaskPriority;
    if (!isDueDateWithinPriorityLimit(dueDate, priority, task.createdAt)) {
      const label = PRIORITY_LABELS[priority];
      throw new Error(`Due date must be within the ${label} window (from today through the priority limit)`);
    }
  }

  await db
    .update(tasks)
    .set({ dueDate, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" }) : "No due date";
  if (fmtDate(task.dueDate) !== fmtDate(dueDate)) {
    await recordActivity(taskId, user.id, {
      action: "due_date_changed",
      field: "dueDate",
      oldValue: fmtDate(task.dueDate),
      newValue: fmtDate(dueDate),
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTask(taskId: string) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = isAdminUser(user) || task.createdBy === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to delete this task");
  }

  await db.delete(taskImages).where(eq(taskImages.taskId, taskId));
  await db.delete(tasks).where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
}

// ── Approval ────────────────────────────────────────────────────────────────

export async function getUserDepartmentInfo(userId: string) {
  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: {
      department: { columns: { id: true, bossId: true } },
    },
  });
  return ud ?? null;
}

export async function approveTask(taskId: string) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, approval: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  if (task.approval === "pending_approval") {
    const creatorBossId = await getBossForUser(task.createdBy);
    if (creatorBossId !== user.id) {
      throw new Error("Only the creator's department coordinator can approve at this stage");
    }

    const creatorDeptInfo = await getUserDepartmentInfo(task.createdBy);
    const creatorDeptId = creatorDeptInfo?.departmentId ?? null;
    const isSameDept = task.departmentId && task.departmentId === creatorDeptId;

    if (!task.departmentId || isSameDept) {
      await db
        .update(tasks)
        .set({
          approval: "approved",
          ownBossApproved: true,
          approvedBy: user.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      await recordActivity(taskId, user.id, { action: "approved", newValue: "Approved" });
    } else {
      await db
        .update(tasks)
        .set({
          approval: "pending_dept_approval",
          ownBossApproved: true,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      await recordActivity(taskId, user.id, {
        action: "coordinator_approved",
        newValue: "Approved by coordinator — forwarded to department",
      });
    }
  } else if (task.approval === "pending_dept_approval") {
    if (!task.departmentId) throw new Error("Task has no target department");
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId !== user.id) {
      throw new Error("Only the target department coordinator can approve at this stage");
    }

    await db
      .update(tasks)
      .set({
        approval: "approved",
        approvedBy: user.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await recordActivity(taskId, user.id, { action: "approved", newValue: "Approved" });
  } else {
    throw new Error("Task is not awaiting approval");
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function rejectTask(taskId: string) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, approval: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  if (task.approval === "pending_approval") {
    const creatorBossId = await getBossForUser(task.createdBy);
    if (creatorBossId !== user.id) {
      throw new Error("Only the creator's department coordinator can reject at this stage");
    }
  } else if (task.approval === "pending_dept_approval") {
    if (!task.departmentId) throw new Error("Task has no target department");
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId !== user.id) {
      throw new Error("Only the target department coordinator can reject at this stage");
    }
  } else {
    throw new Error("Task is not awaiting approval");
  }

  await db
    .update(tasks)
    .set({
      approval: "rejected",
      approvedBy: user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await recordActivity(taskId, user.id, { action: "rejected", newValue: "Rejected" });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function assignTaskToUser(taskId: string, assignedTo: string) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { departmentId: true, approval: true, title: true, description: true, priority: true, dueDate: true, createdBy: true },
  });
  if (!task) throw new Error("Task not found");
  if (task.approval !== "approved") throw new Error("Task must be approved first");

  if (task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId !== user.id) {
      throw new Error("Only the department coordinator can assign this task");
    }
  }

  await db
    .update(tasks)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  await recordActivity(taskId, user.id, {
    action: "assignee_changed",
    field: "assignedTo",
    oldValue: "Unassigned",
    newValue: await getUserName(assignedTo),
  });

  const [assigneeUser, creatorUser, deptInfo] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, assignedTo), columns: { email: true, fullName: true } }),
    db.query.users.findFirst({ where: eq(users.id, task.createdBy), columns: { fullName: true } }),
    task.departmentId
      ? db.query.departments.findFirst({ where: eq(departments.id, task.departmentId), columns: { name: true } })
      : null,
  ]);

  if (assigneeUser) {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    sendTaskCreatedEmail(assigneeUser.email, assigneeUser.fullName, {
      taskTitle: task.title,
      taskDescription: task.description,
      priority: task.priority,
      creatorName: creatorUser?.fullName || "Someone",
      departmentName: deptInfo?.name ?? null,
      dueDate: task.dueDate
        ? new Date(task.dueDate).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" })
        : null,
      taskUrl: `${baseUrl}/tasks/${taskId}`,
      reason: "assigned",
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// ── Admin: Hierarchy ────────────────────────────────────────────────────────

export async function getAllActiveUsers() {
  await requireAdmin();

  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        inArray(users.role, ["MHP_LORD", "SALES_DIRECTOR", "DIRECTOR"])
      )
    )
    .orderBy(users.fullName);
}

export async function getHierarchy() {
  await requireAdmin();

  return db.query.userHierarchy.findMany({
    with: {
      user: { columns: { id: true, fullName: true, email: true } },
      boss: { columns: { id: true, fullName: true, email: true } },
    },
  });
}

export async function updateUserBoss(userId: string, bossId: string | null) {
  await requireAdmin();

  if (!bossId) {
    await db
      .delete(userHierarchy)
      .where(eq(userHierarchy.userId, userId));
  } else {
    const existing = await db.query.userHierarchy.findFirst({
      where: eq(userHierarchy.userId, userId),
    });

    if (existing) {
      await db
        .update(userHierarchy)
        .set({ bossId })
        .where(eq(userHierarchy.userId, userId));
    } else {
      await db.insert(userHierarchy).values({ userId, bossId });
    }
  }

  revalidatePath("/admin/hierarchy");
}

// ── Admin: Departments ──────────────────────────────────────────────────────

export async function getDepartments() {
  await requireAdmin();
  return db.query.departments.findMany({
    columns: { id: true, name: true, bossId: true },
    with: {
      boss: { columns: { id: true, fullName: true } },
    },
    orderBy: [departments.name],
  });
}

export async function updateDepartmentBoss(departmentId: string, bossId: string | null) {
  await requireAdmin();

  await db
    .update(departments)
    .set({ bossId })
    .where(eq(departments.id, departmentId));

  revalidatePath("/admin/hierarchy");
}

export async function getUserDepartments() {
  await requireAdmin();
  return db.query.userDepartment.findMany({
    with: {
      department: { columns: { id: true, name: true } },
    },
  });
}

export async function updateUserDepartment(userId: string, departmentId: string | null) {
  await requireAdmin();

  if (!departmentId) {
    await db
      .delete(userDepartment)
      .where(eq(userDepartment.userId, userId));
  } else {
    const existing = await db.query.userDepartment.findFirst({
      where: eq(userDepartment.userId, userId),
    });

    if (existing) {
      await db
        .update(userDepartment)
        .set({ departmentId })
        .where(eq(userDepartment.userId, userId));
    } else {
      await db.insert(userDepartment).values({ userId, departmentId });
    }
  }

  revalidatePath("/admin/hierarchy");
}

// ── Task queries ────────────────────────────────────────────────────────────

async function resolveImageUrls(
  images: { id: string; imageUrl: string; originalName: string }[]
) {
  return Promise.all(
    images.map(async (img) => ({
      id: img.id,
      imageUrl: await getSignedImageUrl(img.imageUrl),
      s3Key: img.imageUrl,
      originalName: img.originalName,
    }))
  );
}

export async function getCurrentUserDepartment() {
  const session = await auth();
  if (!session?.user) return null;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, session.user.id),
    with: { department: { columns: { id: true, name: true } } },
  });

  if (!ud?.department) return null;
  return { id: ud.departmentId, name: ud.department.name };
}

export async function getTasksForUser() {
  const session = await auth();
  if (!session?.user) return [];

  const userId = session.user.id;

  const myDept = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    with: {
      department: { columns: { name: true } },
    },
  });

  const isExecutive = myDept?.department?.name?.toLowerCase() === "executive";
  const canSeeAllTasks = isExecutive || session.user.email === ADMIN_EMAIL;

  let allTasks;

  if (canSeeAllTasks) {
    allTasks = await db.query.tasks.findMany({
      with: {
        creator: true,
        assignee: true,
        department: true,
        images: true,
      },
      orderBy: [desc(tasks.createdAt)],
    });
  } else {
    const bossDepts = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.bossId, userId));

    const bossDeptIds = bossDepts.map((d) => d.id);

    const conditions = [
      eq(tasks.createdBy, userId),
      eq(tasks.assignedTo, userId),
    ];

    if (myDept) {
      conditions.push(eq(tasks.departmentId, myDept.departmentId));
    }

    if (bossDeptIds.length > 0) {
      conditions.push(inArray(tasks.departmentId, bossDeptIds));

      const subordinateUds = await db.query.userDepartment.findMany({
        where: inArray(userDepartment.departmentId, bossDeptIds),
        columns: { userId: true },
      });
      const subordinateUserIds = subordinateUds.map((ud) => ud.userId);
      if (subordinateUserIds.length > 0) {
        conditions.push(inArray(tasks.createdBy, subordinateUserIds));
      }
    }

    allTasks = await db.query.tasks.findMany({
      where: or(...conditions),
      with: {
        creator: true,
        assignee: true,
        department: true,
        images: true,
      },
      orderBy: [desc(tasks.createdAt)],
    });
  }

  const creatorIds = [...new Set(allTasks.map((t) => t.createdBy))];
  const creatorDepts =
    creatorIds.length > 0
      ? await db.query.userDepartment.findMany({
          where: inArray(userDepartment.userId, creatorIds),
          columns: { userId: true, departmentId: true },
        })
      : [];
  const creatorDeptMap = Object.fromEntries(
    creatorDepts.map((ud) => [ud.userId, ud.departmentId])
  );

  return allTasks.map((t) => ({
    ...t,
    creatorDeptId: creatorDeptMap[t.createdBy] ?? null,
  }));
}

export async function getTaskById(id: string) {
  const session = await auth();
  if (!session?.user) return null;

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      creator: true,
      assignee: true,
      department: true,
      images: true,
    },
  });

  if (!task) return null;

  const resolvedImages = await resolveImageUrls(task.images);

  return {
    ...task,
    images: resolvedImages,
  };
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function getTaskComments(taskId: string) {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.taskComments.findMany({
    where: eq(taskComments.taskId, taskId),
    with: {
      user: { columns: { id: true, fullName: true, email: true } },
      images: { columns: { id: true, imageUrl: true, originalName: true } },
    },
    orderBy: [asc(taskComments.createdAt)],
  });

  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      userId: c.userId,
      author: c.user ? { id: c.user.id, fullName: c.user.fullName, email: c.user.email } : null,
      images: await resolveImageUrls(c.images),
    }))
  );
}

export async function addTaskComment(
  taskId: string,
  content: string,
  imageKeys?: { s3Key: string; originalName: string }[]
) {
  const user = await requireAuth();

  const trimmed = content.trim();
  const hasImages = !!imageKeys && imageKeys.length > 0;
  if (!trimmed && !hasImages) throw new Error("Comment cannot be empty");
  if (trimmed.length > 5000) throw new Error("Comment is too long");

  // Any authenticated user who can view the task may comment.
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true },
  });
  if (!task) throw new Error("Task not found");

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId,
      userId: user.id,
      content: trimmed,
    })
    .returning();

  if (hasImages) {
    await db.insert(taskCommentImages).values(
      imageKeys!.map((img) => ({
        commentId: comment.id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTaskComment(commentId: string) {
  const user = await requireAuth();

  const comment = await db.query.taskComments.findFirst({
    where: eq(taskComments.id, commentId),
    columns: { id: true, userId: true, taskId: true },
  });
  if (!comment) throw new Error("Comment not found");

  const allowed = isAdminUser(user) || comment.userId === user.id;
  if (!allowed) throw new Error("You can only delete your own comments");

  await db.delete(taskComments).where(eq(taskComments.id, commentId));

  revalidatePath(`/tasks/${comment.taskId}`);
}

// ── Activity / history ────────────────────────────────────────────────────────

export async function getTaskActivity(taskId: string) {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.taskActivity.findMany({
    where: eq(taskActivity.taskId, taskId),
    with: { user: { columns: { id: true, fullName: true } } },
    orderBy: [desc(taskActivity.createdAt)],
  });

  return rows.map((a) => ({
    id: a.id,
    action: a.action,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    createdAt: a.createdAt,
    user: a.user ? { id: a.user.id, fullName: a.user.fullName } : null,
  }));
}
