import { db } from "@/lib/db";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** Public: live counts only — never reveals which options people chose. */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`select id from games where code = ${code.toUpperCase()}`;
  const game = games[0];
  if (!game) return jsonError(404, "Game not found.");

  const [participantRows, answerRows] = await Promise.all([
    sql`select count(*)::int as n from participants where game_id = ${game.id}`,
    sql`select question_id, count(*)::int as n
        from answers where game_id = ${game.id}
        group by question_id`,
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
