# Guardian Gauntlet 🛡️

Guardian Pharmacy's live question game for meetings and conferences.

The room sees a big PowerPoint-style screen that cycles through your questions
with a QR code. Attendees scan it and answer multiple-choice questions from
their phones at their own pace. When you're ready, you lock submissions with
one click and walk through the results question by question — revealing the
correct answer only when you say so.

**Stack:** Next.js (hosted free on Vercel, code on GitHub) + Neon serverless
Postgres (free). No other services, no accounts for attendees, fully anonymous.

---

## The four game modes

| Mode | What the room sees | What phones can do |
|---|---|---|
| **1 · Setup** | "Get ready" splash + QR code | Join early, wait |
| **2 · Open** | Questions cycling + QR + live answer count | Answer & change answers freely |
| **3 · Lock** | "Answers are locked" | Nothing — the database rejects new answers |
| **4 · Results** | One question at a time with vote bars; correct answer highlights when you hit **Reveal** | See their own score on their phone |

Correct answers are never sent to phones or the big screen until Results mode —
not even to someone poking around in browser dev tools.

---

## One-time setup (about 15 minutes)

You'll create a GitHub repo, deploy it to Vercel, and attach a free Neon
database. You only ever do this once — every future meeting reuses the same app.

### Step 1 — Push the code to GitHub

If this folder is already a git repository (check with `git status`), just:

1. Go to [github.com/new](https://github.com/new), name it `guardian-gauntlet`,
   keep it **Private**, and click **Create repository** (no README/gitignore —
   the project has them).
2. In a terminal, from this folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/guardian-gauntlet.git
git push -u origin main
```

If it's not a git repo yet, run `git init -b main && git add -A && git commit -m "Guardian Gauntlet"` first.

### Step 2 — Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and sign in **with GitHub**.
2. Import the `guardian-gauntlet` repository. Vercel auto-detects Next.js —
   don't change any build settings.
3. Before clicking Deploy, expand **Environment Variables** and add:
   - `ADMIN_PASSCODE` → the passcode you'll type to open the question console
     (pick something you can type on your phone).
4. Click **Deploy**. It will build and give you a URL like
   `https://guardian-gauntlet.vercel.app`.

### Step 3 — Attach the free Neon database

1. In your new Vercel project, open the **Storage** tab → **Create Database**
   → choose **Neon** (Serverless Postgres) → accept the free plan defaults.
2. Vercel automatically adds `DATABASE_URL` to your project. (If it names it
   something else like `POSTGRES_URL`, rename it to `DATABASE_URL` in
   Project Settings → Environment Variables.)
3. Click **Open in Neon** (or go to [console.neon.tech](https://console.neon.tech))
   → **SQL Editor** → paste the entire contents of **`db/schema.sql`** from this
   project → **Run**. You should see "Success".
   - This creates the tables **and a sample game (code `DEMO1`)** so you can
     test immediately.
4. Back in Vercel: **Deployments** → ⋯ menu on the latest deployment →
   **Redeploy** (so the app picks up the database).

> Prefer not to use the Vercel Marketplace? Create a project directly at
> [neon.tech](https://neon.tech) (free, no card), copy its connection string,
> and add it yourself as `DATABASE_URL` in Vercel. Same result.

### Step 4 — Test drive

1. Open `https://YOUR-APP.vercel.app/console`, enter your passcode.
2. Open the **Demo** game → click **Open big screen ↗** → press **F** for
   full screen.
3. Scan the QR with your phone, answer the questions, then in the console:
   **Lock** → **Results** → **Next/Reveal** your way through.
4. When you're done playing: **Reset answers & players** (keeps the questions).

---

## Running a real meeting — the runbook

**Days before**

1. Console → **Create game** (e.g. "National Purchasing Meeting 2026").
2. Load questions one at a time, or **Bulk add** — one question per line:

   ```
   What does PRN mean? | Every night | *As needed | With food | Twice daily
   ```

   Separate with `|` and put `*` in front of the correct option (2–6 options).
3. Do a practice run with a colleague, then **Reset answers & players**.

**Day of**

1. Podium laptop: open the **display link** → press **F** → full screen.
   The screen is kept awake automatically — no sleep/screensaver mid-game.
2. Your phone or laptop: keep the **console** open. That's your remote.
3. When doors open, leave the game in **Setup** — people can scan early.
4. Hit **Open** when you kick off. Watch the live counter climb.
5. Hit **Lock** when time's up. Then **Results** when you're ready to talk.
6. For each question: let the room react to the bars, *then* hit
   **★ Reveal correct answer**. **Next →** to move on.
7. Phones show each person their own score at the end — scored on their own
   device, so nobody's answers were ever tied to their name.

**Handy keys on the big screen:** `←`/`→` skip · `Space` pause cycling ·
`F` full screen. If you've unlocked the console in the *same browser*, `←`/`→`
and `R` also drive the results walkthrough right from the display.

**Pacing:** questions cycle every 12 seconds. Add `?secs=20` to the display URL
to change it (4–120).

---

## Future meetings

- **Duplicate for a future meeting** (console → Housekeeping) copies all
  questions into a fresh game with a new code, or create a new game from
  scratch. Old games keep their results until you delete them.
- Several games can exist side by side — each has its own code, QR, and links.

## Local development (optional)

```bash
cp .env.example .env.local   # fill in DATABASE_URL + ADMIN_PASSCODE
npm install
npm run dev                  # http://localhost:3000
```

## Good to know

- **Locking is enforced by the database**, not just the UI — late submissions
  are rejected server-side the instant you hit Lock.
- Phones and the big screen sync within ~3 seconds (simple polling — no
  websockets to break on hotel Wi-Fi).
- Comfortably handles a ~100-person room on the free Vercel + Neon tiers.
- Change the passcode anytime: Vercel → Settings → Environment Variables →
  `ADMIN_PASSCODE` → redeploy.
- Everything is anonymous by design: no names, no sign-ins, one answer per
  device per question (people can change answers until you lock).

## Project map

```
db/schema.sql            ← run this once in Neon's SQL Editor
src/app/console/         ← question console (passcode-protected)
src/app/display/[code]/  ← big screen (cycling, QR, results bars)
src/app/play/[code]/     ← what attendees get when they scan
src/app/api/admin/*      ← console API (checks your passcode)
src/app/api/game/*       ← public API (never exposes correct answers early)
src/lib/                 ← db client, shared hooks, helpers
```
