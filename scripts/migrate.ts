import { neon } from "@neondatabase/serverless";

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
      CREATE TYPE tm_task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
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
      priority tm_task_priority NOT NULL DEFAULT 'medium',
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

  console.log("Migration complete!");
}

migrate().catch(console.error);
