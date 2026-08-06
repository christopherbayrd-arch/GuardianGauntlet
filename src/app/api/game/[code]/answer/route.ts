import { db } from "@/lib/db";
import { jsonError } from "@/lib/server";

type Params = { params: Promise<{ code: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: submit (or change) an answer. The database write itself is
 * conditioned on the game being OPEN, so the moment the host locks the
 * game every new submission is rejected — no matter what the phone shows.
 */
export async function POST(req: Request, { params }: Params) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    participant_id?: string;
    question_id?: string;
    choice_index?: number;
  };

  const { participant_id, question_id } = body;
  const choice_index = Number(body.choice_index);
  if (
    !participant_id ||
    !UUID_RE.test(participant_id) ||
    !question_id ||
    !UUID_RE.test(question_id) ||
    !Number.isInteger(choice_index) ||
    choice_index < 0
  ) {
    return jsonError(400, "Invalid answer submission.");
  }

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
  if (game.status !== "open") {
    return jsonError(409, "Answers are locked.");
  }

  const questions = await sql`
    select id, jsonb_array_length(options)::int as option_count
    from questions
    where id = ${question_id} and game_id = ${game.id} and deleted_at is null`;
  const question = questions[0] as { id: string; option_count: number } | undefined;
  if (!question) return jsonError(400, "That question doesn't belong to this game.");
  if (choice_index >= question.option_count) {
    return jsonError(400, "Invalid option.");
  }

  /* ── Live (host-paced) games play by stricter rules ────────── */
  if (game.play_mode === "live") {
    const ordered = (await sql`
      select id from questions
      where game_id = ${game.id} and deleted_at is null
      order by position asc, created_at asc`) as { id: string }[];
    const currentId = ordered[game.current_index]?.id;
    if (question_id !== currentId) {
      return jsonError(409, "That question isn't open right now — follow the big screen.");
    }
    if (game.reveal) {
      return jsonError(409, "The answer has been revealed — this question is closed.");
    }

    // Make sure the participant exists (e.g. cleared storage mid-game).
    await sql`
      insert into participants (id, game_id)
      values (${participant_id}, ${game.id})
      on conflict (id) do nothing`;

    // First tap counts (no changes), and the write re-checks — inside one
    // statement — that the game is still open, on this question, unrevealed.
    const inserted = await sql`
      insert into answers (game_id, question_id, participant_id, choice_index)
      select ${game.id}, ${question_id}, ${participant_id}, ${choice_index}
      where exists (
        select 1 from games
        where id = ${game.id} and status = 'open'
          and current_index = ${game.current_index} and reveal = false
      )
      on conflict (question_id, participant_id) do nothing
      returning id`;

    if (inserted.length === 0) {
      const already = await sql`
        select 1 from answers
        where question_id = ${question_id} and participant_id = ${participant_id}`;
      if (already.length > 0) {
        return jsonError(409, "Your answer is already in — first tap counts.");
      }
      return jsonError(409, "This question just closed.");
    }
    return Response.json({ ok: true });
  }

  /* ── Self-paced games: answer (or change) anything while open ── */

  // Make sure the participant exists (e.g. cleared storage mid-game).
  await sql`
    insert into participants (id, game_id)
    values (${participant_id}, ${game.id})
    on conflict (id) do nothing`;

  // The write re-checks OPEN status inside a single statement, closing the
  // race between the check above and the moment the host locks the game.
  const inserted = await sql`
    insert into answers (game_id, question_id, participant_id, choice_index)
    select ${game.id}, ${question_id}, ${participant_id}, ${choice_index}
    where exists (select 1 from games where id = ${game.id} and status = 'open')
    on conflict (question_id, participant_id)
    do update set choice_index = excluded.choice_index
    returning id`;

  if (inserted.length === 0) {
    return jsonError(409, "Answers are locked.");
  }
  return Response.json({ ok: true });
}
