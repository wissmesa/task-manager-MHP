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
const ADMIN_EMAIL = "luis@bluepaperclip.com";

async function removeAdminDepartment() {
  const sql = neon(DATABASE_URL);

  const userRows = await sql`SELECT id, email FROM users WHERE email = ${ADMIN_EMAIL};`;
  if (userRows.length === 0) {
    console.log(`No user found with email ${ADMIN_EMAIL}.`);
    return;
  }
  const userId = userRows[0].id as string;

  const before = await sql`
    SELECT d.name FROM tm_user_department ud
    JOIN tm_departments d ON d.id = ud.department_id
    WHERE ud.user_id = ${userId};
  `;
  console.log(
    before.length > 0
      ? `Current department for ${ADMIN_EMAIL}: ${before.map((r) => r.name).join(", ")}`
      : `${ADMIN_EMAIL} currently has no department.`
  );

  console.log("Removing department association...");
  await sql`DELETE FROM tm_user_department WHERE user_id = ${userId};`;

  const after = await sql`
    SELECT COUNT(*)::int AS count FROM tm_user_department WHERE user_id = ${userId};
  `;
  console.log(`Remaining department rows for ${ADMIN_EMAIL}: ${after[0].count}`);
  console.log("Done!");
}

removeAdminDepartment().catch((err) => {
  console.error(err);
  process.exit(1);
});
