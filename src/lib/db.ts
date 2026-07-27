import { neon } from "@neondatabase/serverless";

/** Tagged-template SQL: db()`select * from games` → array of row objects. */
export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, any>[]>;

let sql: SqlTag | null = null;

/**
 * The Vercel/Neon integration sometimes injects the connection string under
 * a different name — accept the common ones so setup "just works".
 */
const ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

export function findDatabaseUrl(): { name: string; url: string } | null {
  for (const name of ENV_NAMES) {
    const url = process.env[name];
    if (url) return { name, url };
  }
  return null;
}

/**
 * Lazy singleton over Neon's serverless driver (HTTP-based — ideal for
 * Vercel functions; no connection pool to manage). Any Postgres works:
 * to move off Neon later, swap this file for the `pg` package.
 */
export function db(): SqlTag {
  if (!sql) {
    const found = findDatabaseUrl();
    if (!found) {
      throw new Error(
        "No database connection string is set. Attach Neon (Vercel → Storage tab) or add DATABASE_URL in Environment Variables, then redeploy. Visit /api/health for a full checkup."
      );
    }
    sql = neon(found.url) as unknown as SqlTag;
  }
  return sql;
}
