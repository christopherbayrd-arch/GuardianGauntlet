import { db } from "@/lib/db";
import { isUniqueViolation, jsonError, newGameCode, requireAdmin } from "@/lib/server";
import { DELETED_RETENTION_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sql = db();

  // Lazy purge: any game deleted more than 30 days ago is removed for good
  // (questions, players, and answers cascade). Running it here means the
  // trash cleans itself every time the console loads — no cron needed.
  await sql`
    delete from games
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => ${DELETED_RETENTION_DAYS})`;

  // Active games AND still-restorable deleted ones; the console home page
  // splits them into "your games" and the "Deleted games" section.
  const games = await sql`
    select g.*,
      (select count(*)::int from questions q where q.game_id = g.id) as question_count,
      (select count(*)::int from participants p where p.game_id = g.id) as participant_count
    from games g
    order by g.created_at desc`;

  return Response.json({ games });
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
