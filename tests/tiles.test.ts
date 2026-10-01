import { describe, expect, it } from "vitest";
import { tileResDeg, tileSpanDeg, windowBox, windowFor, wrapCol, zoomForResolution } from "../src/tiles";

describe("tile grid", () => {
  it("halves the tile size at each zoom level", () => {
    expect(tileSpanDeg(0)).toBe(180);
    expect(tileSpanDeg(4)).toBe(11.25);
    // Zoom 4 is 32 × 16 tiles of 256 px: the 8K whole-Earth texture.
    expect(360 / tileResDeg(4)).toBe(8192);
  });

  it("picks the lowest zoom at least as sharp as the screen", () => {
    expect(zoomForResolution(tileResDeg(10), 14, 1)).toBe(10);
    expect(zoomForResolution(tileResDeg(10) * 0.9, 14, 1)).toBe(11);
    expect(zoomForResolution(1e-9, 14)).toBe(14);
    expect(zoomForResolution(10, 14)).toBe(0);
  });

  it("covers a view with a block of tiles", () => {
    const w = windowFor({ lonMin: -82.2, lonMax: -81.9, latMin: 33.4, latMax: 33.6 }, 10, 8);
    expect(w.z).toBe(10);
    const [west, south, width, height] = windowBox(w);
    expect(west).toBeLessThanOrEqual(-82.2);
    expect(west + width).toBeGreaterThanOrEqual(-81.9);
    expect(south).toBeLessThanOrEqual(33.4);
    expect(south + height).toBeGreaterThanOrEqual(33.6);
  });

  it("steps down a zoom level when the view needs too many tiles", () => {
    const w = windowFor({ lonMin: 0, lonMax: 20, latMin: 40, latMax: 50 }, 8, 8);
    expect(w.cols).toBeLessThanOrEqual(8);
    expect(w.rows).toBeLessThanOrEqual(8);
    expect(w.z).toBeLessThan(8);
  });

  it("limits columns and rows separately", () => {
    const bounds = { lonMin: 0, lonMax: 3, latMin: 40, latMax: 50 };
    // At zoom 7 that's 3 columns by 8 rows.
    const tall = windowFor(bounds, 7, 4, 16);
    expect(tall).toMatchObject({ z: 7, cols: 3, rows: 8 });
    expect(windowFor(bounds, 7, 16, 4).z).toBeLessThan(7);
  });

  it("wraps columns across the antimeridian", () => {
    const w = windowFor({ lonMin: 179.5, lonMax: 180.5, latMin: -17, latMax: -16 }, 8, 8);
    const cols = Array.from({ length: w.cols }, (_, i) => wrapCol(w.col0 + i, w.z));
    expect(cols).toContain(0);
    expect(cols).toContain(2 ** (w.z + 1) - 1);
    expect(wrapCol(-1, 3)).toBe(15);
  });
});
