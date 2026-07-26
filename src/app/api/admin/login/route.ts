import { requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return Response.json({ ok: true });
}
