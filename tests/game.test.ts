import { describe, expect, it } from "vitest";
import { COURSES } from "../src/courses";
import {
  BEST_ROUND,
  HOLES_PER_ROUND,
  MIN_SEPARATION_KM,
  MULTIPLIERS,
  RATINGS,
  dailyCourses,
  dayIndexFor,
  distanceForScore,
  distanceKm,
  formatDistance,
  formatToPar,
  holeToPar,
  msUntilNextDay,
  practiceCourses,
  puzzleNumberFor,
  ratingFor,
  roundToPar,
  scoreForDistance,
  shareText,
  withCountryBonus,
  QUIPS,
  quipFor,
  mulberry32,
  type HoleResult,
} from "../src/game";
import { binRange, computeStats, scoreBin } from "../src/storage";
import { countryAt, countryNear } from "../src/geo";

describe("distanceKm", () => {
  it("matches known great-circle distances", () => {
    // London → Paris ≈ 344 km, New York → Los Angeles ≈ 3,936 km
    expect(distanceKm([-0.1276, 51.5072], [2.3522, 48.8566])).toBeCloseTo(344, -1);
    expect(distanceKm([-74.006, 40.7128], [-118.2437, 34.0522])).toBeCloseTo(3936, -1);
  });

  it("is symmetric and zero for identical points", () => {
    const a: [number, number] = [10, 20];
    const b: [number, number] = [-40, -30];
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it("handles antipodes and the date line", () => {
    expect(distanceKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6371.0088, 3);
    expect(distanceKm([179.5, 0], [-179.5, 0])).toBeLessThan(120);
  });
});

describe("scoring", () => {
  it("follows MapTap's curve and decays monotonically", () => {
    expect(scoreForDistance(0)).toBe(100);
    expect(scoreForDistance(20)).toBe(100);
    expect(scoreForDistance(100)).toBe(98);
    expect(scoreForDistance(1000)).toBe(81);
    expect(scoreForDistance(5000)).toBe(34);
    expect(scoreForDistance(16_250)).toBe(0);
    let prev = 100;
    for (let km = 0; km <= 20_000; km += 50) {
      const s = scoreForDistance(km);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      prev = s;
    }
    expect(scoreForDistance(20_000)).toBe(0);
  });

  it("distanceForScore is the exact boundary for a points total", () => {
    for (const points of [100, 90, 50, 25, 10]) {
      const edge = distanceForScore(points);
      expect(scoreForDistance(edge - 0.01)).toBeGreaterThanOrEqual(points);
      expect(scoreForDistance(edge + 0.01)).toBeLessThan(points);
    }
  });

  it("turns points into strokes to par, times the multiplier", () => {
    expect(holeToPar(100, 1)).toBe(-5);
    expect(holeToPar(50, 1)).toBe(0);
    expect(holeToPar(0, 1)).toBe(5);
    expect(holeToPar(100, 3)).toBe(-15);
    expect(holeToPar(0, 3)).toBe(15);
    expect(holeToPar(81, 2)).toBe(-6);
    // Halves round toward the better score.
    expect(holeToPar(55, 1)).toBe(-1);
    expect(holeToPar(45, 1)).toBe(0);
    expect(Object.is(holeToPar(50, 3), 0)).toBe(true);
    for (const m of [1, 2, 3]) {
      let prev = Infinity;
      for (let p = 0; p <= 100; p++) {
        const v = holeToPar(p, m);
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(5 * m);
        expect(v).toBeLessThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it("names holes to agree with their score", () => {
    expect(ratingFor(100, -5, 1).key).toBe("ace");
    expect(ratingFor(97, -5, 1).key).toBe("eagle");
    expect(ratingFor(81, -3, 1).key).toBe("birdie");
    expect(ratingFor(50, 0, 3).key).toBe("par");
    expect(ratingFor(34, 5, 3).key).toBe("bogey");
    expect(ratingFor(12, 11, 3).key).toBe("double");
    expect(ratingFor(0, 15, 3).key).toBe("lost");
    const under = new Set(["ace", "eagle", "birdie"]);
    const over = new Set(["bogey", "double", "lost"]);
    for (const m of [1, 2, 3]) {
      const names = new Map<number, Set<string>>();
      for (let p = 0; p <= 100; p++) {
        const v = holeToPar(p, m);
        const key = ratingFor(p, v, m).key;
        expect(under.has(key), `${p}×${m}`).toBe(v < 0);
        expect(over.has(key), `${p}×${m}`).toBe(v > 0);
        if (key !== "ace") names.set(v, (names.get(v) ?? new Set()).add(key));
      }
      // Apart from a hole-in-one, a score on given tees always has one name.
      for (const [v, keys] of names) expect([...keys], `${v}×${m}`).toHaveLength(1);
    }
  });

  it("never scores worse than a bogey in the right country", () => {
    for (const m of [1, 2, 3]) {
      for (let p = 0; p <= 100; p++) {
        const boosted = withCountryBonus(p, true);
        expect(["double", "lost"]).not.toContain(ratingFor(boosted, holeToPar(boosted, m), m).key);
      }
    }
  });

  it("writes scores in golf notation", () => {
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(-3)).toBe("−3");
    expect(formatToPar(12)).toBe("+12");
    expect(formatToPar(-6.4)).toBe("−6.4");
    expect(formatToPar(0.04)).toBe("E");
  });

  it("boosts a right-country guess without ever lowering or over-lifting it", () => {
    expect(withCountryBonus(0, true)).toBe(25);
    expect(withCountryBonus(60, true)).toBe(70);
    expect(withCountryBonus(80, true)).toBe(80);
    expect(withCountryBonus(92, true)).toBe(92);
    expect(withCountryBonus(60, false)).toBe(60);
    for (let p = 0; p <= 100; p++) {
      expect(withCountryBonus(p, true)).toBeGreaterThanOrEqual(p);
      expect(withCountryBonus(p, true)).toBeLessThanOrEqual(Math.max(p, 80));
    }
  });

  it("weights later holes and runs from −50 to +50", () => {
    expect(MULTIPLIERS).toHaveLength(HOLES_PER_ROUND);
    expect(BEST_ROUND).toBe(-50);
    const round = (points: number): HoleResult[] =>
      MULTIPLIERS.map((_, i) => ({ courseId: `c${i}`, guess: [0, 0], distanceKm: 0, points }));
    expect(roundToPar(round(100))).toBe(-50);
    expect(roundToPar(round(50))).toBe(0);
    expect(roundToPar(round(0))).toBe(50);
  });
});

describe("quips", () => {
  it("has lines for every rating and picks one deterministically", () => {
    for (const r of RATINGS) {
      expect(QUIPS[r.key].length, r.key).toBeGreaterThan(0);
      const line = quipFor(r, "augusta-national");
      expect(QUIPS[r.key]).toContain(line);
      expect(quipFor(r, "augusta-national")).toBe(line);
    }
  });
});

describe("countries", () => {
  it("finds the country under a point", () => {
    expect(countryAt([-82.02, 33.5])).toBe("840"); // Augusta, United States
    expect(countryAt([-2.81, 56.35])).toBe("826"); // St Andrews, United Kingdom
    expect(countryAt([145.03, -37.97])).toBe("036"); // Melbourne, Australia
    expect(countryAt([-30, 30])).toBeNull(); // mid-Atlantic
  });

  it("places every course in a country, so the bonus can apply", () => {
    const missing = COURSES.filter((c) => countryNear([c.lon, c.lat]) === null).map((c) => c.id);
    expect(missing).toEqual([]);
  });
});

describe("course data", () => {
  it("has unique ids and valid coordinates", () => {
    const ids = new Set(COURSES.map((c) => c.id));
    expect(ids.size).toBe(COURSES.length);
    for (const c of COURSES) {
      expect(c.lat, c.id).toBeGreaterThanOrEqual(-90);
      expect(c.lat, c.id).toBeLessThanOrEqual(90);
      expect(c.lon, c.id).toBeGreaterThanOrEqual(-180);
      expect(c.lon, c.id).toBeLessThanOrEqual(180);
      expect(c.name.trim(), c.id).not.toBe("");
      expect(c.clue.trim(), c.id).not.toBe("");
    }
  });

  it("has no accidental duplicates at the same spot", () => {
    for (let i = 0; i < COURSES.length; i++) {
      for (let j = i + 1; j < COURSES.length; j++) {
        const d = distanceKm([COURSES[i].lon, COURSES[i].lat], [COURSES[j].lon, COURSES[j].lat]);
        expect(d, `${COURSES[i].id} vs ${COURSES[j].id}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("has enough courses for at least three weeks without repeats", () => {
    expect(Math.floor(COURSES.length / HOLES_PER_ROUND)).toBeGreaterThanOrEqual(21);
  });
});

describe("daily puzzle", () => {
  it("is deterministic", () => {
    const a = dailyCourses(42, COURSES).map((c) => c.id);
    const b = dailyCourses(42, COURSES.slice()).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("deals five distinct courses sorted easiest first", () => {
    for (let d = 0; d < 120; d++) {
      const day = dailyCourses(d, COURSES);
      expect(day).toHaveLength(HOLES_PER_ROUND);
      expect(new Set(day.map((c) => c.id)).size).toBe(HOLES_PER_ROUND);
      for (let i = 1; i < day.length; i++) expect(day[i].tier).toBeGreaterThanOrEqual(day[i - 1].tier);
    }
  });

  it("uses every course once per cycle before repeating", () => {
    const daysPerCycle = Math.floor(COURSES.length / HOLES_PER_ROUND);
    const seen = new Set<string>();
    for (let d = 0; d < daysPerCycle; d++) for (const c of dailyCourses(d, COURSES)) seen.add(c.id);
    expect(seen.size).toBe(daysPerCycle * HOLES_PER_ROUND);
  });

  it("keeps each day's courses spread out on most days", () => {
    let spread = 0;
    const days = 200;
    for (let d = 0; d < days; d++) {
      const day = dailyCourses(d, COURSES);
      const ok = day.every((a, i) =>
        day.every((b, j) => i === j || distanceKm([a.lon, a.lat], [b.lon, b.lat]) >= MIN_SEPARATION_KM),
      );
      if (ok) spread++;
    }
    expect(spread / days).toBeGreaterThan(0.9);
  });

  it("numbers puzzles by local calendar day", () => {
    expect(puzzleNumberFor(new Date(2026, 8, 30, 0, 1))).toBe(1);
    expect(puzzleNumberFor(new Date(2026, 8, 30, 23, 59))).toBe(1);
    expect(puzzleNumberFor(new Date(2026, 9, 1, 0, 0))).toBe(2);
    expect(dayIndexFor(new Date(2027, 8, 30))).toBe(365);
  });

  it("counts down to local midnight", () => {
    expect(msUntilNextDay(new Date(2026, 8, 30, 23, 59, 0))).toBe(60_000);
  });

  it("practice rounds use five distinct courses", () => {
    const round = practiceCourses(COURSES, mulberry32(7));
    expect(new Set(round.map((c) => c.id)).size).toBe(HOLES_PER_ROUND);
  });
});

describe("sharing & formatting", () => {
  it("builds a MapTap-style share string", () => {
    const pts = [100, 88, 72, 50, 10];
    const results: HoleResult[] = pts.map((p, i) => ({ courseId: `c${i}`, guess: [0, 0], distanceKm: 1, points: p }));
    const text = shareText({ date: new Date(2026, 8, 30), results, url: "https://example.com/golftap/" });
    expect(text).toBe(
      ["GolfTap September 30", "−5🏆 −4🦅 −4🐦 E⛳ +12🟠", "Final score: −1", "https://example.com/golftap/"].join("\n"),
    );
    expect(shareText({ date: null, results })).toMatch(/^GolfTap practice round\n/);
  });

  it("formats distances", () => {
    expect(formatDistance(3.24, "km")).toBe("3.2 km");
    expect(formatDistance(1234.4, "km")).toBe("1,234 km");
    expect(formatDistance(100, "mi")).toBe("62 mi");
  });
});

describe("stats", () => {
  it("computes streaks from consecutive puzzle numbers", () => {
    const history = { 1: -12, 2: 3, 3: -5, 5: -41, 6: 0 };
    const s = computeStats(history, 7);
    expect(s.played).toBe(5);
    expect(s.best).toBe(-41);
    expect(s.average).toBe(-11);
    expect(computeStats({ 1: -3, 2: -4, 3: 0 }, 4).average).toBe(-2.3);
    expect(s.maxStreak).toBe(3);
    expect(s.streak).toBe(2); // today (7) not played yet; 5–6 still counts
    expect(computeStats(history, 8).streak).toBe(0);
    expect(s.distribution[0]).toBe(1);
    expect(s.distribution.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("bands scores ten strokes at a time, best first", () => {
    expect(scoreBin(-50)).toBe(0);
    expect(scoreBin(-41)).toBe(0);
    expect(scoreBin(-40)).toBe(1);
    expect(scoreBin(0)).toBe(5);
    expect(scoreBin(50)).toBe(9);
    expect(binRange(0)).toEqual([-50, -41]);
    expect(binRange(5)).toEqual([0, 9]);
    expect(binRange(9)).toEqual([40, 50]);
  });
});
