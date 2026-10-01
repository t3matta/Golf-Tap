// Satellite imagery for the globe: a full-screen WebGL pass that inverts d3's orthographic
// projection per pixel and samples an equirectangular Blue Marble texture. The 2D canvas
// above it keeps drawing borders, pins and arcs with d3, so both layers share one projection.

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

bool spherePoint(out vec3 n, out vec2 uv, out float alpha) {
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
  n = vec3(vx, s.x, s.y);
  return true;
}

vec3 shade(vec3 col, vec3 n) {
  // Soft daylight from the upper left, darkening toward the limb.
  float light = 0.6 + 0.5 * max(0.0, dot(n, normalize(vec3(0.85, -0.3, 0.42))));
  return col * light;
}`;

const FRAG_300 = `#version 300 es
precision highp float;
uniform sampler2D uTex;
out vec4 outColor;
${SPHERE}
void main() {
  vec3 n; vec2 uv; float alpha;
  if (!spherePoint(n, uv, alpha)) discard;
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
  outColor = vec4(shade(col, n) * alpha, alpha);
}`;

const FRAG_100 = `
precision highp float;
uniform sampler2D uTex;
${SPHERE}
void main() {
  vec3 n; vec2 uv; float alpha;
  if (!spherePoint(n, uv, alpha)) discard;
  vec3 col = texture2D(uTex, vec2(fract(uv.x), uv.y)).rgb;
  gl_FragColor = vec4(shade(col, n) * alpha, alpha);
}`;

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export class SatelliteLayer {
  /** True once a texture is on the GPU and frames can be drawn. */
  ready = false;
  onReady?: () => void;

  private readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private webgl2 = false;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private textureSize = 0;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
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
    for (const name of ["uTex", "uCenter", "uRadius", "uRot", "uDpr", "uHeight"]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    // One triangle that covers the whole viewport.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return true;
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
