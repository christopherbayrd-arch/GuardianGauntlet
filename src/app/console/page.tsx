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
import type { DeletedGameListItem, GameGroup, GameListItem } from "@/lib/types";
import { Shield, Spinner, StatusPill } from "@/components/ui";

import { DELETED_RETENTION_DAYS } from "@/lib/types";

const RETENTION_DAYS = DELETED_RETENTION_DAYS;

const purgeNote = (deletedAt: string) => {
  const daysGone = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
  const left = RETENTION_DAYS - daysGone;
  return left <= 0
    ? "purging soon"
    : `gone for good in ${left} day${left === 1 ? "" : "s"}`;
};

export default function ConsolePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [groups, setGroups] = useState<GameGroup[]>([]);
  const [deletedGames, setDeletedGames] = useState<DeletedGameListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const router = useRouter();

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{
        games: GameListItem[];
        deleted_games: DeletedGameListItem[];
        groups: GameGroup[];
      }>("/api/admin/games");
      setGames(data.games);
      setGroups(data.groups ?? []);
      setDeletedGames(data.deleted_games ?? []);
      setAuthed(true);
      setError(null);
    } catch (e) {
      if (e instanceof AdminAuthError) {
        setAuthed(false);
      } else {
        // Passcode was fine but the server had a problem (usually database
        // setup) — show the console with the error instead of a stuck gate.
        setAuthed(true);
        setError(e instanceof Error ? e.message : "Could not load games.");
      }
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
        body: {
          title: newTitle || "Untitled game",
          ...(newGroupId ? { group_id: newGroupId } : {}),
        },
      });
      router.push(`/console/${data.game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the game.");
      setCreating(false);
    }
  };

  const restoreGame = async (id: string) => {
    try {
      await adminFetch(`/api/admin/games/${id}`, {
        method: "PATCH",
        body: { restore: true },
      });
      await loadGames();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    }
  };

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || groupBusy) return;
    setGroupBusy(true);
    try {
      await adminFetch("/api/admin/groups", {
        method: "POST",
        body: { name: groupName.trim() },
      });
      setGroupName("");
      setAddingGroup(false);
      setError(null);
      await loadGames();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the group.");
    } finally {
      setGroupBusy(false);
    }
  };

  const renameGroup = async (g: GameGroup) => {
    const name = prompt(`Rename "${g.name}" to:`, g.name);
    if (name === null || !name.trim() || name.trim() === g.name) return;
    try {
      await adminFetch(`/api/admin/groups/${g.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
      setError(null);
      await loadGames();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    }
  };

  const deleteGroup = async (g: GameGroup, count: number) => {
    if (
      !confirm(
        `Remove the "${g.name}" group?` +
          (count > 0
            ? ` Its ${count} game${count === 1 ? "" : "s"} won't be deleted — they just move back to Ungrouped.`
            : " It has no games in it.")
      )
    )
      return;
    try {
      await adminFetch(`/api/admin/groups/${g.id}`, { method: "DELETE" });
      setError(null);
      await loadGames();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the group.");
    }
  };

  const moveGame = async (gameId: string, groupId: string) => {
    // optimistic — the select feels instant, the server settles it
    setGames((gs) =>
      gs.map((g) => (g.id === gameId ? { ...g, group_id: groupId || null } : g))
    );
    try {
      await adminFetch(`/api/admin/games/${gameId}`, {
        method: "PATCH",
        body: { group_id: groupId || null },
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the game.");
      await loadGames();
    }
  };

  if (authed === false) return <PasscodeGate onSuccess={loadGames} />;

  const grouped = groups.map((g) => ({
    group: g,
    items: games.filter((game) => game.group_id === g.id),
  }));
  const ungrouped = games.filter(
    (game) => !game.group_id || !groups.some((g) => g.id === game.group_id)
  );

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

      <form onSubmit={create} className="card mb-3 flex flex-wrap items-center gap-3 p-4">
        <input
          className="input min-w-48 flex-1"
          placeholder="New game title (e.g. National Purchasing Meeting 2026)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        {groups.length > 0 && (
          <select
            className="input !w-auto"
            value={newGroupId}
            onChange={(e) => setNewGroupId(e.target.value)}
            aria-label="Group for the new game"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" disabled={creating}>
          {creating ? "Creating…" : "Create game"}
        </button>
      </form>

      {/* Group management — flat groups, purely organizational */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {addingGroup ? (
          <form onSubmit={addGroup} className="flex flex-1 items-center gap-2">
            <input
              className="input !w-56"
              placeholder="Group name (e.g. Atlanta)"
              value={groupName}
              maxLength={60}
              autoFocus
              onChange={(e) => setGroupName(e.target.value)}
            />
            <button
              className="btn btn-primary !px-3 !py-1.5 text-xs"
              disabled={groupBusy || !groupName.trim()}
            >
              {groupBusy ? "Adding…" : "Add group"}
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-3 !py-1.5 text-xs"
              onClick={() => {
                setAddingGroup(false);
                setGroupName("");
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="btn btn-ghost !px-3 !py-1.5 text-xs"
            onClick={() => setAddingGroup(true)}
          >
            ＋ New group
          </button>
        )}
        {groups.length === 0 && !addingGroup && (
          <span className="text-xs text-steel-500">
            Groups organize games by location — Atlanta, Nashville, Corporate…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && games.length === 0 ? (
        <Spinner label="Loading games…" />
      ) : games.length === 0 && groups.length === 0 ? (
        <div className="card p-8 text-center text-steel-600">
          No games yet — create your first one above.
        </div>
      ) : groups.length === 0 ? (
        <GameList games={games} groups={groups} onMove={moveGame} />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ group, items }) => (
            <section key={group.id}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-navy-800">
                  {group.name}
                </h2>
                <span className="text-xs font-semibold text-steel-500">
                  {items.length} game{items.length === 1 ? "" : "s"}
                </span>
                <button
                  className="px-1 text-xs text-steel-400 hover:text-navy-800"
                  title={`Rename ${group.name}`}
                  onClick={() => renameGroup(group)}
                >
                  ✎
                </button>
                <button
                  className="px-1 text-xs text-steel-400 hover:text-red-600"
                  title={`Remove ${group.name} (games move to Ungrouped)`}
                  onClick={() => deleteGroup(group, items.length)}
                >
                  ✕
                </button>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-steel-300 px-4 py-3 text-sm text-steel-500">
                  No games in this group yet.
                </div>
              ) : (
                <GameList games={items} groups={groups} onMove={moveGame} />
              )}
            </section>
          ))}

          {ungrouped.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-steel-500">
                  Ungrouped
                </h2>
                <span className="text-xs font-semibold text-steel-500">
                  {ungrouped.length} game{ungrouped.length === 1 ? "" : "s"}
                </span>
              </div>
              <GameList games={ungrouped} groups={groups} onMove={moveGame} />
            </section>
          )}
        </div>
      )}

      {deletedGames.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-500">
            Deleted games — restorable for {RETENTION_DAYS} days, then removed automatically
          </h2>
          <ul className="space-y-2">
            {deletedGames.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-steel-300 bg-steel-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-steel-600 line-through decoration-steel-400">
                    {g.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-steel-500">
                    <span className="font-mono">{g.code}</span> ·{" "}
                    {purgeNote(g.deleted_at)}
                  </div>
                </div>
                <button
                  className="btn btn-ghost !px-3 !py-1.5 text-xs"
                  onClick={() => restoreGame(g.id)}
                >
                  ↩ Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function GameList({
  games,
  groups,
  onMove,
}: {
  games: GameListItem[];
  groups: GameGroup[];
  onMove: (gameId: string, groupId: string) => void;
}) {
  return (
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
                {g.play_mode === "live" && (
                  <span className="chip border border-steel-300 bg-white text-navy-800">
                    ⚡ Live
                  </span>
                )}
                <span>
                  {g.question_count} question{g.question_count === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {g.participant_count} player{g.participant_count === 1 ? "" : "s"}
                </span>
                {groups.length > 0 && (
                  <select
                    className="rounded-lg border border-steel-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-steel-600"
                    value={g.group_id ?? ""}
                    onChange={(e) => onMove(g.id, e.target.value)}
                    aria-label={`Group for ${g.title}`}
                    title="Move to a group"
                  >
                    <option value="">Ungrouped</option>
                    {groups.map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name}
                      </option>
                    ))}
                  </select>
                )}
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
