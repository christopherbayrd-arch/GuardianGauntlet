"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useGame, useWakeLock } from "@/lib/useGame";
import { adminFetch, getPasscode } from "@/lib/adminApi";
import type { GameStats, LeaderboardPayload, QuestionResult } from "@/lib/types";
import { OPTION_LETTERS } from "@/lib/types";
import { QrPanel } from "@/components/QrPanel";
import { Wordmark } from "@/components/ui";

const DEFAULT_SECONDS = 12;

export default function DisplayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { game, questions, loading, error } = useGame(code);

  // Never let the presenting laptop go to sleep.
  useWakeLock(true);

  // Optional ?secs=20 in the URL changes how long each question stays up.
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(DEFAULT_SECONDS);
  useEffect(() => {
    const raw = Number(new URLSearchParams(window.location.search).get("secs"));
    if (Number.isFinite(raw) && raw >= 4 && raw <= 120) setSecondsPerQuestion(raw);
  }, []);

  /* ── cycling through questions while OPEN ─────────────────── */
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (game?.status !== "open" || paused || questions.length < 2) return;
    const t = setTimeout(
      () => setIdx((i) => (i + 1) % questions.length),
      secondsPerQuestion * 1000
    );
    return () => clearTimeout(t);
  }, [game?.status, paused, questions.length, idx, secondsPerQuestion]);

  useEffect(() => {
    if (idx >= questions.length) setIdx(0);
  }, [questions.length, idx]);

  /* ── live stats while people are answering ────────────────── */
  const [stats, setStats] = useState<GameStats | null>(null);
  useEffect(() => {
    if (!game || game.status === "results" || game.status === "leaderboard") return;
    let stop = false;
    const pull = async () => {
      try {
        const res = await fetch(`/api/game/${code}/stats`, { cache: "no-store" });
        if (res.ok && !stop) setStats(await res.json());
      } catch {
        /* transient */
      }
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [game?.status, game?.id, code, game]);

  /* ── results payload once the game enters Results mode ────── */
  const [results, setResults] = useState<QuestionResult[] | null>(null);
  useEffect(() => {
    if (game?.status !== "results") {
      setResults(null);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/game/${code}/results`, { cache: "no-store" });
        if (res.ok && !stop) setResults((await res.json()).results);
      } catch {
        /* transient */
      }
    })();
    return () => {
      stop = true;
    };
  }, [game?.status, code]);

  /* ── final standings once the game enters Leaderboard mode ── */
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  useEffect(() => {
    if (game?.status !== "leaderboard") {
      setBoard(null);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/game/${code}/leaderboard`, { cache: "no-store" });
        if (res.ok && !stop) setBoard(await res.json());
      } catch {
        /* transient */
      }
    })();
    return () => {
      stop = true;
    };
  }, [game?.status, code]);

  /* ── fullscreen + idle cursor (PowerPoint feel) ───────────── */
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const wake = () => {
      setIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  /* ── keyboard controls ────────────────────────────────────── */
  const canDrive = Boolean(getPasscode());

  const driveResults = useCallback(
    async (patch: { current_index?: number; reveal?: boolean }) => {
      if (!game || !canDrive) return;
      try {
        await adminFetch(`/api/admin/games/${game.id}`, {
          method: "PATCH",
          body: patch,
        });
      } catch {
        /* console still works as the remote */
      }
    },
    [game, canDrive]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
        return;
      }
      if (!game) return;
      if (game.status === "open") {
        if (e.key === "ArrowRight")
          setIdx((i) => (questions.length ? (i + 1) % questions.length : 0));
        if (e.key === "ArrowLeft")
          setIdx((i) =>
            questions.length ? (i - 1 + questions.length) % questions.length : 0
          );
        if (e.key === " ") {
          e.preventDefault();
          setPaused((p) => !p);
        }
      } else if (game.status === "results" && results) {
        if (e.key === "ArrowRight" && game.current_index < results.length - 1)
          driveResults({ current_index: game.current_index + 1, reveal: false });
        if (e.key === "ArrowLeft" && game.current_index > 0)
          driveResults({ current_index: game.current_index - 1, reveal: false });
        if (e.key === "r" || e.key === "R") driveResults({ reveal: !game.reveal });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, questions.length, results, driveResults, toggleFullscreen]);

  /* ── derived ──────────────────────────────────────────────── */
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const playUrl = origin ? `${origin}/play/${code}` : "";

  if (loading) {
    return (
      <Shell idle={idle}>
        <CenterNote>Loading…</CenterNote>
      </Shell>
    );
  }
  if (error || !game) {
    return (
      <Shell idle={idle}>
        <CenterNote>{error ?? "Game not found."}</CenterNote>
      </Shell>
    );
  }

  const q = questions[Math.min(idx, Math.max(questions.length - 1, 0))];

  return (
    <Shell idle={idle}>
      {/* Header */}
      <header className="flex items-center justify-between gap-6 px-10 pt-7">
        <div className="flex items-center gap-5">
          <Wordmark compact />
          <div className="hidden h-8 w-px bg-white/15 md:block" />
          <div className="hidden max-w-[40vw] truncate text-lg font-semibold text-steel-300 md:block">
            {game.title}
          </div>
        </div>
        {(game.status === "open" || game.status === "locked") && (
          <div className="flex items-center gap-3 rounded-full bg-white/10 px-5 py-2 text-steel-200">
            <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-gold-500" />
            <span className="text-lg font-semibold tabular-nums">
              {stats?.participants ?? 0} playing · {stats?.total_answers ?? 0} answers in
            </span>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 items-stretch gap-10 px-10 pb-8 pt-4">
        {game.status === "draft" && (
          <DraftSplash title={game.title} playUrl={playUrl} code={game.code} />
        )}

        {game.status === "open" &&
          (q ? (
            <>
              <section className="flex min-w-0 flex-1 flex-col justify-center">
                <QuestionSlide
                  key={q.id}
                  index={idx}
                  total={questions.length}
                  prompt={q.prompt}
                  options={q.options}
                />
                <div className="mt-8">
                  {!paused && questions.length > 1 ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        key={`${idx}-${secondsPerQuestion}`}
                        className="h-full rounded-full bg-steel-500"
                        style={{
                          animation: `ticker ${secondsPerQuestion}s linear both`,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="h-1.5 rounded-full bg-white/10" />
                  )}
                  <p className="mt-3 text-center text-lg text-steel-400">
                    Answer every question from your phone, in any order — they all
                    stay open{paused ? " · paused" : ""}
                  </p>
                </div>
              </section>
              <aside className="hidden w-[320px] shrink-0 flex-col items-center justify-center gap-6 lg:flex">
                <QrPanel url={playUrl} code={game.code} size={210} />
              </aside>
            </>
          ) : (
            <CenterNote>No questions loaded yet — add some in the console.</CenterNote>
          ))}

        {game.status === "locked" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <LockIcon />
            <h2 className="text-6xl font-extrabold text-white">Answers are locked</h2>
            <p className="text-2xl text-steel-300">
              {stats?.participants ?? 0} players · {stats?.total_answers ?? 0} answers
              submitted
            </p>
            <p className="text-xl text-steel-400">Results coming up…</p>
          </div>
        )}

        {game.status === "results" && (
          <ResultsSlide
            questions={questions}
            results={results}
            currentIndex={game.current_index}
            reveal={game.reveal}
          />
        )}

        {game.status === "leaderboard" && <LeaderboardSlide board={board} />}
      </div>

      {/* Control strip (fades away with the cursor) */}
      <div
        className={
          "pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-6 pb-4 transition-opacity duration-500 " +
          (idle ? "opacity-0" : "opacity-100")
        }
      >
        <span className="text-xs text-steel-500">
          {game.status === "open" &&
            "← → skip · Space pause · F full screen"}
          {game.status === "results" &&
            (canDrive
              ? "← → question · R reveal · F full screen"
              : "Advance from the question console · F full screen")}
          {(game.status === "draft" ||
            game.status === "locked" ||
            game.status === "leaderboard") &&
            "F full screen"}
        </span>
        <button
          onClick={toggleFullscreen}
          className="pointer-events-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-steel-200 hover:bg-white/20"
        >
          {fullscreen ? "Exit full screen (Esc)" : "Full screen (F)"}
        </button>
      </div>
    </Shell>
  );
}

/* ────────────────────────── pieces ────────────────────────── */

function Shell({ children, idle }: { children: React.ReactNode; idle: boolean }) {
  return (
    <main
      className={
        "relative flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 " +
        (idle ? "cursor-idle" : "")
      }
    >
      {/* soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, #7b9ac2 0%, rgba(123,154,194,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-52 -left-40 h-[30rem] w-[30rem] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, #e9b44c 0%, rgba(233,180,76,0) 70%)",
        }}
      />
      {children}
    </main>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-center text-3xl font-semibold text-steel-300">
      {children}
    </div>
  );
}

function DraftSplash({
  title,
  playUrl,
  code,
}: {
  title: string;
  playUrl: string;
  code: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
      <div className="slide-in">
        <div className="text-sm font-bold uppercase tracking-[0.3em] text-gold-500">
          Get ready
        </div>
        <h1 className="mt-3 max-w-4xl text-6xl font-extrabold leading-tight text-white">
          {title}
        </h1>
        <p className="mt-4 text-2xl text-steel-300">
          Scan now — questions open soon.
        </p>
      </div>
      {playUrl && <QrPanel url={playUrl} code={code} size={240} />}
    </div>
  );
}

function QuestionSlide({
  index,
  total,
  prompt,
  options,
}: {
  index: number;
  total: number;
  prompt: string;
  options: string[];
}) {
  const promptSize =
    prompt.length <= 70
      ? "text-6xl"
      : prompt.length <= 130
        ? "text-5xl"
        : "text-4xl";
  const optionSize = options.some((o) => o.length > 40) ? "text-2xl" : "text-3xl";

  return (
    <div className="slide-in">
      <div className="mb-6 flex items-center gap-4">
        <span className="rounded-full bg-gold-500 px-5 py-1.5 text-lg font-extrabold text-navy-950">
          Question {index + 1} of {total}
        </span>
      </div>
      <h2 className={`${promptSize} max-w-[60rem] font-extrabold leading-tight text-white`}>
        {prompt}
      </h2>
      <ul className="mt-10 grid max-w-[60rem] grid-cols-1 gap-4 xl:grid-cols-2">
        {options.map((opt, i) => (
          <li
            key={i}
            className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/5 px-6 py-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-steel-500 text-2xl font-extrabold text-navy-950">
              {OPTION_LETTERS[i]}
            </span>
            <span className={`${optionSize} font-semibold text-steel-100`}>{opt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultsSlide({
  questions,
  results,
  currentIndex,
  reveal,
}: {
  questions: { id: string; prompt: string; options: string[] }[];
  results: QuestionResult[] | null;
  currentIndex: number;
  reveal: boolean;
}) {
  if (!results) return <CenterNote>Tallying the room…</CenterNote>;
  if (results.length === 0) return <CenterNote>No questions to show.</CenterNote>;

  const i = Math.min(currentIndex, results.length - 1);
  const r = results[i];
  const q = questions.find((x) => x.id === r.question_id);
  if (!q) return <CenterNote>Tallying the room…</CenterNote>;

  const max = Math.max(...r.counts, 1);
  const promptSize = q.prompt.length <= 90 ? "text-5xl" : "text-4xl";

  return (
    <section
      className="flex min-w-0 flex-1 flex-col justify-center"
      key={`${r.question_id}-${reveal}`}
    >
      <div className="slide-in">
        <div className="mb-6 flex items-center gap-4">
          <span className="rounded-full bg-white/10 px-5 py-1.5 text-lg font-bold text-steel-200">
            Results — Question {i + 1} of {results.length}
          </span>
          <span className="text-lg text-steel-400 tabular-nums">
            {r.total} answer{r.total === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className={`${promptSize} max-w-[62rem] font-extrabold leading-tight text-white`}>
          {q.prompt}
        </h2>

        <ul className="mt-10 max-w-[62rem] space-y-4">
          {q.options.map((opt, oi) => {
            const isCorrect = oi === r.correct_index;
            const count = r.counts[oi] ?? 0;
            const pct = r.total ? Math.round((count / r.total) * 100) : 0;
            const dimmed = reveal && !isCorrect;
            return (
              <li
                key={oi}
                className={
                  "flex items-center gap-5 transition-opacity duration-500 " +
                  (dimmed ? "opacity-50" : "opacity-100")
                }
              >
                <span
                  className={
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-extrabold " +
                    (reveal && isCorrect
                      ? "bg-gold-500 text-navy-950"
                      : "bg-steel-600 text-white")
                  }
                >
                  {OPTION_LETTERS[oi]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-4">
                    <span className="truncate text-2xl font-semibold text-steel-100">
                      {opt}
                      {reveal && isCorrect && (
                        <span className="ml-3 rounded-full bg-gold-500 px-3 py-0.5 text-base font-extrabold text-navy-950">
                          ✓ Correct
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-2xl font-bold tabular-nums text-white">
                      {count}
                      <span className="ml-2 text-lg font-semibold text-steel-400">
                        {pct}%
                      </span>
                    </span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-lg bg-white/5">
                    <div
                      className={
                        "bar-grow h-full rounded-lg " +
                        (reveal && isCorrect ? "bg-gold-500" : "bg-steel-500")
                      }
                      style={{ width: `${Math.max((count / max) * 100, count > 0 ? 6 : 2)}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {!reveal && (
          <p className="mt-8 text-xl text-steel-400">
            Which one was it? <span className="text-gold-400">Correct answer coming up…</span>
          </p>
        )}
      </div>
    </section>
  );
}

const PODIUM_ORDER = [1, 0, 2]; // display 2nd · 1st · 3rd

function LeaderboardSlide({ board }: { board: LeaderboardPayload | null }) {
  if (!board) return <CenterNote>Crunching the final scores…</CenterNote>;
  if (board.leaderboard.length === 0)
    return <CenterNote>No named players to rank yet.</CenterNote>;

  const top = board.leaderboard.slice(0, 10);
  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <section className="flex min-w-0 flex-1 flex-col items-center justify-center">
      <div className="slide-in flex w-full max-w-[70rem] flex-col items-center">
        <div className="mb-8 flex items-center gap-4">
          <span className="rounded-full bg-gold-500 px-6 py-2 text-xl font-extrabold text-navy-950">
            🏆 Final standings
          </span>
          <span className="text-xl text-steel-400 tabular-nums">
            {board.players} player{board.players === 1 ? "" : "s"} ·{" "}
            {board.total_questions} questions
          </span>
        </div>

        {/* Podium — 2nd, 1st, 3rd */}
        <div className="flex w-full items-end justify-center gap-6">
          {PODIUM_ORDER.map((pi, col) => {
            const e = podium[pi];
            if (!e) return <div key={col} className="w-64" />;
            const first = e.rank === 1;
            const name = `${e.first_name} ${e.last_name}`;
            return (
              <div
                key={col}
                className={
                  "slide-in flex w-80 flex-col items-center rounded-2xl border px-5 text-center " +
                  (first
                    ? "border-gold-500 bg-gold-500/15 py-8"
                    : "border-white/15 bg-white/5 py-6")
                }
                style={{ animationDelay: `${150 + col * 120}ms` }}
              >
                <div className={first ? "text-6xl" : "text-5xl"}>
                  {["🥇", "🥈", "🥉"][e.rank - 1] ?? `#${e.rank}`}
                </div>
                <div
                  className={
                    "mt-3 w-full break-words font-extrabold leading-tight " +
                    (first
                      ? name.length > 18
                        ? "text-2xl text-white"
                        : "text-3xl text-white"
                      : name.length > 18
                        ? "text-xl text-steel-100"
                        : "text-2xl text-steel-100")
                  }
                >
                  {name}
                </div>
                <div
                  className={
                    "mt-1 text-xl font-bold tabular-nums " +
                    (first ? "text-gold-400" : "text-steel-300")
                  }
                >
                  {e.correct} / {board.total_questions}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ranks 4–10 */}
        {rest.length > 0 && (
          <ul className="mt-8 grid w-full max-w-[56rem] grid-cols-1 gap-x-10 gap-y-2 xl:grid-cols-2">
            {rest.map((e, i) => (
              <li
                key={`${e.rank}-${e.first_name}-${e.last_name}-${i}`}
                className="slide-in flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5"
                style={{ animationDelay: `${550 + i * 90}ms` }}
              >
                <span className="w-9 shrink-0 text-right text-xl font-extrabold tabular-nums text-steel-400">
                  {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-xl font-semibold text-steel-100">
                  {e.first_name} {e.last_name}
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums text-steel-300">
                  {e.correct} / {board.total_questions}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-24 w-24 text-gold-500" fill="none">
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="rgba(233,180,76,0.12)"
      />
      <path
        d="M8 10.5V7.5a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.2" r="1.4" fill="currentColor" />
      <path d="M12 16.4v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
