import { BEST_ROUND, HOLES_PER_ROUND, roundToPar, type HoleResult, type Units } from "./game";

// localStorage can be missing or throw (private mode, blocked storage, sandboxed frames).
// Every access goes through these helpers so the game still runs without it.

const PREFIX = "golftap:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

export interface DailyProgress {
  puzzleNumber: number;
  courseIds: string[];
  results: HoleResult[];
}

export const loadDaily = (puzzleNumber: number): DailyProgress | null => {
  const saved = read<DailyProgress | null>(`daily:${puzzleNumber}`, null);
  return saved && saved.puzzleNumber === puzzleNumber ? saved : null;
};

export const saveDaily = (progress: DailyProgress): void => write(`daily:${progress.puzzleNumber}`, progress);

/** Final scores in strokes to par, keyed by puzzle number. */
export type History = Record<string, number>;

const HISTORY_KEY = "to-par";

export function loadHistory(): History {
  const current = read<History | null>(HISTORY_KEY, null);
  if (current) return current;
  // Earlier versions kept points out of 1000 ("history") and, briefly, a −50 to +50 score
  // ("scores"). Re-score each round from its saved holes where possible; otherwise points
  // convert exactly (500 − points) and the short-lived scale by ×10.
  const points = read<History>("history", {});
  const interim = read<History>("scores", {});
  const migrated: History = {};
  for (const n of new Set([...Object.keys(points), ...Object.keys(interim)])) {
    const saved = loadDaily(Number(n));
    migrated[n] =
      saved && saved.results.length === HOLES_PER_ROUND
        ? roundToPar(saved.results)
        : n in points
          ? -BEST_ROUND - points[n]
          : interim[n] * 10;
  }
  if (Object.keys(migrated).length) write(HISTORY_KEY, migrated);
  return migrated;
}

export function recordFinish(puzzleNumber: number, toPar: number): History {
  const history = loadHistory();
  history[puzzleNumber] = toPar;
  write(HISTORY_KEY, history);
  return history;
}

const BIN_SIZE = 100;
const BINS = Math.ceil((-2 * BEST_ROUND) / BIN_SIZE);

/** Which 100-stroke band a round falls in, best (−500 to −401) first. */
export const scoreBin = (toPar: number): number =>
  Math.max(0, Math.min(BINS - 1, Math.floor((toPar - BEST_ROUND) / BIN_SIZE)));

/** The scores a band covers; the last band also takes the worst score, +500. */
export function binRange(bin: number): [number, number] {
  const lo = BEST_ROUND + bin * BIN_SIZE;
  return [lo, bin === BINS - 1 ? -BEST_ROUND : lo + BIN_SIZE - 1];
}

export interface Stats {
  played: number;
  /** Mean score to par. */
  average: number;
  /** Lowest score to par. */
  best: number;
  streak: number;
  maxStreak: number;
  /** Counts per 100-stroke band, best first: −500 to −401, … +400 to +500. */
  distribution: number[];
}

export function computeStats(history: History, todayPuzzle: number): Stats {
  const nums = Object.keys(history)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const totals = nums.map((n) => history[n]);
  const distribution = Array.from({ length: BINS }, () => 0);
  for (const t of totals) distribution[scoreBin(t)]++;

  let maxStreak = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
  }
  // A streak stays alive through today until today's round is played.
  const played = new Set(nums);
  let streak = 0;
  for (let n = played.has(todayPuzzle) ? todayPuzzle : todayPuzzle - 1; played.has(n); n--) streak++;

  return {
    played: nums.length,
    average: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    best: totals.length ? Math.min(...totals) : 0,
    streak,
    maxStreak,
    distribution,
  };
}

export const loadUnits = (): Units | null => read<Units | null>("units", null);
export const saveUnits = (units: Units): void => write("units", units);

export const loadConfirmGuesses = (): boolean => read<boolean>("confirm-guesses", false);
export const saveConfirmGuesses = (on: boolean): void => write("confirm-guesses", on);

