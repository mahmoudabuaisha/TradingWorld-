/**
 * The sign-in screen's globe: a WebGL scene, no React.
 *
 * - Continents as about 5,800 gold dots on a Fibonacci lattice (landMask.ts), lit by the real position of the sun
 *   right now, on a dark sphere with a gold atmosphere rim.
 * - A candlestick chart in orbit: a ring of candles around the planet, the newest one forming at the head while the
 *   series flows back along the ring and fades behind the globe.
 * - Beacons on the financial centres; the ones whose trading session is open right now stand taller and pulse.
 * - Arcs of light between the centres, gold dust around.
 *
 * The page drives it with poses (where the globe sits, how big, which side of the Earth faces the viewer) that are
 * tweened, and with three reactions: a key press nudges the forming candle, a failed sign-in shakes the globe and
 * drops a red candle, a successful one spins it up behind a shock wave. With `reducedMotion` nothing animates: one
 * frame is drawn per change.
 */
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { fromLatLon, landPositions } from "./landMask";

export interface GlobePose {
  /** centre of the globe, as a fraction of the viewport from its centre: -0.5 (left/bottom edge) to 0.5 */
  x: number;
  y: number;
  /** radius as a fraction of the viewport height */
  r: number;
  /** longitude facing the viewer, degrees east (added to the slow spin) */
  lon: number;
  /** 0..1 brightness of the whole scene */
  glow?: number;
}

export type SessionId = "ASIA" | "LONDON" | "NEW_YORK";

interface City {
  name: string;
  lat: number;
  lon: number;
  /** the session it trades in; undefined = a hub shown with a steady light */
  session?: SessionId;
}

const CITIES: City[] = [
  { name: "New York", lat: 40.7, lon: -74.0, session: "NEW_YORK" },
  { name: "Chicago", lat: 41.9, lon: -87.6, session: "NEW_YORK" },
  { name: "São Paulo", lat: -23.5, lon: -46.6, session: "NEW_YORK" },
  { name: "London", lat: 51.5, lon: -0.1, session: "LONDON" },
  { name: "Frankfurt", lat: 50.1, lon: 8.7, session: "LONDON" },
  { name: "Dubai", lat: 25.2, lon: 55.3 },
  { name: "Riyadh", lat: 24.7, lon: 46.7 },
  { name: "Mumbai", lat: 19.1, lon: 72.9 },
  { name: "Singapore", lat: 1.35, lon: 103.8, session: "ASIA" },
  { name: "Hong Kong", lat: 22.3, lon: 114.2, session: "ASIA" },
  { name: "Tokyo", lat: 35.7, lon: 139.7, session: "ASIA" },
  { name: "Sydney", lat: -33.9, lon: 151.2, session: "ASIA" },
];
const ARCS: [number, number][] = [
  [0, 3],
  [3, 5],
  [5, 8],
  [8, 10],
  [10, 11],
  [0, 2],
  [3, 7],
  [9, 4],
  [6, 3],
];

const GOLD = new Color("#f2c75c");
const GOLD_DEEP = new Color("#8a5a1c");
const GREEN = new Color("#34d399");
const RED = new Color("#f87171");

const FOV = 28;
const CAM_Z = 10;
const RING_R = 1.42;
const CANDLES = 88;
const CANDLE_SPAN = (300 * Math.PI) / 180;
const CANDLE_STEP = CANDLE_SPAN / CANDLES;
/** where the newest candle forms: in front of the planet, a little to the far side from the card */
const HEAD_ANGLE = (104 * Math.PI) / 180;
const BAND = 0.2;
const CANDLE_SECONDS = 1.15;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export class GlobeScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private anchor = new Group();
  private tilt = new Group();
  private earth = new Group();
  private ring = new Group();
  private dust: Points;
  private land: Points;
  private landMat: ShaderMaterial;
  private bodyMat: ShaderMaterial;
  private haloMat: ShaderMaterial;
  private dustMat: ShaderMaterial;
  private arcMats: ShaderMaterial[] = [];
  private bodies: InstancedMesh;
  private wicks: InstancedMesh;
  private beacons: InstancedMesh;
  private cityLights: Points;
  private cityMat: ShaderMaterial;
  private headGlow: Points;
  private headMat: ShaderMaterial;
  private shock: Mesh;
  private shockMat: MeshBasicMaterial;
  private disposables: { dispose(): void }[] = [];

  private w = 1;
  private h = 1;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;

  private pose: Required<GlobePose> = { x: 0, y: 0, r: 0.3, lon: 30, glow: 1 };
  private from: Required<GlobePose> = { ...this.pose };
  private to: Required<GlobePose> = { ...this.pose };
  private tweenT = 1;
  private tweenDur = 1;

  private spin = 0;
  private spinVel = 0;
  private pitch = 0;
  private pointer = { x: 0, y: 0 };
  private parallax = { x: 0, y: 0 };

  private candles: Candle[] = [];
  private frac = 0;
  private liveTarget = 0;
  private kick = 0;
  /** >0 while a reaction colours the newest candles: seconds left */
  private mood: { kind: "error" | "success"; left: number } | undefined;
  private shake = 0;
  private shockT = -1;
  private open = new Set<SessionId>();
  private sessionsCheckedAt = -1e9;
  private cityUnit: Vector3[] = CITIES.map((c) => new Vector3(...fromLatLon(c.lat, c.lon)));

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: { reducedMotion: boolean; mirrored: boolean; sessions: () => SessionId[] },
  ) {
    // opaque, in the page's own black: additive glow then never has to be composited over the page
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x080808, 1);
    this.camera.position.set(0, 0, CAM_Z);

    this.scene.add(this.anchor);
    this.anchor.add(this.tilt);
    this.tilt.add(this.earth);
    this.tilt.rotation.z = -0.18;

    // ── the planet: a dark body with a lit rim, and a halo outside it ──
    const light = new Vector3(opts.mirrored ? -0.82 : 0.82, 0.5, 0).normalize();
    this.bodyMat = new ShaderMaterial({
      uniforms: { uLight: { value: light }, uGlow: { value: 1 }, uTint: { value: new Color("#f2b84b") } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uLight; uniform float uGlow; uniform vec3 uTint;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = 1.0 - max(dot(vN, vV), 0.0);
          float side = 0.18 + 0.82 * smoothstep(-0.35, 0.95, dot(vN, uLight));
          vec3 col = vec3(0.020, 0.016, 0.011) + uTint * (pow(f, 2.4) * 0.85 + pow(f, 7.0) * 1.4) * side * uGlow;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sphere = new SphereGeometry(0.985, 96, 64);
    this.tilt.add(new Mesh(sphere, this.bodyMat));

    this.haloMat = new ShaderMaterial({
      uniforms: { uLight: { value: light }, uGlow: { value: 1 }, uTint: { value: new Color("#f2b84b") } },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vN;
        void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uLight; uniform float uGlow; uniform vec3 uTint;
        varying vec3 vN;
        void main() {
          float edge = clamp(-vN.z / 0.64, 0.0, 1.0);          // 1 at the planet's silhouette, 0 at the halo's outer edge
          float side = 0.12 + 0.88 * smoothstep(-0.3, 0.9, dot(normalize(vN.xy + 1e-5), normalize(uLight.xy)));
          gl_FragColor = vec4(uTint * pow(edge, 2.6) * side * uGlow * 0.9, 1.0);
        }`,
    });
    const halo = new Mesh(new SphereGeometry(1.3, 64, 48), this.haloMat);
    this.anchor.add(halo);
    this.disposables.push(sphere, halo.geometry, this.bodyMat, this.haloMat);

    // ── graticule ──
    const grat: number[] = [];
    const R = 1.001;
    for (let lon = 0; lon < 360; lon += 30)
      for (let lat = -80; lat < 80; lat += 4) grat.push(...scaled(fromLatLon(lat, lon), R), ...scaled(fromLatLon(lat + 4, lon), R));
    for (let lat = -60; lat <= 60; lat += 30)
      for (let lon = 0; lon < 360; lon += 4) grat.push(...scaled(fromLatLon(lat, lon), R), ...scaled(fromLatLon(lat, lon + 4), R));
    const gratGeo = new BufferGeometry();
    gratGeo.setAttribute("position", new BufferAttribute(new Float32Array(grat), 3));
    const gratMat = new LineBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.075 });
    this.earth.add(new LineSegments(gratGeo, gratMat));
    this.disposables.push(gratGeo, gratMat);

    // ── continents ──
    const pos = landPositions();
    const seeds = new Float32Array(pos.length / 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const landGeo = new BufferGeometry();
    landGeo.setAttribute("position", new BufferAttribute(pos, 3));
    landGeo.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    this.landMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 4 }, uSun: { value: new Vector3(0, 0, 1) }, uGlow: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        uniform float uTime; uniform float uSize; uniform vec3 uSun;
        varying float vA; varying float vDay; varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float facing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
          vA = smoothstep(0.0, 0.28, facing);
          vDay = smoothstep(-0.12, 0.3, dot(position, uSun));
          vSeed = aSeed;
          float tw = 0.75 + 0.25 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 60.0);
          gl_PointSize = uSize * (0.7 + 0.6 * aSeed) * tw;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uGlow;
        varying float vA; varying float vDay; varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * vA;
          vec3 night = vec3(0.62, 0.40, 0.13);
          vec3 day = mix(vec3(1.0, 0.78, 0.36), vec3(1.0, 0.93, 0.72), vSeed * vSeed);
          gl_FragColor = vec4(mix(night, day, vDay) * a * uGlow * mix(0.55, 1.0, vDay), 1.0);
        }`,
    });
    this.land = new Points(landGeo, this.landMat);
    this.earth.add(this.land);
    this.disposables.push(landGeo, this.landMat);

    // ── beacons on the financial centres ──
    const box = new BoxGeometry(1, 1, 1);
    const glowMat = () =>
      new MeshBasicMaterial({ color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    const beaconMat = glowMat();
    this.beacons = new InstancedMesh(box, beaconMat, CITIES.length);
    this.earth.add(this.beacons);
    this.disposables.push(box, beaconMat);

    const cityGeo = new BufferGeometry();
    cityGeo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(this.cityUnit.flatMap((v) => [v.x * 1.006, v.y * 1.006, v.z * 1.006])), 3),
    );
    cityGeo.setAttribute("aLevel", new BufferAttribute(new Float32Array(CITIES.length), 1));
    this.cityMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 16 }, uGlow: { value: 1 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aLevel; uniform float uTime; uniform float uSize; varying float vL;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float facing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
          vL = aLevel * smoothstep(0.0, 0.3, facing);
          gl_PointSize = uSize * (0.55 + 0.45 * aLevel) * (1.0 + 0.25 * aLevel * sin(uTime * 2.4 + position.x * 9.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uGlow; varying float vL;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.16, 0.0, d);
          float haze = pow(smoothstep(0.5, 0.0, d), 2.0) * 0.55;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * (core + haze) * vL * uGlow, 1.0);
        }`,
    });
    this.cityLights = new Points(cityGeo, this.cityMat);
    this.earth.add(this.cityLights);
    this.disposables.push(cityGeo, this.cityMat);

    // ── arcs between them ──
    ARCS.forEach(([a, b], i) => {
      const va = this.cityUnit[a]!;
      const vb = this.cityUnit[b]!;
      const angle = va.angleTo(vb);
      const pts: Vector3[] = [];
      for (let k = 0; k <= 28; k++) {
        const t = k / 28;
        const p = va
          .clone()
          .multiplyScalar(Math.sin((1 - t) * angle))
          .add(vb.clone().multiplyScalar(Math.sin(t * angle)))
          .normalize();
        pts.push(p.multiplyScalar(1.004 + Math.sin(Math.PI * t) * (0.06 + 0.22 * (angle / Math.PI))));
      }
      const geo = new TubeGeometry(new CatmullRomCurve3(pts), 72, 0.0032, 5, false);
      const mat = new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPhase: { value: i * 0.37 }, uSpeed: { value: 0.16 + (i % 3) * 0.05 }, uGlow: { value: 1 } },
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        vertexShader: `varying float vU; void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uPhase; uniform float uSpeed; uniform float uGlow;
          varying float vU;
          void main() {
            float head = fract(uTime * uSpeed + uPhase) * 1.6 - 0.3;       // runs past both ends, then rests
            float d = head - vU;
            float trail = d > 0.0 ? exp(-d * 9.0) : exp(d * 60.0);
            float ends = smoothstep(0.0, 0.06, vU) * smoothstep(1.0, 0.94, vU);
            gl_FragColor = vec4(vec3(1.0, 0.80, 0.42) * (0.10 + 1.5 * trail) * ends * uGlow, 1.0);
          }`,
      });
      this.earth.add(new Mesh(geo, mat));
      this.arcMats.push(mat);
      this.disposables.push(geo, mat);
    });

    // ── the candle ring ──
    this.anchor.add(this.ring);
    // tilted so the chart climbs toward the card
    this.ring.rotation.set(0.2, 0, opts.mirrored ? -0.27 : 0.27);
    const bodyMat = glowMat();
    const wickMat = glowMat();
    this.bodies = new InstancedMesh(box, bodyMat, CANDLES);
    this.wicks = new InstancedMesh(box, wickMat, CANDLES);
    this.ring.add(this.bodies, this.wicks);
    const circle: number[] = [];
    for (let k = 0; k < 180; k++) {
      const a0 = (k / 180) * Math.PI * 2;
      const a1 = ((k + 1) / 180) * Math.PI * 2;
      circle.push(RING_R * Math.cos(a0), 0, RING_R * Math.sin(a0), RING_R * Math.cos(a1), 0, RING_R * Math.sin(a1));
    }
    const circleGeo = new BufferGeometry();
    circleGeo.setAttribute("position", new BufferAttribute(new Float32Array(circle), 3));
    const circleMat = new LineBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.16 });
    this.ring.add(new LineSegments(circleGeo, circleMat));
    this.disposables.push(bodyMat, wickMat, circleGeo, circleMat);

    this.headMat = new ShaderMaterial({
      uniforms: { uSize: { value: 30 }, uColor: { value: GOLD.clone() }, uGlow: { value: 1 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float uSize; void main() { gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uGlow;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor * pow(smoothstep(0.5, 0.0, d), 2.2) * uGlow, 1.0); }`,
    });
    const headGeo = new BufferGeometry();
    headGeo.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    this.headGlow = new Points(headGeo, this.headMat);
    this.headGlow.frustumCulled = false;
    this.ring.add(this.headGlow);
    this.disposables.push(headGeo, this.headMat);

    let c = 0;
    for (let i = 0; i < CANDLES; i++) {
      const o = c;
      c = clamp(c + (Math.random() - 0.48) * 0.66 - c * 0.1, -1, 1);
      this.candles.push({ o, c, h: Math.max(o, c) + Math.random() * 0.12, l: Math.min(o, c) - Math.random() * 0.12 });
    }
    this.newLive();

    // ── shock wave (successful sign-in) ──
    this.shockMat = new MeshBasicMaterial({
      color: 0xf2c75c,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shockGeo = new RingGeometry(1.0, 1.035, 128);
    this.shock = new Mesh(shockGeo, this.shockMat);
    this.anchor.add(this.shock);
    this.disposables.push(shockGeo, this.shockMat);

    // ── gold dust ──
    const N = 340;
    const dustPos = new Float32Array(N * 3);
    const dustSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 7 - 0.5;
      dustSeed[i] = Math.random();
    }
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute("position", new BufferAttribute(dustPos, 3));
    dustGeo.setAttribute("aSeed", new BufferAttribute(dustSeed, 1));
    this.dustMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uGlow: { value: 1 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSeed; uniform float uTime; uniform float uDpr; varying float vA;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * (0.10 + aSeed * 0.2) + aSeed * 40.0) * 0.25;
          p.x += cos(uTime * (0.07 + aSeed * 0.15) + aSeed * 23.0) * 0.25;
          vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 90.0), 3.0);
          gl_PointSize = (1.2 + aSeed * 2.6) * uDpr;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uGlow; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.82, 0.46) * smoothstep(0.5, 0.0, d) * vA * 0.55 * uGlow, 1.0); }`,
    });
    this.dust = new Points(dustGeo, this.dustMat);
    this.scene.add(this.dust);
    this.disposables.push(dustGeo, this.dustMat);

    document.addEventListener("visibilitychange", this.onVisibility);
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  // ── what the page calls ──

  resize(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.draw();
  }

  /** Jump to a pose (no animation). */
  jump(p: GlobePose) {
    this.pose = { glow: 1, ...p };
    this.from = { ...this.pose };
    this.to = { ...this.pose };
    this.tweenT = 1;
    if (!this.running) this.draw();
  }

  /** Glide to a pose over `ms`. */
  go(p: GlobePose, ms = 1200) {
    if (this.opts.reducedMotion) return this.jump(p);
    this.from = { ...this.pose };
    this.to = { glow: 1, ...p };
    // the short way round the planet
    while (this.to.lon - this.from.lon > 180) this.to.lon -= 360;
    while (this.to.lon - this.from.lon < -180) this.to.lon += 360;
    this.tweenT = 0;
    this.tweenDur = ms / 1000;
  }

  react(kind: "key" | "error" | "success") {
    if (kind === "key") {
      this.kick = Math.min(1.4, this.kick + 0.45);
      return;
    }
    this.mood = { kind, left: kind === "success" ? 2.2 : 1.3 };
    this.liveTarget = kind === "success" ? 1.15 : -1.15;
    if (this.opts.reducedMotion) return this.draw();
    if (kind === "error") this.shake = 1;
    else {
      this.spinVel += 2.4;
      this.shockT = 0;
    }
  }

  /** Pointer position over the stage, -1..1 on both axes. */
  point(nx: number, ny: number) {
    this.pointer.x = clamp(nx, -1, 1);
    this.pointer.y = clamp(ny, -1, 1);
  }

  /** A drag of dx, dy CSS pixels: spins the planet. */
  drag(dx: number, dy: number) {
    this.spinVel += dx * 0.012;
    this.pitch = clamp(this.pitch + dy * 0.004, -0.5, 0.5);
    if (!this.running) {
      this.spin += dx * 0.006;
      this.draw();
    }
  }

  start() {
    if (this.opts.reducedMotion) return this.draw();
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    for (const d of this.disposables) d.dispose();
    this.bodies.dispose();
    this.wicks.dispose();
    this.beacons.dispose();
    this.renderer.dispose();
  }

  // ── the loop ──

  private onVisibility = () => {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    } else this.start();
  };
  private onLost = (e: Event) => {
    e.preventDefault();
    this.running = false;
    cancelAnimationFrame(this.raf);
  };

  private frame = (now: number) => {
    if (!this.running) return;
    // real elapsed time, so a slow machine drops frames instead of falling behind the page's own timings
    const dt = Math.min(0.12, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    this.time += dt;
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / this.tweenDur);
      const k = ease(this.tweenT);
      const mix = (a: number, b: number) => a + (b - a) * k;
      this.pose = {
        x: mix(this.from.x, this.to.x),
        y: mix(this.from.y, this.to.y),
        r: mix(this.from.r, this.to.r),
        lon: mix(this.from.lon, this.to.lon),
        glow: mix(this.from.glow, this.to.glow),
      };
    }
    this.spin += (0.045 + this.spinVel) * dt;
    this.spinVel *= Math.exp(-dt * 1.5);
    this.pitch *= Math.exp(-dt * 0.6);
    this.parallax.x += (this.pointer.x - this.parallax.x) * Math.min(1, dt * 3);
    this.parallax.y += (this.pointer.y - this.parallax.y) * Math.min(1, dt * 3);
    this.shake *= Math.exp(-dt * 5.5);
    this.kick *= Math.exp(-dt * 3.2);
    if (this.mood && (this.mood.left -= dt) <= 0) this.mood = undefined;
    if (this.shockT >= 0 && (this.shockT += dt / 1.3) >= 1) this.shockT = -1;

    // the chart: the newest candle forms, then the whole series steps back by one
    this.frac += dt / CANDLE_SECONDS;
    const live = this.candles[CANDLES - 1]!;
    const wobble = Math.sin(this.time * 9) * 0.03 + Math.sin(this.time * 23) * 0.05 * this.kick;
    live.c = clamp(live.o + (this.liveTarget - live.o) * ease(Math.min(1, this.frac)) + wobble, -1.25, 1.25);
    live.h = Math.max(live.h, live.c, live.o);
    live.l = Math.min(live.l, live.c, live.o);
    if (this.frac >= 1) {
      this.frac -= 1;
      this.candles.shift();
      this.candles.push({ o: live.c, h: live.c, l: live.c, c: live.c });
      this.newLive();
    }
  }

  private newLive() {
    const o = this.candles[CANDLES - 1]!.o;
    if (this.mood) this.liveTarget = clamp(o + (this.mood.kind === "success" ? 0.5 : -0.5), -1.2, 1.2);
    else this.liveTarget = clamp(o + (Math.random() - 0.48) * 0.7 - o * 0.1, -1, 1);
  }

  /** The ring is laid out for a card on the right; with the card on the left it runs the other way round. */
  private ringAngle(a: number) {
    return this.opts.mirrored ? Math.PI - a : a;
  }

  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();
  private col = new Color();
  private up = new Vector3(0, 1, 0);

  private draw() {
    const t = this.time;
    const halfH = Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    const halfW = halfH * (this.w / this.h);
    const radius = this.pose.r * 2 * halfH;
    const shakeX = Math.sin(t * 46) * this.shake * 0.09;
    this.anchor.position.set(this.pose.x * 2 * halfW + shakeX * radius, this.pose.y * 2 * halfH, 0);
    this.anchor.scale.setScalar(radius);
    this.tilt.rotation.x = 0.16 + this.pitch + this.parallax.y * 0.07;
    this.tilt.rotation.y = this.parallax.x * 0.1;
    this.earth.rotation.y = this.spin - (this.pose.lon * Math.PI) / 180;
    this.ring.rotation.y = this.parallax.x * 0.05;
    this.dust.rotation.y = t * 0.012 + this.parallax.x * 0.03;

    const glow = this.pose.glow;
    const radiusPx = this.pose.r * this.h;
    this.landMat.uniforms.uTime!.value = t;
    this.landMat.uniforms.uSize!.value = clamp(radiusPx / 105, 1.6, 7) * this.dpr;
    this.landMat.uniforms.uGlow!.value = glow;
    this.dustMat.uniforms.uTime!.value = t;
    this.dustMat.uniforms.uDpr!.value = this.dpr;
    this.dustMat.uniforms.uGlow!.value = glow;
    for (const m of this.arcMats) {
      m.uniforms.uTime!.value = t;
      m.uniforms.uGlow!.value = glow;
    }
    const tint = this.mood?.kind === "error" ? RED : GOLD;
    const moodK = this.mood ? smooth(0, 0.25, this.mood.left) : 0;
    (this.bodyMat.uniforms.uTint!.value as Color).set("#f2b84b").lerp(tint, this.mood?.kind === "error" ? moodK * 0.8 : 0);
    (this.haloMat.uniforms.uTint!.value as Color).copy(this.bodyMat.uniforms.uTint!.value as Color);
    this.bodyMat.uniforms.uGlow!.value = glow * (1 + (this.mood?.kind === "success" ? moodK * 0.5 : 0));
    this.haloMat.uniforms.uGlow!.value = this.bodyMat.uniforms.uGlow!.value;

    // beacons: open sessions stand tall and pulse
    if (t - this.sessionsCheckedAt > 20) {
      this.sessionsCheckedAt = t;
      this.open = new Set(this.opts.sessions());
      (this.landMat.uniforms.uSun!.value as Vector3).copy(sunDirection(new Date()));
    }
    CITIES.forEach((c, i) => {
      const n = this.cityUnit[i]!;
      const isOpen = c.session ? this.open.has(c.session) : undefined;
      const hgt = isOpen ? 0.062 + 0.022 * Math.sin(t * 2.4 + i * 1.7) : isOpen === undefined ? 0.04 : 0.016;
      this.q.setFromUnitVectors(this.up, n);
      this.v.copy(n).multiplyScalar(1 + hgt / 2);
      this.s.set(0.0045, hgt, 0.0045);
      this.m.compose(this.v, this.q, this.s);
      this.beacons.setMatrixAt(i, this.m);
      this.col.copy(GOLD).multiplyScalar((isOpen ? 1.25 : isOpen === undefined ? 0.7 : 0.28) * glow);
      this.beacons.setColorAt(i, this.col);
    });
    const level = this.cityLights.geometry.getAttribute("aLevel") as BufferAttribute;
    CITIES.forEach((c, i) => level.setX(i, c.session ? (this.open.has(c.session) ? 1 : 0.3) : 0.6));
    level.needsUpdate = true;
    this.cityMat.uniforms.uTime!.value = t;
    this.cityMat.uniforms.uSize!.value = clamp(radiusPx / 17, 8, 30) * this.dpr;
    this.cityMat.uniforms.uGlow!.value = glow;
    this.beacons.instanceMatrix.needsUpdate = true;
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;

    // the candle ring
    const width = RING_R * CANDLE_STEP * 0.62;
    const frac = Math.min(1, this.frac);
    for (let i = 0; i < CANDLES; i++) {
      const c = this.candles[i]!;
      const back = CANDLES - 1 - i + frac;
      const a = this.ringAngle(HEAD_ANGLE + back * CANDLE_STEP);
      const cx = RING_R * Math.cos(a);
      const cz = RING_R * Math.sin(a);
      // the tail fades out, and the stretch that crosses the hero's text stays quiet
      const heroSide = (this.opts.mirrored ? 1 : -1) * Math.cos(a);
      const fade =
        smooth(CANDLES - 0.5, CANDLES - 14, back) * (i === CANDLES - 1 ? 0.55 + 0.45 * frac : 1) * (1 - 0.8 * smooth(0.3, 0.9, heroSide));
      const isUp = c.c >= c.o;
      const young = CANDLES - 1 - i;
      if (this.mood && young < 6) this.col.copy(this.mood.kind === "success" ? GREEN : RED);
      else this.col.copy(isUp ? GOLD : GOLD_DEEP);
      this.col.multiplyScalar(fade * glow * (isUp ? 1.15 : 0.9));
      this.q.setFromAxisAngle(this.up, Math.PI / 2 - a);
      this.v.set(cx, ((c.o + c.c) / 2) * BAND, cz);
      this.s.set(width, Math.max(Math.abs(c.c - c.o) * BAND, 0.006), 0.008);
      this.m.compose(this.v, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.bodies.setColorAt(i, this.col);
      this.v.set(cx, ((c.h + c.l) / 2) * BAND, cz);
      this.s.set(width * 0.12, Math.max((c.h - c.l) * BAND, 0.006), 0.004);
      this.m.compose(this.v, this.q, this.s);
      this.wicks.setMatrixAt(i, this.m);
      this.wicks.setColorAt(i, this.col.multiplyScalar(0.8));
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wicks.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.wicks.instanceColor) this.wicks.instanceColor.needsUpdate = true;

    const head = this.candles[CANDLES - 1]!;
    const ha = this.ringAngle(HEAD_ANGLE + frac * CANDLE_STEP);
    const headPos = this.headGlow.geometry.getAttribute("position") as BufferAttribute;
    headPos.setXYZ(0, RING_R * Math.cos(ha), head.c * BAND, RING_R * Math.sin(ha));
    headPos.needsUpdate = true;
    this.headMat.uniforms.uSize!.value = clamp(radiusPx / 9, 14, 60) * this.dpr * (1 + this.kick * 0.5);
    (this.headMat.uniforms.uColor!.value as Color).copy(this.mood ? (this.mood.kind === "success" ? GREEN : RED) : GOLD);
    this.headMat.uniforms.uGlow!.value = glow * (0.75 + 0.25 * Math.sin(t * 6));

    if (this.shockT >= 0) {
      this.shock.visible = true;
      this.shock.scale.setScalar(1 + ease(this.shockT) * 1.9);
      this.shockMat.opacity = (1 - this.shockT) * 0.85 * glow;
    } else this.shock.visible = false;

    this.renderer.render(this.scene, this.camera);
  }
}

function scaled(v: [number, number, number], k: number): [number, number, number] {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Unit vector toward the sun in the globe's frame, from the time of day and the season (accurate to a degree or two). */
export function sunDirection(d: Date): Vector3 {
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  return new Vector3(...fromLatLon(declination, (12 - hours) * 15));
}
