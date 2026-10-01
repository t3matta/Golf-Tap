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

export function loadHistory(): History {
  const scores = read<History | null>("scores", null);
  if (scores) return scores;
  // Rounds finished before golf scoring were kept as points out of 1000. Re-score them
  // hole by hole where the round is still saved, else convert the total.
  const old = read<History>("history", {});
  const migrated: History = {};
  for (const [n, total] of Object.entries(old)) {
    const saved = loadDaily(Number(n));
    migrated[n] =
      saved && saved.results.length === HOLES_PER_ROUND ? roundToPar(saved.results) : Math.round(50 - total / 10);
  }
  if (Object.keys(migrated).length) write("scores", migrated);
  return migrated;
}

export function recordFinish(puzzleNumber: number, toPar: number): History {
  const history = loadHistory();
  history[puzzleNumber] = toPar;
  write("scores", history);
  return history;
}

const BIN_SIZE = 10;
const BINS = Math.ceil((-2 * BEST_ROUND) / BIN_SIZE);

/** Which 10-stroke band a round falls in, best (−50 to −41) first. */
export const scoreBin = (toPar: number): number =>
  Math.max(0, Math.min(BINS - 1, Math.floor((toPar - BEST_ROUND) / BIN_SIZE)));

/** The scores a band covers; the last band also takes the worst score, +50. */
export function binRange(bin: number): [number, number] {
  const lo = BEST_ROUND + bin * BIN_SIZE;
  return [lo, bin === BINS - 1 ? -BEST_ROUND : lo + BIN_SIZE - 1];
}

export interface Stats {
  played: number;
  /** Mean score to par, to one decimal. */
  average: number;
  /** Lowest score to par. */
  best: number;
  streak: number;
  maxStreak: number;
  /** Counts per 10-stroke band, best first: −50 to −41, … +40 to +50. */
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
    average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0,
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

