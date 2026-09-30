import "./style.css";
import { COURSES, type Course } from "./courses";
import {
  HOLES_PER_ROUND,
  MAX_TOTAL,
  MULTIPLIERS,
  RATINGS,
  dailyCourses,
  dayIndexFor,
  dateKey,
  distanceForScore,
  distanceKm,
  formatDistance,
  msUntilNextDay,
  practiceCourses,
  puzzleNumberFor,
  ratingFor,
  roundTotal,
  scoreForDistance,
  shareText,
  withCountryBonus,
  type HoleResult,
  type LonLat,
  type Rating,
  type Units,
} from "./game";
import * as store from "./storage";
import { Globe, type Pin } from "./globe";
import { countryAt, countryNear } from "./geo";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  canvas: $<HTMLCanvasElement>("globe"),
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
  clue: $("clue"),
  result: $("result"),
  rating: $("rating"),
  points: $("points"),
  pointsX: $("points-x"),
  where: $("where"),
  distance: $("distance"),
  hint: $("hint"),
  go: $<HTMLButtonElement>("btn-go"),
  toast: $("toast"),
  dlgHelp: $<HTMLDialogElement>("dlg-help"),
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

const globe = new Globe(el.canvas);
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
      li.className = `is-done ${ratingTone(ratingFor(r.points))}`;
      li.textContent = String(r.points);
      li.setAttribute("aria-label", `Hole ${i + 1}: ${r.points} points`);
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
    const total = roundTotal(session.results);
    el.tee.hidden = true;
    el.teeName.hidden = true;
    el.holeLabel.textContent = "Round complete";
    el.courseName.textContent = `You shot ${total}`;
    el.clue.textContent =
      session.mode === "daily"
        ? `Out of ${MAX_TOTAL.toLocaleString("en-US")}. Five new courses tee off at midnight.`
        : `Out of ${MAX_TOTAL.toLocaleString("en-US")}. Practice rounds don't count toward your record.`;
    el.result.hidden = true;
    el.hint.textContent = "";
    el.go.hidden = false;
    el.go.disabled = false;
    el.go.textContent = "Scorecard";
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
  el.clue.textContent = course.clue;

  if (phase === "revealed") {
    const r = session.results[idx];
    const rating = ratingFor(r.points);
    el.result.hidden = false;
    el.rating.textContent = rating.label;
    el.rating.className = `rating ${ratingTone(rating)}`;
    el.points.textContent = String(r.points);
    el.pointsX.textContent = m > 1 ? `× ${m} = ${r.points * m}` : "";
    el.where.textContent = `${course.place}, ${course.country}`;
    const bonus = r.points - scoreForDistance(r.distanceKm);
    const countryNote = r.sameCountry ? (bonus > 0 ? ` · right country, +${bonus}` : " · right country") : "";
    el.distance.textContent = `${formatDistance(r.distanceKm, units)} from your ball${countryNote}`;
    el.hint.textContent = "";
    el.go.hidden = false;
    el.go.disabled = false;
    el.go.textContent = idx + 1 < HOLES_PER_ROUND ? "Next hole" : "Scorecard";
  } else if (confirmGuesses) {
    el.result.hidden = true;
    el.hint.textContent = phase === "placed" ? "Tap again to move your ball." : "Tap the globe to drop your ball.";
    el.go.hidden = false;
    el.go.disabled = phase !== "placed";
    el.go.textContent = "Lock it in";
  } else {
    el.result.hidden = true;
    el.hint.textContent = "Tap where you think the course is. Your first tap is your guess.";
    el.go.hidden = true;
  }
}

function renderHelp(): void {
  el.ratingsBody.innerHTML = RATINGS.map((r, i) => {
    const next = RATINGS[i - 1];
    const pts = next ? `${r.min}–${next.min - 1}` : `${r.min}`;
    const within = r.min > 0 ? `${formatDistance(distanceForScore(r.min), units)}` : "farther";
    const tone = ratingTone(r);
    return `<tr><td class="${tone}">${r.label}</td><td>${pts}</td><td>${within}</td></tr>`;
  }).join("");
}

function renderStats(): void {
  const history = store.loadHistory();
  const s = store.computeStats(history, day.puzzleNumber);
  const tiles: [string, number][] = [
    ["Played", s.played],
    ["Average", s.average],
    ["Best", s.best],
    ["Streak", s.streak],
    ["Longest streak", s.maxStreak],
  ];
  el.statRow.innerHTML = tiles.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  if (!s.played) {
    el.dist.innerHTML = `<p class="empty">Finish today's round to start your record.</p>`;
  } else {
    const max = Math.max(...s.distribution, 1);
    const today = history[day.puzzleNumber];
    const todayBin = today === undefined ? -1 : Math.min(9, Math.floor(today / 100));
    el.dist.innerHTML = s.distribution
      .map((count, bin) => ({ count, bin }))
      .reverse()
      .map(({ count, bin }) => {
        const label = bin === 9 ? "900–1000" : `${bin * 100}–${bin * 100 + 99}`;
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
  const total = roundTotal(results);
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
  const pts = holes
    .map((i) => {
      const r = results[i];
      return `<td>${r ? `<span class="${markClass(ratingFor(r.points))}">${r.points}</span>` : ""}</td>`;
    })
    .join("");
  const scores = holes
    .map((i) => `<td>${results[i] ? `<span class="hand">${results[i].points * MULTIPLIERS[i]}</span>` : ""}</td>`)
    .join("");
  const rawTotal = results.reduce((a, r) => a + r.points, 0);
  el.scTable.innerHTML =
    head +
    `<tbody>
      <tr><th scope="row">Tees</th>${tees}<td class="total-col"></td></tr>
      <tr><th scope="row">Pts</th>${pts}<td class="total-col"><span class="hand">${rawTotal}</span></td></tr>
      <tr><th scope="row">Score</th>${scores}<td class="total-col"><span class="hand">${total}</span></td></tr>
    </tbody>`;

  el.scCourses.innerHTML = results
    .map((r, i) => {
      const c = courses[i];
      const rating = ratingFor(r.points);
      return `<li><span class="n">${i + 1}</span><span class="name">${escapeHtml(c.name)}</span><span class="km">${formatDistance(r.distanceKm, units)}</span><span class="loc">${escapeHtml(`${c.place}, ${c.country}`)} · ${rating.label}</span></li>`;
    })
    .join("");
  el.scTotal.textContent = String(total);
  el.btnShare.textContent = "Copy result";
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
  session.phase = "aim";
  session.pending = null;
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
  };
  renderTopbar();
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
  };
  renderTopbar();
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
  session.pending = null;

  if (session.mode === "daily" && session.puzzleNumber !== null) {
    store.saveDaily({
      puzzleNumber: session.puzzleNumber,
      courseIds: session.courses.map((c) => c.id),
      results: session.results,
    });
    if (session.results.length === HOLES_PER_ROUND) {
      store.recordFinish(session.puzzleNumber, roundTotal(session.results));
    }
  }

  const pin: Pin = { guess, answer, label: String(idx + 1), progress: 0 };
  globe.setPending(null);
  globe.tapEnabled = false;
  globe.pins = [pin];
  globe.frame2(guess, answer, () => globe.animateArc(pin, 900));
  renderCard();
}

function showFinished(openCard: boolean): void {
  session.phase = "done";
  session.pending = null;
  globe.setPending(null);
  globe.tapEnabled = false;
  globe.pins = pinsFor(session.results, session.courses);
  globe.overview();
  renderCard();
  if (openCard) openScorecard();
}

function onPrimary(): void {
  switch (session.phase) {
    case "placed":
      lockIn();
      break;
    case "revealed":
      if (session.results.length >= HOLES_PER_ROUND) showFinished(true);
      else beginHole();
      break;
    case "done":
      openScorecard();
      break;
  }
}

function openScorecard(): void {
  renderScorecard();
  el.dlgCard.showModal();
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
    el.btnShare.textContent = "Copied";
    toast("Result copied. Paste it anywhere.");
  } catch {
    el.shareFallback.value = text;
    el.shareFallback.hidden = false;
    el.shareFallback.focus();
    el.shareFallback.select();
    toast("Copy the text below to share your round.");
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
el.zoomIn.addEventListener("click", () => globe.zoomBy(1.6));
el.zoomOut.addEventListener("click", () => globe.zoomBy(1 / 1.6));
el.zoomReset.addEventListener("click", () => globe.resetView());

el.btnMode.addEventListener("click", () => (session.mode === "daily" ? startPractice() : startDaily()));
el.btnHelp.addEventListener("click", () => {
  renderHelp();
  el.dlgHelp.showModal();
});
el.btnStats.addEventListener("click", () => {
  renderStats();
  el.dlgStats.showModal();
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
el.dlgHelp.addEventListener("close", () => store.markHelpSeen());

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
if (!store.hasSeenHelp()) {
  renderHelp();
  el.dlgHelp.showModal();
}
