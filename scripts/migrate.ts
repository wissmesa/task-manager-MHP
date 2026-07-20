import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const DATABASE_URL = process.env.DATABASE_URL!;

function cleanUrl(url: string) {
  const u = new URL(url);
  u.searchParams.delete("channel_binding");
  return u.toString();
}

const sql = neon(cleanUrl(DATABASE_URL));

async function migrate() {
  console.log("Creating tm_task_status enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE tm_task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("Creating tm_task_priority enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE tm_task_priority AS ENUM ('P0', 'P1', 'P2', 'P3');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("Creating tm_tasks table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_tasks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status tm_task_status NOT NULL DEFAULT 'pending',
      priority tm_task_priority NOT NULL DEFAULT 'P2',
      created_by VARCHAR NOT NULL REFERENCES users(id),
      assigned_to VARCHAR REFERENCES users(id),
      tenant_id VARCHAR REFERENCES tenants(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;

  console.log("Creating tm_task_images table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_task_images (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR NOT NULL REFERENCES tm_tasks(id) ON DELETE CASCADE,
      image_url VARCHAR NOT NULL,
      original_name VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;

  console.log("Adding due_date column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
  `;

  console.log("Creating tm_approval_status enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE tm_approval_status AS ENUM ('pending_approval', 'approved', 'rejected');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("Adding approval columns to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS approval tm_approval_status NOT NULL DEFAULT 'pending_approval';
  `;
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS approved_by VARCHAR REFERENCES users(id);
  `;
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
  `;

  console.log("Creating tm_user_hierarchy table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_user_hierarchy (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
      boss_id VARCHAR NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;

  console.log("Creating tm_departments table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_departments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;

  console.log("Seeding departments...");
  await sql`
    INSERT INTO tm_departments (name)
    VALUES ('Sales_B2C'), ('Sales_B2B'), ('Development')
    ON CONFLICT (name) DO NOTHING;
  `;

  console.log("Creating tm_user_department table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_user_department (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
      department_id VARCHAR NOT NULL REFERENCES tm_departments(id),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;

  console.log("Adding boss_id column to tm_departments...");
  await sql`
    ALTER TABLE tm_departments ADD COLUMN IF NOT EXISTS boss_id VARCHAR REFERENCES users(id);
  `;

  console.log("Adding department_id column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS department_id VARCHAR REFERENCES tm_departments(id);
  `;

  console.log("Adding pending_dept_approval to tm_approval_status enum...");
  await sql`
    ALTER TYPE tm_approval_status ADD VALUE IF NOT EXISTS 'pending_dept_approval' AFTER 'pending_approval';
  `;

  console.log("Adding own_boss_approved column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS own_boss_approved BOOLEAN NOT NULL DEFAULT false;
  `;

  console.log("Adding DIRECTOR to user_role enum...");
  await sql`
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DIRECTOR';
  `;

  console.log("Seeding Executive department...");
  await sql`
    INSERT INTO tm_departments (name) VALUES ('Executive') ON CONFLICT (name) DO NOTHING;
  `;

  console.log("Seeding Data department...");
  await sql`
    INSERT INTO tm_departments (name) VALUES ('Data') ON CONFLICT (name) DO NOTHING;
  `;

  console.log("Migrating task priority enum to P0-P3...");
  await sql`
    ALTER TABLE tm_tasks ALTER COLUMN priority DROP DEFAULT;
  `;
  await sql`
    ALTER TABLE tm_tasks ALTER COLUMN priority TYPE VARCHAR USING priority::text;
  `;
  await sql`
    DROP TYPE IF EXISTS tm_task_priority;
  `;
  await sql`
    CREATE TYPE tm_task_priority AS ENUM ('P0', 'P1', 'P2', 'P3');
  `;
  await sql`
    UPDATE tm_tasks SET priority = CASE
      WHEN priority = 'urgent' THEN 'P0'
      WHEN priority = 'high' THEN 'P1'
      WHEN priority = 'medium' THEN 'P2'
      WHEN priority = 'low' THEN 'P3'
      WHEN priority IN ('P0', 'P1', 'P2', 'P3') THEN priority
      ELSE 'P2'
    END;
  `;
  await sql`
    ALTER TABLE tm_tasks
      ALTER COLUMN priority TYPE tm_task_priority USING priority::tm_task_priority,
      ALTER COLUMN priority SET DEFAULT 'P2',
      ALTER COLUMN priority SET NOT NULL;
  `;

  console.log("Creating tm_task_planning_stage enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE tm_task_planning_stage AS ENUM ('draft', 'brainstorming', 'discussed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("Adding planning_stage column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS planning_stage tm_task_planning_stage;
  `;

  console.log("Adding waiting_for_bundle column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS waiting_for_bundle BOOLEAN NOT NULL DEFAULT false;
  `;

  console.log("Adding dev_target column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS dev_target VARCHAR;
  `;

  console.log("Adding effort column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS effort VARCHAR;
  `;

  console.log("Adding value column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS value VARCHAR;
  `;

  console.log("Adding category column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS category VARCHAR;
  `;

  console.log("Adding client_scope column to tm_tasks...");
  await sql`
    ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS client_scope VARCHAR;
  `;

  console.log("Creating tm_task_activity table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_task_activity (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR NOT NULL REFERENCES tm_tasks(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      action VARCHAR NOT NULL,
      field VARCHAR,
      old_value TEXT,
      new_value TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_task_activity_task_id_idx ON tm_task_activity(task_id);
  `;

  console.log("Creating tm_task_comments table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_task_comments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR NOT NULL REFERENCES tm_tasks(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_task_comments_task_id_idx ON tm_task_comments(task_id);
  `;

  console.log("Creating tm_task_comment_images table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_task_comment_images (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id VARCHAR NOT NULL REFERENCES tm_task_comments(id) ON DELETE CASCADE,
      image_url VARCHAR NOT NULL,
      original_name VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_task_comment_images_comment_idx ON tm_task_comment_images(comment_id);
  `;

  console.log("Creating tm_recurring_tasks table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_tasks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      department_id VARCHAR NOT NULL REFERENCES tm_departments(id),
      created_by VARCHAR NOT NULL REFERENCES users(id),
      assigned_to VARCHAR REFERENCES users(id),
      frequency VARCHAR NOT NULL,
      due_weekday INTEGER,
      due_day_of_month INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_tasks_dept_idx ON tm_recurring_tasks(department_id);
  `;

  console.log("Creating tm_recurring_task_completions table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_task_completions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_task_id VARCHAR NOT NULL REFERENCES tm_recurring_tasks(id) ON DELETE CASCADE,
      period_key VARCHAR NOT NULL,
      completed_by VARCHAR NOT NULL REFERENCES users(id),
      completed_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (recurring_task_id, period_key)
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_completions_task_idx ON tm_recurring_task_completions(recurring_task_id);
  `;

  console.log("Adding instructions column to tm_recurring_tasks...");
  await sql`
    ALTER TABLE tm_recurring_tasks ADD COLUMN IF NOT EXISTS instructions TEXT;
  `;

  console.log("Creating tm_recurring_task_activity table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_task_activity (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_task_id VARCHAR NOT NULL REFERENCES tm_recurring_tasks(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      action VARCHAR NOT NULL,
      field VARCHAR,
      old_value TEXT,
      new_value TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_activity_task_idx ON tm_recurring_task_activity(recurring_task_id);
  `;

  console.log("Creating tm_recurring_task_comments table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_task_comments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_task_id VARCHAR NOT NULL REFERENCES tm_recurring_tasks(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_comments_task_idx ON tm_recurring_task_comments(recurring_task_id);
  `;

  console.log("Creating tm_recurring_task_images table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_task_images (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_task_id VARCHAR NOT NULL REFERENCES tm_recurring_tasks(id) ON DELETE CASCADE,
      image_url VARCHAR NOT NULL,
      original_name VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_task_images_task_idx ON tm_recurring_task_images(recurring_task_id);
  `;

  console.log("Creating tm_recurring_comment_images table...");
  await sql`
    CREATE TABLE IF NOT EXISTS tm_recurring_comment_images (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id VARCHAR NOT NULL REFERENCES tm_recurring_task_comments(id) ON DELETE CASCADE,
      image_url VARCHAR NOT NULL,
      original_name VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tm_recurring_comment_images_comment_idx ON tm_recurring_comment_images(comment_id);
  `;

  console.log("Migration complete!");
}

migrate().catch(console.error);
