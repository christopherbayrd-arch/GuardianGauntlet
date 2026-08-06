import { createHash, timingSafeEqual } from "crypto";

export const PASSCODE_HEADER = "x-gauntlet-passcode";

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Returns an error Response if the request is not authorized, or null if OK.
 * The console sends the passcode in a header; compare in constant time.
 */
export function requireAdmin(req: Request): Response | null {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return jsonError(
      500,
      "ADMIN_PASSCODE is not set on the server. Add it to your environment variables."
    );
  }
  const provided = req.headers.get(PASSCODE_HEADER) ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return jsonError(401, "Wrong passcode.");
  }
  return null;
}

/** Short, unambiguous game codes (no 0/O/1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newGameCode(length = 5): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalize a group name: trim, collapse inner whitespace, cap the length. */
export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  return name.length > 0 ? name : null;
}

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export function validateQuestionInput(body: {
  prompt?: unknown;
  options?: unknown;
  correct_index?: unknown;
}): { prompt: string; options: string[]; correct_index: number } | string {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return "Question text is required.";
  if (!Array.isArray(body.options)) return "Options must be a list.";
  const options = (body.options as unknown[])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o.length > 0);
  if (options.length < 2 || options.length > 6)
    return "Provide between 2 and 6 answer options.";
  const correct_index = Number(body.correct_index);
  if (
    !Number.isInteger(correct_index) ||
    correct_index < 0 ||
    correct_index >= options.length
  )
    return "Mark one of the options as the correct answer.";
  return { prompt, options, correct_index };
}

/** Normalize a questions row coming back from Postgres. */
export function rowToQuestion<T extends { options: unknown }>(row: T): T & { options: string[] } {
  return {
    ...row,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
  };
}
