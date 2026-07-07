import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
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

// ── Relations ───────────────────────────────────────────────────────────────

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  assignee: one(users, { fields: [tasks.assignedTo], references: [users.id] }),
  approver: one(users, { fields: [tasks.approvedBy], references: [users.id] }),
  department: one(departments, { fields: [tasks.departmentId], references: [departments.id] }),
  images: many(taskImages),
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
