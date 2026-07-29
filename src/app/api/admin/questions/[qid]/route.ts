import { db } from "@/lib/db";
import { jsonError, requireAdmin, rowToQuestion, validateQuestionInput } from "@/lib/server";

type Params = { params: Promise<{ qid: string }> };

/**
 * PATCH { restore: true }        → un-delete a soft-deleted question
 * PATCH { prompt/options/... }   → edit content (stamps updated_at)
 */
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

  if (body.restore === true) {
    const restored = await sql`
      update questions set deleted_at = null
      where id = ${qid}
      returning *`;
    return Response.json({ question: rowToQuestion(restored[0] as { options: unknown }) });
  }

  const merged = {
    prompt: body.prompt ?? existing.prompt,
    options: body.options ?? existing.options,
    correct_index: body.correct_index ?? existing.correct_index,
  };
  const parsed = validateQuestionInput(merged);
  if (typeof parsed === "string") return jsonError(400, parsed);

  // Content edit — stamp updated_at so the host's audit view shows it.
  const updated = await sql`
    update questions
    set prompt = ${parsed.prompt},
        options = ${JSON.stringify(parsed.options)}::jsonb,
        correct_index = ${parsed.correct_index},
        updated_at = now()
    where id = ${qid}
    returning *`;
  return Response.json({ question: rowToQuestion(updated[0] as { options: unknown }) });
}

/**
 * DELETE               → soft delete (greyed out in the console, restorable;
 *                        players and the big screen never see it)
 * DELETE ?permanent=1  → gone for good, along with its answers
 */
export async function DELETE(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { qid } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";

  if (permanent) {
    await db()`delete from questions where id = ${qid}`;
  } else {
    await db()`update questions set deleted_at = now() where id = ${qid}`;
  }
  return Response.json({ ok: true });
}
