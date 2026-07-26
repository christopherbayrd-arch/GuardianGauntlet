export type GameStatus = "draft" | "open" | "locked" | "results";

export interface Game {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  current_index: number;
  reveal: boolean;
  created_at: string;
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

export interface GameListItem extends Game {
  question_count: number;
  participant_count: number;
}

export const STATUS_LABELS: Record<GameStatus, string> = {
  draft: "Setup",
  open: "Open for answers",
  locked: "Locked",
  results: "Results",
};

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
