"use server";

import { db } from "@/db";
import {
  ongoingResponsibilities,
  ongoingResponsibilityActivity,
  ongoingResponsibilityComments,
  ongoingResponsibilityImages,
  ongoingCommentImages,
  departments,
  userDepartment,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, inArray, or, asc, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

const ADMIN_EMAIL = "luis@bluepaperclip.com";

type SessionUser = { id: string; email?: string | null };

export interface OngoingResponsibilityDTO {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  departmentId: string;
  departmentName: string | null;
  isActive: boolean;
  createdBy: string;
  creatorName: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: string;
  images: ResolvedImage[];
  canToggle: boolean;
  canManage: boolean;
}

async function recordOngoingActivity(entry: {
  responsibilityId: string;
  userId: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  try {
    await db.insert(ongoingResponsibilityActivity).values({
      responsibilityId: entry.responsibilityId,
      userId: entry.userId,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    });
  } catch (err) {
    console.error("Failed to record ongoing responsibility activity:", err);
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

/** View/comment permission: admin, assignee, creator, same-department member, dept boss, executive. */
async function canToggle(
  user: SessionUser,
  item: { departmentId: string; assignedTo: string | null; createdBy: string }
): Promise<boolean> {
  if (user.email === ADMIN_EMAIL) return true;
  if (item.assignedTo === user.id) return true;
  if (item.createdBy === user.id) return true;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, user.id),
    with: { department: { columns: { name: true } } },
  });
  if (ud) {
    if (ud.departmentId === item.departmentId) return true;
    if (ud.department?.name?.toLowerCase() === "executive") return true;
  }

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, item.departmentId),
    columns: { bossId: true },
  });
  if (dept?.bossId === user.id) return true;

  return false;
}

/** Edit/delete permission (stricter): admin, creator, dept boss, executive. */
async function canManage(
  user: SessionUser,
  item: { departmentId: string; createdBy: string }
): Promise<boolean> {
  if (user.email === ADMIN_EMAIL) return true;
  if (item.createdBy === user.id) return true;

  const ud = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, user.id),
    with: { department: { columns: { name: true } } },
  });
  if (ud?.department?.name?.toLowerCase() === "executive") return true;

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, item.departmentId),
    columns: { bossId: true },
  });
  if (dept?.bossId === user.id) return true;

  return false;
}

export async function getOngoingResponsibilitiesForUser(): Promise<
  OngoingResponsibilityDTO[]
> {
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
  } as const;

  let rows;
  if (canSeeAll) {
    rows = await db.query.ongoingResponsibilities.findMany({
      with: withRels,
      orderBy: [desc(ongoingResponsibilities.createdAt)],
    });
  } else {
    const conditions = [
      eq(ongoingResponsibilities.createdBy, userId),
      eq(ongoingResponsibilities.assignedTo, userId),
    ];
    if (myDeptId) conditions.push(eq(ongoingResponsibilities.departmentId, myDeptId));
    if (bossDeptIds.size > 0) {
      conditions.push(
        inArray(ongoingResponsibilities.departmentId, [...bossDeptIds])
      );
    }

    rows = await db.query.ongoingResponsibilities.findMany({
      where: or(...conditions),
      with: withRels,
      orderBy: [desc(ongoingResponsibilities.createdAt)],
    });
  }

  const canToggleItem = (r: (typeof rows)[number]) =>
    isAdmin ||
    isExecutive ||
    r.assignedTo === userId ||
    r.createdBy === userId ||
    (myDeptId != null && r.departmentId === myDeptId) ||
    bossDeptIds.has(r.departmentId);

  const canManageItem = (r: (typeof rows)[number]) =>
    isAdmin || isExecutive || r.createdBy === userId || bossDeptIds.has(r.departmentId);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    instructions: r.instructions,
    departmentId: r.departmentId,
    departmentName: r.department?.name ?? null,
    isActive: r.isActive,
    createdBy: r.createdBy,
    creatorName: r.creator?.fullName ?? null,
    assignedTo: r.assignedTo,
    assigneeName: r.assignee?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    // Instruction images are only needed on the detail view, skip signing here.
    images: [],
    canToggle: canToggleItem(r),
    canManage: canManageItem(r),
  }));
}

export async function getOngoingResponsibilityById(
  id: string
): Promise<OngoingResponsibilityDTO | null> {
  const session = await auth();
  if (!session?.user) return null;

  const r = await db.query.ongoingResponsibilities.findFirst({
    where: eq(ongoingResponsibilities.id, id),
    with: {
      creator: { columns: { fullName: true } },
      assignee: { columns: { fullName: true } },
      department: { columns: { name: true } },
      images: { columns: { id: true, imageUrl: true, originalName: true } },
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
    isActive: r.isActive,
    createdBy: r.createdBy,
    creatorName: r.creator?.fullName ?? null,
    assignedTo: r.assignedTo,
    assigneeName: r.assignee?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    images: resolvedImages,
    canToggle: canToggleFlag,
    canManage: canManageFlag,
  };
}

export async function createOngoingResponsibility(input: {
  title: string;
  description?: string;
  instructions?: string;
  departmentId: string;
  assignedTo?: string | null;
  imageKeys?: ImageKeyInput[];
}): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!input.departmentId) throw new Error("Department is required");
  if (!input.assignedTo) throw new Error("A responsible person is required");

  const [row] = await db
    .insert(ongoingResponsibilities)
    .values({
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      departmentId: input.departmentId,
      createdBy: session.user.id,
      assignedTo: input.assignedTo || null,
    })
    .returning();

  if (input.imageKeys && input.imageKeys.length > 0) {
    await db.insert(ongoingResponsibilityImages).values(
      input.imageKeys.map((img) => ({
        responsibilityId: row.id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  await recordOngoingActivity({
    responsibilityId: row.id,
    userId: session.user.id,
    action: "created",
    newValue: "Responsibility created",
  });

  revalidatePath("/responsibilities");
  return row.id;
}

export async function updateOngoingResponsibility(
  id: string,
  input: {
    title: string;
    description?: string;
    instructions?: string;
    departmentId: string;
    assignedTo?: string | null;
    imageKeys?: ImageKeyInput[];
    removedImageIds?: string[];
  }
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const item = await db.query.ongoingResponsibilities.findFirst({
    where: eq(ongoingResponsibilities.id, id),
    columns: {
      id: true,
      title: true,
      description: true,
      instructions: true,
      departmentId: true,
      createdBy: true,
      assignedTo: true,
    },
  });
  if (!item) throw new Error("Responsibility not found");

  const allowed = await canManage(session.user, item);
  if (!allowed) throw new Error("You don't have permission to edit this responsibility");

  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!input.departmentId) throw new Error("Department is required");

  await db
    .update(ongoingResponsibilities)
    .set({
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      departmentId: input.departmentId,
      assignedTo: input.assignedTo || null,
      updatedAt: new Date(),
    })
    .where(eq(ongoingResponsibilities.id, id));

  // Remove instruction images the user deleted.
  if (input.removedImageIds && input.removedImageIds.length > 0) {
    await db
      .delete(ongoingResponsibilityImages)
      .where(
        and(
          eq(ongoingResponsibilityImages.responsibilityId, id),
          inArray(ongoingResponsibilityImages.id, input.removedImageIds)
        )
      );
  }

  // Add newly attached instruction images.
  if (input.imageKeys && input.imageKeys.length > 0) {
    await db.insert(ongoingResponsibilityImages).values(
      input.imageKeys.map((img) => ({
        responsibilityId: id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  const uid = session.user.id;
  const newAssigneeId = input.assignedTo || null;
  const newDescription = input.description?.trim() || null;
  const newInstructions = input.instructions?.trim() || null;
  if (item.title !== title) {
    await recordOngoingActivity({
      responsibilityId: id,
      userId: uid,
      action: "title_changed",
      oldValue: item.title,
      newValue: title,
    });
  }
  if ((item.description ?? null) !== newDescription) {
    await recordOngoingActivity({
      responsibilityId: id,
      userId: uid,
      action: "description_changed",
    });
  }
  if ((item.instructions ?? null) !== newInstructions) {
    await recordOngoingActivity({
      responsibilityId: id,
      userId: uid,
      action: "instructions_changed",
    });
  }
  if (item.departmentId !== input.departmentId) {
    await recordOngoingActivity({
      responsibilityId: id,
      userId: uid,
      action: "department_changed",
      oldValue: (await getDepartmentName(item.departmentId)) ?? undefined,
      newValue: (await getDepartmentName(input.departmentId)) ?? undefined,
    });
  }
  if ((item.assignedTo ?? null) !== newAssigneeId) {
    await recordOngoingActivity({
      responsibilityId: id,
      userId: uid,
      action: "assignee_changed",
      oldValue: (await getUserName(item.assignedTo)) ?? "Unassigned",
      newValue: (await getUserName(newAssigneeId)) ?? "Unassigned",
    });
  }

  revalidatePath("/responsibilities");
  revalidatePath(`/responsibilities/ongoing/${id}`);
}

export async function toggleOngoingActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const item = await db.query.ongoingResponsibilities.findFirst({
    where: eq(ongoingResponsibilities.id, id),
    columns: { id: true, departmentId: true, assignedTo: true, createdBy: true, isActive: true },
  });
  if (!item) throw new Error("Responsibility not found");

  const allowed = await canToggle(session.user, item);
  if (!allowed) throw new Error("You don't have permission to update this responsibility");

  if (item.isActive !== isActive) {
    await db
      .update(ongoingResponsibilities)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(ongoingResponsibilities.id, id));

    await recordOngoingActivity({
      responsibilityId: id,
      userId: session.user.id,
      action: "active_changed",
      oldValue: item.isActive ? "Active" : "Inactive",
      newValue: isActive ? "Active" : "Inactive",
    });
  }

  revalidatePath("/responsibilities");
  revalidatePath(`/responsibilities/ongoing/${id}`);
}

export async function deleteOngoingResponsibility(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const item = await db.query.ongoingResponsibilities.findFirst({
    where: eq(ongoingResponsibilities.id, id),
    columns: { id: true, departmentId: true, createdBy: true },
  });
  if (!item) return;

  const allowed = await canManage(session.user, item);
  if (!allowed) throw new Error("You don't have permission to delete this responsibility");

  await db.delete(ongoingResponsibilities).where(eq(ongoingResponsibilities.id, id));
  revalidatePath("/responsibilities");
}

// ── Comments & activity ──────────────────────────────────────────────────────

export interface OngoingCommentItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  author: { id: string; fullName: string; email: string } | null;
  images: ResolvedImage[];
}

export interface OngoingActivityItem {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; fullName: string } | null;
}

export async function getOngoingResponsibilityComments(
  responsibilityId: string
): Promise<OngoingCommentItem[]> {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.ongoingResponsibilityComments.findMany({
    where: eq(ongoingResponsibilityComments.responsibilityId, responsibilityId),
    with: {
      user: { columns: { id: true, fullName: true, email: true } },
      images: { columns: { id: true, imageUrl: true, originalName: true } },
    },
    orderBy: [asc(ongoingResponsibilityComments.createdAt)],
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

export async function addOngoingResponsibilityComment(
  responsibilityId: string,
  content: string,
  imageKeys?: ImageKeyInput[]
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const trimmed = content.trim();
  const hasImages = !!imageKeys && imageKeys.length > 0;
  if (!trimmed && !hasImages) throw new Error("Comment cannot be empty");
  if (trimmed.length > 5000) throw new Error("Comment is too long");

  const item = await db.query.ongoingResponsibilities.findFirst({
    where: eq(ongoingResponsibilities.id, responsibilityId),
    columns: {
      id: true,
      departmentId: true,
      assignedTo: true,
      createdBy: true,
    },
  });
  if (!item) throw new Error("Responsibility not found");

  const allowed = await canToggle(session.user, item);
  if (!allowed) throw new Error("You don't have access to this responsibility");

  const [comment] = await db
    .insert(ongoingResponsibilityComments)
    .values({
      responsibilityId,
      userId: session.user.id,
      content: trimmed,
    })
    .returning();

  if (hasImages) {
    await db.insert(ongoingCommentImages).values(
      imageKeys!.map((img) => ({
        commentId: comment.id,
        imageUrl: img.s3Key,
        originalName: img.originalName,
      }))
    );
  }

  revalidatePath(`/responsibilities/ongoing/${responsibilityId}`);
}

export async function deleteOngoingResponsibilityComment(
  commentId: string
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const comment = await db.query.ongoingResponsibilityComments.findFirst({
    where: eq(ongoingResponsibilityComments.id, commentId),
    columns: { id: true, userId: true, responsibilityId: true },
  });
  if (!comment) throw new Error("Comment not found");

  const isAdmin = session.user.email === ADMIN_EMAIL;
  if (!isAdmin && comment.userId !== session.user.id) {
    throw new Error("You can only delete your own comments");
  }

  await db
    .delete(ongoingResponsibilityComments)
    .where(eq(ongoingResponsibilityComments.id, commentId));

  revalidatePath(`/responsibilities/ongoing/${comment.responsibilityId}`);
}

export async function getOngoingResponsibilityActivity(
  responsibilityId: string
): Promise<OngoingActivityItem[]> {
  const session = await auth();
  if (!session?.user) return [];

  const rows = await db.query.ongoingResponsibilityActivity.findMany({
    where: eq(ongoingResponsibilityActivity.responsibilityId, responsibilityId),
    with: { user: { columns: { id: true, fullName: true } } },
    orderBy: [desc(ongoingResponsibilityActivity.createdAt)],
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
