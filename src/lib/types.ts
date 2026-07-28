export type GameStatus = "draft" | "open" | "locked" | "results" | "leaderboard";

export interface Game {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  current_index: number;
  reveal: boolean;
  created_at: string;
  /** Set when the game is in "Deleted games" (admin payloads only). */
  deleted_at?: string | null;
}

/** How long a deleted game stays restorable before it's purged for good. */
export const DELETED_RETENTION_DAYS = 30;

/** The exact phrase a host must type to delete a game. */
export function deleteConfirmationPhrase(title: string): string {
  return `Delete ${title}`;
}

/**
 * Does the typed confirmation match "Delete <title>"?
 * Forgiving about capitalization and extra spaces — strict about the words.
 */
export function confirmationMatches(input: string, title: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(input) === norm(deleteConfirmationPhrase(title));
}

/** Whole days left before a deleted game is purged (0 = can go any time now). */
export function daysLeftInTrash(deletedAt: string, now = Date.now()): number {
  const purgeAt =
    new Date(deletedAt).getTime() + DELETED_RETENTION_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((purgeAt - now) / 86_400_000));
}

export interface PublicQuestion {
  id: string;
  game_id: string;
  position: number;
  prompt: string;
  options: string[];
}

export interface AdminQuestion extends PublicQuestion {
  correct_index: number;
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

export const STATUS_LABELS: Record<GameStatus, string> = {
  draft: "Setup",
  open: "Open for answers",
  locked: "Locked",
  results: "Results",
  leaderboard: "Leaderboard",
};

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
