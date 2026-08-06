export type GameStatus = "draft" | "open" | "locked" | "results" | "leaderboard";

/**
 * How a game is played while it is Open:
 * - "self": everyone answers at their own pace (the original mode)
 * - "live": host-paced — phones can only answer the question currently on
 *   the big screen; the host reveals, then advances
 */
export type PlayMode = "self" | "live";

export interface Game {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  play_mode: PlayMode;
  group_id: string | null;
  current_index: number;
  reveal: boolean;
  created_at: string;
}

/** A flat organizational bucket for games (e.g. a company location). */
export interface GameGroup {
  id: string;
  name: string;
  created_at: string;
}

export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  self: "Self-paced",
  live: "Live · host-paced",
};

export interface PublicQuestion {
  id: string;
  game_id: string;
  position: number;
  prompt: string;
  options: string[];
}

export interface AdminQuestion extends PublicQuestion {
  correct_index: number;
  created_at: string;
  /** Set only when the question's content was edited after creation. */
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface GameStats {
  participants: number;
  total_answers: number;
  by_question: { question_id: string; count: number }[];
}

export interface Distribution {
  question_id: string;
  counts: number[];
  total: number;
}

export interface QuestionResult {
  question_id: string;
  position: number;
  correct_index: number;
  total: number;
  counts: number[];
}

/** One row of the final standings. Ties share a rank (1, 2, 2, 4…). */
export interface LeaderboardEntry {
  rank: number;
  first_name: string;
  last_name: string;
  correct: number;
  answered: number;
  is_me?: boolean;
  /** Present only in the admin console payload — never sent to players. */
  participant_id?: string;
}

export interface LeaderboardPayload {
  leaderboard: LeaderboardEntry[];
  total_questions: number;
  players: number;
}

export interface GameListItem extends Game {
  question_count: number;
  participant_count: number;
}

/** A soft-deleted game sitting in the recycle bin. */
export interface DeletedGameListItem {
  id: string;
  code: string;
  title: string;
  deleted_at: string;
}

/** Days a deleted game stays restorable before it is purged for good. */
export const DELETED_RETENTION_DAYS = 10;

/**
 * Deleting a game requires typing "Delete <game title>". Case-insensitive,
 * and forgiving about extra whitespace — but nothing less than the full
 * phrase counts.
 */
export function confirmationMatches(input: string, title: string): boolean {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(input) === norm(`Delete ${title}`);
}

export const STATUS_LABELS: Record<GameStatus, string> = {
  draft: "Setup",
  open: "Open for answers",
  locked: "Locked",
  results: "Results",
  leaderboard: "Leaderboard",
};

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
