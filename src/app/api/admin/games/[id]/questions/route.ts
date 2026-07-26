import { db } from "@/lib/db";
import { jsonError, requireAdmin, validateQuestionInput } from "@/lib/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const parsed = validateQuestionInput(body);
  if (typeof parsed === "string") return jsonError(400, parsed);

  const sql = db();
  const games = await sql`select id from games where id = ${id}`;
  if (!games[0]) return jsonError(404, "Game not found.");

  const rows = await sql`
    insert into questions (game_id, position, prompt, options, correct_index)
    values (
      ${id},
      (select coalesce(max(position), -1) + 1 from questions where game_id = ${id}),
      ${parsed.prompt},
      ${JSON.stringify(parsed.options)}::jsonb,
      ${parsed.correct_index}
    )
    returning *`;
  return Response.json({ question: rows[0] });
}

/** Reorder: body = { ordered_ids: [questionId, ...] } in the desired order. */
export async function PUT(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (
    !Array.isArray(body.ordered_ids) ||
    body.ordered_ids.some((x: unknown) => typeof x !== "string")
  ) {
    return jsonError(400, "ordered_ids must be a list of question ids.");
  }

  const sql = db();
  for (let i = 0; i < body.ordered_ids.length; i++) {
    await sql`
      update questions set position = ${i}
      where id = ${body.ordered_ids[i]} and game_id = ${id}`;
  }
  return Response.json({ ok: true });
}
