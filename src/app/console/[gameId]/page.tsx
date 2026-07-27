"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { AdminAuthError, adminFetch, getPasscode } from "@/lib/adminApi";
import type {
  AdminQuestion,
  Distribution,
  Game,
  GameStats,
  GameStatus,
  LeaderboardEntry,
} from "@/lib/types";
import { OPTION_LETTERS } from "@/lib/types";
import { CopyButton, Spinner, StatusPill } from "@/components/ui";

interface Detail {
  game: Game;
  questions: AdminQuestion[];
  stats: GameStats;
  distributions: Distribution[];
  leaderboard: LeaderboardEntry[];
}

const MODES: { status: GameStatus; label: string; desc: string }[] = [
  { status: "draft", label: "1 · Setup", desc: "Load & edit questions. Players see a waiting screen." },
  { status: "open", label: "2 · Open", desc: "Phones can answer. Big screen cycles the questions." },
  { status: "locked", label: "3 · Lock", desc: "Submissions stop instantly, everywhere." },
  { status: "results", label: "4 · Results", desc: "Walk through the answers on the big screen." },
  { status: "leaderboard", label: "5 · Leaderboard", desc: "Crown the winners — top 10 on the big screen." },
];

export default function GameConsolePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;
  const router = useRouter();

  const [game, setGame] = useState<Game | null>(null);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // question id | "new" | "bulk" | null
  const [origin, setOrigin] = useState("");
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useEffect(() => setOrigin(window.location.origin), []);

  const authFail = useCallback(
    (e: unknown) => {
      if (e instanceof AdminAuthError) {
        router.push("/console");
        return true;
      }
      return false;
    },
    [router]
  );

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<Detail>(`/api/admin/games/${gameId}`);
      setGame(d.game);
      setStats(d.stats);
      setDistributions(d.distributions);
      setLeaderboard(d.leaderboard ?? []);
      if (editingRef.current === null) setQuestions(d.questions);
      setError(null);
    } catch (e) {
      if (!authFail(e))
        setError(e instanceof Error ? e.message : "Could not load the game.");
    }
  }, [gameId, authFail]);

  useEffect(() => {
    if (!getPasscode()) {
      router.push("/console");
      return;
    }
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(t);
  }, [load, router]);

  const patchGame = useCallback(
    async (patch: Partial<Pick<Game, "title" | "status" | "current_index" | "reveal">>) => {
      setBusy(true);
      try {
        const d = await adminFetch<{ game: Game }>(`/api/admin/games/${gameId}`, {
          method: "PATCH",
          body: patch,
        });
        setGame(d.game);
        setError(null);
      } catch (e) {
        if (!authFail(e)) setError(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setBusy(false);
      }
    },
    [gameId, authFail]
  );

  const saveQuestion = async (
    id: string | null,
    data: { prompt: string; options: string[]; correct_index: number }
  ) => {
    setBusy(true);
    try {
      if (id) {
        const d = await adminFetch<{ question: AdminQuestion }>(
          `/api/admin/questions/${id}`,
          { method: "PATCH", body: data }
        );
        setQuestions((qs) => qs.map((q) => (q.id === id ? d.question : q)));
      } else {
        const d = await adminFetch<{ question: AdminQuestion }>(
          `/api/admin/games/${gameId}/questions`,
          { method: "POST", body: data }
        );
        setQuestions((qs) => [...qs, d.question]);
      }
      setEditing(null);
      setError(null);
    } catch (e) {
      if (!authFail(e)) setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await adminFetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      setQuestions((qs) => qs.filter((q) => q.id !== id));
    } catch (e) {
      if (!authFail(e)) setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = questions.findIndex((q) => q.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    setQuestions(next);
    try {
      await adminFetch(`/api/admin/games/${gameId}/questions`, {
        method: "PUT",
        body: { ordered_ids: next.map((q) => q.id) },
      });
    } catch (e) {
      if (!authFail(e)) setError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  const removeParticipant = async (pid: string, name: string) => {
    if (
      !confirm(
        `Remove ${name} from this game? Their answers are deleted too. ` +
          `Use this for duplicate or abandoned entries.`
      )
    )
      return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/games/${gameId}/participants/${pid}`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      if (!authFail(e)) setError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  };

  const action = async (kind: "reset" | "duplicate" | "delete") => {
    const confirms: Record<string, string> = {
      reset:
        "Clear ALL answers and players for this game? Questions are kept. Use this after a test run.",
      delete: "Permanently delete this game, its questions, and all answers?",
    };
    if (confirms[kind] && !confirm(confirms[kind])) return;
    setBusy(true);
    try {
      if (kind === "delete") {
        await adminFetch(`/api/admin/games/${gameId}`, { method: "DELETE" });
        router.push("/console");
        return;
      }
      const d = await adminFetch<{ game?: { id: string } }>(
        `/api/admin/games/${gameId}/actions`,
        { method: "POST", body: { action: kind } }
      );
      if (kind === "duplicate" && d.game) {
        router.push(`/console/${d.game.id}`);
        return;
      }
      await load();
    } catch (e) {
      if (!authFail(e)) setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const answeredFor = (qid: string) =>
    stats?.by_question.find((b) => b.question_id === qid)?.count ?? 0;
  const distFor = (qid: string) => distributions.find((d) => d.question_id === qid);

  const playUrl = origin && game ? `${origin}/play/${game.code}` : "";
  const displayUrl = origin && game ? `${origin}/display/${game.code}` : "";
  const current = game
    ? questions[Math.min(game.current_index, Math.max(questions.length - 1, 0))]
    : undefined;

  if (!game)
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        {error ? (
          <div className="card p-6 text-red-700">{error}</div>
        ) : (
          <Spinner label="Loading game…" />
        )}
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/console" className="btn btn-ghost !px-3">
          ← All games
        </Link>
        <TitleEditor title={game.title} onSave={(t) => patchGame({ title: t })} />
        <span className="chip bg-steel-100 font-mono text-sm text-navy-800">
          {game.code}
        </span>
        <StatusPill status={game.status} />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Game mode */}
      <section className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-steel-600">
          Game mode
        </h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {MODES.map((m) => {
            const active = game.status === m.status;
            return (
              <button
                key={m.status}
                disabled={busy}
                onClick={() => patchGame({ status: m.status })}
                className={
                  "rounded-xl border p-3 text-left transition-colors " +
                  (active
                    ? "border-navy-800 bg-navy-800 text-white shadow"
                    : "border-steel-200 bg-white hover:border-steel-400")
                }
              >
                <div className="text-sm font-bold">{m.label}</div>
                <div
                  className={
                    "mt-1 text-xs leading-snug " +
                    (active ? "text-steel-300" : "text-steel-600")
                  }
                >
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
        {game.status === "open" && (
          <p className="mt-3 text-xs text-steel-600">
            Phones answer at their own pace. When you hit{" "}
            <span className="font-semibold">Lock</span>, the database rejects any
            further submissions instantly.
          </p>
        )}
      </section>

      {/* Links + live stats */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-steel-600">
            Links & QR
          </h2>
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-xl border border-steel-200 bg-white p-2">
              {playUrl ? (
                <QRCode value={playUrl} size={110} fgColor="#101f3a" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-3 text-sm">
              <div>
                <div className="font-semibold text-navy-900">Players (phones)</div>
                <div className="truncate text-xs text-steel-600">{playUrl}</div>
                <div className="mt-1 flex gap-2">
                  <CopyButton text={playUrl} label="Copy link" />
                  <a
                    className="btn btn-ghost !px-3 !py-1.5 text-xs"
                    href={playUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ↗
                  </a>
                </div>
              </div>
              <div>
                <div className="font-semibold text-navy-900">Big screen (projector)</div>
                <div className="truncate text-xs text-steel-600">{displayUrl}</div>
                <div className="mt-1 flex gap-2">
                  <CopyButton text={displayUrl} label="Copy link" />
                  <a
                    className="btn btn-steel !px-3 !py-1.5 text-xs"
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open big screen ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-steel-600">
            Live
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-steel-50 p-3">
              <div className="text-3xl font-extrabold text-navy-900">
                {stats?.participants ?? 0}
              </div>
              <div className="text-xs font-medium text-steel-600">players</div>
            </div>
            <div className="rounded-xl bg-steel-50 p-3">
              <div className="text-3xl font-extrabold text-navy-900">
                {stats?.total_answers ?? 0}
              </div>
              <div className="text-xs font-medium text-steel-600">answers in</div>
            </div>
            <div className="rounded-xl bg-steel-50 p-3">
              <div className="text-3xl font-extrabold text-navy-900">
                {questions.length}
              </div>
              <div className="text-xs font-medium text-steel-600">questions</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-steel-600">
            Updates every few seconds. Answer breakdowns per option are visible to
            you below — the room never sees them until Results mode.
          </p>
        </section>
      </div>

      {/* Results walkthrough */}
      {(game.status === "results" || game.status === "locked") && (
        <section className="card mb-6 border-2 border-gold-500 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-steel-600">
              Results walkthrough
            </h2>
            {game.status === "locked" && (
              <span className="text-xs text-steel-600">
                Switch to <b>Results</b> to put this on the big screen.
              </span>
            )}
          </div>

          {questions.length === 0 ? (
            <p className="text-sm text-steel-600">No questions yet.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-ghost"
                  disabled={busy || game.current_index <= 0}
                  onClick={() =>
                    patchGame({ current_index: game.current_index - 1, reveal: false })
                  }
                >
                  ← Prev
                </button>
                <select
                  className="input !w-auto"
                  value={Math.min(game.current_index, questions.length - 1)}
                  onChange={(e) =>
                    patchGame({ current_index: Number(e.target.value), reveal: false })
                  }
                >
                  {questions.map((q, i) => (
                    <option key={q.id} value={i}>
                      Q{i + 1} — {q.prompt.slice(0, 40)}
                      {q.prompt.length > 40 ? "…" : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost"
                  disabled={busy || game.current_index >= questions.length - 1}
                  onClick={() =>
                    patchGame({ current_index: game.current_index + 1, reveal: false })
                  }
                >
                  Next →
                </button>
                <button
                  className={game.reveal ? "btn btn-ghost" : "btn btn-gold"}
                  disabled={busy || game.status !== "results"}
                  onClick={() => patchGame({ reveal: !game.reveal })}
                >
                  {game.reveal ? "Hide correct answer" : "★ Reveal correct answer"}
                </button>
              </div>

              {current && (
                <WalkthroughPreview
                  question={current}
                  dist={distFor(current.id)}
                  reveal={game.reveal && game.status === "results"}
                  index={Math.min(game.current_index, questions.length - 1)}
                  total={questions.length}
                />
              )}
              <p className="mt-3 text-xs text-steel-600">
                The big screen follows these controls within a couple of seconds.
                Tip: talk through the guesses first, then hit Reveal.
              </p>
            </>
          )}
        </section>
      )}

      {/* Standings preview */}
      {(game.status === "locked" ||
        game.status === "results" ||
        game.status === "leaderboard") && (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-steel-600">
              Leaderboard{game.status === "leaderboard" ? " — live on the big screen" : " preview"}
            </h2>
            {game.status !== "leaderboard" && (
              <span className="text-xs text-steel-600">
                Only you can see this until you switch to <b>5 · Leaderboard</b>.
              </span>
            )}
          </div>
          {leaderboard.length === 0 ? (
            <p className="rounded-xl bg-steel-50 p-4 text-sm text-steel-600">
              No named players yet.
            </p>
          ) : (
            <ol className="grid grid-cols-1 gap-x-8 gap-y-1.5 md:grid-cols-2">
              {leaderboard.slice(0, 10).map((e, i) => (
                <li
                  key={e.participant_id ?? `${e.rank}-${e.first_name}-${e.last_name}-${i}`}
                  className={
                    "group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm " +
                    (e.rank === 1 ? "bg-gold-100" : "bg-steel-50")
                  }
                >
                  <span className="w-6 shrink-0 text-right font-extrabold tabular-nums text-navy-800">
                    {e.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-navy-900">
                    {e.first_name} {e.last_name}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-steel-600">
                    {e.correct} correct · {e.answered} answered
                  </span>
                  {e.participant_id && (
                    <button
                      className="shrink-0 px-1 text-steel-400 opacity-40 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      disabled={busy}
                      title="Remove this player (for duplicates & abandoned entries)"
                      aria-label={`Remove ${e.first_name} ${e.last_name}`}
                      onClick={() =>
                        removeParticipant(
                          e.participant_id!,
                          `${e.first_name} ${e.last_name}`
                        )
                      }
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {leaderboard.length > 10 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-steel-600">
                Showing the top 10 of {leaderboard.length} players (ties share a
                rank) — click to see everyone
              </summary>
              <ol className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
                {leaderboard.slice(10).map((e, i) => (
                  <li
                    key={e.participant_id ?? `rest-${i}`}
                    className="group flex items-center gap-3 rounded-lg bg-white px-3 py-1 text-sm"
                  >
                    <span className="w-6 shrink-0 text-right font-bold tabular-nums text-steel-500">
                      {e.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-navy-900">
                      {e.first_name} {e.last_name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-steel-500">
                      {e.correct} correct · {e.answered} answered
                    </span>
                    {e.participant_id && (
                      <button
                        className="shrink-0 px-1 text-steel-400 opacity-40 transition-opacity hover:text-red-600 group-hover:opacity-100"
                        disabled={busy}
                        title="Remove this player (for duplicates & abandoned entries)"
                        aria-label={`Remove ${e.first_name} ${e.last_name}`}
                        onClick={() =>
                          removeParticipant(
                            e.participant_id!,
                            `${e.first_name} ${e.last_name}`
                          )
                        }
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {/* Questions */}
      <section className="card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-steel-600">
            Questions ({questions.length})
          </h2>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost"
              onClick={() => setEditing(editing === "bulk" ? null : "bulk")}
            >
              Bulk add
            </button>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              + Add question
            </button>
          </div>
        </div>

        {editing === "bulk" && (
          <BulkAdd
            gameId={gameId}
            onDone={() => {
              setEditing(null);
              load();
            }}
            onAuthFail={authFail}
          />
        )}

        {editing === "new" && (
          <div className="mb-4 rounded-xl border-2 border-steel-300 bg-steel-50 p-4">
            <QuestionForm
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(data) => saveQuestion(null, data)}
            />
          </div>
        )}

        {questions.length === 0 && editing === null && (
          <p className="rounded-xl bg-steel-50 p-6 text-center text-sm text-steel-600">
            No questions yet. Add them one by one, or use <b>Bulk add</b> to paste a
            whole list at once.
          </p>
        )}

        <ul className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-steel-200 p-4">
              {editing === q.id ? (
                <QuestionForm
                  busy={busy}
                  initial={q}
                  onCancel={() => setEditing(null)}
                  onSave={(data) => saveQuestion(q.id, data)}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-800 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <button
                      className="text-steel-500 hover:text-navy-800 disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => move(q.id, -1)}
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      className="text-steel-500 hover:text-navy-800 disabled:opacity-30"
                      disabled={i === questions.length - 1}
                      onClick={() => move(q.id, 1)}
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-navy-900">{q.prompt}</p>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        <span className="text-steel-600">
                          {answeredFor(q.id)} answered
                        </span>
                        <button
                          className="btn btn-ghost !px-3 !py-1 text-xs"
                          onClick={() => setEditing(q.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger !px-3 !py-1 text-xs"
                          onClick={() => deleteQuestion(q.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.correct_index;
                        const count = distFor(q.id)?.counts[oi] ?? 0;
                        return (
                          <li
                            key={oi}
                            className={
                              "chip " +
                              (isCorrect
                                ? "bg-gold-100 text-navy-900 ring-1 ring-gold-500"
                                : "bg-steel-100 text-navy-800")
                            }
                            title={isCorrect ? "Correct answer" : undefined}
                          >
                            <b>{OPTION_LETTERS[oi]}</b> {opt}
                            {isCorrect && <span aria-hidden>✓</span>}
                            <span className="ml-1 rounded-full bg-white/70 px-1.5 text-[10px] font-bold text-steel-700">
                              {count}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Danger zone */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-steel-600">
          Housekeeping
        </h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" disabled={busy} onClick={() => action("duplicate")}>
            Duplicate for a future meeting
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => action("reset")}>
            Reset answers & players
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => action("delete")}>
            Delete game
          </button>
        </div>
        <p className="mt-3 text-xs text-steel-600">
          Run a practice round today, then <b>Reset answers & players</b> so the room
          starts clean on game day.
        </p>
      </section>
    </main>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function TitleEditor({
  title,
  onSave,
}: {
  title: string;
  onSave: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  if (!editing)
    return (
      <button
        className="max-w-full truncate text-left text-2xl font-extrabold text-navy-900 hover:underline"
        title="Rename"
        onClick={() => setEditing(true)}
      >
        {title}
      </button>
    );
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
        setEditing(false);
      }}
    >
      <input
        className="input !w-72 text-lg font-bold"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <button className="btn btn-primary !px-3 !py-1.5 text-xs">Save</button>
      <button
        type="button"
        className="btn btn-ghost !px-3 !py-1.5 text-xs"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  );
}

function QuestionForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: AdminQuestion;
  busy: boolean;
  onSave: (data: { prompt: string; options: string[]; correct_index: number }) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(
    initial?.options?.length ? [...initial.options] : ["", "", "", ""]
  );
  const [correct, setCorrect] = useState(initial?.correct_index ?? 0);

  const setOption = (i: number, v: string) =>
    setOptions((o) => o.map((x, xi) => (xi === i ? v : x)));

  const removeOption = (i: number) => {
    setOptions((o) => o.filter((_, xi) => xi !== i));
    setCorrect((c) => (i === c ? 0 : i < c ? c - 1 : c));
  };

  const filled = options.filter((o) => o.trim());
  const valid = prompt.trim() && filled.length >= 2 && options[correct]?.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Re-map correct index onto the filled options only.
        const map: number[] = [];
        options.forEach((o, i) => {
          if (o.trim()) map.push(i);
        });
        onSave({
          prompt: prompt.trim(),
          options: filled.map((o) => o.trim()),
          correct_index: Math.max(0, map.indexOf(correct)),
        });
      }}
      className="space-y-3"
    >
      <textarea
        className="input min-h-16"
        placeholder="Question text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-steel-700"
              title="Mark as the correct answer"
            >
              <input
                type="radio"
                name="correct"
                checked={correct === i}
                onChange={() => setCorrect(i)}
                className="h-4 w-4 accent-[#c9952f]"
              />
              <span className="w-4 font-bold">{OPTION_LETTERS[i]}</span>
            </label>
            <input
              className="input"
              placeholder={`Option ${OPTION_LETTERS[i]}${i < 2 ? " (required)" : ""}`}
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="px-1 text-steel-500 hover:text-red-600"
                onClick={() => removeOption(i)}
                aria-label="Remove option"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button
            type="button"
            className="btn btn-ghost !px-3 !py-1.5 text-xs"
            onClick={() => setOptions((o) => [...o, ""])}
          >
            + Add option
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={busy || !valid}>
          {initial ? "Save changes" : "Add question"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <span className="text-xs text-steel-600">
          Select the radio button next to the correct answer.
        </span>
      </div>
    </form>
  );
}

function BulkAdd({
  gameId,
  onDone,
  onAuthFail,
}: {
  gameId: string;
  onDone: () => void;
  onAuthFail: (e: unknown) => boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const run = async () => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const good: { prompt: string; options: string[]; correct_index: number }[] = [];
    const bad: string[] = [];

    lines.forEach((line, li) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) {
        bad.push(`Line ${li + 1}: needs a question and at least 2 options.`);
        return;
      }
      const prompt = parts[0];
      const rawOptions = parts.slice(1, 7);
      const correct = rawOptions.findIndex((o) => o.startsWith("*"));
      if (correct === -1) {
        bad.push(`Line ${li + 1}: mark the correct option with a leading *`);
        return;
      }
      good.push({
        prompt,
        options: rawOptions.map((o) => o.replace(/^\*/, "").trim()),
        correct_index: correct,
      });
    });

    setBusy(true);
    let added = 0;
    try {
      for (const q of good) {
        await adminFetch(`/api/admin/games/${gameId}/questions`, {
          method: "POST",
          body: q,
        });
        added++;
      }
      setReport(
        `Added ${added} question${added === 1 ? "" : "s"}.` +
          (bad.length ? `\nSkipped:\n${bad.join("\n")}` : "")
      );
      if (!bad.length) {
        setText("");
        onDone();
      }
    } catch (e) {
      if (!onAuthFail(e)) {
        setReport(
          `Added ${added} before an error: ${e instanceof Error ? e.message : "unknown"}`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border-2 border-steel-300 bg-steel-50 p-4">
      <p className="mb-2 text-sm text-steel-700">
        One question per line:{" "}
        <code className="rounded bg-white px-1.5 py-0.5 text-xs">
          Question? | option A | *correct option | option C | option D
        </code>{" "}
        — put a <b>*</b> in front of the correct answer.
      </p>
      <textarea
        className="input min-h-36 font-mono text-xs"
        placeholder={`What does PRN mean? | As needed is wrong | *As needed | Every night | With food`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {report && (
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-navy-800">
          {report}
        </pre>
      )}
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={run}>
          {busy ? "Adding…" : "Add all"}
        </button>
      </div>
    </div>
  );
}

function WalkthroughPreview({
  question,
  dist,
  reveal,
  index,
  total,
}: {
  question: AdminQuestion;
  dist?: Distribution;
  reveal: boolean;
  index: number;
  total: number;
}) {
  const counts = dist?.counts ?? question.options.map(() => 0);
  const sum = dist?.total ?? 0;
  const max = Math.max(...counts, 1);

  return (
    <div className="rounded-xl bg-navy-900 p-4 text-white">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel-400">
        On screen now — Question {index + 1} of {total}
      </div>
      <p className="mb-3 font-semibold">{question.prompt}</p>
      <ul className="space-y-2">
        {question.options.map((opt, i) => {
          const isCorrect = i === question.correct_index;
          const pct = sum ? Math.round((counts[i] / sum) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold " +
                  (reveal && isCorrect
                    ? "bg-gold-500 text-navy-950"
                    : "bg-steel-600 text-white")
                }
              >
                {OPTION_LETTERS[i]}
              </span>
              <span className="w-44 truncate">{opt}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy-700">
                <div
                  className={
                    "h-full rounded-full " +
                    (reveal && isCorrect ? "bg-gold-500" : "bg-steel-500")
                  }
                  style={{ width: `${(counts[i] / max) * 100}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-steel-300">
                {counts[i]} · {pct}%
              </span>
              {reveal && isCorrect && (
                <span className="shrink-0 text-xs font-bold text-gold-400">✓ Correct</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
