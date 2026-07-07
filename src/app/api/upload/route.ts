import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import path from "path";
import { db } from "@/db";
import { tasks, taskImages, departments, userDepartment, users } from "@/db/schema";
import { buildS3Key, uploadToS3 } from "@/lib/s3";
import { sendTaskCreatedEmail } from "@/lib/mail";
import { isTaskPriority } from "@/lib/task-priority";
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
  const planningStageRaw = formData.get("planningStage") as string | null;
  const files = formData.getAll("files") as File[];

  const validPlanningStages = ["draft", "brainstorming", "discussed"] as const;
  const planningStage = validPlanningStages.includes(
    planningStageRaw as (typeof validPlanningStages)[number]
  )
    ? (planningStageRaw as (typeof validPlanningStages)[number])
    : null;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!priority || !isTaskPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  if (!departmentId?.trim()) {
    return NextResponse.json({ error: "Department is required" }, { status: 400 });
  }

  const departmentExists = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId.trim()),
    columns: { id: true, name: true },
  });
  if (!departmentExists) {
    return NextResponse.json({ error: "Invalid department" }, { status: 400 });
  }

  const DEV_TARGET_VALUES = ["task_manager", "web_app", "mobile_app", "both"] as const;
  const devTargetRaw = formData.get("devTarget") as string | null;
  const devTarget =
    departmentExists.name === "Development" &&
    devTargetRaw &&
    DEV_TARGET_VALUES.includes(devTargetRaw as (typeof DEV_TARGET_VALUES)[number])
      ? (devTargetRaw as (typeof DEV_TARGET_VALUES)[number])
      : null;

  const EFFORT_VALUES = ["low", "mid_low", "mid_high", "high"] as const;
  const effortRaw = formData.get("effort") as string | null;
  const effort =
    effortRaw && EFFORT_VALUES.includes(effortRaw as (typeof EFFORT_VALUES)[number])
      ? (effortRaw as (typeof EFFORT_VALUES)[number])
      : null;

  const VALUE_VALUES = ["anyone", "specialist", "senior", "highest"] as const;
  const valueRaw = formData.get("value") as string | null;
  const value =
    valueRaw && VALUE_VALUES.includes(valueRaw as (typeof VALUE_VALUES)[number])
      ? (valueRaw as (typeof VALUE_VALUES)[number])
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId: string | null = (session.user as any).tenantId ?? null;

  let approvalStatus: "pending_approval" | "pending_dept_approval" | "approved" = "pending_approval";
  let approvedBy: string | null = null;
  let approvedAt: Date | null = null;
  let ownBossApproved = false;

  const isSelfAssigned = assignedTo === session.user.id;

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

  if (isSelfAssigned) {
    approvalStatus = "approved";
    ownBossApproved = true;
    approvedBy = session.user.id;
    approvedAt = new Date();
  } else if (isExecutive) {
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
      priority,
      status: "pending",
      createdBy: session.user.id,
      assignedTo: approvalStatus === "approved" && assignedTo ? assignedTo : null,
      departmentId: departmentId || null,
      dueDate: null,
      planningStage,
      devTarget,
      effort,
      value,
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

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const taskUrl = `${baseUrl}/tasks/${task.id}`;

  const creatorName = session.user.name || session.user.email || "Someone";
  const deptName = departmentId
    ? (await db.query.departments.findFirst({
        where: eq(departments.id, departmentId),
        columns: { name: true, bossId: true },
      }))
    : null;
  const dueDateFormatted = null;

  const baseNotification = {
    taskTitle: title.trim(),
    taskDescription: description?.trim() || null,
    priority,
    creatorName,
    departmentName: deptName?.name ?? null,
    dueDate: dueDateFormatted,
    taskUrl,
  };

  if (!isSelfAssigned) {
    if (approvalStatus === "pending_approval" && creatorDeptInfo?.department?.bossId) {
      const boss = await db.query.users.findFirst({
        where: eq(users.id, creatorDeptInfo.department.bossId),
        columns: { email: true, fullName: true },
      });
      if (boss) {
        sendTaskCreatedEmail(boss.email, boss.fullName, { ...baseNotification, reason: "approval_needed" });
      }
    }

    if (approvalStatus === "pending_dept_approval" && departmentId) {
      const targetDept = await db.query.departments.findFirst({
        where: eq(departments.id, departmentId),
        columns: { bossId: true },
      });
      if (targetDept?.bossId) {
        const targetBoss = await db.query.users.findFirst({
          where: eq(users.id, targetDept.bossId),
          columns: { email: true, fullName: true },
        });
        if (targetBoss) {
          sendTaskCreatedEmail(targetBoss.email, targetBoss.fullName, { ...baseNotification, reason: "dept_approval_needed" });
        }
      }
    }

    if (assignedTo && approvalStatus === "approved") {
      const assigneeUser = await db.query.users.findFirst({
        where: eq(users.id, assignedTo),
        columns: { email: true, fullName: true },
      });
      if (assigneeUser) {
        sendTaskCreatedEmail(assigneeUser.email, assigneeUser.fullName, { ...baseNotification, reason: "assigned" });
      }
    }
  }

  return NextResponse.json({ taskId: task.id });
}
