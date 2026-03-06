import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function cleanConnectionString(url: string) {
  const u = new URL(url);
  u.searchParams.delete("channel_binding");
  return u.toString();
}

const sql = neon(cleanConnectionString(process.env.DATABASE_URL!));
export const db = drizzle(sql, { schema });
