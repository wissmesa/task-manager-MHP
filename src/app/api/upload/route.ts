import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import path from "path";
import { db } from "@/db";
import { tasks, taskImages, departments, userDepartment } from "@/db/schema";
import { buildS3Key, uploadToS3 } from "@/lib/s3";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const priority = formData.get("priority") as string;
  const departmentId = formData.get("departmentId") as string | null;
  const assignedTo = formData.get("assignedTo") as string | null;
  const dueDateStr = formData.get("dueDate") as string | null;
  const files = formData.getAll("files") as File[];

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId: string | null = (session.user as any).tenantId ?? null;

  let approvalStatus: "pending_approval" | "pending_dept_approval" | "approved" = "pending_approval";
  let approvedBy: string | null = null;
  let approvedAt: Date | null = null;
  let ownBossApproved = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (session.user as any).role as string | undefined;

  const creatorDeptInfo = await db.query.userDepartment.findFirst({
    where: eq(userDepartment.userId, session.user.id),
    with: { department: { columns: { id: true, name: true, bossId: true } } },
  });
  const creatorDeptId = creatorDeptInfo?.departmentId ?? null;
  const creatorDeptName = creatorDeptInfo?.department?.name ?? null;
  const isCreatorBoss = creatorDeptInfo?.department?.bossId === session.user.id;
  const isSameDept = departmentId && departmentId === creatorDeptId;
  const isExecutive = userRole === "DIRECTOR" || creatorDeptName === "Executive";

  if (isExecutive) {
    ownBossApproved = true;
    if (!departmentId || isSameDept) {
      approvalStatus = "approved";
      approvedBy = session.user.id;
      approvedAt = new Date();
    } else {
      approvalStatus = "pending_dept_approval";
    }
  } else if (isCreatorBoss) {
    ownBossApproved = true;
    if (!departmentId || isSameDept) {
      approvalStatus = "approved";
      approvedBy = session.user.id;
      approvedAt = new Date();
    } else {
      approvalStatus = "pending_dept_approval";
    }
  } else {
    approvalStatus = "pending_approval";
  }

  const [task] = await db
    .insert(tasks)
    .values({
      title: title.trim(),
      description: description?.trim() || null,
      priority: (priority as "low" | "medium" | "high" | "urgent") || "medium",
      status: "pending",
      createdBy: session.user.id,
      assignedTo: approvalStatus === "approved" && assignedTo ? assignedTo : null,
      departmentId: departmentId || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      approval: approvalStatus,
      ownBossApproved,
      approvedBy,
      approvedAt,
      tenantId,
    })
    .returning();

  if (files.length > 0) {
    const imageRecords: { taskId: string; imageUrl: string; originalName: string }[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = path.extname(file.name) || ".png";
      const filename = `${randomUUID()}${ext}`;
      const s3Key = buildS3Key(task.id, filename);

      await uploadToS3(s3Key, buffer, file.type || "image/png");

      imageRecords.push({
        taskId: task.id,
        imageUrl: s3Key,
        originalName: file.name,
      });
    }

    await db.insert(taskImages).values(imageRecords);
  }

  return NextResponse.json({ taskId: task.id });
}
