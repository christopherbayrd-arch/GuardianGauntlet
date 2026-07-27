"use client";

/**
 * Participant identity, one per game per device, kept in localStorage so
 * refreshing the page never double-counts anyone. Since the leaderboard
 * feature, identity includes the player's name — the phone shows a name
 * gate until joinGame() has succeeded.
 */

export interface StoredParticipant {
  id: string;
  first_name: string;
  last_name: string;
}

const participantKey = (gameId: string) => `gg:participant:${gameId}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What this device knows about itself for this game.
 * - Named participant → full record (skip the name gate).
 * - Legacy value from before the name feature (bare uuid) → id only,
 *   so the name gate shows but saved answers stay attached to the id.
 */
export function getStoredParticipant(
  gameId: string
): { id: string; first_name?: string; last_name?: string } | null {
  const raw = window.localStorage.getItem(participantKey(gameId));
  if (!raw) return null;
  if (UUID_RE.test(raw)) return { id: raw }; // pre-leaderboard format
  try {
    const parsed = JSON.parse(raw) as Partial<StoredParticipant>;
    if (parsed && typeof parsed.id === "string" && UUID_RE.test(parsed.id)) {
      return {
        id: parsed.id,
        first_name:
          typeof parsed.first_name === "string" && parsed.first_name
            ? parsed.first_name
            : undefined,
        last_name:
          typeof parsed.last_name === "string" && parsed.last_name
            ? parsed.last_name
            : undefined,
      };
    }
  } catch {
    /* corrupted — treat as absent */
  }
  return null;
}

/**
 * Register (or re-register) this device with the player's name. Passing the
 * existing id keeps previously saved answers; the server also heals the row
 * if it went missing (e.g. the host reset the game between visits).
 */
export async function joinGame(
  code: string,
  gameId: string,
  firstName: string,
  lastName: string,
  existingId?: string
): Promise<StoredParticipant> {
  const res = await fetch(`/api/game/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      participant_id: existingId,
      first_name: firstName,
      last_name: lastName,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    participant_id?: string;
    first_name?: string;
    last_name?: string;
    error?: string;
  };
  if (!res.ok || !data.participant_id) {
    throw new Error(
      data.error ?? "Could not join the game. Check your connection and try again."
    );
  }
  const record: StoredParticipant = {
    id: data.participant_id,
    first_name: data.first_name ?? firstName,
    last_name: data.last_name ?? lastName,
  };
  window.localStorage.setItem(participantKey(gameId), JSON.stringify(record));
  return record;
}

export async function submitAnswer(
  code: string,
  body: { participant_id: string; question_id: string; choice_index: number }
): Promise<void> {
  const res = await fetch(`/api/game/${encodeURIComponent(code)}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not save your answer.");
  }
}

const answersKey = (gameId: string) => `gg:answers:${gameId}`;

/** The choices this device has made, kept locally for the results screen. */
export function getLocalAnswers(gameId: string): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(answersKey(gameId)) ?? "{}");
  } catch {
    return {};
  }
}

export function setLocalAnswer(
  gameId: string,
  questionId: string,
  choiceIndex: number
) {
  const all = getLocalAnswers(gameId);
  all[questionId] = choiceIndex;
  window.localStorage.setItem(answersKey(gameId), JSON.stringify(all));
}
