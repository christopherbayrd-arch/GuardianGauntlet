import { db, findDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * One-stop checkup: environment variables, database connectivity, and
 * whether the schema is current (columns added by newer features exist).
 * Open /api/health in a browser whenever something seems off.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  checks.admin_passcode = process.env.ADMIN_PASSCODE
    ? "✓ set"
    : "✗ missing — add ADMIN_PASSCODE in Vercel → Settings → Environment Variables, then redeploy";

  const found = findDatabaseUrl();
  checks.database_url = found
    ? `✓ found (as ${found.name})`
    : "✗ missing — attach Neon in Vercel → Storage, or add DATABASE_URL yourself, then redeploy";

  if (found) {
    try {
      const sql = db();
      const games = await sql`select count(*)::int as n from games`;
      checks.database = `✓ connected — ${(games[0] as { n: number }).n} game(s) in the database`;

      // Newer features need newer columns — detect a stale schema so the fix
      // ("re-run db/schema.sql in Neon's SQL Editor") is obvious.
      const cols = (await sql`
        select table_name, column_name
        from information_schema.columns
        where (table_name = 'games' and column_name in ('deleted_at', 'play_mode', 'group_id'))
           or (table_name = 'questions' and column_name in ('updated_at', 'deleted_at'))
           or (table_name = 'participants' and column_name in ('first_name', 'last_name'))
           or (table_name = 'groups' and column_name = 'id')
      `) as { table_name: string; column_name: string }[];
      const have = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
      const needed = [
        "games.deleted_at",
        "games.play_mode",
        "games.group_id",
        "groups.id",
        "questions.updated_at",
        "questions.deleted_at",
        "participants.first_name",
        "participants.last_name",
      ];
      const missing = needed.filter((c) => !have.has(c));
      checks.schema =
        missing.length === 0
          ? "✓ up to date"
          : `✗ missing ${missing.join(", ")} — paste db/schema.sql into Neon's SQL Editor and Run (safe to re-run), then reload`;
    } catch (e) {
      checks.database = `✗ could not connect — ${
        e instanceof Error ? e.message : "unknown error"
      }`;
    }
  }

  const allGood = Object.values(checks).every((v) => v.startsWith("✓"));
  return Response.json(
    {
      status: allGood
        ? "✓ Everything looks good — open /console and play!"
        : "✗ Something needs attention — see below",
      ...checks,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
