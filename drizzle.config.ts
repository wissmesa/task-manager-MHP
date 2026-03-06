import { defineConfig } from "drizzle-kit";

function cleanUrl(url: string) {
  const u = new URL(url);
  u.searchParams.delete("channel_binding");
  return u.toString();
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl(process.env.DATABASE_URL!),
  },
  tablesFilter: ["tm_tasks", "tm_task_images", "tm_user_hierarchy", "tm_departments", "tm_user_department"],
});
