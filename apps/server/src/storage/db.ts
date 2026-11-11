import "dotenv/config";
import { Pool, type PoolClient } from "pg";
import { migrate } from "./migrations.js";

/** Use a dedicated Postgres database. Never silently substitute in-memory persistence. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://mercatum:mercatum@127.0.0.1:5432/mercatum",
  max: 8,
  connectionTimeoutMillis: 5000,
});

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase(): Promise<void> {
  await transaction(migrate);
  console.log("[Mercatum] PostgreSQL migrations checked.");
}
