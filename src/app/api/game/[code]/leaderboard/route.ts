import { db } from "@/lib/db";
import { computeLeaderboard } from "@/lib/leaderboard";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: final standings. Refuses until the host reaches Results mode, so
 * nobody can peek at scores while answers are still open (correct answers
 * only become public knowledge at step 4 anyway).
 *
 * Pass ?me=<participant_id> and your own row comes back flagged is_me —
 * participant ids themselves are never included in the response.
 */
export async function GET(req: Request, { params }: Params) {
  const { code } = await params;
  const sql = db();

  const games = await sql`
    select id, status from games
    where code = ${code.toUpperCase()} and deleted_at is null`;
  const game = games[0] as { id: string; status: string } | undefined;
  if (!game) return jsonError(404, "Game not found.");
  if (game.status !== "results" && game.status !== "leaderboard") {
    return jsonError(403, "The leaderboard is not available yet.");
  }

  const meRaw = new URL(req.url).searchParams.get("me");
  const me = meRaw && UUID_RE.test(meRaw) ? meRaw.toLowerCase() : null;

  const { entries, total_questions } = await computeLeaderboard(sql, game.id);

  return Response.json(
    {
      leaderboard: entries.map((e) => ({
        rank: e.rank,
        first_name: e.first_name,
        last_name: e.last_name,
        correct: e.correct,
        answered: e.answered,
        ...(me && e.participant_id.toLowerCase() === me ? { is_me: true } : {}),
      })),
      total_questions,
      players: entries.length,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
