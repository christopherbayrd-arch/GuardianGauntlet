import { db } from "@/lib/db";
import { jsonError, requireAdmin, rowToQuestion, validateQuestionInput } from "@/lib/server";

type Params = { params: Promise<{ qid: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { qid } = await params;
  const body = await req.json().catch(() => ({}));
  const sql = db();

  const rows = await sql`select * from questions where id = ${qid}`;
  const existing = rows[0] as
    | { prompt: string; options: unknown; correct_index: number }
    | undefined;
  if (!existing) return jsonError(404, "Question not found.");

  const merged = {
    prompt: body.prompt ?? existing.prompt,
    options: body.options ?? existing.options,
    correct_index: body.correct_index ?? existing.correct_index,
  };
  const parsed = validateQuestionInput(merged);
  if (typeof parsed === "string") return jsonError(400, parsed);

  const updated = await sql`
    update questions
    set prompt = ${parsed.prompt},
        options = ${JSON.stringify(parsed.options)}::jsonb,
        correct_index = ${parsed.correct_index}
    where id = ${qid}
    returning *`;
  return Response.json({ question: rowToQuestion(updated[0] as { options: unknown }) });
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { qid } = await params;
  await db()`delete from questions where id = ${qid}`;
  return Response.json({ ok: true });
}
