import "./style.css";
import { COURSES, type Course } from "./courses";
import {
  BEST_ROUND,
  HOLES_PER_ROUND,
  MULTIPLIERS,
  SCORE_RANGE_KM,
  dailyCourses,
  dayIndexFor,
  dateKey,
  distanceForScore,
  distanceKm,
  formatDistance,
  formatToPar,
  holeToPar,
  msUntilNextDay,
  practiceCourses,
  puzzleNumberFor,
  quipFor,
  ratingFor,
  roundToPar,
  scoreForDistance,
  shareText,
  spokenToPar,
  withCountryBonus,
  type HoleResult,
  type LonLat,
  type Rating,
  type Units,
} from "./game";
import * as store from "./storage";
import { Globe, type Pin } from "./globe";
import { countryAt, countryNear, countryShape } from "./geo";
import earth4k from "./assets/earth-4k.jpg";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  canvas: $<HTMLCanvasElement>("globe"),
  satCanvas: $<HTMLCanvasElement>("globe-sat"),
  scoreChip: $("score-chip"),
  scoreNum: $("score-num"),
  tag: $("reveal-tag"),
  tagRating: $("tag-rating"),
  tagPoints: $("tag-points"),
  tagDist: $("tag-dist"),
  tagQuip: $("tag-quip"),
  topbar: $("topbar"),
  roundTag: $("round-tag"),
  btnMode: $<HTMLButtonElement>("btn-mode"),
  btnStats: $<HTMLButtonElement>("btn-stats"),
  btnHelp: $<HTMLButtonElement>("btn-help"),
  zoomIn: $<HTMLButtonElement>("zoom-in"),
  zoomOut: $<HTMLButtonElement>("zoom-out"),
  zoomReset: $<HTMLButtonElement>("zoom-reset"),
  card: $("card"),
  tee: $("tee"),
  holeLabel: $("hole-label"),
  teeName: $("tee-name"),
  pips: $("pips"),
  courseName: $("course-name"),
  reveal: $("reveal"),
  where: $("where"),
  fact: $("fact"),
  resultSr: $("result-sr"),
  hint: $("hint"),
  go: $<HTMLButtonElement>("btn-go"),
  goLabel: $("btn-go-label"),
  toast: $("toast"),
  dlgHelp: $<HTMLDialogElement>("dlg-help"),
  ratingsHead: $("ratings-table").querySelector("thead")!,
  ratingsBody: $("ratings-table").querySelector("tbody")!,
  dlgStats: $<HTMLDialogElement>("dlg-stats"),
  statRow: $("stat-row"),
  dist: $("dist"),
  unitButtons: [$<HTMLButtonElement>("units-km"), $<HTMLButtonElement>("units-mi")],
  confirmToggle: $<HTMLInputElement>("confirm-guess"),
  dlgCard: $<HTMLDialogElement>("dlg-card"),
  scDate: $("sc-date"),
  scTable: $("sc-table"),
  scCourses: $("sc-courses"),
  scTotal: $("sc-total"),
  scTotalNote: $("sc-total-note"),
  btnShare: $<HTMLButtonElement>("btn-share"),
  btnNextMode: $<HTMLButtonElement>("btn-next-mode"),
  shareFallback: $<HTMLTextAreaElement>("share-fallback"),
  nextRound: $("next-round"),
};

// ── State ──────────────────────────────────────────────────────

type Phase = "aim" | "placed" | "revealed" | "done";

interface Session {
  mode: "daily" | "practice";
  puzzleNumber: number | null;
  /** Calendar day this round belongs to (a daily round started before midnight keeps its date). */
  date: Date;
  courses: Course[];
  results: HoleResult[];
  phase: Phase;
  pending: LonLat | null;
  /** In the "revealed" phase: the flag has landed and the result is showing. */
  landed: boolean;
}

const byId = new Map(COURSES.map((c) => [c.id, c]));
const defaultUnits: Units = /^en-(US|LR|MM)$/i.test(navigator.language) ? "mi" : "km";
let units: Units = store.loadUnits() ?? defaultUnits;
/** Off (default): the first tap is the guess. On: tap to place, then "Lock it in". */
let confirmGuesses = store.loadConfirmGuesses();

let day = makeDay(new Date());
let session: Session;

function makeDay(date: Date) {
  return {
    date,
    key: dateKey(date),
    puzzleNumber: puzzleNumberFor(date),
    courses: dailyCourses(dayIndexFor(date), COURSES),
  };
}

// A quick 4K texture first; desktops then swap in 8K for sharper zooming. The single-file
// build only carries the 4K one.
const imagery = [earth4k];
if (import.meta.env.MODE !== "single" && window.matchMedia("(pointer: fine)").matches) {
  imagery.push(`${import.meta.env.BASE_URL}textures/earth-8k.jpg`);
}
// Sharper tiles stream in as you zoom (same 2025 imagery, from EOX's tile server). The
// single-file build can't reach other hosts, so it keeps the whole-Earth texture only.
const TILE_URL: string =
  import.meta.env.VITE_TILE_URL || "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{y}/{x}.jpg";
const tiles =
  import.meta.env.MODE === "single"
    ? undefined
    : {
        url: (z: number, row: number, col: number) =>
          TILE_URL.replace("{z}", String(z)).replace("{y}", String(row)).replace("{x}", String(col)),
        maxZoom: 14,
      };
const globe = new Globe(el.canvas, { canvas: el.satCanvas, sources: imagery, tiles });
if (import.meta.env.VITE_DEBUG_HOOKS) (window as unknown as { __globe: Globe }).__globe = globe;
globe.onRender = positionTag;
globe.onInteract = () => {
  // Exploring the revealed spot pauses the countdown to the next hole.
  if (session.phase === "revealed" && advanceTimer) {
    cancelAdvance();
    renderCard();
  }
};
globe.onTap = (p) => {
  if (session.phase !== "aim" && session.phase !== "placed") return;
  session.pending = p;
  if (!confirmGuesses) {
    lockIn();
    return;
  }
  session.phase = "placed";
  globe.setPending(p);
  renderCard();
};

// ── Helpers ────────────────────────────────────────────────────

const answerOf = (c: Course): LonLat => [c.lon, c.lat];

const courseCountries = new Map<string, string | null>();
function countryOfCourse(c: Course): string | null {
  if (!courseCountries.has(c.id)) courseCountries.set(c.id, countryNear(answerOf(c)));
  return courseCountries.get(c.id) ?? null;
}

function teeFor(multiplier: number): { key: string; name: string } {
  if (multiplier >= 3) return { key: "black", name: "The tips" };
  if (multiplier === 2) return { key: "blue", name: "Blue tees" };
  return { key: "white", name: "White tees" };
}

function markClass(r: Rating): string {
  switch (r.key) {
    case "ace":
    case "eagle":
      return "mark under double";
    case "birdie":
      return "mark under";
    case "bogey":
      return "mark over";
    case "double":
    case "lost":
      return "mark over double";
    default:
      return "mark";
  }
}

/** A played hole's strokes to par and the name that goes with them. */
function scoreOf(r: HoleResult, index: number): { toPar: number; rating: Rating } {
  return { toPar: holeToPar(r.points, MULTIPLIERS[index]), rating: ratingFor(r.points) };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ratingTone = (r: Rating) =>
  r.key === "ace" || r.key === "eagle" || r.key === "birdie" ? "under" : r.key === "par" ? "" : "over";

function currentIndex(): number {
  const n = session.results.length;
  return session.phase === "revealed" || session.phase === "done" ? Math.max(0, n - 1) : n;
}

function pinsFor(results: HoleResult[], courses: Course[]): Pin[] {
  return results.map((r, i) => ({
    guess: r.guess,
    answer: answerOf(courses[i]),
    label: String(i + 1),
    progress: 1,
  }));
}

function formatDate(d: Date, long = false): string {
  return d.toLocaleDateString(undefined, long
    ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

let toastTimer = 0;
function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), 2600);
}

function shareUrl(): string | undefined {
  const configured = import.meta.env.VITE_SHARE_URL as string | undefined;
  if (configured) return configured;
  const topLevel = window.top === window.self;
  return topLevel && location.protocol.startsWith("http") && location.hostname !== "localhost"
    ? location.origin + location.pathname
    : undefined;
}

// ── Rendering ─────────────────────────────────────────────────

function renderTopbar(): void {
  const practice = session.mode === "practice";
  el.roundTag.textContent = practice ? "Practice round" : `No. ${session.puzzleNumber} · ${formatDate(session.date)}`;
  el.btnMode.classList.toggle("is-active", practice);
  el.btnMode.setAttribute("aria-label", practice ? "Back to today's round" : "Play a practice round");
  el.btnMode.title = practice ? "Back to today's round" : "Practice round";
}

function renderPips(): void {
  const idx = currentIndex();
  el.pips.innerHTML = "";
  for (let i = 0; i < HOLES_PER_ROUND; i++) {
    const li = document.createElement("li");
    const r = session.results[i];
    if (r) {
      const { toPar, rating } = scoreOf(r, i);
      li.className = `is-done ${ratingTone(rating)}`;
      li.textContent = formatToPar(toPar);
      li.setAttribute("aria-label", `Hole ${i + 1}: ${rating.label}, ${spokenToPar(toPar)}`);
    } else {
      li.textContent = String(i + 1);
      if (i === idx && session.phase !== "done") li.className = "is-current";
      li.setAttribute("aria-label", `Hole ${i + 1}: not played`);
    }
    el.pips.append(li);
  }
}

function renderCard(): void {
  renderPips();
  const { phase } = session;

  if (phase === "done") {
    const total = roundToPar(session.results);
    el.tee.hidden = true;
    el.teeName.hidden = true;
    el.holeLabel.textContent = "Round complete";
    el.courseName.textContent = `You shot ${formatToPar(total)}`;
    el.reveal.hidden = false;
    el.where.textContent = `${capitalize(spokenToPar(total))} · best possible ${formatToPar(BEST_ROUND)}`;
    el.fact.textContent =
      session.mode === "daily"
        ? "Five new courses tee off at midnight."
        : "Practice rounds don't count toward your record.";
    el.hint.textContent = "";
    showButton("Scorecard");
    return;
  }

  const idx = currentIndex();
  const course = session.courses[idx];
  const m = MULTIPLIERS[idx];
  const tee = teeFor(m);
  el.tee.hidden = false;
  el.teeName.hidden = false;
  el.tee.dataset.tee = tee.key;
  el.holeLabel.textContent = `Hole ${idx + 1}`;
  el.teeName.innerHTML = `<span class="tee-long">${tee.name}</span>${m > 1 ? ` ×${m}` : ""}`;
  el.courseName.textContent = course.name;

  if (phase === "revealed" && session.landed) {
    // The course fact is only shown once the guess is in.
    el.reveal.hidden = false;
    el.where.textContent = `${course.place}, ${course.country}`;
    el.fact.textContent = course.clue;
    el.hint.textContent = advanceTimer ? "" : "Take your time.";
    showButton(idx + 1 < HOLES_PER_ROUND ? "Next hole" : "Scorecard");
  } else if (phase === "revealed") {
    el.reveal.hidden = true;
    el.hint.textContent = "Finding the flag…";
    el.go.hidden = true;
  } else if (confirmGuesses) {
    el.reveal.hidden = true;
    el.hint.textContent = phase === "placed" ? "Tap again to move your ball." : "Tap the globe to drop your ball.";
    showButton("Lock it in", phase !== "placed");
  } else {
    el.reveal.hidden = true;
    el.hint.textContent = "Tap where you think the course is. Your first tap is your guess.";
    el.go.hidden = true;
  }
}

function showButton(label: string, disabled = false): void {
  el.go.hidden = false;
  el.go.disabled = disabled;
  el.goLabel.textContent = label;
}

// ── Reveal ────────────────────────────────────────────────────

/** Seconds of reveal before the next hole tees off by itself. */
const ADVANCE_MS = 6500;
let advanceTimer = 0;
let tagAnchor: LonLat | null = null;

/** Runs once the flag lands: label, country highlight, score and the countdown. */
function onLanded(): void {
  if (session.phase !== "revealed") return;
  session.landed = true;
  const idx = session.results.length - 1;
  const r = session.results[idx];
  const course = session.courses[idx];
  const m = MULTIPLIERS[idx];
  const { toPar, rating } = scoreOf(r, idx);
  // Strokes the right-country bonus took off.
  const saved = holeToPar(scoreForDistance(r.distanceKm), m) - toPar;
  const countryNote = r.sameCountry ? (saved > 0 ? ` · right country ${formatToPar(-saved)}` : " · right country") : "";

  el.tagRating.textContent = rating.label;
  el.tagRating.className = `tag-rating ${ratingTone(rating)}`;
  el.tagPoints.innerHTML = `<b>${formatToPar(toPar)}</b>${m > 1 ? ` on a ×${m} hole` : ""}`;
  el.tagDist.textContent = `${formatDistance(r.distanceKm, units)} away${countryNote}`;
  el.tagQuip.textContent = `“${quipFor(rating, course.id)}”`;
  tagAnchor = answerOf(course);
  el.tag.hidden = false;
  positionTag();
  el.resultSr.textContent = `${rating.label}: ${spokenToPar(toPar)}${m > 1 ? ` on a times ${m} hole` : ""}. ${formatDistance(
    r.distanceKm,
    units,
  )} away. ${course.place}, ${course.country}.`;

  const target = countryOfCourse(course);
  globe.highlight = target ? countryShape(target) : null;
  globe.requestDraw();
  renderScore(true);
  startAdvance();
  renderCard();
}

function hideReveal(): void {
  cancelAdvance();
  el.tag.hidden = true;
  tagAnchor = null;
  globe.highlight = null;
}

/** Keeps the label beside the flag as the globe moves, clear of the card and top bar. */
function positionTag(): void {
  if (el.tag.hidden || !tagAnchor) return;
  const p = globe.project(tagAnchor);
  if (!p) {
    el.tag.style.visibility = "hidden";
    return;
  }
  el.tag.style.visibility = "visible";
  const w = el.tag.offsetWidth;
  const h = el.tag.offsetHeight;
  const vw = window.innerWidth;
  const card = el.card.getBoundingClientRect();
  const top = el.scoreChip.getBoundingClientRect().bottom + 8;
  let x = p[0] + 18;
  let y = p[1] - h - 44;
  if (x + w > vw - 12) x = p[0] - w - 18;
  if (y < top) y = p[1] + 14;
  x = Math.min(Math.max(12, x), vw - w - 12);
  if (x < card.right && x + w > card.left && y + h > card.top - 8) y = card.top - h - 8;
  y = Math.max(top, y);
  el.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function startAdvance(): void {
  cancelAdvance();
  el.go.style.setProperty("--advance-ms", `${ADVANCE_MS}ms`);
  void el.go.offsetWidth; // restart the fill animation
  el.go.classList.add("is-counting");
  advanceTimer = window.setTimeout(() => {
    advanceTimer = 0;
    // Don't move on underneath an open dialog; the player continues with the button.
    if ([el.dlgHelp, el.dlgStats, el.dlgCard].some((d) => d.open)) {
      cancelAdvance();
      renderCard();
      return;
    }
    advance();
  }, ADVANCE_MS);
}

function cancelAdvance(): void {
  clearTimeout(advanceTimer);
  advanceTimer = 0;
  el.go.classList.remove("is-counting");
}

function advance(): void {
  if (session.phase !== "revealed" || !session.landed) return;
  if (session.results.length >= HOLES_PER_ROUND) showFinished(true);
  else beginHole();
}

// ── Score counter ─────────────────────────────────────────────

let shownScore = 0;
let scoreFrame = 0;

function renderScore(animate: boolean): void {
  const counting = session.phase === "revealed" && !session.landed;
  const target = roundToPar(counting ? session.results.slice(0, -1) : session.results);
  cancelAnimationFrame(scoreFrame);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (n: number) => (el.scoreNum.textContent = formatToPar(n));
  el.scoreChip.setAttribute("aria-label", `Score: ${spokenToPar(target)}`);
  if (!animate || reduced || target === shownScore) {
    shownScore = target;
    show(target);
    return;
  }
  const from = shownScore;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    show(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
    if (t < 1) scoreFrame = requestAnimationFrame(step);
    else {
      shownScore = target;
      el.scoreChip.classList.remove("is-bumping");
      void el.scoreChip.offsetWidth;
      el.scoreChip.classList.add("is-bumping");
    }
  };
  scoreFrame = requestAnimationFrame(step);
}

/** Example misses for the scoring table, as round numbers in each unit. */
const HELP_EXAMPLES: { km: number; mi: number }[] = [
  { km: 250, mi: 150 },
  { km: 1000, mi: 600 },
  { km: 3200, mi: 2000 },
  { km: 5000, mi: 3000 },
  { km: 10_000, mi: 6000 },
];

function renderHelp(): void {
  const tees = [...new Set(MULTIPLIERS)];
  const row = (label: string, km: number) => {
    const points = scoreForDistance(km);
    const rating = ratingFor(points);
    const cells = tees.map((m) => `<td class="num">${formatToPar(holeToPar(points, m))}</td>`).join("");
    return `<tr><td class="${ratingTone(rating)}">${rating.label}</td><td>${label}</td>${cells}</tr>`;
  };
  const ace = distanceForScore(100);
  // Past this, a ball scores nothing; in miles, round it up to a tidy figure.
  const far = units === "mi" ? (Math.ceil((SCORE_RANGE_KM * 0.621371) / 100) * 100) / 0.621371 : SCORE_RANGE_KM;
  el.ratingsHead.innerHTML = `<tr><th scope="col">Result</th><th scope="col">Ball off by</th>${tees
    .map((m) => `<th scope="col" class="num">×${m}</th>`)
    .join("")}</tr>`;
  el.ratingsBody.innerHTML = [
    row(`under ${formatDistance(ace, units)}`, 0),
    ...HELP_EXAMPLES.map((e) => {
      const km = units === "mi" ? e.mi / 0.621371 : e.km;
      return row(formatDistance(km, units), km);
    }),
    row(`over ${formatDistance(far, units)}`, far),
  ].join("");
}

function renderStats(): void {
  const history = store.loadHistory();
  const s = store.computeStats(history, day.puzzleNumber);
  const tiles: [string, string | number][] = [
    ["Played", s.played],
    ["Average", s.played ? formatToPar(s.average) : "–"],
    ["Best", s.played ? formatToPar(s.best) : "–"],
    ["Streak", s.streak],
    ["Longest streak", s.maxStreak],
  ];
  el.statRow.innerHTML = tiles.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  if (!s.played) {
    el.dist.innerHTML = `<p class="empty">Finish today's round to start your record.</p>`;
  } else {
    const max = Math.max(...s.distribution, 1);
    const today = history[day.puzzleNumber];
    const todayBin = today === undefined ? -1 : store.scoreBin(today);
    // Best scores (furthest under par) at the top.
    el.dist.innerHTML = s.distribution
      .map((count, bin) => ({ count, bin }))
      .map(({ count, bin }) => {
        const [lo, hi] = store.binRange(bin);
        const label = `${formatToPar(lo)} to ${formatToPar(hi)}`;
        const w = count ? Math.max(6, (count / max) * 100) : 0;
        const cls = `dist-row${bin === todayBin ? " is-today" : ""}${count ? "" : " is-empty"}`;
        return `<div class="${cls}"><span>${label}</span><span class="dist-bar" style="--w:${w}">${count || ""}</span></div>`;
      })
      .join("");
  }
  for (const b of el.unitButtons) b.setAttribute("aria-checked", String(b.dataset.units === units));
  el.confirmToggle.checked = confirmGuesses;
}

function renderScorecard(): void {
  const { results, courses } = session;
  const total = roundToPar(results);
  el.scDate.textContent =
    session.mode === "daily" ? `No. ${session.puzzleNumber} · ${formatDate(session.date, true)}` : "Practice round";

  const holes = Array.from({ length: HOLES_PER_ROUND }, (_, i) => i);
  const head = `<thead><tr><th scope="col">Hole</th>${holes.map((i) => `<th scope="col">${i + 1}</th>`).join("")}<th scope="col" class="total-col">Tot</th></tr></thead>`;
  const tees = holes
    .map((i) => {
      const m = MULTIPLIERS[i];
      return `<td><span class="tee-cell" title="${teeFor(m).name}"><span class="tee" data-tee="${teeFor(m).key}"></span>×${m}</span></td>`;
    })
    .join("");
  const scores = holes
    .map((i) => {
      const r = results[i];
      if (!r) return "<td></td>";
      const { toPar, rating } = scoreOf(r, i);
      return `<td><span class="${markClass(rating)}">${formatToPar(toPar)}</span></td>`;
    })
    .join("");
  // Running score to par after each hole, as on a tournament card.
  let running = 0;
  const runningCells = holes
    .map((i) => {
      if (!results[i]) return "<td></td>";
      running += scoreOf(results[i], i).toPar;
      return `<td><span class="hand">${formatToPar(running)}</span></td>`;
    })
    .join("");
  el.scTable.innerHTML =
    head +
    `<tbody>
      <tr><th scope="row">Tees</th>${tees}<td class="total-col"></td></tr>
      <tr><th scope="row">Score</th>${scores}<td class="total-col"><span class="hand">${formatToPar(total)}</span></td></tr>
      <tr><th scope="row">To par</th>${runningCells}<td class="total-col"></td></tr>
    </tbody>`;

  el.scCourses.innerHTML = results
    .map((r, i) => {
      const c = courses[i];
      const { rating } = scoreOf(r, i);
      return `<li><span class="n">${i + 1}</span><span class="name">${escapeHtml(c.name)}</span><span class="km">${formatDistance(r.distanceKm, units)}</span><span class="loc">${escapeHtml(`${c.place}, ${c.country}`)} · ${rating.label}</span><span class="fact-line">${escapeHtml(c.clue)}</span></li>`;
    })
    .join("");
  el.scTotal.textContent = formatToPar(total);
  el.scTotalNote.textContent = total === 0 ? "even par" : "to par";
  el.btnShare.textContent = "Share results";
  el.btnNextMode.textContent = session.mode === "daily" ? "Practice round" : "Play again";
  el.shareFallback.hidden = true;
  renderCountdown();
}

function renderCountdown(): void {
  if (session.mode !== "daily") {
    el.nextRound.textContent = "Practice rounds don't count toward your record.";
    return;
  }
  const ms = msUntilNextDay(new Date());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  el.nextRound.textContent = `Next course set in ${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ── Flow ──────────────────────────────────────────────────────

function beginHole(): void {
  hideReveal();
  session.phase = "aim";
  session.landed = false;
  session.pending = null;
  el.resultSr.textContent = "";
  globe.setPending(null);
  globe.pins = [];
  globe.tapEnabled = true;
  globe.flyTo(globe.center, 1, 900);
  renderCard();
}

function startDaily(): void {
  const saved = store.loadDaily(day.puzzleNumber);
  let courses = day.courses;
  let results: HoleResult[] = [];
  if (saved) {
    const restored = saved.courseIds.map((id) => byId.get(id));
    if (restored.length === HOLES_PER_ROUND && restored.every(Boolean)) {
      courses = restored as Course[];
      results = saved.results.slice(0, HOLES_PER_ROUND);
    }
  }
  session = {
    mode: "daily",
    puzzleNumber: day.puzzleNumber,
    date: day.date,
    courses,
    results,
    phase: "aim",
    pending: null,
    landed: false,
  };
  renderTopbar();
  shownScore = roundToPar(results);
  renderScore(false);
  if (results.length >= HOLES_PER_ROUND) showFinished(false);
  else beginHole();
}

function startPractice(): void {
  session = {
    mode: "practice",
    puzzleNumber: null,
    date: new Date(),
    courses: practiceCourses(COURSES),
    results: [],
    phase: "aim",
    pending: null,
    landed: false,
  };
  renderTopbar();
  shownScore = 0;
  renderScore(false);
  beginHole();
}

function lockIn(): void {
  if ((session.phase !== "aim" && session.phase !== "placed") || !session.pending) return;
  const idx = session.results.length;
  const course = session.courses[idx];
  const guess = session.pending;
  const answer = answerOf(course);
  const km = Math.round(distanceKm(guess, answer) * 10) / 10;
  const target = countryOfCourse(course);
  const sameCountry = target !== null && countryAt(guess) === target;
  session.results.push({
    courseId: course.id,
    guess,
    distanceKm: km,
    points: withCountryBonus(scoreForDistance(km), sameCountry),
    sameCountry,
  });
  session.phase = "revealed";
  session.landed = false;
  session.pending = null;

  if (session.mode === "daily" && session.puzzleNumber !== null) {
    store.saveDaily({
      puzzleNumber: session.puzzleNumber,
      courseIds: session.courses.map((c) => c.id),
      results: session.results,
    });
    if (session.results.length === HOLES_PER_ROUND) {
      store.recordFinish(session.puzzleNumber, roundToPar(session.results));
    }
  }

  const pin: Pin = { guess, answer, label: String(idx + 1), progress: 0 };
  globe.setPending(null);
  globe.tapEnabled = false;
  globe.pins = [pin];
  globe.frame2(guess, answer, () => globe.animateArc(pin, 900, 0, onLanded));
  renderCard();
}

function showFinished(openCard: boolean): void {
  hideReveal();
  session.phase = "done";
  session.landed = false;
  session.pending = null;
  globe.setPending(null);
  globe.tapEnabled = false;
  globe.pins = pinsFor(session.results, session.courses);
  globe.overview();
  renderScore(false);
  renderCard();
  if (openCard) openScorecard();
}

function onPrimary(): void {
  switch (session.phase) {
    case "placed":
      lockIn();
      break;
    case "revealed":
      advance();
      break;
    case "done":
      openScorecard();
      break;
  }
}

/** Opens a sheet scrolled to the top, whatever it showed last time. */
function openSheet(dlg: HTMLDialogElement): void {
  dlg.showModal();
  dlg.scrollTop = 0;
}

function openScorecard(): void {
  renderScorecard();
  openSheet(el.dlgCard);
}

async function shareResult(): Promise<void> {
  const text = shareText({
    date: session.mode === "daily" ? session.date : null,
    results: session.results,
    url: shareUrl(),
  });
  const topLevel = window.top === window.self;
  if (topLevel && navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Results copied. Paste them anywhere to share.");
  } catch {
    el.shareFallback.value = text;
    el.shareFallback.hidden = false;
    el.shareFallback.focus();
    el.shareFallback.select();
    toast("Copy the text below to share your results.");
  }
}

// ── Layout & theme ────────────────────────────────────────────

function updateInsets(): void {
  const top = el.topbar.getBoundingClientRect().bottom;
  const card = el.card.getBoundingClientRect();
  if (window.innerWidth >= 1100) {
    // Wide screens: the card sits bottom-left, so centre the globe in the space to its right.
    globe.setInsets(top, 0, card.right + 8);
  } else {
    globe.setInsets(top, Math.max(0, window.innerHeight - card.top + 8));
  }
}

new ResizeObserver(updateInsets).observe(el.card);
window.addEventListener("resize", updateInsets);

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
darkQuery.addEventListener("change", () => globe.refreshColors());
new MutationObserver(() => globe.refreshColors()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme", "class"],
});
document.fonts?.ready.then(() => globe.requestDraw());

// ── Events ────────────────────────────────────────────────────

el.go.addEventListener("click", onPrimary);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && advanceTimer) {
    cancelAdvance();
    renderCard();
  }
});
el.zoomIn.addEventListener("click", () => globe.zoomBy(1.6));
el.zoomOut.addEventListener("click", () => globe.zoomBy(1 / 1.6));
el.zoomReset.addEventListener("click", () => globe.resetView());

el.btnMode.addEventListener("click", () => (session.mode === "daily" ? startPractice() : startDaily()));
el.btnHelp.addEventListener("click", () => {
  renderHelp();
  openSheet(el.dlgHelp);
});
el.btnStats.addEventListener("click", () => {
  renderStats();
  openSheet(el.dlgStats);
});
el.btnShare.addEventListener("click", () => void shareResult());
el.btnNextMode.addEventListener("click", () => {
  el.dlgCard.close();
  startPractice();
});

for (const b of el.unitButtons) {
  b.addEventListener("click", () => {
    units = b.dataset.units as Units;
    store.saveUnits(units);
    renderStats();
    renderCard();
  });
}

el.confirmToggle.addEventListener("change", () => {
  confirmGuesses = el.confirmToggle.checked;
  store.saveConfirmGuesses(confirmGuesses);
  // A ball placed under confirm mode is dropped when switching back to instant taps.
  if (!confirmGuesses && session.phase === "placed") {
    session.phase = "aim";
    session.pending = null;
    globe.setPending(null);
  }
  renderCard();
});

for (const dlg of [el.dlgHelp, el.dlgStats, el.dlgCard]) {
  dlg.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-close]")) {
      dlg.close();
      return;
    }
    // Clicks on the backdrop land on the dialog element itself, outside its box.
    if (target === dlg) {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    }
  });
}

// Tick once a second: scorecard countdown, and roll over to the new puzzle at midnight.
window.setInterval(() => {
  if (el.dlgCard.open) renderCountdown();
  const now = new Date();
  if (dateKey(now) !== day.key) {
    day = makeDay(now);
    if (session.mode === "daily" && session.phase === "done") {
      el.dlgCard.close();
      startDaily();
      toast(`No. ${day.puzzleNumber} is ready: five new courses.`);
    }
  }
}, 1000);

// ── Boot ──────────────────────────────────────────────────────

startDaily();
updateInsets();
