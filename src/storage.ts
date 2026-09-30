import type { HoleResult, Units } from "./game";

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

/** Final totals keyed by puzzle number. */
export type History = Record<string, number>;

export const loadHistory = (): History => read<History>("history", {});

export function recordFinish(puzzleNumber: number, total: number): History {
  const history = loadHistory();
  history[puzzleNumber] = total;
  write("history", history);
  return history;
}

export interface Stats {
  played: number;
  average: number;
  best: number;
  streak: number;
  maxStreak: number;
  /** Counts per 100-point band: 0–99, 100–199, … 900–1000. */
  distribution: number[];
}

export function computeStats(history: History, todayPuzzle: number): Stats {
  const nums = Object.keys(history)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const totals = nums.map((n) => history[n]);
  const distribution = Array.from({ length: 10 }, () => 0);
  for (const t of totals) distribution[Math.min(9, Math.floor(t / 100))]++;

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
    best: totals.length ? Math.max(...totals) : 0,
    streak,
    maxStreak,
    distribution,
  };
}

export const loadUnits = (): Units | null => read<Units | null>("units", null);
export const saveUnits = (units: Units): void => write("units", units);

export const hasSeenHelp = (): boolean => read<boolean>("seen-help", false);
export const markHelpSeen = (): void => write("seen-help", true);
