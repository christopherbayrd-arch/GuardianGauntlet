import { db } from "@/lib/db";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * Public: full results — per-option counts AND correct answers.
 * Refuses until the host switches the game into Results mode, so nobody
 * can peek early (not even with browser dev tools).
 */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`
    select id, status from games where code = ${code.toUpperCase()}`;
  const game = games[0] as { id: string; status: string } | undefined;
  if (!game) return jsonError(404, "Game not found.");
  if (game.status !== "results") {
    return jsonError(403, "Results are not available until the game is in Results mode.");
  }

  const [questions, countRows] = await Promise.all([
    sql`select id, position, options, correct_index
        from questions where game_id = ${game.id}
        order by position asc, created_at asc`,
    sql`select question_id, choice_index, count(*)::int as n
        from answers where game_id = ${game.id}
        group by question_id, choice_index`,
  ]);

  const results = (questions as {
    id: string;
    position: number;
    options: unknown;
    correct_index: number;
  }[]).map((q) => {
    const options = Array.isArray(q.options) ? (q.options as string[]) : [];
    const counts = new Array<number>(options.length).fill(0);
    for (const row of countRows as { question_id: string; choice_index: number; n: number }[]) {
      if (row.question_id === q.id && row.choice_index >= 0 && row.choice_index < counts.length) {
        counts[row.choice_index] = row.n;
      }
    }
    return {
      question_id: q.id,
      position: q.position,
      correct_index: q.correct_index,
      counts,
      total: counts.reduce((s, n) => s + n, 0),
    };
  });

  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
