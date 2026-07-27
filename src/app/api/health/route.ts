import { db, findDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Self-diagnosis: open https://YOUR-APP.vercel.app/api/health in a browser.
 * Reports exactly which setup step is missing, in plain English.
 * Safe to leave public — it never reveals secrets, only whether they exist.
 */
export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  // 1 — console passcode
  if (process.env.ADMIN_PASSCODE) {
    checks.admin_passcode = "✓ set";
  } else {
    ok = false;
    checks.admin_passcode =
      "✗ MISSING — Vercel → Settings → Environment Variables → add ADMIN_PASSCODE, then Deployments → Redeploy. (Variables only take effect on a new deployment.)";
  }

  // 2 — database connection string
  const found = findDatabaseUrl();
  if (!found) {
    ok = false;
    checks.database_url =
      "✗ MISSING — attach Neon via Vercel → Storage → Create Database (or add DATABASE_URL yourself), then Redeploy.";
  } else {
    checks.database_url = `✓ found (as ${found.name})`;

    // 3 — can we reach the database, and do the tables exist?
    try {
      const rows = await db()`select count(*)::int as n from games`;
      checks.database = `✓ connected — ${rows[0].n} game(s) in the database`;
    } catch (e) {
      ok = false;
      const msg = e instanceof Error ? e.message : String(e);
      checks.database = /does not exist/i.test(msg)
        ? "✗ TABLES MISSING — open your Neon project (console.neon.tech) → SQL Editor → paste ALL of db/schema.sql → Run. Then refresh this page."
        : `✗ CONNECTION FAILED — ${msg}`;
    }
  }

  return Response.json(
    {
      status: ok ? "✓ Everything looks good — open /console and play!" : "✗ Action needed — see below",
      ...checks,
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
