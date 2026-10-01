// Tile maths for the WGS84 ("plate carrée") WMTS grid EOX serves: zoom z has 2^(z+1) columns
// and 2^z rows of 256 px tiles, each 180 / 2^z degrees square, row 0 at the north pole.
// Because the grid is linear in lon/lat, a block of tiles is itself an equirectangular image.

export const TILE_PX = 256;

export const tileSpanDeg = (z: number): number => 180 / 2 ** z;

/** Degrees per pixel of imagery at zoom z. */
export const tileResDeg = (z: number): number => tileSpanDeg(z) / TILE_PX;

/**
 * The lowest zoom whose imagery is at least as sharp as the screen, allowing a little
 * upscaling (`slack`) so we don't fetch more tiles than the eye can tell apart.
 */
export function zoomForResolution(degPerPx: number, maxZoom: number, slack = 1.4): number {
  const z = Math.ceil(Math.log2(180 / (TILE_PX * degPerPx * slack)));
  return Math.max(0, Math.min(maxZoom, z));
}

export interface Bounds {
  /** West edge; may be below -180 or east edge above 180 when the view crosses the antimeridian. */
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/** A block of tiles. `col0` may run past the grid's width; columns wrap around the globe. */
export interface TileWindow {
  z: number;
  col0: number;
  row0: number;
  cols: number;
  rows: number;
}

export const sameWindow = (a: TileWindow | null, b: TileWindow | null): boolean =>
  !!a && !!b && a.z === b.z && a.col0 === b.col0 && a.row0 === b.row0 && a.cols === b.cols && a.rows === b.rows;

/**
 * Tiles covering `bounds` at zoom `z`, stepping down a zoom level while the block would be
 * wider than `maxCols` or taller than `maxRows` (the slots in the detail texture).
 */
export function windowFor(bounds: Bounds, z: number, maxCols: number, maxRows = maxCols): TileWindow {
  for (let zoom = z; zoom >= 0; zoom--) {
    const span = tileSpanDeg(zoom);
    const rowsInGrid = 2 ** zoom;
    const col0 = Math.floor((bounds.lonMin + 180) / span);
    const col1 = Math.floor((bounds.lonMax + 180) / span);
    const row0 = Math.max(0, Math.floor((90 - bounds.latMax) / span));
    const row1 = Math.min(rowsInGrid - 1, Math.floor((90 - bounds.latMin) / span));
    const cols = col1 - col0 + 1;
    const rows = row1 - row0 + 1;
    if ((cols <= maxCols && rows <= maxRows) || zoom === 0) {
      return { z: zoom, col0, row0, cols: Math.min(cols, maxCols), rows: Math.min(rows, maxRows) };
    }
  }
  return { z: 0, col0: 0, row0: 0, cols: 2, rows: 1 };
}

/** Wraps a column index into the grid at zoom z. */
export const wrapCol = (col: number, z: number): number => {
  const width = 2 ** (z + 1);
  return ((col % width) + width) % width;
};

/** The window's extent in degrees: west, south, width, height. */
export function windowBox(w: TileWindow): [number, number, number, number] {
  const span = tileSpanDeg(w.z);
  const west = w.col0 * span - 180;
  const north = 90 - w.row0 * span;
  return [west, north - w.rows * span, w.cols * span, w.rows * span];
}
