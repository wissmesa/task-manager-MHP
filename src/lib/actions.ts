"use server";

import { db } from "@/db";
import { tasks, taskImages, users, userHierarchy, departments, userDepartment } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc, inArray, and, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSignedImageUrl } from "@/lib/s3";
import { sendTaskCreatedEmail } from "@/lib/mail";

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

  const bossDepts = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.bossId, session.user.id));

  if (bossDepts.length === 0) return {};

  const result: Record<string, { id: string; fullName: string }[]> = {};

  for (const dept of bossDepts) {
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
    columns: { createdBy: true, assignedTo: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = task.createdBy === user.id || task.assignedTo === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    const creatorBossId = await getBossForUser(task.createdBy);
    if (creatorBossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to change this task's status");
  }

  await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskPriority(
  taskId: string,
  priority: "low" | "medium" | "high" | "urgent"
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, assignedTo: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = task.createdBy === user.id || task.assignedTo === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    const creatorBossId = await getBossForUser(task.createdBy);
    if (creatorBossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to change this task's priority");
  }

  await db
    .update(tasks)
    .set({ priority, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

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
    columns: { createdBy: true, departmentId: true, title: true, description: true, priority: true, dueDate: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = task.createdBy === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to change the assignee");
  }

  await db
    .update(tasks)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

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
    priority: "low" | "medium" | "high" | "urgent";
    status: "pending" | "in_progress" | "completed" | "cancelled";
    assignedTo: string | null;
    dueDate: string | null;
  }
) {
  const user = await requireAuth();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { createdBy: true, departmentId: true },
  });
  if (!task) throw new Error("Task not found");

  let allowed = task.createdBy === user.id;

  if (!allowed && task.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, task.departmentId),
      columns: { bossId: true },
    });
    if (dept?.bossId === user.id) allowed = true;
  }

  if (!allowed) {
    throw new Error("You don't have permission to edit this task");
  }

  await db
    .update(tasks)
    .set({
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status,
      assignedTo: data.assignedTo,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
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
    } else {
      await db
        .update(tasks)
        .set({
          approval: "pending_dept_approval",
          ownBossApproved: true,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
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

export async function getTasksForUser() {
  const session = await auth();
  if (!session?.user) return [];

  const userId = session.user.id;

  const bossDepts = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.bossId, userId));

  const bossDeptIds = bossDepts.map((d) => d.id);

  const conditions = [
    eq(tasks.createdBy, userId),
    eq(tasks.assignedTo, userId),
  ];

  const myDept = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, userId),
    columns: { departmentId: true },
  });
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

  const allTasks = await db.query.tasks.findMany({
    where: or(...conditions),
    with: {
      creator: true,
      assignee: true,
      department: true,
      images: true,
    },
    orderBy: [desc(tasks.createdAt)],
  });

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
