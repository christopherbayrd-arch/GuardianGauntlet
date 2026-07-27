import { db } from "@/lib/db";
import { jsonError, requireAdmin } from "@/lib/server";

type Params = { params: Promise<{ id: string; pid: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin: remove a player from a game — for cleaning up duplicate or
 * abandoned entries before showing the leaderboard (e.g. someone who
 * switched phones mid-game and rejoined under a second identity).
 * Deleting the participant cascades to their answers.
 */
export async function DELETE(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id, pid } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(pid)) {
    return jsonError(404, "Player not found.");
  }

  const rows = await db()`
    delete from participants
    where id = ${pid} and game_id = ${id}
    returning id`;
  if (rows.length === 0) {
    return jsonError(404, "Player not found in this game.");
  }
  return Response.json({ ok: true });
}
