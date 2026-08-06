import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AdminQuestion,
  Distribution,
  Game,
  GameStats,
  LeaderboardEntry,
} from "@/lib/types";
import { OPTION_LETTERS } from "@/lib/types";

/**
 * Everything the results PDF needs — structurally identical to the admin
 * console's game payload (GET /api/admin/games/[id]), so the export button
 * can pass a fresh fetch of that straight through.
 */
export interface ReportData {
  game: Game;
  questions: AdminQuestion[];
  stats: GameStats;
  distributions: Distribution[];
  leaderboard: LeaderboardEntry[];
}

/* ── Guardian palette (mirrors globals.css) ─────────────────── */

type Rgb = [number, number, number];
const NAVY_950: Rgb = [10, 21, 38];
const NAVY_900: Rgb = [16, 31, 58];
const NAVY_800: Rgb = [24, 44, 80];
const NAVY_700: Rgb = [34, 58, 103];
const STEEL_700: Rgb = [63, 99, 155];
const STEEL_600: Rgb = [90, 127, 177];
const STEEL_500: Rgb = [123, 154, 194];
const STEEL_400: Rgb = [152, 177, 210];
const STEEL_300: Rgb = [183, 200, 224];
const STEEL_200: Rgb = [212, 222, 238];
const STEEL_100: Rgb = [232, 238, 247];
const STEEL_50: Rgb = [244, 247, 251];
const GOLD_600: Rgb = [201, 149, 47];
const GOLD_500: Rgb = [233, 180, 76];
const GOLD_100: Rgb = [253, 243, 221];
const BRONZE_100: Rgb = [246, 232, 217];
const BRONZE_700: Rgb = [154, 107, 51];
const WHITE: Rgb = [255, 255, 255];

/* ── Page geometry (A4, points) ─────────────────────────────── */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_Y = 60; // first baseline-ish y on continuation pages
const BOTTOM_LIMIT = PAGE_H - 56;

/* ── Shield mark (same paths as src/components/ui.tsx) ──────── */

const SHIELD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<path d="M32 6 L10 13.5 V33.5 C10 45.5 19.4 54.5 32 58 Z" fill="#16294a"/>
<path d="M32 6 L54 13.5 V33.5 C54 45.5 44.6 54.5 32 58 Z" fill="#26497f"/>
<path d="M32 6 L54 13.5 V33.5 C54 45.5 44.6 54.5 32 58 C19.4 54.5 10 45.5 10 33.5 V13.5 Z" fill="none" stroke="#7b9ac2" stroke-width="3" stroke-linejoin="round"/>
<path d="M24.4 31.13 A7.6 7.6 0 1 1 32.84 37.82 L32.84 42.53" fill="none" stroke="#e9b44c" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="32.84" cy="49.33" r="3" fill="#e9b44c"/>
</svg>`;

/** Rasterize the shield SVG to a PNG data URL (browser only; null if it fails). */
async function shieldPng(px = 240): Promise<string | null> {
  try {
    const img = new Image();
    const url = URL.createObjectURL(
      new Blob([SHIELD_SVG], { type: "image/svg+xml" })
    );
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, px, px);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ── Small helpers ──────────────────────────────────────────── */

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const pct = (n: number, total: number): number =>
  total > 0 ? Math.round((n / total) * 100) : 0;

const slugify = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "game";

function setFill(doc: jsPDF, c: Rgb) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: Rgb) {
  doc.setDrawColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: Rgb) {
  doc.setTextColor(c[0], c[1], c[2]);
}

/** Width of a string drawn with extra letter-spacing. */
function spacedWidth(doc: jsPDF, s: string, charSpace: number): number {
  return doc.getTextWidth(s) + charSpace * Math.max(0, s.length - 1);
}

/* ── The report ─────────────────────────────────────────────── */

/** Build the results PDF and hand it to the caller (does not download). */
export async function buildResultsPdf(data: ReportData): Promise<jsPDF> {
  const { game, questions, stats, distributions, leaderboard } = data;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const totalQ = questions.length;
  const distByQ = new Map<string, Distribution>(
    distributions.map((d) => [d.question_id, d])
  );
  const generated = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  doc.setProperties({
    title: `${game.title} — Guardian Gauntlet results`,
    subject: "Game results: final standings and answer breakdown",
    author: "Guardian Gauntlet",
    creator: "Guardian Gauntlet",
  });

  /* ── Header band ── */

  const BAND_H = 124;
  setFill(doc, NAVY_900);
  doc.rect(0, 0, PAGE_W, BAND_H, "F");
  // thin gold keel line under the band
  setFill(doc, GOLD_500);
  doc.rect(0, BAND_H, PAGE_W, 2.5, "F");

  const logo = await shieldPng();
  let lockupX = MARGIN;
  if (logo) {
    doc.addImage(logo, "PNG", MARGIN - 4, 20, 62, 62);
    lockupX = MARGIN + 66;
  }

  // brand lockup
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, STEEL_400);
  doc.text("GUARDIAN PHARMACY", lockupX, 45, { charSpace: 1.8 });
  doc.setFontSize(21);
  setText(doc, WHITE);
  doc.text("Guardian ", lockupX, 68);
  const w1 = doc.getTextWidth("Guardian ");
  setText(doc, GOLD_500);
  doc.text("Gauntlet", lockupX + w1, 68);

  // right-hand column
  const xRight = PAGE_W - MARGIN;
  doc.setFontSize(8);
  setText(doc, STEEL_400);
  const rr = "RESULTS REPORT";
  doc.text(rr, xRight - spacedWidth(doc, rr, 1.6), 45, { charSpace: 1.6 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, STEEL_300);
  doc.text(generated, xRight, 61, { align: "right" });
  // "Game code XXXXX" with the code in gold monospace
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const labelW = doc.getTextWidth("Game code");
  doc.setFont("courier", "bold");
  doc.setFontSize(10.5);
  const codeW = doc.getTextWidth(game.code);
  const comboX = xRight - (labelW + 6 + codeW);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, STEEL_400);
  doc.text("Game code", comboX, 77);
  doc.setFont("courier", "bold");
  doc.setFontSize(10.5);
  setText(doc, GOLD_500);
  doc.text(game.code, comboX + labelW + 6, 77);

  // game title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  setText(doc, WHITE);
  let titleLines = doc.splitTextToSize(game.title, CONTENT_W) as string[];
  if (titleLines.length > 2) {
    titleLines = titleLines.slice(0, 2);
    titleLines[1] = titleLines[1].replace(/.{2}$/, "") + "…";
  }
  doc.text(titleLines[0], MARGIN, 101);
  if (titleLines[1]) doc.text(titleLines[1], MARGIN, 117);

  /* ── Summary tiles ── */

  const tilesY = BAND_H + 22;
  const TILE_H = 58;
  const gap = 10;
  const tileW = (CONTENT_W - gap * 3) / 4;
  const topEntry = leaderboard[0];
  const tiles: { value: string; label: string }[] = [
    { value: String(stats.participants), label: "PLAYERS" },
    { value: String(totalQ), label: "QUESTIONS" },
    { value: String(stats.total_answers), label: "ANSWERS IN" },
    {
      value: topEntry ? `${topEntry.correct} / ${totalQ}` : "—",
      label: "TOP SCORE",
    },
  ];
  tiles.forEach((t, i) => {
    const x = MARGIN + i * (tileW + gap);
    setFill(doc, STEEL_50);
    setStroke(doc, STEEL_200);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, tilesY, tileW, TILE_H, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(t.value.length > 6 ? 15 : 19);
    setText(doc, NAVY_900);
    doc.text(t.value, x + tileW / 2, tilesY + 29, { align: "center" });
    doc.setFontSize(7.5);
    setText(doc, STEEL_600);
    const lw = spacedWidth(doc, t.label, 0.8);
    doc.text(t.label, x + tileW / 2 - lw / 2, tilesY + 44, { charSpace: 0.8 });
  });

  /* ── Section title helper ── */

  const sectionTitle = (title: string, y: number, note?: string): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    setText(doc, NAVY_900);
    doc.text(title, MARGIN, y);
    setFill(doc, GOLD_500);
    doc.rect(MARGIN, y + 6, 30, 3, "F");
    if (note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText(doc, STEEL_500);
      doc.text(note, xRight, y, { align: "right" });
    }
    return y + 24;
  };

  /* ── Final standings ── */

  const hasTies = leaderboard.some(
    (e, i) => i > 0 && e.rank === leaderboard[i - 1].rank
  );
  let cursorY = sectionTitle(
    "Final standings",
    tilesY + TILE_H + 34,
    hasTies ? "Ties share a rank" : undefined
  );

  if (leaderboard.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    setText(doc, STEEL_600);
    doc.text("No players joined this game.", MARGIN, cursorY + 4);
    cursorY += 24;
  } else {
    autoTable(doc, {
      startY: cursorY - 6,
      margin: { left: MARGIN, right: MARGIN, top: TOP_Y, bottom: 56 },
      head: [["Rank", "Player", "Correct", "Answered"]],
      body: leaderboard.map((e) => [
        ordinal(e.rank),
        `${e.first_name} ${e.last_name}`,
        `${e.correct} / ${totalQ}`,
        `${e.answered} / ${totalQ}`,
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        textColor: NAVY_900,
        cellPadding: { top: 5, bottom: 5, left: 8, right: 8 },
        lineWidth: 0,
      },
      headStyles: {
        fillColor: NAVY_800,
        textColor: WHITE,
        fontSize: 8,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: STEEL_50 },
      columnStyles: {
        0: { cellWidth: 56, halign: "center" },
        2: { cellWidth: 80, halign: "center" },
        3: { cellWidth: 80, halign: "center" },
      },
      didParseCell: (hook) => {
        if (hook.section === "head" && hook.column.index === 1) {
          hook.cell.styles.halign = "left";
        }
        if (hook.section !== "body") return;
        const entry = leaderboard[hook.row.index];
        if (!entry) return;
        if (entry.rank <= 3) {
          hook.cell.styles.fillColor =
            entry.rank === 1
              ? GOLD_100
              : entry.rank === 2
                ? STEEL_100
                : BRONZE_100;
          if (hook.column.index <= 1) hook.cell.styles.fontStyle = "bold";
          if (hook.column.index === 0) {
            hook.cell.styles.textColor =
              entry.rank === 1
                ? GOLD_600
                : entry.rank === 2
                  ? STEEL_700
                  : BRONZE_700;
          }
        } else if (hook.column.index === 0) {
          hook.cell.styles.textColor = STEEL_600;
        }
      },
    });
    cursorY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? cursorY;
  }

  /* ── Questions & answers ── */

  let y = cursorY + 36;
  const ensureRoom = (needed: number) => {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = TOP_Y;
    }
  };

  ensureRoom(110); // section title + at least one question header
  y = sectionTitle("Questions & answers", y, `${totalQ} questions`);
  y += 2;

  if (totalQ === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    setText(doc, STEEL_600);
    doc.text("This game has no questions.", MARGIN, y + 4);
  }

  const OPT_TEXT_X = MARGIN + 26;
  const BAR_W = 104;
  const STATS_W = 66;
  const BAR_X = MARGIN + CONTENT_W - STATS_W - 10 - BAR_W;
  const OPT_TEXT_W = BAR_X - 10 - OPT_TEXT_X;

  questions.forEach((q, qi) => {
    const dist = distByQ.get(q.id);
    const counts =
      dist && dist.counts.length === q.options.length
        ? dist.counts
        : new Array<number>(q.options.length).fill(0);
    const totalVotes = counts.reduce((s, n) => s + n, 0);
    const correctCount = counts[q.correct_index] ?? 0;
    const correctLetter = OPTION_LETTERS[q.correct_index] ?? "?";

    // Pre-measure: question prompt lines + first option, so the header
    // never strands alone at the bottom of a page.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    const promptLines = doc.splitTextToSize(
      q.prompt,
      CONTENT_W - 34
    ) as string[];
    const headerH = Math.max(17, promptLines.length * 14) + 18;
    ensureRoom(headerH + 46);

    // divider between questions
    if (qi > 0) {
      setStroke(doc, STEEL_200);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y - 10, MARGIN + CONTENT_W, y - 10);
    }

    // Qn chip
    const chipLabel = `Q${qi + 1}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const chipW = doc.getTextWidth(chipLabel) + 12;
    setFill(doc, NAVY_800);
    doc.roundedRect(MARGIN, y, chipW, 15, 4, 4, "F");
    setText(doc, WHITE);
    doc.text(chipLabel, MARGIN + chipW / 2, y + 10.5, { align: "center" });

    // prompt
    doc.setFontSize(10.5);
    setText(doc, NAVY_900);
    promptLines.forEach((line, i) => {
      doc.text(line, MARGIN + chipW + 8, y + 11 + i * 14);
    });
    y += Math.max(17, promptLines.length * 14) + 4;

    // meta line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, STEEL_600);
    const meta =
      totalVotes > 0
        ? `Correct answer: ${correctLetter}  ·  ${correctCount} of ${totalVotes} answered right (${pct(correctCount, totalVotes)}%)`
        : `Correct answer: ${correctLetter}  ·  no answers recorded`;
    doc.text(meta, MARGIN, y + 6);
    y += 16;

    // options
    q.options.forEach((opt, oi) => {
      const isCorrect = oi === q.correct_index;
      doc.setFont("helvetica", isCorrect ? "bold" : "normal");
      doc.setFontSize(9.5);
      const optLines = doc.splitTextToSize(opt, OPT_TEXT_W) as string[];
      const rowH = Math.max(21, 9 + optLines.length * 12);
      ensureRoom(rowH + 2);

      if (isCorrect) {
        setFill(doc, GOLD_100);
        doc.roundedRect(MARGIN - 5, y - 2, CONTENT_W + 10, rowH, 6, 6, "F");
      }

      const firstBase = y + 11;

      // letter chip
      setFill(doc, isCorrect ? GOLD_500 : STEEL_100);
      doc.roundedRect(MARGIN, firstBase - 10.5, 17, 14, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      setText(doc, isCorrect ? NAVY_950 : NAVY_700);
      doc.text(OPTION_LETTERS[oi] ?? "?", MARGIN + 8.5, firstBase - 0.5, {
        align: "center",
      });

      // option text
      doc.setFont("helvetica", isCorrect ? "bold" : "normal");
      doc.setFontSize(9.5);
      setText(doc, NAVY_900);
      optLines.forEach((line, i) => {
        doc.text(line, OPT_TEXT_X, firstBase + i * 12);
      });

      // bar
      const ratio = totalVotes > 0 ? (counts[oi] ?? 0) / totalVotes : 0;
      setFill(doc, STEEL_100);
      setStroke(doc, STEEL_200);
      doc.setLineWidth(0.5);
      doc.roundedRect(BAR_X, firstBase - 8, BAR_W, 6.5, 2, 2, "FD");
      if (ratio > 0) {
        const w = Math.max(3, BAR_W * ratio);
        setFill(doc, isCorrect ? GOLD_500 : STEEL_500);
        doc.roundedRect(BAR_X, firstBase - 8, w, 6.5, 2, 2, "F");
      }

      // count · %
      doc.setFont("helvetica", isCorrect ? "bold" : "normal");
      doc.setFontSize(8.5);
      setText(doc, isCorrect ? GOLD_600 : NAVY_700);
      doc.text(
        `${counts[oi] ?? 0} · ${pct(counts[oi] ?? 0, totalVotes)}%`,
        MARGIN + CONTENT_W,
        firstBase - 1,
        { align: "right" }
      );

      y += rowH;
    });

    y += 20;
  });

  /* ── Footers ── */

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setStroke(doc, STEEL_200);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - 38, PAGE_W - MARGIN, PAGE_H - 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, STEEL_500);
    doc.text(
      `Guardian Gauntlet  ·  ${game.title}  ·  generated ${generated}`,
      MARGIN,
      PAGE_H - 26
    );
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 26, {
      align: "right",
    });
  }

  return doc;
}

/** Build the PDF and trigger a download named after the game. */
export async function downloadResultsPdf(data: ReportData): Promise<void> {
  const doc = await buildResultsPdf(data);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${slugify(data.game.title)}-results-${stamp}.pdf`);
}
