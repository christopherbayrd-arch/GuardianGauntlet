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
    select id, status, play_mode, current_index, reveal from games
    where code = ${code.toUpperCase()} and deleted_at is null`;
  const game = games[0] as
    | {
        id: string;
        status: string;
        play_mode: "self" | "live";
        current_index: number;
        reveal: boolean;
      }
    | undefined;
  if (!game) return jsonError(404, "Game not found.");

  // A live game mid-run may serve the CURRENT question's result — but only
  // while the host has it revealed. Everything else stays hidden until
  // Results mode, exactly like a self-paced game.
  const liveReveal =
    game.status === "open" && game.play_mode === "live" && game.reveal;
  if (game.status !== "results" && !liveReveal) {
    return jsonError(403, "Results are not available until the game is in Results mode.");
  }

  const [allQuestions, countRows] = await Promise.all([
    sql`select id, position, options, correct_index
        from questions where game_id = ${game.id} and deleted_at is null
        order by position asc, created_at asc`,
    sql`select a.question_id, a.choice_index, count(*)::int as n
        from answers a
        join questions q on q.id = a.question_id and q.deleted_at is null
        where a.game_id = ${game.id}
        group by a.question_id, a.choice_index`,
  ]);

  // Mid-game live reveal → trim the payload to just the question on screen.
  const questions = liveReveal
    ? allQuestions.slice(
        Math.min(game.current_index, Math.max(allQuestions.length - 1, 0)),
        Math.min(game.current_index, Math.max(allQuestions.length - 1, 0)) + 1
      )
    : allQuestions;

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
