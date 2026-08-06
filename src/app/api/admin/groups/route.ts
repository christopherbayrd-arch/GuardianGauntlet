import { db } from "@/lib/db";
import {
  isUniqueViolation,
  jsonError,
  normalizeGroupName,
  requireAdmin,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const sql = db();
  const groups = await sql`
    select id, name, created_at from groups order by lower(name) asc`;
  return Response.json({ groups });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const name = normalizeGroupName(body.name);
  if (!name) return jsonError(400, "Give the group a name.");

  try {
    const rows = await db()`
      insert into groups (name) values (${name}) returning id, name, created_at`;
    return Response.json({ group: rows[0] });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return jsonError(409, `A group named "${name}" already exists.`);
    }
    return jsonError(500, e instanceof Error ? e.message : "Database error.");
  }
}
