// Satellite imagery for the globe: a full-screen WebGL pass that inverts d3's orthographic
// projection per pixel and samples an equirectangular texture of the whole Earth. When zoomed
// in, sharper tiles for the area on screen are streamed into a second "detail" texture and
// blended over it. That texture is a grid of tile-sized slots addressed modulo its size, so
// panning only uploads the tiles that scroll into view. The 2D canvas above keeps drawing borders, pins and arcs with d3, so both
// layers share one projection.

import { TILE_PX, sameWindow, tileSpanDeg, wrapCol, type TileWindow } from "./tiles";

export interface SatelliteView {
  /** Projection centre in CSS px (d3 projection.translate()). */
  cx: number;
  cy: number;
  /** Globe radius in CSS px (d3 projection.scale()). */
  radius: number;
  /** d3 projection.rotate() λ and φ, in degrees. */
  lambda: number;
  phi: number;
}

const VERT_300 = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const VERT_100 = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Shared body: screen pixel -> point on the sphere -> lon/lat -> texture coordinate.
// Inverse of d3.geoRotation([λ, φ]) followed by d3.geoOrthographicRaw.
const SPHERE = `
const float PI = 3.141592653589793;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec2 uRot;
uniform float uDpr;
uniform float uHeight;
uniform vec2 uDetailOrigin; // the window's north-west corner: lon, lat (radians)
uniform vec2 uDetailSize;   // the window in tiles: cols, rows
uniform float uDetailSpan;  // one tile, in radians
uniform vec4 uDetailSlots;  // slot of the window's first tile (x, y), and slots per side (x, y)
uniform float uDetailOn;

bool spherePoint(out vec3 n, out vec2 uv, out vec2 ll, out float alpha) {
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) / uDpr;
  vec2 s = vec2(p.x - uCenter.x, uCenter.y - p.y) / uRadius;
  float r = length(s);
  alpha = clamp((1.0 - r) * uRadius * uDpr / 1.25, 0.0, 1.0);
  if (alpha <= 0.0) return false;
  float vx = sqrt(max(0.0, 1.0 - r * r));
  float cp = cos(uRot.y);
  float sp = sin(uRot.y);
  float x = vx * cp + s.y * sp;
  float z = s.y * cp - vx * sp;
  float lon = atan(s.x, x) - uRot.x;
  float lat = asin(clamp(z, -1.0, 1.0));
  uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  ll = vec2(lon, lat);
  n = vec3(vx, s.x, s.y);
  return true;
}

// Where this point falls in the detail texture, or false when it's outside the window.
// Offsets are taken from the window's corner first, which keeps precision at deep zoom.
bool detailUv(vec2 ll, out vec2 duv) {
  vec2 t = vec2(mod(ll.x - uDetailOrigin.x, 2.0 * PI), uDetailOrigin.y - ll.y) / uDetailSpan;
  duv = mod(uDetailSlots.xy + t, uDetailSlots.zw) / uDetailSlots.zw;
  return uDetailOn > 0.5 && t.x <= uDetailSize.x && t.y >= 0.0 && t.y <= uDetailSize.y;
}

vec3 shade(vec3 col, vec3 n) {
  // Soft daylight from the upper left, darkening toward the limb.
  float light = 0.6 + 0.5 * max(0.0, dot(n, normalize(vec3(0.85, -0.3, 0.42))));
  return col * light;
}`;

const FRAG_300 = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uDetail;
out vec4 outColor;
${SPHERE}
void main() {
  vec3 n; vec2 uv; vec2 ll; float alpha;
  if (!spherePoint(n, uv, ll, alpha)) discard;
  // Seam-safe mip selection: take the gradient of whichever u parameterisation is
  // continuous here, so the antimeridian doesn't show a line of blurred pixels.
  float u1 = fract(uv.x);
  float u2 = fract(uv.x + 0.5) - 0.5;
  vec2 dx1 = vec2(dFdx(u1), dFdx(uv.y));
  vec2 dy1 = vec2(dFdy(u1), dFdy(uv.y));
  vec2 dx2 = vec2(dFdx(u2), dFdx(uv.y));
  vec2 dy2 = vec2(dFdy(u2), dFdy(uv.y));
  bool second = abs(dx2.x) + abs(dy2.x) < abs(dx1.x) + abs(dy1.x);
  vec3 col = textureGrad(uTex, vec2(u1, uv.y), second ? dx2 : dx1, second ? dy2 : dy1).rgb;
  vec2 duv;
  if (detailUv(ll, duv)) {
    vec4 d = textureLod(uDetail, duv, 0.0); // premultiplied; transparent where tiles haven't loaded
    col = col * (1.0 - d.a) + d.rgb;
  }
  outColor = vec4(shade(col, n) * alpha, alpha);
}`;

const FRAG_100 = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uDetail;
${SPHERE}
void main() {
  vec3 n; vec2 uv; vec2 ll; float alpha;
  if (!spherePoint(n, uv, ll, alpha)) discard;
  vec3 col = texture2D(uTex, vec2(fract(uv.x), uv.y)).rgb;
  vec2 duv;
  if (detailUv(ll, duv)) {
    vec4 d = texture2D(uDetail, duv);
    col = col * (1.0 - d.a) + d.rgb;
  }
  gl_FragColor = vec4(shade(col, n) * alpha, alpha);
}`;

export interface TileSource {
  url: (z: number, row: number, col: number) => string;
  maxZoom: number;
}

/** Most tile slots per side of the detail texture (16 × 256 px = a 4096 px texture). */
const MAX_SLOTS = 16;
const MAX_IN_FLIGHT = 10;
const CACHE_LIMIT = 400;
/** Time a composite pass may spend drawing stand-ins before finishing on a later frame. */
const FALLBACK_BUDGET_MS = 6;
/** A tile that fails to load is tried again after this long, a couple of times. */
const RETRY_MS = 8000;
const MAX_RETRIES = 2;

type TileImage = HTMLImageElement | HTMLCanvasElement;
type CachedTile = { state: "loading" | "error" } | { state: "ready"; img: TileImage };

/** What a slot of the detail texture holds: the tile it stands for, drawn from tile `from`. */
type Slot = { key: string; from: string } | null;

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export class SatelliteLayer {
  /** True once a texture is on the GPU and frames can be drawn. */
  ready = false;
  onReady?: () => void;
  /** Called when new imagery is ready to draw. */
  onUpdate?: () => void;
  /** Tile slots per side of the detail texture; a window can't be larger than this. */
  slotsX = 0;
  slotsY = 0;

  private readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private webgl2 = false;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private textureSize = 0;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private detailTexture: WebGLTexture | null = null;
  private detailFbo: WebGLFramebuffer | null = null;
  private slots: Slot[] = [];
  /** The zoom level of the tiles in the slots. */
  private slotZoom = -1;
  /** The window the detail texture currently shows, and the one the view wants. */
  private shown: TileWindow | null = null;
  private window: TileWindow | null = null;
  private tiles: TileSource | null = null;
  private cache = new Map<string, CachedTile>();
  private queue: string[] = [];
  private wanted = new Set<string>();
  private inFlight = 0;
  private failures = new Map<string, number>();
  private compositeTimer = 0;
  private scratch: CanvasRenderingContext2D | null = null;
  private blank: Uint8Array | null = null;
  private dpr = 1;
  private height = 0;
  private sources: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.ready = false;
      this.gl = null;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (this.init()) void this.loadSources(this.sources);
    });
  }

  /** Sets up WebGL. Returns false when the browser can't render the imagery. */
  init(): boolean {
    const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false };
    const gl2 = this.canvas.getContext("webgl2", opts);
    const gl = gl2 ?? (this.canvas.getContext("webgl", opts) as WebGLRenderingContext | null);
    if (!gl) return false;
    this.gl = gl;
    this.webgl2 = !!gl2;
    const program = this.compile(this.webgl2 ? VERT_300 : VERT_100, this.webgl2 ? FRAG_300 : FRAG_100);
    if (!program) return false;
    this.program = program;
    gl.useProgram(program);
    for (const name of [
      "uTex",
      "uDetail",
      "uDetailOrigin",
      "uDetailSize",
      "uDetailSpan",
      "uDetailSlots",
      "uDetailOn",
      "uCenter",
      "uRadius",
      "uRot",
      "uDpr",
      "uHeight",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    this.textureSize = 0;
    this.detailTexture = gl.createTexture();
    this.detailFbo = gl.createFramebuffer();
    this.slotsX = this.slotsY = 0;
    this.shown = this.window = null;
    this.sizeDetail();
    // One triangle that covers the whole viewport.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return true;
  }

  /** Stream sharper tiles when zoomed in. */
  setTileSource(source: TileSource | null): void {
    this.tiles = source;
  }

  get hasTiles(): boolean {
    return !!this.tiles && !!this.gl && this.slotsX > 0;
  }

  get maxTileZoom(): number {
    return this.tiles?.maxZoom ?? 0;
  }

  /** The tile zoom the whole-Earth texture already matches (8K wide = zoom 4). */
  get baseZoom(): number {
    return this.textureSize ? Math.log2(this.textureSize / (2 * TILE_PX)) : 0;
  }

  /** The block of tiles the view needs, or null when the base texture is sharp enough. */
  setWindow(w: TileWindow | null): void {
    if (!this.tiles || sameWindow(w, this.window) || (!w && !this.window)) return;
    // Slots are addressed modulo the texture size, which only lines up with the grid's
    // wrap-around when the grid is at least as wide.
    if (w && (w.cols > this.slotsX || w.rows > this.slotsY || 2 ** (w.z + 1) < this.slotsX)) w = null;
    this.window = w;
    if (!w) {
      this.shown = null;
      this.wanted.clear();
      this.queue = [];
      this.onUpdate?.();
      return;
    }
    this.scheduleComposite(0);
  }

  get maxTextureSize(): number {
    return this.gl ? (this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number) : 0;
  }

  /**
   * Loads textures in order, each replacing the last (e.g. a quick 4K, then 8K).
   * Sources wider than the GPU allows are skipped.
   */
  async loadSources(urls: string[]): Promise<void> {
    this.sources = urls;
    for (const url of urls) {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        if (!this.gl || img.naturalWidth > this.maxTextureSize || img.naturalWidth <= this.textureSize) continue;
        this.upload(img);
        this.ready = true;
        this.onReady?.();
      } catch {
        /* keep whatever texture is already showing */
      }
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.sizeDetail();
  }

  render(view: SatelliteView): void {
    const gl = this.gl;
    if (!gl || !this.ready || !this.program) return;
    const toRad = Math.PI / 180;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.uTex, 0);
    gl.uniform1i(this.uniforms.uDetail, 1);
    const w = this.shown;
    gl.uniform1f(this.uniforms.uDetailOn, w ? 1 : 0);
    if (w) {
      const span = tileSpanDeg(w.z);
      gl.uniform2f(this.uniforms.uDetailOrigin, (w.col0 * span - 180) * toRad, (90 - w.row0 * span) * toRad);
      gl.uniform2f(this.uniforms.uDetailSize, w.cols, w.rows);
      gl.uniform1f(this.uniforms.uDetailSpan, span * toRad);
      const [sx, sy] = this.slotOf(w.row0, wrapCol(w.col0, w.z));
      gl.uniform4f(this.uniforms.uDetailSlots, sx, sy, this.slotsX, this.slotsY);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.detailTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform2f(this.uniforms.uCenter, view.cx, view.cy);
    gl.uniform1f(this.uniforms.uRadius, view.radius);
    gl.uniform2f(this.uniforms.uRot, view.lambda * toRad, view.phi * toRad);
    gl.uniform1f(this.uniforms.uDpr, this.dpr);
    gl.uniform1f(this.uniforms.uHeight, this.height * this.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  clear(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ── Detail tiles ──────────────────────────────────────────

  private key(z: number, row: number, col: number): string {
    return `${z}/${row}/${col}`;
  }

  private slotOf(row: number, col: number): [number, number] {
    return [col % this.slotsX, row % this.slotsY];
  }

  /**
   * Sizes the detail texture to cover the screen at up to ~1.7 tile pixels per screen pixel,
   * plus a tile of slack on each side, in powers of two so slots wrap like the grid does.
   */
  private sizeDetail(): void {
    const gl = this.gl;
    if (!gl || !this.detailTexture) return;
    const most = Math.max(4, Math.min(MAX_SLOTS, Math.floor(this.maxTextureSize / TILE_PX)));
    const fit = (px: number) => Math.min(most, 2 ** Math.ceil(Math.log2(Math.ceil((px * 1.7) / TILE_PX) + 2)));
    const x = fit(this.canvas.width);
    const y = fit(this.canvas.height);
    if (x === this.slotsX && y === this.slotsY) return;
    this.slotsX = x;
    this.slotsY = y;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.detailTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, x * TILE_PX, y * TILE_PX, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // Repeat, so filtering across a slot edge that wraps reads the neighbouring tile.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    this.slots = new Array<Slot>(x * y).fill(null);
    this.slotZoom = -1;
    this.shown = null;
    if (this.window) this.scheduleComposite(0);
  }

  /** Empties every slot at once (on the GPU), e.g. when the view changes zoom level. */
  private clearDetail(): void {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.detailFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.detailTexture, 0);
    gl.viewport(0, 0, this.slotsX * TILE_PX, this.slotsY * TILE_PX);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.slots.fill(null);
  }

  private scheduleComposite(delay = 60): void {
    if (this.compositeTimer) return;
    this.compositeTimer = window.setTimeout(() => {
      this.compositeTimer = 0;
      this.composite();
    }, delay);
  }

  private readyTile(key: string): TileImage | null {
    const t = this.cache.get(key);
    if (!t || t.state !== "ready") return null;
    // Re-insert to keep the cache in least-recently-used order.
    this.cache.delete(key);
    this.cache.set(key, t);
    return t.img;
  }

  /** Writes one tile-sized image (or transparency, for null) into a slot. */
  private put(slot: number, src: TexImageSource | null): void {
    const gl = this.gl!;
    const x = (slot % this.slotsX) * TILE_PX;
    const y = Math.floor(slot / this.slotsX) * TILE_PX;
    if (src) gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else {
      this.blank ??= new Uint8Array(TILE_PX * TILE_PX * 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, TILE_PX, TILE_PX, gl.RGBA, gl.UNSIGNED_BYTE, this.blank);
    }
  }

  /**
   * Brings the detail texture up to date with the window: tiles that have loaded go in as they
   * are, and tiles still loading are stood in for by a cached ancestor, scaled up, so the view
   * sharpens step by step instead of popping. Stand-ins are drawn on a time budget; a slot
   * that still holds some other tile is always cleared in the same pass, so the texture never
   * shows imagery from the wrong place.
   */
  private composite(): void {
    const gl = this.gl;
    const w = this.window;
    if (!gl || !w || !this.tiles) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.detailTexture);
    if (this.slotZoom !== w.z) this.clearDetail();
    this.slotZoom = w.z;

    // Centre of the screen first.
    const order: { row: number; col: number; d: number }[] = [];
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        order.push({ row: w.row0 + r, col: wrapCol(w.col0 + c, w.z), d: Math.hypot(r + 0.5 - w.rows / 2, c + 0.5 - w.cols / 2) });
      }
    }
    order.sort((a, b) => a.d - b.d);

    const start = performance.now();
    let unfinished = false;
    const missing: string[] = [];
    try {
      for (const { row, col } of order) {
        const key = this.key(w.z, row, col);
        const [sx, sy] = this.slotOf(row, col);
        const slot = sy * this.slotsX + sx;
        const held = this.slots[slot];
        if (held?.from === key) continue;
        const img = this.readyTile(key);
        if (img) {
          this.put(slot, img);
          this.slots[slot] = { key, from: key };
          continue;
        }
        if (!this.cache.has(key)) missing.push(key);
        let from = "";
        let parent: TileImage | null = null;
        let dz = 1;
        for (; dz <= 6 && w.z - dz >= 0 && !parent; dz++) {
          const f = 2 ** dz;
          from = this.key(w.z - dz, Math.floor(row / f), Math.floor(col / f));
          parent = this.readyTile(from);
        }
        if (!parent) from = "";
        if (held?.key === key && held.from === from) continue;
        if (parent && performance.now() - start < FALLBACK_BUDGET_MS) {
          const f = 2 ** (dz - 1);
          const size = TILE_PX / f;
          const g = (this.scratch ??= this.makeScratch());
          g.drawImage(parent, (col % f) * size, (row % f) * size, size, size, 0, 0, TILE_PX, TILE_PX);
          this.put(slot, g.canvas);
          this.slots[slot] = { key, from };
        } else {
          if (parent) unfinished = true;
          // Keep a coarser stand-in for this tile; clear one for anywhere else.
          if (held?.key !== key) {
            if (held) this.put(slot, null);
            this.slots[slot] = { key, from: "" };
          }
        }
      }
    } catch {
      // A tile the browser won't hand to WebGL (e.g. served without CORS): stop streaming.
      gl.activeTexture(gl.TEXTURE0);
      this.tiles = null;
      this.window = this.shown = null;
      this.onUpdate?.();
      return;
    }
    gl.activeTexture(gl.TEXTURE0);
    this.shown = w;
    this.queue = missing;
    this.wanted = new Set(missing);
    this.pump();
    if (unfinished) this.scheduleComposite(16);
    this.onUpdate?.();
  }

  private makeScratch(): CanvasRenderingContext2D {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TILE_PX;
    // CPU-backed, so handing it to WebGL is a copy rather than a GPU read-back.
    return canvas.getContext("2d", { willReadFrequently: true })!;
  }

  private pump(): void {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const key = this.queue.shift()!;
      if (!this.wanted.has(key) || this.cache.has(key)) continue;
      this.load(key);
    }
  }

  private load(key: string): void {
    const [z, row, col] = key.split("/").map(Number);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    this.cache.set(key, { state: "loading" });
    this.inFlight++;
    const finish = (tile: CachedTile) => {
      this.inFlight--;
      this.cache.set(key, tile);
      this.evict();
      this.pump();
    };
    img.onload = () => {
      finish({ state: "ready", img: this.mendSeam(img, z, col) });
      if (this.window?.z === z) this.scheduleComposite();
    };
    img.onerror = () => {
      finish({ state: "error" });
      const tries = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, tries);
      if (tries > MAX_RETRIES) return;
      window.setTimeout(() => {
        if (this.cache.get(key)?.state !== "error") return;
        this.cache.delete(key);
        if (this.window?.z === z) this.scheduleComposite();
      }, RETRY_MS);
    };
    img.src = this.tiles!.url(z, row, col);
  }

  /** EOX tiles carry a stray column of pixels at ±180°; copy its neighbour over it. */
  private mendSeam(img: HTMLImageElement, z: number, col: number): TileImage {
    const last = 2 ** (z + 1) - 1;
    if (col !== 0 && col !== last) return img;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TILE_PX;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return img;
    g.drawImage(img, 0, 0);
    const edge = col === 0 ? 0 : TILE_PX - 1;
    g.drawImage(canvas, col === 0 ? 1 : TILE_PX - 2, 0, 1, TILE_PX, edge, 0, 1, TILE_PX);
    return canvas;
  }

  private evict(): void {
    if (this.cache.size <= CACHE_LIMIT) return;
    for (const [key, t] of this.cache) {
      if (this.cache.size <= CACHE_LIMIT) break;
      if (t.state !== "loading" && !this.wanted.has(key)) this.cache.delete(key);
    }
  }
  private upload(img: HTMLImageElement): void {
    const gl = this.gl!;
    if (this.texture) gl.deleteTexture(this.texture);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.webgl2) {
      // WebGL 2 can mipmap safely thanks to textureGrad in the shader.
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      if (aniso) {
        const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
        gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.texture = tex;
    this.textureSize = img.naturalWidth;
  }

  private compile(vertSrc: string, fragSrc: string): WebGLProgram | null {
    const gl = this.gl!;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("Globe shader failed to compile:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, vertSrc);
    const fs = shader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Globe shader failed to link:", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }
}
