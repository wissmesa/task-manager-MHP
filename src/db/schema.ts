import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Existing enums ──────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "AGENT",
  "MHP_LORD",
  "SALES_DIRECTOR",
  "DIRECTOR",
]);

// ── Existing tables (read-only references) ──────────────────────────────────

export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey(),
  name: varchar("name"),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey(),
  name: varchar("name"),
});

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  fullName: varchar("full_name").notNull(),
  phone: varchar("phone"),
  role: userRoleEnum("role").notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  companyId: varchar("company_id").references(() => companies.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── New enums ───────────────────────────────────────────────────────────────

export const taskStatusEnum = pgEnum("tm_task_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("tm_task_priority", [
  "P0",
  "P1",
  "P2",
  "P3",
]);

export const approvalStatusEnum = pgEnum("tm_approval_status", [
  "pending_approval",
  "pending_dept_approval",
  "approved",
  "rejected",
]);

export const taskPlanningStageEnum = pgEnum("tm_task_planning_stage", [
  "draft",
  "brainstorming",
  "discussed",
]);

// ── New tables ──────────────────────────────────────────────────────────────

export const tasks = pgTable("tm_tasks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: taskPriorityEnum("priority").notNull().default("P2"),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  departmentId: varchar("department_id").references(() => departments.id),
  dueDate: timestamp("due_date"),
  approval: approvalStatusEnum("approval").notNull().default("pending_approval"),
  ownBossApproved: boolean("own_boss_approved").default(false).notNull(),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  planningStage: taskPlanningStageEnum("planning_stage"),
  waitingForBundle: boolean("waiting_for_bundle").default(false).notNull(),
  devTarget: varchar("dev_target").$type<"task_manager" | "web_app" | "mobile_app" | "both">(),
  effort: varchar("effort").$type<"low" | "mid_low" | "mid_high" | "high">(),
  value: varchar("value").$type<"anyone" | "specialist" | "senior" | "highest">(),
  category: varchar("category").$type<
    | "ceo_strategy"
    | "b2b_acquisition"
    | "product_engineering"
    | "b2c_sales_leasing"
    | "data_reporting"
    | "hr_people_culture"
    | "finance_legal"
    | "partnerships_integrations"
    | "office_environment"
    | "personal_inner_game"
    | "family_life_ops"
  >(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskImages = pgTable("tm_task_images", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  taskId: varchar("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url").notNull(),
  originalName: varchar("original_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userHierarchy = pgTable("tm_user_hierarchy", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  bossId: varchar("boss_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const departments = pgTable("tm_departments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  bossId: varchar("boss_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userDepartment = pgTable("tm_user_department", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  departmentId: varchar("department_id")
    .notNull()
    .references(() => departments.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskActivity = pgTable("tm_task_activity", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  taskId: varchar("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action").notNull(),
  field: varchar("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskComments = pgTable("tm_task_comments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  taskId: varchar("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Images attached to a regular task comment.
export const taskCommentImages = pgTable("tm_task_comment_images", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id")
    .notNull()
    .references(() => taskComments.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url").notNull(),
  originalName: varchar("original_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recurringTasks = pgTable("tm_recurring_tasks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  departmentId: varchar("department_id")
    .notNull()
    .references(() => departments.id),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  frequency: varchar("frequency").$type<"daily" | "weekly" | "monthly">().notNull(),
  // weekly: 0=Sunday .. 6=Saturday (deadline weekday within each week)
  dueWeekday: integer("due_weekday"),
  // monthly: 1..31 (deadline day within each month)
  dueDayOfMonth: integer("due_day_of_month"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recurringTaskActivity = pgTable("tm_recurring_task_activity", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  recurringTaskId: varchar("recurring_task_id")
    .notNull()
    .references(() => recurringTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action").notNull(),
  field: varchar("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recurringTaskComments = pgTable("tm_recurring_task_comments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  recurringTaskId: varchar("recurring_task_id")
    .notNull()
    .references(() => recurringTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Images attached to a recurring task's instructions.
export const recurringTaskImages = pgTable("tm_recurring_task_images", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  recurringTaskId: varchar("recurring_task_id")
    .notNull()
    .references(() => recurringTasks.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url").notNull(),
  originalName: varchar("original_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Images attached to a recurring task comment.
export const recurringCommentImages = pgTable("tm_recurring_comment_images", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id")
    .notNull()
    .references(() => recurringTaskComments.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url").notNull(),
  originalName: varchar("original_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recurringTaskCompletions = pgTable("tm_recurring_task_completions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  recurringTaskId: varchar("recurring_task_id")
    .notNull()
    .references(() => recurringTasks.id, { onDelete: "cascade" }),
  // 'YYYY-MM-DD' (daily) | 'YYYY-Www' (weekly) | 'YYYY-MM' (monthly)
  periodKey: varchar("period_key").notNull(),
  completedBy: varchar("completed_by")
    .notNull()
    .references(() => users.id),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

// ── Ongoing responsibilities ─────────────────────────────────────────────────
// Standing duties owned permanently by a person, with no repeat schedule.

export const ongoingResponsibilities = pgTable("tm_ongoing_responsibilities", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  departmentId: varchar("department_id")
    .notNull()
    .references(() => departments.id),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ongoingResponsibilityActivity = pgTable(
  "tm_ongoing_responsibility_activity",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    responsibilityId: varchar("responsibility_id")
      .notNull()
      .references(() => ongoingResponsibilities.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id),
    action: varchar("action").notNull(),
    field: varchar("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

export const ongoingResponsibilityComments = pgTable(
  "tm_ongoing_responsibility_comments",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    responsibilityId: varchar("responsibility_id")
      .notNull()
      .references(() => ongoingResponsibilities.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

// Images attached to an ongoing responsibility's instructions.
export const ongoingResponsibilityImages = pgTable(
  "tm_ongoing_responsibility_images",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    responsibilityId: varchar("responsibility_id")
      .notNull()
      .references(() => ongoingResponsibilities.id, { onDelete: "cascade" }),
    imageUrl: varchar("image_url").notNull(),
    originalName: varchar("original_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

// Images attached to an ongoing responsibility comment.
export const ongoingCommentImages = pgTable("tm_ongoing_comment_images", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id")
    .notNull()
    .references(() => ongoingResponsibilityComments.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url").notNull(),
  originalName: varchar("original_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Relations ───────────────────────────────────────────────────────────────

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  assignee: one(users, { fields: [tasks.assignedTo], references: [users.id] }),
  approver: one(users, { fields: [tasks.approvedBy], references: [users.id] }),
  department: one(departments, { fields: [tasks.departmentId], references: [departments.id] }),
  images: many(taskImages),
  activity: many(taskActivity),
  comments: many(taskComments),
}));

export const userHierarchyRelations = relations(userHierarchy, ({ one }) => ({
  user: one(users, { fields: [userHierarchy.userId], references: [users.id] }),
  boss: one(users, { fields: [userHierarchy.bossId], references: [users.id] }),
}));

export const taskImagesRelations = relations(taskImages, ({ one }) => ({
  task: one(tasks, { fields: [taskImages.taskId], references: [tasks.id] }),
}));

export const userDepartmentRelations = relations(userDepartment, ({ one }) => ({
  user: one(users, { fields: [userDepartment.userId], references: [users.id] }),
  department: one(departments, { fields: [userDepartment.departmentId], references: [departments.id] }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  boss: one(users, { fields: [departments.bossId], references: [users.id] }),
  users: many(userDepartment),
}));

export const taskActivityRelations = relations(taskActivity, ({ one }) => ({
  task: one(tasks, { fields: [taskActivity.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskActivity.userId], references: [users.id] }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one, many }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskComments.userId], references: [users.id] }),
  images: many(taskCommentImages),
}));

export const taskCommentImagesRelations = relations(
  taskCommentImages,
  ({ one }) => ({
    comment: one(taskComments, {
      fields: [taskCommentImages.commentId],
      references: [taskComments.id],
    }),
  })
);

export const recurringTasksRelations = relations(recurringTasks, ({ one, many }) => ({
  creator: one(users, { fields: [recurringTasks.createdBy], references: [users.id] }),
  assignee: one(users, { fields: [recurringTasks.assignedTo], references: [users.id] }),
  department: one(departments, {
    fields: [recurringTasks.departmentId],
    references: [departments.id],
  }),
  completions: many(recurringTaskCompletions),
  activity: many(recurringTaskActivity),
  comments: many(recurringTaskComments),
  images: many(recurringTaskImages),
}));

export const recurringTaskImagesRelations = relations(
  recurringTaskImages,
  ({ one }) => ({
    recurringTask: one(recurringTasks, {
      fields: [recurringTaskImages.recurringTaskId],
      references: [recurringTasks.id],
    }),
  })
);

export const recurringCommentImagesRelations = relations(
  recurringCommentImages,
  ({ one }) => ({
    comment: one(recurringTaskComments, {
      fields: [recurringCommentImages.commentId],
      references: [recurringTaskComments.id],
    }),
  })
);

export const recurringTaskActivityRelations = relations(
  recurringTaskActivity,
  ({ one }) => ({
    recurringTask: one(recurringTasks, {
      fields: [recurringTaskActivity.recurringTaskId],
      references: [recurringTasks.id],
    }),
    user: one(users, {
      fields: [recurringTaskActivity.userId],
      references: [users.id],
    }),
  })
);

export const recurringTaskCommentsRelations = relations(
  recurringTaskComments,
  ({ one, many }) => ({
    recurringTask: one(recurringTasks, {
      fields: [recurringTaskComments.recurringTaskId],
      references: [recurringTasks.id],
    }),
    user: one(users, {
      fields: [recurringTaskComments.userId],
      references: [users.id],
    }),
    images: many(recurringCommentImages),
  })
);

export const recurringTaskCompletionsRelations = relations(
  recurringTaskCompletions,
  ({ one }) => ({
    recurringTask: one(recurringTasks, {
      fields: [recurringTaskCompletions.recurringTaskId],
      references: [recurringTasks.id],
    }),
    completedByUser: one(users, {
      fields: [recurringTaskCompletions.completedBy],
      references: [users.id],
    }),
  })
);

export const ongoingResponsibilitiesRelations = relations(
  ongoingResponsibilities,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [ongoingResponsibilities.createdBy],
      references: [users.id],
    }),
    assignee: one(users, {
      fields: [ongoingResponsibilities.assignedTo],
      references: [users.id],
    }),
    department: one(departments, {
      fields: [ongoingResponsibilities.departmentId],
      references: [departments.id],
    }),
    activity: many(ongoingResponsibilityActivity),
    comments: many(ongoingResponsibilityComments),
    images: many(ongoingResponsibilityImages),
  })
);

export const ongoingResponsibilityImagesRelations = relations(
  ongoingResponsibilityImages,
  ({ one }) => ({
    responsibility: one(ongoingResponsibilities, {
      fields: [ongoingResponsibilityImages.responsibilityId],
      references: [ongoingResponsibilities.id],
    }),
  })
);

export const ongoingCommentImagesRelations = relations(
  ongoingCommentImages,
  ({ one }) => ({
    comment: one(ongoingResponsibilityComments, {
      fields: [ongoingCommentImages.commentId],
      references: [ongoingResponsibilityComments.id],
    }),
  })
);

export const ongoingResponsibilityActivityRelations = relations(
  ongoingResponsibilityActivity,
  ({ one }) => ({
    responsibility: one(ongoingResponsibilities, {
      fields: [ongoingResponsibilityActivity.responsibilityId],
      references: [ongoingResponsibilities.id],
    }),
    user: one(users, {
      fields: [ongoingResponsibilityActivity.userId],
      references: [users.id],
    }),
  })
);

export const ongoingResponsibilityCommentsRelations = relations(
  ongoingResponsibilityComments,
  ({ one, many }) => ({
    responsibility: one(ongoingResponsibilities, {
      fields: [ongoingResponsibilityComments.responsibilityId],
      references: [ongoingResponsibilities.id],
    }),
    user: one(users, {
      fields: [ongoingResponsibilityComments.userId],
      references: [users.id],
    }),
    images: many(ongoingCommentImages),
  })
);
