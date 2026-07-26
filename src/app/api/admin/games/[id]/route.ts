import { db } from "@/lib/db";
import { jsonError, requireAdmin, rowToQuestion } from "@/lib/server";
import type { GameStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: GameStatus[] = ["draft", "open", "locked", "results"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "Game not found.");
  const sql = db();

  const games = await sql`select * from games where id = ${id}`;
  const game = games[0];
  if (!game) return jsonError(404, "Game not found.");

  const [questionRows, participantRows, answerRows] = await Promise.all([
    sql`select * from questions where game_id = ${id}
        order by position asc, created_at asc`,
    sql`select count(*)::int as n from participants where game_id = ${id}`,
    sql`select question_id, choice_index, count(*)::int as n
        from answers where game_id = ${id}
        group by question_id, choice_index`,
  ]);

  const questions = questionRows.map((q) => rowToQuestion(q as { options: unknown }));
  const counts = answerRows as { question_id: string; choice_index: number; n: number }[];

  // Per-option distributions — console-only preview (admin is trusted).
  const distributions = questions.map((q) => {
    const arr = new Array<number>((q.options as string[]).length).fill(0);
    for (const c of counts) {
      if (c.question_id === (q as { id?: string }).id && c.choice_index >= 0 && c.choice_index < arr.length) {
        arr[c.choice_index] = c.n;
      }
    }
    return {
      question_id: (q as { id?: string }).id,
      counts: arr,
      total: arr.reduce((s, n) => s + n, 0),
    };
  });

  const stats = {
    participants: (participantRows[0] as { n: number }).n,
    total_answers: counts.reduce((s, c) => s + c.n, 0),
    by_question: distributions.map((d) => ({
      question_id: d.question_id,
      count: d.total,
    })),
  };

  return Response.json({ game, questions, stats, distributions });
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "Game not found.");
  const body = await req.json().catch(() => ({}));
  const sql = db();

  const games = await sql`select * from games where id = ${id}`;
  const existing = games[0] as
    | { title: string; status: GameStatus; current_index: number; reveal: boolean }
    | undefined;
  if (!existing) return jsonError(404, "Game not found.");

  let title = existing.title;
  let status = existing.status;
  let current_index = existing.current_index;
  let reveal = existing.reveal;

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim())
      return jsonError(400, "Title cannot be empty.");
    title = body.title.trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return jsonError(400, "Invalid status.");
    status = body.status;
    // Entering results mode starts the walkthrough at question 1, unrevealed.
    if (status === "results" && existing.status !== "results") {
      current_index = 0;
      reveal = false;
    }
  }
  if (body.current_index !== undefined) {
    const n = Number(body.current_index);
    if (!Number.isInteger(n) || n < 0) return jsonError(400, "Invalid question index.");
    current_index = n;
  }
  if (body.reveal !== undefined) reveal = Boolean(body.reveal);

  const rows = await sql`
    update games
    set title = ${title}, status = ${status},
        current_index = ${current_index}, reveal = ${reveal}
    where id = ${id}
    returning *`;
  return Response.json({ game: rows[0] });
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "Game not found.");
  await db()`delete from games where id = ${id}`;
  return Response.json({ ok: true });
}
