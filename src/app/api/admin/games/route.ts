import { db } from "@/lib/db";
import { isUniqueViolation, jsonError, newGameCode, requireAdmin } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sql = db();

  // Recycle bin housekeeping: deleted games are kept for 10 days, then
  // purged for good (runs opportunistically whenever the list is loaded).
  await sql`
    delete from games
    where deleted_at is not null and deleted_at < now() - interval '10 days'`;

  const [games, deleted_games] = await Promise.all([
    sql`
      select g.*,
        (select count(*)::int from questions q
         where q.game_id = g.id and q.deleted_at is null) as question_count,
        (select count(*)::int from participants p where p.game_id = g.id) as participant_count
      from games g
      where g.deleted_at is null
      order by g.created_at desc`,
    sql`
      select id, code, title, deleted_at
      from games
      where deleted_at is not null
      order by deleted_at desc`,
  ]);

  return Response.json({ games, deleted_games });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled game";

  // Retry a few times in the (unlikely) event of a code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await db()`
        insert into games (code, title)
        values (${newGameCode()}, ${title})
        returning *`;
      return Response.json({ game: rows[0] });
    } catch (e) {
      if (!isUniqueViolation(e)) {
        return jsonError(500, e instanceof Error ? e.message : "Database error.");
      }
    }
  }
  return jsonError(500, "Could not generate a unique game code. Try again.");
}
