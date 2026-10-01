import {
  geoCentroid,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  geoArea,
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";
import world50Json from "world-atlas/countries-50m.json";
import world110Json from "world-atlas/countries-110m.json";
import usJson from "us-atlas/states-10m.json";
import lakesJson from "@geo-maps/earth-lakes-10km/map.geo.json";
import type { LonLat } from "./game";
import { SatelliteLayer, type TileSource } from "./satellite";
import { windowFor, zoomForResolution, type Bounds } from "./tiles";

type WorldTopo = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
type UsTopo = Topology<{ states: GeometryCollection; nation: GeometryCollection }>;

/**
 * A piece of map geometry plus the spherical cap that contains it. Projecting the
 * 50m data costs far more than drawing it, so zoomed-in frames skip pieces whose
 * cap is off screen.
 */
interface Piece {
  geo: GeoPermissibleObjects;
  center: LonLat;
  radius: number;
}

function piece(geo: GeoPermissibleObjects, points: Position[]): Piece {
  const c = geoCentroid(geo);
  if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return { geo, center: [0, 0], radius: Math.PI };
  let radius = 0;
  for (const p of points) radius = Math.max(radius, geoDistance(c, p as LonLat));
  return { geo, center: c as LonLat, radius };
}

function polygonPieces(polygons: Position[][][]): Piece[] {
  return polygons.map((rings) => piece({ type: "Polygon", coordinates: rings }, rings[0]));
}

function linePieces(lines: MultiLineString): Piece[] {
  return lines.coordinates.map((line) => piece({ type: "LineString", coordinates: line }, line));
}

function countryPolygons(topo: WorldTopo): Position[][][] {
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon>;
  return countries.features.flatMap((f) =>
    !f.geometry ? [] : f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
  );
}

interface Layer {
  land: Piece[];
  borders: Piece[];
}

const world50 = world50Json as unknown as WorldTopo;
const world110 = world110Json as unknown as WorldTopo;
const us = usJson as unknown as UsTopo;

const DETAIL: Layer = {
  land: polygonPieces(countryPolygons(world50)),
  borders: linePieces(mesh(world50, world50.objects.countries, (a, b) => a !== b)),
};
// Whole-hemisphere views can't cull much, so they draw merged geometry in one go.
const DETAIL_WHOLE: Layer = {
  land: [{ geo: feature(world50, world50.objects.land), center: [0, 0], radius: Math.PI }],
  borders: [{ geo: mesh(world50, world50.objects.countries, (a, b) => a !== b), center: [0, 0], radius: Math.PI }],
};
const COARSE: Layer = {
  land: [{ geo: feature(world110, world110.objects.land), center: [0, 0], radius: Math.PI }],
  borders: [{ geo: mesh(world110, world110.objects.countries, (a, b) => a !== b), center: [0, 0], radius: Math.PI }],
};
const STATES = linePieces(mesh(us, us.objects.states, (a, b) => a !== b));

// The Natural Earth land polygons fill lakes in; paint the larger ones back as water.
const LAKE_MIN_KM2 = 350;
const lakesGeometry = (lakesJson as unknown as { geometries: MultiPolygon[] }).geometries[0];
const LAKES = polygonPieces(
  lakesGeometry.coordinates.filter(
    (poly) => geoArea({ type: "Polygon", coordinates: poly }) * 6371 ** 2 > LAKE_MIN_KM2,
  ),
);

const GRATICULE = geoGraticule10();
const SPHERE = { type: "Sphere" } as const;

export interface Pin {
  guess?: LonLat;
  answer?: LonLat;
  /** Short text drawn on the flag, e.g. the hole number. */
  label?: string;
  /** 0–1: how much of the guess→answer arc is drawn. */
  progress: number;
}

interface Colors {
  ocean1: string;
  ocean2: string;
  shade: string;
  glow: string;
  land: string;
  border: string;
  state: string;
  lake: string;
  graticule: string;
  rim: string;
  ball: string;
  ballEdge: string;
  flag: string;
  flagText: string;
  pole: string;
  arc: string;
  cup: string;
  satBorder: string;
  satState: string;
  satRim: string;
  highlightFill: string;
  highlightStroke: string;
}

const COLOR_VARS: Record<keyof Colors, string> = {
  ocean1: "--globe-ocean-1",
  ocean2: "--globe-ocean-2",
  shade: "--globe-shade",
  glow: "--globe-glow",
  land: "--globe-land",
  border: "--globe-border",
  state: "--globe-state",
  lake: "--globe-lake",
  graticule: "--globe-graticule",
  rim: "--globe-rim",
  ball: "--ball",
  ballEdge: "--ball-edge",
  flag: "--flag",
  flagText: "--flag-ink",
  pole: "--pole",
  arc: "--arc",
  cup: "--cup",
  satBorder: "--sat-border",
  satState: "--sat-state",
  satRim: "--sat-rim",
  highlightFill: "--highlight-fill",
  highlightStroke: "--highlight-stroke",
};

const MIN_ZOOM = 0.85;
/** Zoom limit for the flat vector globe, which has no detail to zoom into. */
const MAX_ZOOM = 90;
/** With streamed imagery: the deepest view, as a globe radius in CSS px (about 5 m per px). */
const MAX_RADIUS_TILES_PX = 1.3e6;
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 700;
/** Touch taps this soon after a drag or pinch are treated as part of it, not a guess. */
const TAP_GUARD_MS = 500;

interface Flight {
  start: number;
  duration: number;
  path: (t: number) => LonLat;
  zoomFrom: number;
  zoomTo: number;
  dip: number;
  done?: () => void;
}

interface ArcAnim {
  pin: Pin;
  start: number;
  duration: number;
  delay: number;
  done?: () => void;
}

/** Same colour at zero alpha, so gradients fade without going grey. */
const transparent = (color: string) =>
  color.startsWith("rgba(") ? color.replace(/,[^,]*\)$/, ",0)") : color.startsWith("rgb(") ? color.replace("rgb(", "rgba(").replace(")", ",0)") : "rgba(0,0,0,0)";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Globe {
  pins: Pin[] = [];
  /** A placed-but-unconfirmed guess. */
  pending: LonLat | null = null;
  tapEnabled = true;
  onTap?: (p: LonLat) => void;
  /** Any touch, click or scroll on the globe. */
  onInteract?: () => void;
  /** Called after every frame, e.g. to keep labels pinned to points on the globe. */
  onRender?: () => void;
  /** A shape (usually a country) to tint on the globe. */
  highlight: GeoPermissibleObjects | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly projection: GeoProjection;
  private sat: SatelliteLayer | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private insets = { top: 0, bottom: 0, left: 0 };
  private targetInsets = { top: 0, bottom: 0, left: 0 };
  private laidOut = false;
  private zoom = 1;
  private colors!: Colors;

  private frame = 0;
  private flight: Flight | null = null;
  private arcs: ArcAnim[] = [];
  private pendingSince = 0;
  private velocity = { x: 0, y: 0 };
  private coasting = false;
  private lastMoveAt = 0;
  private showCrosshair = false;
  private lastGestureEnd = -Infinity;

  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: {
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
    multi: boolean;
    /** Started while the globe was still moving, so it can't count as a tap. */
    blocked: boolean;
    pinchDist: number;
    pinchZoom: number;
    mid: { x: number; y: number };
  } | null = null;

  /**
   * `imagery` paints satellite textures on a WebGL canvas under this one. Without WebGL
   * (or until the first texture loads) the globe falls back to flat vector colours.
   */
  constructor(
    canvas: HTMLCanvasElement,
    imagery?: { canvas: HTMLCanvasElement; sources: string[]; tiles?: TileSource },
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;
    this.projection = geoOrthographic().clipAngle(90).rotate([20, -25]).precision(0);
    this.refreshColors();
    this.bindEvents();
    if (imagery) {
      const sat = new SatelliteLayer(imagery.canvas);
      if (sat.init()) {
        this.sat = sat;
        sat.onReady = () => this.requestDraw();
        sat.onUpdate = () => this.requestDraw();
        sat.setTileSource(imagery.tiles ?? null);
        void sat.loadSources(imagery.sources);
      }
    }
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // ── Public API ────────────────────────────────────────────────

  /** Screen space covered by UI; the globe centres itself in what's left, easing between sizes. */
  setInsets(top: number, bottom: number, left = 0): void {
    this.targetInsets = { top, bottom, left };
    if (!this.laidOut || reducedMotion()) {
      this.insets = { top, bottom, left };
      this.applyLayout();
    }
    this.requestDraw();
  }

  refreshColors(): void {
    const style = getComputedStyle(document.documentElement);
    const entries = Object.entries(COLOR_VARS).map(([k, v]) => [k, style.getPropertyValue(v).trim()]);
    this.colors = Object.fromEntries(entries) as Colors;
    this.requestDraw();
  }

  get center(): LonLat {
    const r = this.projection.rotate();
    return [-r[0], -r[1]];
  }

  zoomBy(factor: number): void {
    this.stopMotion();
    const [cx, cy] = this.projection.translate();
    this.zoomAt(factor, cx, cy);
    this.requestDraw();
  }

  /** Animate the view to a new center and zoom. */
  flyTo(center: LonLat, zoom: number, duration = 1400, done?: () => void): void {
    this.stopMotion();
    const from = this.center;
    const angle = geoDistance(from, center);
    const zoomTo = clamp(zoom, MIN_ZOOM, this.maxZoom);
    if (reducedMotion() || duration <= 0) {
      this.setView(center, zoomTo);
      this.requestDraw();
      done?.();
      return;
    }
    const interp = geoInterpolate(from, center);
    // Pull back mid-flight when crossing a long way while zoomed in.
    const dip = Math.max(this.zoom, zoomTo) > 1.5 ? clamp(angle / 1.2, 0, 1) : 0;
    this.flight = {
      start: performance.now(),
      duration: duration * clamp(0.5 + angle / 2, 0.5, 1.2),
      path: (t) => interp(t) as LonLat,
      zoomFrom: this.zoom,
      zoomTo,
      dip,
      done,
    };
    this.requestDraw();
  }

  /** Frame two points (guess and answer) so both are comfortably on screen. */
  frame2(a: LonLat, b: LonLat, done?: () => void): void {
    const mid = geoInterpolate(a, b)(0.5) as LonLat;
    const half = geoDistance(a, b) / 2;
    const room = 0.34 * Math.min(this.visibleWidth, this.visibleHeight);
    const zoom = half < 1e-4 ? 20 : room / (Math.sin(Math.min(half, Math.PI / 2)) * this.baseScale);
    this.flyTo(mid, clamp(zoom, MIN_ZOOM, 24), 1400, done);
  }

  /** Show every pin at once, centred on the answers. */
  overview(): void {
    const answers = this.pins.flatMap((p) => (p.answer ? [p.answer] : []));
    if (!answers.length) return;
    const c = geoCentroid({ type: "MultiPoint", coordinates: answers }) as LonLat;
    this.flyTo(Number.isFinite(c[0]) ? c : answers[0], 1, 1600);
  }

  resetView(): void {
    this.flyTo(this.center, 1, 900);
  }

  /** Draw the guess→answer arc over `duration` ms. */
  animateArc(pin: Pin, duration = 900, delay = 0, done?: () => void): void {
    if (reducedMotion()) {
      pin.progress = 1;
      this.requestDraw();
      done?.();
      return;
    }
    pin.progress = 0;
    this.arcs.push({ pin, start: performance.now(), duration, delay, done });
    this.requestDraw();
  }

  /** Screen position of a point in CSS px, or null when it's on the far side. */
  project(p: LonLat): [number, number] | null {
    if (!this.visible(p)) return null;
    const q = this.projection(p);
    return q ? [q[0], q[1]] : null;
  }

  get hasImagery(): boolean {
    return !!this.sat?.ready;
  }

  setPending(p: LonLat | null): void {
    this.pending = p;
    this.pendingSince = performance.now();
    this.requestDraw();
  }

  requestDraw(): void {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  // ── View math ────────────────────────────────────────────────

  private get visibleHeight(): number {
    return Math.max(120, this.height - this.insets.top - this.insets.bottom);
  }

  private get visibleWidth(): number {
    return Math.max(120, this.width - this.insets.left);
  }

  /** Streamed imagery can zoom almost to street level; the vector globe stops much sooner. */
  private get maxZoom(): number {
    return this.sat?.ready && this.sat.hasTiles ? Math.max(MAX_ZOOM, MAX_RADIUS_TILES_PX / this.baseScale) : MAX_ZOOM;
  }

  private get baseScale(): number {
    return (Math.min(this.visibleWidth, this.visibleHeight) / 2) * 0.9;
  }

  private setView(center: LonLat, zoom: number): void {
    this.zoom = clamp(zoom, MIN_ZOOM, this.maxZoom);
    this.projection.rotate([-center[0], -center[1]]).scale(this.baseScale * this.zoom);
  }

  private rotateBy(dx: number, dy: number): void {
    const k = 180 / Math.PI / this.projection.scale();
    const [l, p] = this.projection.rotate();
    this.projection.rotate([l + dx * k, clamp(p - dy * k, -89, 89)]);
  }

  private zoomAt(factor: number, px: number, py: number): void {
    const anchor = this.invert(px, py);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, this.maxZoom);
    this.projection.scale(this.baseScale * this.zoom);
    if (!anchor) return;
    // Nudge the rotation so the point under the cursor stays put.
    for (let i = 0; i < 3; i++) {
      const q = this.projection(anchor);
      if (!q) break;
      this.rotateBy(px - q[0], py - q[1]);
    }
  }

  private invert(x: number, y: number): LonLat | null {
    const [cx, cy] = this.projection.translate();
    if (Math.hypot(x - cx, y - cy) > this.projection.scale()) return null;
    const p = this.projection.invert?.([x, y]);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null;
  }

  private visible(p: LonLat): boolean {
    return geoDistance(p, this.center) < Math.PI / 2 - 0.01;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    // The imagery pass is per-pixel, so cap its resolution a little lower.
    this.sat?.resize(rect.width, rect.height, Math.min(this.dpr, 2));
    this.laidOut = true;
    this.applyLayout();
    this.requestDraw();
  }

  private applyLayout(): void {
    this.projection
      .translate([this.insets.left + this.visibleWidth / 2, this.insets.top + this.visibleHeight / 2])
      .scale(this.baseScale * this.zoom)
      // Skip drawing anything off-screen; matters when zoomed in.
      .clipExtent([
        [-40, -40],
        [this.width + 40, this.height + 40],
      ]);
  }

  private stopMotion(): void {
    this.flight = null;
    this.coasting = false;
  }

  // ── Input ────────────────────────────────────────────────────

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    c.addEventListener("pointerup", (e) => this.onPointerUp(e));
    c.addEventListener("pointercancel", (e) => this.onPointerUp(e, true));
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.stopMotion();
        this.onInteract?.();
        const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0022;
        const { x, y } = this.local(e);
        this.zoomAt(Math.exp(-e.deltaY * unit), x, y);
        this.requestDraw();
      },
      { passive: false },
    );
    c.addEventListener("dblclick", (e) => {
      const { x, y } = this.local(e);
      this.stopMotion();
      this.zoomAt(2, x, y);
      this.requestDraw();
    });
    c.addEventListener("keydown", (e) => this.onKey(e));
    c.addEventListener("blur", () => {
      this.showCrosshair = false;
      this.requestDraw();
    });
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.onInteract?.();
    this.canvas.setPointerCapture(e.pointerId);
    // A tap that stops a spinning globe, or lands right after a touch drag, is a
    // mis-tap rather than a guess.
    const blocked =
      this.coasting ||
      !!this.flight ||
      (e.pointerType !== "mouse" && performance.now() - this.lastGestureEnd < TAP_GUARD_MS);
    this.stopMotion();
    this.showCrosshair = false;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.gesture = {
        startX: p.x,
        startY: p.y,
        startTime: performance.now(),
        moved: false,
        multi: false,
        blocked,
        pinchDist: 0,
        pinchZoom: this.zoom,
        mid: p,
      };
      this.velocity = { x: 0, y: 0 };
    } else if (this.gesture && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture.multi = true;
      this.gesture.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.gesture.pinchZoom = this.zoom;
      this.gesture.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    this.canvas.classList.add("is-dragging");
  }

  private onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.gesture) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;

    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.rotateBy(mid.x - g.mid.x, mid.y - g.mid.y);
      const target = g.pinchZoom * (dist / g.pinchDist);
      this.zoomAt(target / this.zoom, mid.x, mid.y);
      g.mid = mid;
      this.requestDraw();
      return;
    }

    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP_PX) g.moved = true;
    if (!g.moved) return;
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveAt);
    this.lastMoveAt = now;
    // Smoothed velocity in px/ms, used for the coast after release.
    this.velocity = {
      x: 0.7 * (dx / dt) + 0.3 * this.velocity.x,
      y: 0.7 * (dy / dt) + 0.3 * this.velocity.y,
    };
    this.rotateBy(dx, dy);
    this.requestDraw();
  }

  private onPointerUp(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size > 0 || !g) return;
    this.gesture = null;
    this.canvas.classList.remove("is-dragging");

    if (g.moved || g.multi) this.lastGestureEnd = performance.now();
    const quick = performance.now() - g.startTime < TAP_MAX_MS;
    if (!cancelled && !g.moved && !g.multi && !g.blocked && quick) {
      this.tap(p.x, p.y);
      return;
    }
    const idle = performance.now() - this.lastMoveAt > 80;
    if (!g.multi && !idle && !reducedMotion() && Math.hypot(this.velocity.x, this.velocity.y) > 0.05) {
      this.coasting = true;
      this.requestDraw();
    }
  }

  private tap(x: number, y: number): void {
    if (!this.tapEnabled) return;
    const p = this.invert(x, y);
    if (p) this.onTap?.(p);
  }

  private onKey(e: KeyboardEvent): void {
    const step = 50;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      this.stopMotion();
      this.showCrosshair = true;
      this.rotateBy(...moves[e.key]);
      this.requestDraw();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      this.showCrosshair = true;
      this.zoomBy(1.5);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      this.showCrosshair = true;
      this.zoomBy(1 / 1.5);
    } else if (e.key === "Enter" || e.key === " ") {
      // Keyboard players aim with the crosshair and drop the ball at the centre.
      e.preventDefault();
      this.showCrosshair = true;
      const [cx, cy] = this.projection.translate();
      this.tap(cx, cy);
    }
  }

  // ── Render loop ──────────────────────────────────────────────

  private tick(now: number): void {
    this.frame = 0;
    let busy = false;

    const dTop = this.targetInsets.top - this.insets.top;
    const dBottom = this.targetInsets.bottom - this.insets.bottom;
    const dLeft = this.targetInsets.left - this.insets.left;
    if (dTop || dBottom || dLeft) {
      const settle = Math.max(Math.abs(dTop), Math.abs(dBottom), Math.abs(dLeft)) < 0.5;
      this.insets = settle
        ? { ...this.targetInsets }
        : {
            top: this.insets.top + dTop * 0.2,
            bottom: this.insets.bottom + dBottom * 0.2,
            left: this.insets.left + dLeft * 0.2,
          };
      this.applyLayout();
      if (!settle) busy = true;
    }

    if (this.flight) {
      const f = this.flight;
      const t = clamp((now - f.start) / f.duration, 0, 1);
      const e = easeInOut(t);
      const z = Math.exp(Math.log(f.zoomFrom) + (Math.log(f.zoomTo) - Math.log(f.zoomFrom)) * e);
      const pulled = z / (1 + f.dip * Math.max(f.zoomFrom, f.zoomTo) * 0.35 * Math.sin(Math.PI * e));
      this.setView(f.path(e), Math.max(MIN_ZOOM, pulled));
      if (t >= 1) {
        this.flight = null;
        f.done?.();
      } else busy = true;
    }

    if (this.coasting) {
      this.rotateBy(this.velocity.x * 16, this.velocity.y * 16);
      this.velocity.x *= 0.93;
      this.velocity.y *= 0.93;
      if (Math.hypot(this.velocity.x, this.velocity.y) < 0.01) this.coasting = false;
      else busy = true;
    }

    const finished: ArcAnim[] = [];
    this.arcs = this.arcs.filter((a) => {
      const t = clamp((now - a.start - a.delay) / a.duration, 0, 1);
      a.pin.progress = easeInOut(t);
      if (t >= 1) finished.push(a);
      return t < 1;
    });
    for (const a of finished) a.done?.();
    if (this.arcs.length) busy = true;

    if (this.pending && now - this.pendingSince < 700) busy = true;

    this.draw(now);
    if (busy) this.requestDraw();
  }

  private draw(now: number): void {
    const { ctx, projection, colors: c } = this;
    const moving = !!(this.flight || this.coasting || this.gesture);
    const path = geoPath(projection, ctx);
    const [cx, cy] = projection.translate();
    const r = projection.scale();
    // Level of detail: the 110m map is plenty until the globe is a few hundred px across,
    // and while it's spinning.
    const { visible, wide } = this.pieceFilter();
    const layer = r <= (moving ? 700 : 260) ? COARSE : wide ? DETAIL_WHOLE : DETAIL;
    const drawPieces = (pieces: Piece[]) => {
      ctx.beginPath();
      for (const p of pieces) if (visible(p)) path(p.geo);
    };

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Atmosphere: a soft halo just outside the rim (cheaper than shadowBlur).
    const halo = Math.min(48, r * 0.14);
    const glow = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r + halo);
    glow.addColorStop(0, c.glow);
    glow.addColorStop(1, transparent(c.glow));
    ctx.fillStyle = glow;
    // A ring only: a radial gradient also paints its first colour inside the inner
    // circle, which would tint the satellite imagery underneath.
    ctx.beginPath();
    ctx.arc(cx, cy, r + halo, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.995, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.lineJoin = "round";
    if (this.sat?.ready) {
      const [lambda, phi] = projection.rotate();
      this.sat.render({ cx, cy, radius: r, lambda, phi });
      this.updateDetail();
      // The imagery already shows land and water. Borders appear once zoomed in, to help
      // pin down a spot, and drop out again near ground level where the simplified
      // outlines would visibly miss the coastline.
      const kmPerPx = 6371 / r;
      if (this.zoom > 2.2 && kmPerPx > 1.2) {
        drawPieces(layer.borders);
        ctx.strokeStyle = c.satBorder;
        ctx.lineWidth = this.zoom > 6 ? 1.2 : 0.8;
        ctx.stroke();
      }
      if (this.zoom > 3.5 && kmPerPx > 0.6) {
        drawPieces(STATES);
        ctx.strokeStyle = c.satState;
        ctx.lineWidth = 0.7;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      path(SPHERE);
      ctx.strokeStyle = c.satRim;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      this.drawVector(path, drawPieces, layer, cx, cy, r);
    }

    if (this.highlight) {
      ctx.beginPath();
      path(this.highlight);
      ctx.fillStyle = c.highlightFill;
      ctx.fill();
      ctx.strokeStyle = c.highlightStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Arcs under markers, sampled along the great circle.
    for (const pin of this.pins) {
      if (!pin.guess || !pin.answer || pin.progress <= 0) continue;
      const interp = geoInterpolate(pin.guess, pin.answer);
      const steps = Math.max(2, Math.ceil(72 * pin.progress));
      const coords = Array.from({ length: steps + 1 }, (_, i) => interp((i / steps) * pin.progress));
      ctx.beginPath();
      path({ type: "LineString", coordinates: coords });
      ctx.strokeStyle = c.arc;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const pin of this.pins) {
      if (pin.guess && this.visible(pin.guess)) this.drawBall(pin.guess);
    }
    for (const pin of this.pins) {
      if (pin.answer && pin.progress >= 1 && this.visible(pin.answer)) this.drawFlag(pin.answer, pin.label);
    }

    if (this.pending && this.visible(this.pending)) {
      const age = (now - this.pendingSince) / 700;
      if (age < 1) {
        const [x, y] = projection(this.pending)!;
        ctx.beginPath();
        ctx.arc(x, y, 7 + age * 18, 0, Math.PI * 2);
        ctx.strokeStyle = c.ball;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      this.drawBall(this.pending);
    }

    if (this.showCrosshair) {
      ctx.strokeStyle = c.ball;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
    this.onRender?.();
  }

  /** Asks for sharper tiles covering the screen once the whole-Earth texture runs out of detail. */
  private updateDetail(): void {
    const sat = this.sat;
    if (!sat?.hasTiles) return;
    const satDpr = Math.min(this.dpr, 2);
    const degPerPx = 180 / (Math.PI * this.projection.scale()) / satDpr;
    const z = zoomForResolution(degPerPx, sat.maxTileZoom);
    const bounds = z > sat.baseZoom ? this.visibleBounds() : null;
    const win = bounds ? windowFor(bounds, z, sat.slotsX, sat.slotsY) : null;
    // A view too wide for the tile budget falls back to tiles no sharper than the base; skip those.
    sat.setWindow(win && win.z > sat.baseZoom ? win : null);
  }

  /** Lon/lat extent of what's on screen, or null when it isn't a compact area (e.g. a pole). */
  private visibleBounds(): Bounds | null {
    const [clon] = this.center;
    const n = 9;
    let lonMin = Infinity;
    let lonMax = -Infinity;
    let latMin = Infinity;
    let latMax = -Infinity;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = this.invert((this.width * i) / (n - 1), (this.height * j) / (n - 1));
        if (!p) continue;
        hits++;
        // Unwrap longitudes around the view centre so a view across ±180° stays contiguous.
        const lon = clon + ((((p[0] - clon) % 360) + 540) % 360) - 180;
        lonMin = Math.min(lonMin, lon);
        lonMax = Math.max(lonMax, lon);
        latMin = Math.min(latMin, p[1]);
        latMax = Math.max(latMax, p[1]);
      }
    }
    if (hits < 4 || latMax > 88 || latMin < -88 || lonMax - lonMin > 150) return null;
    // Samples miss the strip between grid points and the limb; pad a little.
    const padLon = (lonMax - lonMin) * 0.08;
    const padLat = (latMax - latMin) * 0.08;
    return {
      lonMin: lonMin - padLon,
      lonMax: lonMax + padLon,
      latMin: Math.max(-90, latMin - padLat),
      latMax: Math.min(90, latMax + padLat),
    };
  }

  /** Returns a test for whether a piece's cap can reach the visible part of the globe. */
  private pieceFilter(): { visible: (p: Piece) => boolean; wide: boolean } {
    const [cx, cy] = this.projection.translate();
    const r = this.projection.scale();
    const reach = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(this.width - cx, cy),
      Math.hypot(cx, this.height - cy),
      Math.hypot(this.width - cx, this.height - cy),
    );
    // Angular radius of the on-screen region around the view centre.
    const view = reach >= r ? Math.PI / 2 : Math.asin(reach / r);
    const center = this.center;
    return {
      visible: (p) => p.radius >= Math.PI || geoDistance(p.center, center) - p.radius < view + 0.02,
      wide: view > 1.1,
    };
  }

  /** Flat-colour globe, used without WebGL or before the imagery loads. */
  private drawVector(
    path: GeoPath,
    drawPieces: (pieces: Piece[]) => void,
    layer: Layer,
    cx: number,
    cy: number,
    r: number,
  ): void {
    const { ctx, colors: c } = this;
    ctx.beginPath();
    path(SPHERE);
    const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    ocean.addColorStop(0, c.ocean1);
    ocean.addColorStop(1, c.ocean2);
    ctx.fillStyle = ocean;
    ctx.fill();

    ctx.beginPath();
    path(GRATICULE);
    ctx.strokeStyle = c.graticule;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    drawPieces(layer.land);
    ctx.fillStyle = c.land;
    ctx.fill();

    drawPieces(LAKES);
    ctx.fillStyle = c.lake;
    ctx.fill();

    drawPieces(layer.borders);
    ctx.strokeStyle = c.border;
    ctx.lineWidth = this.zoom > 4 ? 1.2 : 0.8;
    ctx.stroke();

    if (this.zoom > 1.8) {
      drawPieces(STATES);
      ctx.strokeStyle = c.state;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Terminator-style shading for depth
    const shade = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r * 1.02);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, c.shade);
    ctx.beginPath();
    path(SPHERE);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.strokeStyle = c.rim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawBall(p: LonLat): void {
    const { ctx, colors: c } = this;
    const [x, y] = this.projection(p)!;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = c.ball;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = c.ballEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // A few dimples
    ctx.fillStyle = c.ballEdge;
    ctx.globalAlpha = 0.35;
    for (const [dx, dy] of [[-2, -1.5], [1.5, -2.2], [2.4, 1], [-1, 2.2], [0, 0]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFlag(p: LonLat, label?: string): void {
    const { ctx, colors: c } = this;
    const [x, y] = this.projection(p)!;
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.cup;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 34);
    ctx.strokeStyle = c.pole;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 34);
    ctx.lineTo(x + 22, y - 28);
    ctx.lineTo(x + 1, y - 21);
    ctx.closePath();
    ctx.fillStyle = c.flag;
    ctx.fill();
    if (label) {
      ctx.fillStyle = c.flagText;
      ctx.font = "700 9px Archivo, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 8, y - 27.5);
    }
  }
}
