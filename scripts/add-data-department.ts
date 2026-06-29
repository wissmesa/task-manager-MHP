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

async function addDataDepartment() {
  const sql = neon(DATABASE_URL);

  console.log("Renaming 'Data Department' to 'Data' (if present)...");
  await sql`
    UPDATE tm_departments SET name = 'Data' WHERE name = 'Data Department';
  `;

  console.log("Ensuring 'Data' department exists...");
  await sql`
    INSERT INTO tm_departments (name) VALUES ('Data') ON CONFLICT (name) DO NOTHING;
  `;

  const rows = await sql`SELECT id, name FROM tm_departments ORDER BY name;`;
  console.log("Departments now:");
  for (const row of rows) {
    console.log(`  - ${row.name} (${row.id})`);
  }
  console.log("Done!");
}

addDataDepartment().catch((err) => {
  console.error(err);
  process.exit(1);
});
