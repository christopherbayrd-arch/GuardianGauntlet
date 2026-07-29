import type { SqlTag } from "@/lib/db";
import type { LeaderboardEntry } from "@/lib/types";

/**
 * Final standings for a game, computed from the answers table.
 *
 * - Only named participants are ranked (everyone who came through the
 *   name gate; stray anonymous rows from older sessions are ignored).
 * - Score = number of answers matching the question's correct_index.
 * - Ties share a rank (competition ranking: 1, 2, 2, 4…) — answering is
 *   self-paced, so speed-based tiebreaks would mostly reward whoever
 *   scanned the QR code first.
 */
export async function computeLeaderboard(
  sql: SqlTag,
  gameId: string
): Promise<{ entries: (LeaderboardEntry & { participant_id: string })[]; total_questions: number }> {
  const [rows, questionCount] = await Promise.all([
    sql`
      select p.id as participant_id,
             p.first_name,
             p.last_name,
             count(a.id) filter (where a.choice_index = q.correct_index)::int as correct,
             count(q.id)::int as answered
      from participants p
      left join answers a on a.participant_id = p.id and a.game_id = ${gameId}
      left join questions q on q.id = a.question_id and q.deleted_at is null
      where p.game_id = ${gameId}
        and p.first_name is not null
        and p.last_name  is not null
      group by p.id, p.first_name, p.last_name
      order by correct desc, lower(p.first_name) asc, lower(p.last_name) asc, p.id asc`,
    sql`select count(*)::int as n
        from questions where game_id = ${gameId} and deleted_at is null`,
  ]);

  const entries = (rows as {
    participant_id: string;
    first_name: string;
    last_name: string;
    correct: number;
    answered: number;
  }[]).map((r) => ({
    participant_id: r.participant_id,
    first_name: r.first_name,
    last_name: r.last_name,
    correct: r.correct,
    answered: r.answered,
    rank: 0,
  }));

  // Competition ranking: same score → same rank; next distinct score skips.
  let lastCorrect: number | null = null;
  let lastRank = 0;
  entries.forEach((e, i) => {
    if (e.correct !== lastCorrect) {
      lastRank = i + 1;
      lastCorrect = e.correct;
    }
    e.rank = lastRank;
  });

  return {
    entries,
    total_questions: (questionCount[0] as { n: number }).n,
  };
}

/** Clean up a typed name: trim, collapse inner whitespace, cap the length. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  return name.length > 0 ? name : null;
}
