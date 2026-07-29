"use client";

import { useState } from "react";
import type { GameStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

/**
 * Guardian Gauntlet mark: split-field shield with a gold question mark.
 * Self-coloured on purpose — the two field tones sit above navy-900 so the
 * shield still reads as an object on the dark screens, and below white so it
 * holds on the light console. Halves are drawn as two paths (no clipPath) so
 * repeated instances on a page can't collide over an element id.
 */
export function Shield({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* left field */}
      <path d="M32 6 L10 13.5 V33.5 C10 45.5 19.4 54.5 32 58 Z" fill="#16294a" />
      {/* right field */}
      <path d="M32 6 L54 13.5 V33.5 C54 45.5 44.6 54.5 32 58 Z" fill="#26497f" />
      {/* steel rim */}
      <path
        d="M32 6 L54 13.5 V33.5 C54 45.5 44.6 54.5 32 58 C19.4 54.5 10 45.5 10 33.5 V13.5 Z"
        fill="none"
        stroke="#7b9ac2"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* question mark */}
      <path
        d="M24.4 31.13 A7.6 7.6 0 1 1 32.84 37.82 L32.84 42.53"
        fill="none"
        stroke="#e9b44c"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32.84" cy="49.33" r="3" fill="#e9b44c" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Shield className={compact ? "h-8 w-8 text-steel-500" : "h-11 w-11 text-steel-500"} />
      <div className="leading-tight">
        <div
          className={
            (compact ? "text-[10px]" : "text-xs") +
            " font-semibold uppercase tracking-[0.22em] text-steel-400"
          }
        >
          Guardian Pharmacy
        </div>
        <div
          className={
            (compact ? "text-lg" : "text-2xl") + " font-extrabold text-white"
          }
        >
          Guardian <span className="text-gold-500">Gauntlet</span>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<GameStatus, string> = {
  draft: "bg-steel-100 text-navy-700 border border-steel-300",
  open: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  locked: "bg-amber-100 text-amber-800 border border-amber-300",
  results: "bg-navy-800 text-white border border-navy-800",
  leaderboard: "bg-gold-100 text-navy-900 border border-gold-500",
};

export function StatusPill({ status }: { status: GameStatus }) {
  return (
    <span className={`chip ${STATUS_STYLES[status]}`}>
      {status === "open" && (
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
      )}
      {status === "leaderboard" && <span aria-hidden>🏆</span>}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost !px-3 !py-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-steel-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-steel-300 border-t-steel-600" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
