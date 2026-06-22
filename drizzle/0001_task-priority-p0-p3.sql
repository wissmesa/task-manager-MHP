ALTER TABLE "tm_tasks" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "tm_tasks" ALTER COLUMN "priority" TYPE varchar USING priority::text;
DROP TYPE IF EXISTS "tm_task_priority";
CREATE TYPE "tm_task_priority" AS ENUM ('P0', 'P1', 'P2', 'P3');
UPDATE "tm_tasks" SET priority = CASE
  WHEN priority = 'urgent' THEN 'P0'
  WHEN priority = 'high' THEN 'P1'
  WHEN priority = 'medium' THEN 'P2'
  WHEN priority = 'low' THEN 'P3'
  WHEN priority IN ('P0', 'P1', 'P2', 'P3') THEN priority
  ELSE 'P2'
END;
ALTER TABLE "tm_tasks"
  ALTER COLUMN "priority" TYPE "tm_task_priority" USING priority::"tm_task_priority",
  ALTER COLUMN "priority" SET DEFAULT 'P2',
  ALTER COLUMN "priority" SET NOT NULL;
