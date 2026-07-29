import { db } from "@/lib/db";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** Public: live counts only — never reveals which options people chose. */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`
    select id from games where code = ${code.toUpperCase()} and deleted_at is null`;
  const game = games[0];
  if (!game) return jsonError(404, "Game not found.");

  const [participantRows, answerRows] = await Promise.all([
    sql`select count(*)::int as n from participants where game_id = ${game.id}`,
    sql`select a.question_id, count(*)::int as n
        from answers a
        join questions q on q.id = a.question_id and q.deleted_at is null
        where a.game_id = ${game.id}
        group by a.question_id`,
  ]);

  const by_question = (answerRows as { question_id: string; n: number }[]).map(
    (r) => ({ question_id: r.question_id, count: r.n })
  );

  return Response.json(
    {
      participants: (participantRows[0] as { n: number }).n,
      total_answers: by_question.reduce((s, r) => s + r.count, 0),
      by_question,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
