import { Pool } from "pg";

// Managed Postgres providers (e.g. Supabase) require TLS; local/Docker Postgres doesn't.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
