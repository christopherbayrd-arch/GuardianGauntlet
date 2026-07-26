import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/server";

type Params = { params: Promise<{ code: string }> };

/** Public: register an anonymous participant for this game. */
export async function POST(_req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`select id from games where code = ${code.toUpperCase()}`;
  const game = games[0] as { id: string } | undefined;
  if (!game) return jsonError(404, "Game not found.");

  const id = randomUUID();
  await sql`insert into participants (id, game_id) values (${id}, ${game.id})`;
  return Response.json({ participant_id: id });
}
