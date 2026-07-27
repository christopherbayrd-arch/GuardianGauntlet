"use client";

import { useState } from "react";
import type { GameStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export function Shield({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M32 6 L54 14 V32 C54 46 44.5 56 32 60 C19.5 56 10 46 10 32 V14 Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M32 12 L48 18 V32 C48 42.5 41 50 32 53.5 C23 50 16 42.5 16 32 V18 Z"
        fill="currentColor"
      />
      <path
        d="M25 32 L30 37 L40 26"
        stroke="#e9b44c"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
