import { geoBounds, geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import world50Json from "world-atlas/countries-50m.json";
import type { LonLat } from "./game";

type WorldTopo = Topology<{ countries: GeometryCollection<{ name: string }> }>;

interface Country {
  id: string;
  shape: Feature<Geometry, { name: string }>;
  bounds: [[number, number], [number, number]];
}

const world = world50Json as unknown as WorldTopo;
const COUNTRIES: Country[] = (
  feature(world, world.objects.countries) as FeatureCollection<Geometry, { name: string }>
).features.map((shape) => ({
  // A few disputed areas have no ISO code, so fall back to the name.
  id: String(shape.id ?? shape.properties.name),
  shape,
  bounds: geoBounds(shape),
}));

function inBounds([[west, south], [east, north]]: Country["bounds"], [lon, lat]: LonLat): boolean {
  if (lat < south || lat > north) return false;
  // Bounds that cross the antimeridian have west > east.
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
}

/** ISO 3166 numeric code (or name) of the country containing `p`, or null over water. */
export function countryAt(p: LonLat): string | null {
  for (const c of COUNTRIES) {
    if (inBounds(c.bounds, p) && geoContains(c.shape, p)) return c.id;
  }
  return null;
}

function offset([lon, lat]: LonLat, bearingDeg: number, km: number): LonLat {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (km / 111.2) * Math.cos(b);
  const dLon = (km / (111.2 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))) * Math.sin(b);
  return [lon + dLon, lat + dLat];
}

/**
 * Like countryAt, but also searches a few km around the point. Seaside courses often sit
 * just outside the simplified 50m coastline.
 */
export function countryNear(p: LonLat): string | null {
  const direct = countryAt(p);
  if (direct) return direct;
  for (const km of [3, 6, 10, 15, 25]) {
    for (let bearing = 0; bearing < 360; bearing += 30) {
      const hit = countryAt(offset(p, bearing, km));
      if (hit) return hit;
    }
  }
  return null;
}

/** The country's outline, for highlighting on the globe. */
export function countryShape(id: string): Feature<Geometry, { name: string }> | null {
  return COUNTRIES.find((c) => c.id === id)?.shape ?? null;
}
