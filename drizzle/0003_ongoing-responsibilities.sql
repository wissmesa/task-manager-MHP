CREATE TABLE IF NOT EXISTS "tm_ongoing_responsibilities" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(255) NOT NULL,
  "description" text,
  "instructions" text,
  "department_id" varchar NOT NULL REFERENCES "tm_departments"("id"),
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "assigned_to" varchar REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tm_ongoing_responsibilities_dept_idx" ON "tm_ongoing_responsibilities"("department_id");

CREATE TABLE IF NOT EXISTS "tm_ongoing_responsibility_activity" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "responsibility_id" varchar NOT NULL REFERENCES "tm_ongoing_responsibilities"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "action" varchar NOT NULL,
  "field" varchar,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tm_ongoing_activity_resp_idx" ON "tm_ongoing_responsibility_activity"("responsibility_id");

CREATE TABLE IF NOT EXISTS "tm_ongoing_responsibility_comments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "responsibility_id" varchar NOT NULL REFERENCES "tm_ongoing_responsibilities"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tm_ongoing_comments_resp_idx" ON "tm_ongoing_responsibility_comments"("responsibility_id");

CREATE TABLE IF NOT EXISTS "tm_ongoing_responsibility_images" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "responsibility_id" varchar NOT NULL REFERENCES "tm_ongoing_responsibilities"("id") ON DELETE CASCADE,
  "image_url" varchar NOT NULL,
  "original_name" varchar NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tm_ongoing_resp_images_idx" ON "tm_ongoing_responsibility_images"("responsibility_id");

CREATE TABLE IF NOT EXISTS "tm_ongoing_comment_images" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" varchar NOT NULL REFERENCES "tm_ongoing_responsibility_comments"("id") ON DELETE CASCADE,
  "image_url" varchar NOT NULL,
  "original_name" varchar NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tm_ongoing_comment_images_idx" ON "tm_ongoing_comment_images"("comment_id");
