"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/lib/useGame";
import {
  getLocalAnswers,
  getStoredParticipant,
  joinGame,
  setLocalAnswer,
  submitAnswer,
  type StoredParticipant,
} from "@/lib/participant";
import type { LeaderboardPayload, QuestionResult } from "@/lib/types";
import { OPTION_LETTERS } from "@/lib/types";
import { Shield, Spinner, StatusPill } from "@/components/ui";

type SaveState = "saving" | "saved" | "error";

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { game, questions, loading, error } = useGame(code);

  const [participant, setParticipant] = useState<StoredParticipant | null>(null);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<QuestionResult[] | null>(null);
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const jumpedRef = useRef(false);
  const healedRef = useRef(false);

  /* restore identity + local answers for this game */
  useEffect(() => {
    if (!game?.id) return;
    setAnswers(getLocalAnswers(game.id));
    const stored = getStoredParticipant(game.id);
    if (stored?.first_name && stored?.last_name) {
      setParticipant({
        id: stored.id,
        first_name: stored.first_name,
        last_name: stored.last_name,
      });
    } else if (stored?.id) {
      // Joined before names existed — keep the id so answers survive,
      // but ask for the name once.
      setPendingId(stored.id);
    }
    setCheckedStorage(true);
  }, [game?.id]);

  /* re-register once per visit so the server row always matches this device
     (heals things like "host reset the game while I kept the tab open") */
  useEffect(() => {
    if (!game?.id || !participant || healedRef.current) return;
    healedRef.current = true;
    joinGame(code, game.id, participant.first_name, participant.last_name, participant.id).catch(
      () => {
        /* offline blip — answering will surface any real problem */
      }
    );
  }, [game?.id, participant, code]);

  const live = game?.play_mode === "live";

  /* start on the first unanswered question when the game opens
     (self-paced only — live games follow the host's current question) */
  useEffect(() => {
    if (
      live ||
      jumpedRef.current ||
      game?.status !== "open" ||
      questions.length === 0
    )
      return;
    jumpedRef.current = true;
    const first = questions.findIndex((q) => answers[q.id] === undefined);
    if (first > 0) setIdx(first);
  }, [live, game?.status, questions, answers]);

  /* live mode: when the host reveals, fetch the current question's result */
  const liveReveal = Boolean(live && game?.status === "open" && game?.reveal);
  const [liveResult, setLiveResult] = useState<QuestionResult | null>(null);
  useEffect(() => {
    if (!liveReveal) {
      setLiveResult(null);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/game/${code}/results`, { cache: "no-store" });
        if (res.ok && !stop) {
          const data = (await res.json()) as { results: QuestionResult[] };
          setLiveResult(data.results[0] ?? null);
        }
      } catch {
        /* transient */
      }
    })();
    return () => {
      stop = true;
    };
  }, [liveReveal, game?.current_index, code]);

  /* results once the host reveals them */
  useEffect(() => {
    if (game?.status !== "results" && game?.status !== "leaderboard") {
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

  /* final standings once the host reaches step 5 */
  useEffect(() => {
    if (game?.status !== "leaderboard") {
      setBoard(null);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const me = participant ? `?me=${encodeURIComponent(participant.id)}` : "";
        const res = await fetch(`/api/game/${code}/leaderboard${me}`, {
          cache: "no-store",
        });
        if (res.ok && !stop) setBoard(await res.json());
      } catch {
        /* transient */
      }
    })();
    return () => {
      stop = true;
    };
  }, [game?.status, code, participant]);

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;

  const choose = useCallback(
    async (questionId: string, choice: number) => {
      if (!game || game.status !== "open" || !participant) return;
      const isLive = game.play_mode === "live";
      // Live rule: first tap counts — no changes once an answer is in
      // (or is mid-flight; the guard covers the optimistic state too).
      if (isLive && answers[questionId] !== undefined) return;
      setBanner(null);
      setAnswers((a) => ({ ...a, [questionId]: choice }));
      setSaveState((s) => ({ ...s, [questionId]: "saving" }));
      try {
        await submitAnswer(code, {
          participant_id: participant.id,
          question_id: questionId,
          choice_index: choice,
        });
        setSaveState((s) => ({ ...s, [questionId]: "saved" }));
        setLocalAnswer(game.id, questionId, choice);
        if (isLive) return; // stay put — the host moves everyone on
        // hop to the next unanswered question, if there is one
        const local = { ...getLocalAnswers(game.id), [questionId]: choice };
        const n = questions.length;
        const start = questions.findIndex((q) => q.id === questionId);
        for (let step = 1; step <= n; step++) {
          const cand = (start + step) % n;
          if (local[questions[cand].id] === undefined) {
            setTimeout(() => setIdx(cand), 350);
            break;
          }
        }
      } catch (e) {
        if (isLive) {
          // The tap didn't count (question closed / already answered) —
          // don't show a locked-in choice that never reached the server.
          setAnswers((a) => {
            const next = { ...a };
            delete next[questionId];
            return next;
          });
          setSaveState((s) => {
            const next = { ...s };
            delete next[questionId];
            return next;
          });
        } else {
          setSaveState((s) => ({ ...s, [questionId]: "error" }));
        }
        setBanner(e instanceof Error ? e.message : "Could not save your answer.");
      }
    },
    [game, participant, code, questions, answers]
  );

  /* ── render states ────────────────────────────────────────── */

  if (loading)
    return (
      <PhoneShell>
        <Spinner label="Finding your game…" />
      </PhoneShell>
    );

  if (error || !game)
    return (
      <PhoneShell>
        <div className="card p-6 text-center">
          <p className="font-semibold text-navy-900">Hmm.</p>
          <p className="mt-1 text-sm text-steel-600">{error ?? "Game not found."}</p>
        </div>
      </PhoneShell>
    );

  const q = questions[Math.min(idx, Math.max(questions.length - 1, 0))];

  /* name gate — nobody gets in without a first and last name */
  if (checkedStorage && !participant) {
    return (
      <PhoneShell>
        <GameHeader title={game.title} status={game.status} />
        <NameGate
          onSubmit={async (first, last) => {
            const joined = await joinGame(code, game.id, first, last, pendingId);
            setParticipant(joined);
            healedRef.current = true; // just joined — no need to re-register
          }}
        />
        <PhoneFooter />
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <GameHeader
        title={game.title}
        status={game.status}
        playerName={participant ? `${participant.first_name} ${participant.last_name}` : undefined}
      />

      {banner && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
          {banner}
        </div>
      )}

      {game.status === "draft" && (
        <div className="card p-8 text-center">
          <div className="pulse-dot mx-auto mb-4 h-3 w-3 rounded-full bg-gold-500" />
          <h1 className="text-xl font-extrabold text-navy-900">
            You&apos;re in{participant ? `, ${participant.first_name}` : ""}!
          </h1>
          <p className="mt-2 text-sm text-steel-600">
            Questions open soon. Keep this page handy — it updates by itself.
          </p>
        </div>
      )}

      {/* Live (host-paced): one question at a time, first tap counts */}
      {game.status === "open" &&
        live &&
        (questions.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="pulse-dot mx-auto mb-4 h-3 w-3 rounded-full bg-gold-500" />
            <p className="text-sm text-steel-600">Waiting for the first question…</p>
          </div>
        ) : (
          (() => {
            const liveIdx = Math.min(game.current_index, questions.length - 1);
            const lq = questions[liveIdx];
            const mine = answers[lq.id];
            const answered = mine !== undefined;
            const revealNow =
              liveReveal && liveResult && liveResult.question_id === lq.id;
            return (
              <>
                {/* live progress strip */}
                <div className="card mb-3 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-steel-600">
                    <span>
                      Question {liveIdx + 1} of {questions.length}
                    </span>
                    <span>⚡ Live — follow the big screen</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-steel-100">
                    <div
                      className="h-full rounded-full bg-steel-500 transition-all duration-500"
                      style={{
                        width: `${((liveIdx + (game.reveal ? 1 : 0)) / questions.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="card p-5" key={lq.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-steel-500">
                      Question {liveIdx + 1} of {questions.length}
                    </span>
                    <SaveBadge state={saveState[lq.id]} answered={answered} />
                  </div>
                  <h2 className="text-lg font-extrabold leading-snug text-navy-900">
                    {lq.prompt}
                  </h2>

                  {revealNow ? (
                    <LiveRevealList question={lq} result={liveResult!} mine={mine} />
                  ) : (
                    <>
                      <ul className="mt-4 space-y-2.5">
                        {lq.options.map((opt, oi) => {
                          const selected = mine === oi;
                          return (
                            <li key={oi}>
                              <button
                                onClick={() => choose(lq.id, oi)}
                                disabled={answered}
                                className={
                                  "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors " +
                                  (selected
                                    ? "border-navy-800 bg-navy-800 text-white"
                                    : answered
                                      ? "border-steel-100 bg-white text-navy-900 opacity-50"
                                      : "border-steel-200 bg-white text-navy-900 active:bg-steel-50")
                                }
                              >
                                <span
                                  className={
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold " +
                                    (selected
                                      ? "bg-gold-500 text-navy-950"
                                      : "bg-steel-100 text-steel-700")
                                  }
                                >
                                  {OPTION_LETTERS[oi]}
                                </span>
                                <span className="text-[15px] font-semibold leading-snug">
                                  {opt}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-4 text-center text-sm font-medium text-steel-600">
                        {answered ? (
                          <>
                            You&apos;re in!{" "}
                            <span className="text-steel-500">
                              Waiting for the reveal…
                            </span>
                          </>
                        ) : (
                          <>Tap your answer — first tap counts, no changes.</>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </>
            );
          })()
        ))}

      {game.status === "open" && !live && q && (
        <>
          {/* progress */}
          <div className="card mb-3 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-steel-600">
              <span>
                {answeredCount} of {questions.length} answered
              </span>
              <span>Answer in any order · change anytime</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-steel-100">
              <div
                className="h-full rounded-full bg-steel-500 transition-all duration-500"
                style={{
                  width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {questions.map((qq, i) => {
                const answered = answers[qq.id] !== undefined;
                const isCurrent = i === idx;
                return (
                  <button
                    key={qq.id}
                    onClick={() => setIdx(i)}
                    aria-label={`Question ${i + 1}`}
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-colors " +
                      (isCurrent
                        ? "bg-navy-800 text-white ring-2 ring-gold-500"
                        : answered
                          ? "bg-steel-500 text-white"
                          : "bg-steel-100 text-steel-600")
                    }
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* question */}
          <div className="card p-5" key={q.id}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-steel-500">
                Question {idx + 1} of {questions.length}
              </span>
              <SaveBadge state={saveState[q.id]} answered={answers[q.id] !== undefined} />
            </div>
            <h2 className="text-lg font-extrabold leading-snug text-navy-900">
              {q.prompt}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <li key={oi}>
                    <button
                      onClick={() => choose(q.id, oi)}
                      className={
                        "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors " +
                        (selected
                          ? "border-navy-800 bg-navy-800 text-white"
                          : "border-steel-200 bg-white text-navy-900 active:bg-steel-50")
                      }
                    >
                      <span
                        className={
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold " +
                          (selected
                            ? "bg-gold-500 text-navy-950"
                            : "bg-steel-100 text-steel-700")
                        }
                      >
                        {OPTION_LETTERS[oi]}
                      </span>
                      <span className="text-[15px] font-semibold leading-snug">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              <button
                className="btn btn-ghost"
                disabled={idx === 0}
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
              >
                ← Prev
              </button>
              <button
                className="btn btn-ghost"
                disabled={idx >= questions.length - 1}
                onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              >
                Next →
              </button>
            </div>
          </div>

          {answeredCount === questions.length && questions.length > 0 && (
            <p className="mt-3 text-center text-sm font-medium text-steel-600">
              All answered 🎉 You can still change answers until the host locks the
              game.
            </p>
          )}
        </>
      )}

      {game.status === "locked" && (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 text-4xl">🔒</div>
          <h1 className="text-xl font-extrabold text-navy-900">Answers are locked</h1>
          <p className="mt-2 text-sm text-steel-600">
            You answered {answeredCount} of {questions.length}. Eyes on the big
            screen for the results!
          </p>
        </div>
      )}

      {game.status === "results" && (
        <ResultsView questions={questions} results={results} answers={answers} />
      )}

      {game.status === "leaderboard" && (
        <LeaderboardView
          board={board}
          fallbackName={
            participant ? `${participant.first_name} ${participant.last_name}` : null
          }
        />
      )}

      <PhoneFooter />
    </PhoneShell>
  );
}

/* ────────────────────────── pieces ────────────────────────── */

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-5">{children}</main>
  );
}

function GameHeader({
  title,
  status,
  playerName,
}: {
  title: string;
  status: React.ComponentProps<typeof StatusPill>["status"];
  playerName?: string;
}) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <Shield className="h-9 w-9 text-steel-600" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-steel-500">
          Guardian Gauntlet
        </div>
        <div className="truncate text-sm font-bold text-navy-900">{title}</div>
        {playerName && (
          <div className="truncate text-[11px] font-medium text-steel-500">
            Playing as {playerName}
          </div>
        )}
      </div>
      <StatusPill status={status} />
    </header>
  );
}

function PhoneFooter() {
  return (
    <footer className="mt-8 pb-6 text-center text-[11px] font-medium text-steel-400">
      Guardian Pharmacy · Guardian Gauntlet
    </footer>
  );
}

function NameGate({
  onSubmit,
}: {
  onSubmit: (first: string, last: string) => Promise<void>;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = first.trim().length > 0 && last.trim().length > 0;

  return (
    <div className="card p-6">
      <h1 className="text-xl font-extrabold text-navy-900">Who&apos;s playing?</h1>
      <p className="mt-1 text-sm text-steel-600">
        Enter your name to join — the top scorers land on the big-screen
        leaderboard at the end.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          try {
            await onSubmit(first.trim(), last.trim());
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not join. Try again."
            );
            setBusy(false);
          }
        }}
      >
        <div>
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-steel-600"
            htmlFor="first-name"
          >
            First name
          </label>
          <input
            id="first-name"
            className="input"
            autoComplete="given-name"
            autoFocus
            maxLength={40}
            placeholder="Alex"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-steel-600"
            htmlFor="last-name"
          >
            Last name
          </label>
          <input
            id="last-name"
            className="input"
            autoComplete="family-name"
            maxLength={40}
            placeholder="Rivera"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}
        <button className="btn btn-primary w-full !py-3 text-base" disabled={!valid || busy}>
          {busy ? "Joining…" : "Let's play →"}
        </button>
      </form>
    </div>
  );
}

function SaveBadge({ state, answered }: { state?: SaveState; answered: boolean }) {
  if (state === "saving")
    return <span className="text-xs font-semibold text-steel-500">Saving…</span>;
  if (state === "error")
    return <span className="text-xs font-semibold text-red-600">Not saved — tap again</span>;
  if (answered)
    return <span className="text-xs font-semibold text-emerald-700">Saved ✓</span>;
  return null;
}

/**
 * The phone's reveal state during a live game: the correct answer in gold,
 * your pick marked, and the room's spread with % + vote counts.
 */
function LiveRevealList({
  question,
  result,
  mine,
}: {
  question: { options: string[] };
  result: QuestionResult;
  mine: number | undefined;
}) {
  const gotIt = mine !== undefined && mine === result.correct_index;
  const correctLetter = OPTION_LETTERS[result.correct_index];

  return (
    <>
      <div
        className={
          "mt-3 rounded-xl px-4 py-2.5 text-center text-sm font-bold " +
          (gotIt
            ? "bg-emerald-100 text-emerald-800"
            : "bg-steel-100 text-navy-800")
        }
      >
        {gotIt
          ? "You got it! 🎉"
          : mine !== undefined
            ? `Not this time — it was ${correctLetter}.`
            : `No answer in — it was ${correctLetter}.`}
      </div>
      <ul className="mt-3 space-y-1.5">
        {question.options.map((opt, oi) => {
          const isCorrect = oi === result.correct_index;
          const isMine = mine === oi;
          const pct = result.total
            ? Math.round(((result.counts[oi] ?? 0) / result.total) * 100)
            : 0;
          return (
            <li
              key={oi}
              className={
                "rounded-lg border px-3 py-2 text-sm " +
                (isCorrect
                  ? "border-gold-500 bg-gold-100"
                  : isMine
                    ? "border-steel-400 bg-steel-50"
                    : "border-steel-100")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 font-medium text-navy-900">
                  <b className="mr-1.5">{OPTION_LETTERS[oi]}</b>
                  {opt}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-steel-600">
                  {result.counts[oi] ?? 0} · {pct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className={
                    "h-full rounded-full " +
                    (isCorrect ? "bg-gold-500" : "bg-steel-400")
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
              {(isCorrect || isMine) && (
                <div className="mt-1 flex gap-2 text-[11px] font-bold">
                  {isCorrect && (
                    <span className="text-gold-600">✓ Correct answer</span>
                  )}
                  {isMine && (
                    <span
                      className={isCorrect ? "text-emerald-700" : "text-steel-600"}
                    >
                      {isCorrect ? "You got it!" : "Your pick"}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-xs font-medium text-steel-500">
        Next question coming up on the big screen…
      </p>
    </>
  );
}

function ResultsView({
  questions,
  results,
  answers,
}: {
  questions: { id: string; prompt: string; options: string[] }[];
  results: QuestionResult[] | null;
  answers: Record<string, number>;
}) {
  if (!results)
    return (
      <div className="card p-8 text-center text-sm text-steel-600">
        Loading results…
      </div>
    );

  const gradable = results.filter((r) => answers[r.question_id] !== undefined);
  const score = gradable.filter((r) => answers[r.question_id] === r.correct_index).length;

  return (
    <div className="space-y-3">
      <div className="card bg-navy-900 p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-steel-400">
          Your score
        </div>
        <div className="mt-1 text-5xl font-extrabold text-white">
          {score}
          <span className="text-2xl font-bold text-steel-400"> / {results.length}</span>
        </div>
        <p className="mt-2 text-xs text-steel-400">
          Leaderboard coming up on the big screen…
        </p>
      </div>

      {results.map((r, i) => {
        const q = questions.find((x) => x.id === r.question_id);
        if (!q) return null;
        const mine = answers[r.question_id];
        return (
          <div key={r.question_id} className="card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-steel-500">
              Question {i + 1}
            </div>
            <p className="mt-1 text-sm font-bold text-navy-900">{q.prompt}</p>
            <ul className="mt-3 space-y-1.5">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === r.correct_index;
                const isMine = mine === oi;
                const pct = r.total ? Math.round(((r.counts[oi] ?? 0) / r.total) * 100) : 0;
                return (
                  <li
                    key={oi}
                    className={
                      "rounded-lg border px-3 py-2 text-sm " +
                      (isCorrect
                        ? "border-gold-500 bg-gold-100"
                        : isMine
                          ? "border-steel-400 bg-steel-50"
                          : "border-steel-100")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 font-medium text-navy-900">
                        <b className="mr-1.5">{OPTION_LETTERS[oi]}</b>
                        {opt}
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-steel-600">
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                      <div
                        className={
                          "h-full rounded-full " +
                          (isCorrect ? "bg-gold-500" : "bg-steel-400")
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {(isCorrect || isMine) && (
                      <div className="mt-1 flex gap-2 text-[11px] font-bold">
                        {isCorrect && <span className="text-gold-600">✓ Correct answer</span>}
                        {isMine && (
                          <span
                            className={
                              isCorrect ? "text-emerald-700" : "text-steel-600"
                            }
                          >
                            {isCorrect ? "You got it!" : "Your pick"}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function LeaderboardView({
  board,
  fallbackName,
}: {
  board: LeaderboardPayload | null;
  fallbackName: string | null;
}) {
  if (!board)
    return (
      <div className="card p-8 text-center text-sm text-steel-600">
        Loading the leaderboard…
      </div>
    );

  const me = board.leaderboard.find((e) => e.is_me) ?? null;
  const top = board.leaderboard.slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="card bg-navy-900 p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-500">
          Final standings
        </div>
        {me ? (
          <>
            <div className="mt-1 text-5xl font-extrabold text-white">
              {me.rank <= 3 ? MEDALS[me.rank - 1] : `#${me.rank}`}
            </div>
            <p className="mt-1 text-sm font-semibold text-steel-300">
              {me.first_name} {me.last_name} — {me.correct} of {board.total_questions}{" "}
              correct
            </p>
            <p className="mt-1 text-xs text-steel-400">
              Out of {board.players} player{board.players === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-steel-300">
            {fallbackName ? `${fallbackName}, thanks` : "Thanks"} for playing!
          </p>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-500">
          Top {Math.min(10, top.length)}
        </div>
        <ul className="space-y-1.5">
          {top.map((e, i) => (
            <li
              key={`${e.rank}-${e.first_name}-${e.last_name}-${i}`}
              className={
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm " +
                (e.is_me
                  ? "border-gold-500 bg-gold-100"
                  : e.rank === 1
                    ? "border-gold-300 bg-gold-100/50"
                    : "border-steel-100")
              }
            >
              <span className="w-8 shrink-0 text-center font-extrabold text-navy-900">
                {e.rank <= 3 ? MEDALS[e.rank - 1] : e.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-navy-900">
                {e.first_name} {e.last_name}
                {e.is_me && (
                  <span className="ml-2 rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-bold text-white">
                    You
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-steel-600">
                {e.correct}/{board.total_questions}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
