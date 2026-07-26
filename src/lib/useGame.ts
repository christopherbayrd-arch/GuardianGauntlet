"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Game, PublicQuestion } from "@/lib/types";

const POLL_MS = 3000;

/**
 * Loads a game (and its public questions) by join code and keeps it fresh
 * by polling every few seconds while the page is visible. Mode changes made
 * in the console reach phones and the big screen within ~3 seconds.
 */
export function useGame(code: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastGameJson = useRef<string>("");
  const lastQuestionsJson = useRef<string>("");

  const load = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/game/${encodeURIComponent(code.toUpperCase())}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setError(`No game found for code “${code.toUpperCase()}”.`);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { game: Game; questions: PublicQuestion[] };

      // Keep object identity stable unless something actually changed,
      // so animations and effects don't re-fire on every poll.
      const gJson = JSON.stringify(data.game);
      if (gJson !== lastGameJson.current) {
        lastGameJson.current = gJson;
        setGame(data.game);
      }
      const qJson = JSON.stringify(data.questions);
      if (qJson !== lastQuestionsJson.current) {
        lastQuestionsJson.current = qJson;
        setQuestions(data.questions);
      }
      setError(null);
    } catch {
      /* transient network hiccup — keep showing the last known state */
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
    const tick = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        load();
      }
    }, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [load]);

  return { game, questions, loading, error, reload: load };
}

/** Keep the screen awake (projector laptops + phones during the game). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          sentinel = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* not supported or denied — nothing we can do */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) request();
    };

    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        sentinel?.release();
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);
}
