import { neon } from "@neondatabase/serverless";

/** Tagged-template SQL: db()`select * from games` → array of row objects. */
export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, any>[]>;

let sql: SqlTag | null = null;

/**
 * Lazy singleton over Neon's serverless driver (HTTP-based — ideal for
 * Vercel functions; no connection pool to manage). Any Postgres works:
 * to move off Neon later, swap this file for the `pg` package.
 */
export function db(): SqlTag {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add your Neon connection string to the environment (see README)."
      );
    }
    sql = neon(url) as unknown as SqlTag;
  }
  return sql;
}
