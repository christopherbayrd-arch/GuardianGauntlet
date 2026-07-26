import { db } from "@/lib/db";
import { isUniqueViolation, jsonError, newGameCode, requireAdmin } from "@/lib/server";

type Params = { params: Promise<{ id: string }> };

/**
 * POST { action: "duplicate" } → copy the game + questions into a fresh draft
 * POST { action: "reset" }     → wipe all answers & participants (fresh room)
 */
export async function POST(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sql = db();

  if (body.action === "reset") {
    await sql`delete from answers where game_id = ${id}`;
    await sql`delete from participants where game_id = ${id}`;
    await sql`update games set current_index = 0, reveal = false where id = ${id}`;
    return Response.json({ ok: true });
  }

  if (body.action === "duplicate") {
    const sourceRows = await sql`select * from games where id = ${id}`;
    const source = sourceRows[0] as { title: string } | undefined;
    if (!source) return jsonError(404, "Game not found.");

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await sql`
          insert into games (code, title, status)
          values (${newGameCode()}, ${`${source.title} (copy)`}, 'draft')
          returning *`;
        const newGame = created[0] as { id: string };
        await sql`
          insert into questions (game_id, position, prompt, options, correct_index)
          select ${newGame.id}, position, prompt, options, correct_index
          from questions where game_id = ${id}`;
        return Response.json({ game: created[0] });
      } catch (e) {
        if (!isUniqueViolation(e)) {
          return jsonError(500, e instanceof Error ? e.message : "Database error.");
        }
      }
    }
    return jsonError(500, "Could not generate a unique game code. Try again.");
  }

  return jsonError(400, "Unknown action.");
}
