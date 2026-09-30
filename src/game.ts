import type { Course } from "./courses";

export type LonLat = [number, number];

export const HOLES_PER_ROUND = 5;
/** Later holes are worth more, MapTap-style: a perfect round is 1000. */
export const MULTIPLIERS = [1, 1, 2, 3, 3] as const;
export const MAX_TOTAL = MULTIPLIERS.reduce((sum, m) => sum + 100 * m, 0);

// Scoring follows MapTap's curve: points fall off exponentially with distance and hit
// zero at SCORE_RANGE_KM. Roughly 98 at 100 km, 81 at 1,000 km, 34 at 5,000 km.
export const SCORE_RANGE_KM = 16_250;
export const DECAY_KM = SCORE_RANGE_KM / 3.5;
/** Tapping inside the right country lifts the score to at least this… */
export const COUNTRY_FLOOR = 25;
/** …scaling up with accuracy, but the bonus never lifts a score above this. */
export const COUNTRY_BONUS_CAP = 80;

/** Day 1 of the daily puzzle, local calendar date. */
export const EPOCH = { year: 2026, month: 9, day: 30 };

const EARTH_RADIUS_KM = 6371.0088;

export function distanceKm(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function scoreForDistance(km: number): number {
  if (km >= SCORE_RANGE_KM) return 0;
  return Math.round(100 * Math.exp(-km / DECAY_KM));
}

/** Largest distance that still earns `points` from distance alone. */
export function distanceForScore(points: number): number {
  return DECAY_KM * Math.log(100 / (points - 0.5));
}

/**
 * Rescales a distance score into [COUNTRY_FLOOR, 100] when the ball landed in the
 * right country, capped at COUNTRY_BONUS_CAP. Never lowers a score.
 */
export function withCountryBonus(points: number, sameCountry: boolean): number {
  if (!sameCountry) return points;
  const boosted = COUNTRY_FLOOR + (points / 100) * (100 - COUNTRY_FLOOR);
  return Math.round(Math.max(points, Math.min(boosted, COUNTRY_BONUS_CAP)));
}

export interface Rating {
  key: "ace" | "eagle" | "birdie" | "par" | "bogey" | "double" | "lost";
  label: string;
  emoji: string;
  min: number;
}

// Ordered best to worst. `min` is the lowest points total that earns the rating.
export const RATINGS: Rating[] = [
  { key: "ace", label: "Hole-in-one", emoji: "🏆", min: 100 },
  { key: "eagle", label: "Eagle", emoji: "🦅", min: 95 },
  { key: "birdie", label: "Birdie", emoji: "🐦", min: 85 },
  { key: "par", label: "Par", emoji: "⛳", min: 70 },
  { key: "bogey", label: "Bogey", emoji: "🟡", min: 50 },
  { key: "double", label: "Double bogey", emoji: "🟠", min: 25 },
  { key: "lost", label: "Lost ball", emoji: "💦", min: 0 },
];

export function ratingFor(points: number): Rating {
  return RATINGS.find((r) => points >= r.min) ?? RATINGS[RATINGS.length - 1];
}

// ── Seeded randomness ──────────────────────────────────────────

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Daily puzzle ───────────────────────────────────────────────

/** Courses in the same day's round are kept at least this far apart. */
export const MIN_SEPARATION_KM = 800;

const lonLat = (c: Course): LonLat => [c.lon, c.lat];

function pickSpread(pool: Course[], count: number): Course[] {
  const picked: Course[] = [];
  while (picked.length < count && pool.length) {
    let idx = pool.findIndex((c) =>
      picked.every((p) => distanceKm(lonLat(p), lonLat(c)) >= MIN_SEPARATION_KM),
    );
    if (idx === -1) idx = 0;
    picked.push(pool.splice(idx, 1)[0]);
  }
  // Easier holes first; the ×3 holes are the deep cuts. Array.sort is stable.
  return picked.sort((a, b) => a.tier - b.tier);
}

const cycleCache = new Map<string, Course[][]>();

/**
 * Every course is used once per cycle before any repeats. Each cycle is a fresh
 * seeded shuffle, dealt out five courses per day.
 */
function buildCycle(cycle: number, courses: Course[]): Course[][] {
  const cacheKey = `${cycle}:${courses.length}`;
  const cached = cycleCache.get(cacheKey);
  if (cached) return cached;
  const daysPerCycle = Math.floor(courses.length / HOLES_PER_ROUND);
  const pool = shuffle(courses, mulberry32(hashString(`golftap-cycle-${cycle}`)));
  const days: Course[][] = [];
  for (let d = 0; d < daysPerCycle; d++) days.push(pickSpread(pool, HOLES_PER_ROUND));
  cycleCache.set(cacheKey, days);
  return days;
}

export function dailyCourses(dayIndex: number, courses: Course[]): Course[] {
  const daysPerCycle = Math.floor(courses.length / HOLES_PER_ROUND);
  const i = Math.max(0, dayIndex);
  return buildCycle(Math.floor(i / daysPerCycle), courses)[i % daysPerCycle];
}

export function practiceCourses(courses: Course[], rand: () => number = Math.random): Course[] {
  return pickSpread(shuffle(courses, rand), HOLES_PER_ROUND);
}

// ── Dates ──────────────────────────────────────────────────────

export function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Days since EPOCH in the player's local calendar (0 on launch day). */
export function dayIndexFor(d: Date): number {
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const epoch = Date.UTC(EPOCH.year, EPOCH.month - 1, EPOCH.day);
  return Math.round((local - epoch) / 86_400_000);
}

export function puzzleNumberFor(d: Date): number {
  return dayIndexFor(d) + 1;
}

export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

// ── Formatting & sharing ───────────────────────────────────────

export type Units = "km" | "mi";

export function formatDistance(km: number, units: Units): string {
  const value = units === "mi" ? km * 0.621371 : km;
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-US");
  return `${rounded} ${units}`;
}

export interface HoleResult {
  courseId: string;
  guess: LonLat;
  distanceKm: number;
  /** Final points for the hole, before its multiplier (country bonus included). */
  points: number;
  /** The ball landed in the course's country. */
  sameCountry?: boolean;
}

export function roundTotal(results: HoleResult[]): number {
  return results.reduce((sum, r, i) => sum + r.points * MULTIPLIERS[i], 0);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * MapTap-style share text:
 *   GolfTap September 30
 *   100🏆 81🐦 62⛳ 40🟡 10💦
 *   Final score: 455
 *   https://…
 */
export function shareText(opts: { date: Date | null; results: HoleResult[]; url?: string }): string {
  const title = opts.date ? `GolfTap ${MONTHS[opts.date.getMonth()]} ${opts.date.getDate()}` : "GolfTap practice round";
  const holes = opts.results.map((r) => `${r.points}${ratingFor(r.points).emoji}`).join(" ");
  return [title, holes, `Final score: ${roundTotal(opts.results)}`, opts.url].filter(Boolean).join("\n");
}
