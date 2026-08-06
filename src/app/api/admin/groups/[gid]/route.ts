import { db } from "@/lib/db";
import {
  isUniqueViolation,
  jsonError,
  normalizeGroupName,
  requireAdmin,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ gid: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH { name } → rename the group. */
export async function PATCH(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { gid } = await params;
  if (!UUID_RE.test(gid)) return jsonError(404, "Group not found.");
  const body = await req.json().catch(() => ({}));
  const name = normalizeGroupName(body.name);
  if (!name) return jsonError(400, "Give the group a name.");

  try {
    const rows = await db()`
      update groups set name = ${name} where id = ${gid}
      returning id, name, created_at`;
    if (rows.length === 0) return jsonError(404, "Group not found.");
    return Response.json({ group: rows[0] });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return jsonError(409, `A group named "${name}" already exists.`);
    }
    return jsonError(500, e instanceof Error ? e.message : "Database error.");
  }
}

/**
 * DELETE → remove the group. Its games are NOT deleted — the group_id
 * foreign key is `on delete set null`, so they simply become ungrouped.
 */
export async function DELETE(req: Request, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { gid } = await params;
  if (!UUID_RE.test(gid)) return jsonError(404, "Group not found.");

  const rows = await db()`delete from groups where id = ${gid} returning id`;
  if (rows.length === 0) return jsonError(404, "Group not found.");
  return Response.json({ ok: true });
}
