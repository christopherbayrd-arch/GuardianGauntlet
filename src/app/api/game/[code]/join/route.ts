import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { normalizeName } from "@/lib/leaderboard";
import { jsonError } from "@/lib/server";

type Params = { params: Promise<{ code: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: register a participant for this game. First and last name are
 * required — they power the final leaderboard.
 *
 * If the phone already has a participant id (from localStorage), we keep it
 * and just make sure the row exists with the right name. That way a device
 * that re-joins after a glitch keeps all of its saved answers.
 */
export async function POST(req: Request, { params }: Params) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    participant_id?: string;
    first_name?: unknown;
    last_name?: unknown;
  };

  const first_name = normalizeName(body.first_name);
  const last_name = normalizeName(body.last_name);
  if (!first_name || !last_name) {
    return jsonError(400, "Please enter your first and last name.");
  }

  const sql = db();
  const games = await sql`
    select id from games where code = ${code.toUpperCase()} and deleted_at is null`;
  const game = games[0] as { id: string } | undefined;
  if (!game) return jsonError(404, "Game not found.");

  const id =
    body.participant_id && UUID_RE.test(body.participant_id)
      ? body.participant_id
      : randomUUID();

  // Upsert, but never let one game's join touch another game's participant.
  await sql`
    insert into participants (id, game_id, first_name, last_name)
    values (${id}, ${game.id}, ${first_name}, ${last_name})
    on conflict (id) do update
      set first_name = excluded.first_name,
          last_name  = excluded.last_name
      where participants.game_id = excluded.game_id`;

  const rows = await sql`
    select id from participants where id = ${id} and game_id = ${game.id}`;
  if (rows.length === 0) {
    // The id belonged to a different game — issue a fresh one instead.
    const fresh = randomUUID();
    await sql`
      insert into participants (id, game_id, first_name, last_name)
      values (${fresh}, ${game.id}, ${first_name}, ${last_name})`;
    return Response.json({ participant_id: fresh, first_name, last_name });
  }

  return Response.json({ participant_id: id, first_name, last_name });
}
