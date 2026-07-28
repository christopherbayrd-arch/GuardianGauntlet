import { db } from "@/lib/db";
import { jsonError, rowToQuestion } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** Public: game state + questions WITHOUT correct answers. */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`
    select id, code, title, status, current_index, reveal, created_at
    from games where code = ${code.toUpperCase()} and deleted_at is null`;
  const game = games[0];
  if (!game) return jsonError(404, "Game not found.");

  const questions = await sql`
    select id, game_id, position, prompt, options
    from questions
    where game_id = ${game.id}
    order by position asc, created_at asc`;

  return Response.json(
    { game, questions: questions.map((q) => rowToQuestion(q as { options: unknown })) },
    { headers: { "cache-control": "no-store" } }
  );
}
