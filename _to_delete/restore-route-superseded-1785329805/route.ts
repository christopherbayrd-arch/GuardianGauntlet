import { db } from "@/lib/db";
import { jsonError, requireAdmin } from "@/lib/server";
import { DELETED_RETENTION_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/**
 * Bring a game back from "Deleted games", exactly as it was — questions,
 * players, and answers included. Only works inside the 30-day window;
 * anything older is purged first so an expired game can't sneak back.
 */
export async function POST(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(404, "Game not found.");
  const sql = db();

  // Purge anything past the window before restoring (same rule as the list).
  await sql`
    delete from games
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => ${DELETED_RETENTION_DAYS})`;

  const rows = await sql`
    update games set deleted_at = null
    where id = ${id} and deleted_at is not null
    returning *`;
  if (rows.length > 0) return Response.json({ game: rows[0] });

  const exists = await sql`select id from games where id = ${id}`;
  if (exists.length > 0)
    return jsonError(400, "This game isn't in Deleted games — nothing to restore.");
  return jsonError(
    404,
    "Game not found — deleted games are removed for good after 30 days."
  );
}
