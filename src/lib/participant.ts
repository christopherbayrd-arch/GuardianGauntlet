"use client";

/**
 * Anonymous participant identity, one per game per device, kept in
 * localStorage so refreshing the page never double-counts anyone.
 */
export async function getOrCreateParticipant(
  code: string,
  gameId: string
): Promise<string> {
  const key = `gg:participant:${gameId}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const res = await fetch(`/api/game/${encodeURIComponent(code)}/join`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Could not join the game. Check your connection and refresh.");
  }
  const data = (await res.json()) as { participant_id: string };
  window.localStorage.setItem(key, data.participant_id);
  return data.participant_id;
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
