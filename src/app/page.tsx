"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/ui";

export default function Home() {
  const [code, setCode] = useState("");
  const router = useRouter();

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) router.push(`/play/${clean}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-700 px-6 py-12">
      <div className="slide-in flex w-full max-w-md flex-col items-center gap-8">
        <Wordmark />
        <p className="text-center text-steel-300">
          Scan the QR code on the big screen — or type the game code below to
          jump in.
        </p>

        <form
          onSubmit={join}
          className="flex w-full items-center gap-2 rounded-2xl bg-white/10 p-2 backdrop-blur"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="GAME CODE"
            maxLength={8}
            className="w-full rounded-xl border-0 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.25em] text-navy-900 outline-none placeholder:font-semibold placeholder:tracking-[0.15em] placeholder:text-steel-400"
            aria-label="Game code"
          />
          <button type="submit" className="btn btn-gold !px-5 !py-3 !text-base">
            Join
          </button>
        </form>

        <Link
          href="/console"
          className="text-sm font-medium text-steel-400 underline-offset-4 hover:text-steel-200 hover:underline"
        >
          Host sign-in → question console
        </Link>
      </div>
    </main>
  );
}
