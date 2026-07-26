"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminAuthError,
  adminFetch,
  getPasscode,
  setPasscode,
} from "@/lib/adminApi";
import type { GameListItem } from "@/lib/types";
import { Shield, Spinner, StatusPill } from "@/components/ui";

export default function ConsolePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ games: GameListItem[] }>("/api/admin/games");
      setGames(data.games);
      setAuthed(true);
      setError(null);
    } catch (e) {
      if (e instanceof AdminAuthError) setAuthed(false);
      else setError(e instanceof Error ? e.message : "Could not load games.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getPasscode()) loadGames();
    else setAuthed(false);
  }, [loadGames]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const data = await adminFetch<{ game: { id: string } }>("/api/admin/games", {
        method: "POST",
        body: { title: newTitle || "Untitled game" },
      });
      router.push(`/console/${data.game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the game.");
      setCreating(false);
    }
  };

  if (authed === false) return <PasscodeGate onSuccess={loadGames} />;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Shield className="h-10 w-10 text-steel-600" />
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">
            Question Console
          </h1>
          <p className="text-sm text-steel-600">
            Guardian Gauntlet — create a game, load questions, run the show.
          </p>
        </div>
      </header>

      <form onSubmit={create} className="card mb-6 flex items-center gap-3 p-4">
        <input
          className="input"
          placeholder="New game title (e.g. National Purchasing Meeting 2026)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn btn-primary" disabled={creating}>
          {creating ? "Creating…" : "Create game"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && games.length === 0 ? (
        <Spinner label="Loading games…" />
      ) : games.length === 0 ? (
        <div className="card p-8 text-center text-steel-600">
          No games yet — create your first one above.
        </div>
      ) : (
        <ul className="space-y-3">
          {games.map((g) => (
            <li key={g.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/console/${g.id}`}
                    className="block truncate text-lg font-bold text-navy-900 hover:underline"
                  >
                    {g.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-steel-600">
                    <span className="chip bg-steel-100 font-mono text-navy-800">
                      {g.code}
                    </span>
                    <StatusPill status={g.status} />
                    <span>
                      {g.question_count} question{g.question_count === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>
                      {g.participant_count} player{g.participant_count === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/console/${g.id}`} className="btn btn-primary">
                    Manage
                  </Link>
                  <a
                    href={`/display/${g.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                  >
                    Big screen ↗
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function PasscodeGate({ onSuccess }: { onSuccess: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPasscode(value);
    try {
      await adminFetch("/api/admin/login", { method: "POST" });
      onSuccess();
    } catch (e) {
      setError(
        e instanceof AdminAuthError
          ? "That passcode isn't right."
          : e instanceof Error
            ? e.message
            : "Could not sign in."
      );
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-navy-950 to-navy-800 px-6">
      <form
        onSubmit={submit}
        className="card slide-in w-full max-w-sm space-y-4 p-6 text-center"
      >
        <Shield className="mx-auto h-12 w-12 text-steel-600" />
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">Host sign-in</h1>
          <p className="mt-1 text-sm text-steel-600">
            Enter the console passcode to manage games.
          </p>
        </div>
        <input
          type="password"
          className="input text-center"
          placeholder="Passcode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !value}>
          {busy ? "Checking…" : "Unlock console"}
        </button>
      </form>
    </main>
  );
}
