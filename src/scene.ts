import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { avatarsSettled, badgeKey, makeBadge, setBadgeTheme } from "./badges";
import { CameraRig } from "./camera";
import { ForceLayout, type Vec3 } from "./layout";
import type { Analysis } from "./normalize";
import { EDGE_STYLE, NODE_STYLE, PALETTES, type MapPalette } from "./theme";
import { EDGE_KINDS, type Edge, type EdgeKind, type NodeType } from "./types";

export type ViewState = {
  selectedNode: string | null;
  selectedEdge: string | null;
  /** Nodes to keep fully visible and labelled (selection + direct neighbors, or an edge's two ends). */
  focus: Set<string>;
  /** Search matches (glow + always revealed). */
  matches: Set<string>;
  nodeMatch: (id: string) => boolean;
  edgeMatch: (e: Edge) => boolean;
  filtersActive: boolean;
  hideFiltered: boolean;
  /** Colour every visible line by its kind (e.g. while filtering by connection kind). */
  colorKinds?: boolean;
};

export type SceneCallbacks = {
  onPickNode: (id: string) => void;
  onPickEdge: (id: string) => void;
  onPickNothing: () => void;
  onEscape: () => void;
  onFrame: (info: { depth: number; moving: boolean; ready: boolean }) => void;
  onHint: (text: string) => void;
};

type EdgeGroup = { line: any; edges: Edge[]; segs: number[]; total: number; pos: Float32Array; col: Float32Array; segToEdge: Int32Array };

const SEGS_CURVED = 8;
const tmpColor = new THREE.Color();
const bgColor = new THREE.Color(PALETTES.light.bg);

const vertGlow = `
attribute float size; attribute vec3 color; attribute float alpha;
uniform float uScale; uniform float uDensity;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 0.1);
  gl_PointSize = min(size * uScale / d, 420.0);
  float f = exp(-pow(uDensity * d, 2.0));
  vColor = color; vAlpha = alpha * f;
  gl_Position = projectionMatrix * mv;
}`;
const fragGlow = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r); a = a * a;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;
const vertSnow = `
uniform vec3 uCam; uniform float uBox; uniform float uScale; uniform float uAlpha;
varying float vA;
void main() {
  vec3 p = uCam + (mod(position - uCam, uBox) - 0.5 * uBox);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.1);
  gl_PointSize = max(1.0, 0.09 * uScale / d);
  vA = uAlpha * smoothstep(0.5 * uBox, 0.12 * uBox, d) * smoothstep(0.4, 2.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const fragSnow = `
varying float vA;
uniform vec3 uColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vA * 0.45;
  gl_FragColor = vec4(uColor, a);
}`;

export class MapScene {
  readonly renderer: any;
  readonly scene: any;
  readonly camera: any;
  readonly rig: CameraRig;
  readonly layout = new ForceLayout();
  private raycaster = new THREE.Raycaster();
  private sprites = new Map<string, any>();
  private nodeGroup = new THREE.Group();
  private glow: any;
  private glowAttr: { pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array } | null = null;
  private snow: any;
  private edgeGroups = new Map<EdgeKind, EdgeGroup>();
  private highlight: any = null;
  private rings: any[] = [];
  private labelPool: HTMLButtonElement[] = [];

  private analysis: Analysis | null = null;
  private ids: string[] = [];
  private index = new Map<string, number>();
  private nodeType: NodeType[] = [];
  private deg: number[] = [];
  private visCur = new Float32Array(0);
  /** Drawn badge radius per account, so lines can stop at the badge edge. */
  private dispR = new Float32Array(0);
  private hubRank = new Map<string, number>();
  private maxDeg = 1;
  private pairInfo = new Map<string, { k: number; n: number }>();
  private edgeStrength = new Map<string, number>();
  private extentR = 40;
  private extentC: Vec3 = { x: 0, y: 0, z: 0 };

  private view: ViewState = { selectedNode: null, selectedEdge: null, focus: new Set(), matches: new Set(), nodeMatch: () => true, edgeMatch: () => true, filtersActive: false, hideFiltered: false };
  /** Names on the map: off by default; selection, neighbours, hover and search matches are always named. */
  showNames = false;
  private hoverNode: string | null = null;
  private hoverEdge: string | null = null;
  private dirty = true;
  private pickAt: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private lastT = performance.now();
  private frameN = 0;
  private width = 1;
  private height = 1;
  private initialLayoutPending = false;

  private pal: MapPalette = PALETTES.light;

  // ---------- interaction animations ----------
  /** Seconds (performance.now()/1000), set at the start of each frame. */
  private fxNow = 0;
  /** Selection ripple: a pulse travelling out along the selected account's lines. */
  private ripple: { i: number; start: number; delay: Map<number, number> } | null = null;

  private startRipple(id: string) {
    const i = this.index.get(id);
    if (i === undefined || !this.analysis || this.rig.reducedMotion) { this.ripple = null; return; }
    const p = this.layout.get(id)!;
    const nb: [number, number][] = [];
    for (const e of this.analysis.edgesByNode.get(id) ?? []) {
      const j = this.index.get(e.source === id ? e.target : e.source);
      if (j === undefined) continue;
      const q = this.layout.get(this.ids[j])!;
      nb.push([j, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)]);
    }
    const far = Math.max(1e-6, ...nb.map((x) => x[1]));
    // The pulse reaches the nearest neighbours first and the farthest after ~0.45s.
    const delay = new Map(nb.map(([j, d]) => [j, 0.06 + 0.4 * (d / far)]));
    this.ripple = { i, start: performance.now() / 1000, delay };
  }

  /** 0…1…0 as the ripple passes account i. */
  private rippleBump(i: number) {
    const r = this.ripple;
    if (!r) return 0;
    const d = r.delay.get(i);
    if (d === undefined) return 0;
    const u = (this.fxNow - r.start - d) / 0.5;
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
  }

  /**
   * How far a line has drawn in (0…1) and which end it grows from. Lines draw in
   * during the entrance, and along the ripple from a newly selected account.
   */
  private edgeReveal(ia: number, ib: number) {
    let ink = 1, fromA = true;
    if (this.introState !== "off") {
      ink = this.edgeInk(ia, ib);
      fromA = this.introAt[ia] <= this.introAt[ib];
    }
    const r = this.ripple;
    if (r && (ia === r.i || ib === r.i)) {
      const other = ia === r.i ? ib : ia;
      const k = Math.min(1, Math.max(0, (this.fxNow - r.start) / Math.max(0.12, (r.delay.get(other) ?? 0.3) + 0.04)));
      if (k < ink) { ink = k; fromA = ia === r.i; }
    }
    return { ink, fromA };
  }

  /** Switch the map between the light and dark palettes. */
  setTheme(dark: boolean) {
    this.pal = dark ? PALETTES.dark : PALETTES.light;
    this.renderer.setClearColor(this.pal.bg, 1);
    this.scene.fog.color.set(this.pal.bg);
    bgColor.set(this.pal.bg);
    this.snow.material.uniforms.uColor.value.setRGB(...this.pal.snow);
    this.rings.forEach((r) => r.material.color.set(this.pal.select));
    if (this.highlight) this.highlight.material.color.set(this.pal.select);
    setBadgeTheme(dark);
    this.dirty = true;
  }

  // ---------- entrance ----------
  /** "waiting": data is in but positions are still being worked out; "playing": the network grows in. */
  private introState: "off" | "waiting" | "playing" = "off";
  private introT = 0;
  /** Wall-clock start of the entrance, so a slow frame never changes its pace. */
  private introStart = 0;
  /** Badge textures are drawn, photos are in and everything is on the GPU. */
  private introAssetsReady = false;
  private introAssetsPending = false;

  // ---------- ambient drift ----------
  /** The viewer's choice (pause button). */
  driftOn = true;
  /** 0 still … 1 full drift; eases in, drops to 0 on any input. */
  private driftLevel = 0;
  /** Drift may (re)start after this time (ms, performance.now()). */
  private driftResumeAt = 0;
  /** Drift's own clock: advances only while drifting, so motion picks up where it left off. */
  private driftT = 0;
  /** A deep dive in progress: glide into one cluster, circle it close up, glide back out. */
  private dive: { start: number; fx: number; fy: number; fz: number; fdist: number; x: number; y: number; z: number; close: number } | null = null;
  /** Drift-clock time of the next dive: the first comes ~35s in, then roughly every 2 minutes. */
  private nextDiveAt = 35;
  private lastDiveId: string | null = null;
  /** Per account: seconds into the entrance when its badge pops in. */
  private introAt = new Float32Array(0);
  /** Per account: 0 hidden … 1 full size (overshoots a little while popping). */
  private introS = new Float32Array(0);
  private introDur = 2.6;
  private introFrom = { dist: 1, yaw: 0, pitch: 0.32, x: 0, y: 0, z: 0 };
  private introTo = { dist: 1, yaw: 0, pitch: 0.32, x: 0, y: 0, z: 0 };

  constructor(
    _container: HTMLElement,
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLElement,
    private tooltip: HTMLElement,
    private cb: SceneCallbacks
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(PALETTES.light.bg, 1);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTES.light.bg, 0.01);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 5000);
    this.rig = new CameraRig(this.camera);
    this.rig.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.raycaster.params.Line2 = { threshold: 7 };
    this.raycaster.camera = this.camera;

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(0.4, 0.8, 1);
    this.camera.add(key);
    this.scene.add(this.camera);

    // Accounts are camera-facing badges (avatar or initials), shaped and coloured by type.
    this.scene.add(this.nodeGroup);

    // Glow sprites for every node (bioluminescence; also hints at nodes not yet revealed).
    const gm = new THREE.ShaderMaterial({ vertexShader: vertGlow, fragmentShader: fragGlow, uniforms: { uScale: { value: 1 }, uDensity: { value: 0.01 } }, transparent: true, depthWrite: false });
    this.glow = new THREE.Points(new THREE.BufferGeometry(), gm);
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);

    // Drifting particles near the camera give a sense of motion through water.
    const sn = 1400;
    const sp = new Float32Array(sn * 3);
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < sp.length; i++) sp[i] = r() * 40;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: vertSnow, fragmentShader: fragSnow, uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: 40 }, uScale: { value: 1 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(...PALETTES.light.snow) } }, transparent: true, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.09, 64), new THREE.MeshBasicMaterial({ color: PALETTES.light.select, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
      ring.renderOrder = 10;
      ring.visible = false;
      this.rings.push(ring);
      this.scene.add(ring);
    }

    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- data ----------

  setData(analysis: Analysis) {
    this.analysis = analysis;
    const ids = analysis.mapNodeIds;
    this.ids = ids;
    this.index = new Map(ids.map((id, i) => [id, i]));
    this.nodeType = ids.map((id) => analysis.nodeById.get(id)!.type);
    this.deg = ids.map((id) => analysis.degree.get(id) ?? 0);
    this.maxDeg = Math.max(2, ...this.deg);
    const ranked = ids.slice().sort((a, b) => (analysis.degree.get(b) ?? 0) - (analysis.degree.get(a) ?? 0));
    this.hubRank = new Map(ranked.map((id, i) => [id, i]));
    const oldVis = new Map<string, number>();
    this.index.forEach((i, id) => oldVis.set(id, 0));
    const prev = this.visCur;
    const prevIds = (this as any)._prevIds as string[] | undefined;
    prevIds?.forEach((id, i) => oldVis.set(id, prev[i] ?? 0));
    this.visCur = new Float32Array(ids.map((id) => oldVis.get(id) ?? 0));
    this.dispR = new Float32Array(ids.length);
    // Accounts added later (merges) appear at once; only the first load gets the entrance.
    this.introS = new Float32Array(ids.length).fill(this.introState === "off" ? 1 : 0);
    (this as any)._prevIds = ids;

    // One spring per linked pair, regardless of how many edge records the pair has.
    const pairs = new Map<string, [string, string]>();
    const groups = new Map<string, Edge[]>();
    for (const e of analysis.drawnEdges) {
      const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      pairs.set(key, [e.source, e.target]);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
    }
    this.pairInfo.clear();
    groups.forEach((list) => list.forEach((e, k) => this.pairInfo.set(e.id, { k, n: list.length })));
    const firstLoad = this.layout.bodies.size === 0;
    this.layout.setGraph(ids, Array.from(pairs.values()));
    if (firstLoad) {
      this.updateExtent();
      this.rig.overview(this.extentC, this.extentR, true);
      this.settleInitialLayout(ids, Array.from(pairs.values()));
    }

    // One badge per account; rebuilt only when its name, type or avatar changes.
    const keep = new Set(ids);
    this.sprites.forEach((sp, id) => {
      const n = analysis.nodeById.get(id);
      if (!keep.has(id) || !n || sp.userData.key !== badgeKey(n)) {
        this.nodeGroup.remove(sp);
        sp.material.map?.dispose();
        sp.material.dispose();
        this.sprites.delete(id);
      }
    });
    for (const id of ids) {
      if (this.sprites.has(id)) continue;
      const n = analysis.nodeById.get(id)!;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeBadge(n), transparent: true, alphaTest: 0.02, depthTest: false, depthWrite: false }));
      sp.userData = { id, key: badgeKey(n) };
      this.sprites.set(id, sp);
      this.nodeGroup.add(sp);
    }

    // Glow buffers.
    const n = ids.length;
    this.glowAttr = { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alpha: new Float32Array(n) };
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.glowAttr.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.glowAttr.col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.glowAttr.size, 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.glowAttr.alpha, 1));
    this.glow.geometry.dispose();
    this.glow.geometry = g;

    // Line objects per edge kind.
    this.edgeGroups.forEach((grp) => { this.scene.remove(grp.line); grp.line.geometry.dispose(); grp.line.material.dispose(); });
    this.edgeGroups.clear();
    for (const kind of EDGE_KINDS) {
      const edges = analysis.drawnEdges.filter((e) => e.kind === kind);
      if (!edges.length) continue;
      const segs = edges.map((e) => ((this.pairInfo.get(e.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1));
      const total = segs.reduce((a, b) => a + b, 0);
      const geom = new LineSegmentsGeometry();
      geom.setPositions(new Float32Array(total * 6));
      geom.setColors(new Float32Array(total * 6));
      const st = EDGE_STYLE[kind];
      const mat = new LineMaterial({ color: 0xffffff, linewidth: st.width, vertexColors: true, dashed: st.dashed, dashSize: st.dash, gapSize: st.gap, dashScale: 1, worldUnits: false });
      mat.resolution.set(this.width, this.height);
      const line = new LineSegments2(geom, mat);
      line.frustumCulled = false;
      line.renderOrder = 1;
      this.scene.add(line);
      const segToEdge = new Int32Array(total);
      let o = 0;
      segs.forEach((c, i) => { for (let j = 0; j < c; j++) segToEdge[o++] = i; });
      this.edgeGroups.set(kind, { line, edges, segs, total, pos: geom.attributes.instanceStart.data.array, col: geom.attributes.instanceColorStart.data.array, segToEdge });
    }
    this.dirty = true;
  }

  private settleInitialLayout(ids: string[], pairs: [string, string][]) {
    this.initialLayoutPending = true;
    try {
      const worker = new Worker(new URL("./layout-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ positions?: [number, number, number][]; error?: string }>) => {
        worker.terminate();
        this.initialLayoutPending = false;
        const positions = event.data?.positions;
        if (positions?.length === ids.length) {
          ids.forEach((id, i) => {
            const body = this.layout.bodies.get(id);
            const position = positions[i];
            if (!body || !position?.every(Number.isFinite)) return;
            [body.x, body.y, body.z] = position;
            body.vx = 0; body.vy = 0; body.vz = 0;
          });
          this.layout.alpha = 0;
          this.updateExtent();
          if (!this.rig.userMoved && this.introState === "off") this.rig.overview(this.extentC, this.extentR, true);
        }
        this.dirty = true;
      };
      worker.onerror = () => {
        worker.terminate();
        this.initialLayoutPending = false;
        this.dirty = true;
      };
      worker.postMessage({ ids, pairs });
    } catch {
      // Browsers that block workers still get the progressive frame-loop fallback.
      this.initialLayoutPending = false;
    }
  }

  setView(v: ViewState) {
    if (v.selectedNode && v.selectedNode !== this.view.selectedNode) this.startRipple(v.selectedNode);
    else if (!v.selectedNode) this.ripple = null;
    this.view = v;
    this.dirty = true;
  }

  // ---------- camera helpers ----------

  extent() { return { center: this.extentC, radius: this.extentR }; }

  /**
   * The entrance. While positions are being worked out the camera drifts slowly
   * through the empty space; once they are ready the network grows outward from its
   * most-connected accounts along their links, badges popping in ring by ring,
   * while the camera eases back to the wide view. Any input ends it at once.
   */
  playIntro() {
    if (this.rig.reducedMotion || !this.ids.length) { this.endIntro(); return; }
    this.introState = "waiting";
    this.introS.fill(0);
    this.rig.target.set(this.extentC.x, this.extentC.y, this.extentC.z);
    this.rig.dist = this.extentR * 0.5;
    this.rig.snap();
    this.dirty = true;
    this.prepareIntroAssets();
  }

  /** Wait for fonts and avatar photos (at most 1.5s), then upload every badge to the GPU. */
  private prepareIntroAssets() {
    if (this.introAssetsReady || this.introAssetsPending) return;
    this.introAssetsPending = true;
    const fonts = (document as any).fonts?.ready ?? Promise.resolve();
    const timeout = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.race([Promise.all([fonts, avatarsSettled()]), timeout]).then(() => {
      // Let the font redraw (badges.ts) run first, then push every texture up now,
      // while the screen is still empty, instead of mid-animation.
      setTimeout(() => {
        this.sprites.forEach((sp) => { try { this.renderer.initTexture(sp.material.map); } catch { /* uploads on first draw instead */ } });
        this.introAssetsPending = false;
        this.introAssetsReady = true;
      }, 0);
    });
  }

  /** Show everything at once (used for reduced motion, a restored view, or any input). */
  endIntro() {
    if (this.introState === "off") return;
    this.introState = "off";
    this.introS.fill(1);
    this.dirty = true;
  }

  get introPlaying() { return this.introState !== "off"; }

  private startIntro() {
    const n = this.ids.length;
    // Breadth-first rings outward from the most-connected account of each linked group.
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const e of this.analysis!.drawnEdges) {
      const a = this.index.get(e.source), b = this.index.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      adj[a].push(b); adj[b].push(a);
    }
    const depth = new Int32Array(n).fill(-1);
    const byDeg = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.deg[b] - this.deg[a]);
    let maxD = 1;
    for (const seed of byDeg) {
      if (depth[seed] >= 0) continue;
      depth[seed] = 0;
      const q = [seed];
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        for (const w of adj[u]) if (depth[w] < 0) { depth[w] = depth[u] + 1; maxD = Math.max(maxD, depth[w]); q.push(w); }
      }
    }
    // Spread rings over the first ~1.7s, with a little scatter inside each ring.
    const spread = 1.55;
    this.introAt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const jitter = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      this.introAt[i] = 0.12 + spread * Math.pow(depth[i] / maxD, 0.85) + jitter * 0.18;
    }
    // Camera: from close in, ease back to the wide view with a slight turn.
    // Camera: start on the most-connected account, then ease back to the wide view
    // over the whole map with a slight turn.
    const yaw = this.rig.yaw;
    const seed = this.layout.get(this.ids[byDeg[0]])!;
    const c = this.extentC;
    this.introFrom = { dist: this.extentR * 0.45, yaw: yaw - 0.3, pitch: 0.2, x: seed.x, y: seed.y, z: seed.z };
    this.introTo = { dist: Math.min(this.rig.maxDist, this.extentR * 2.35), yaw, pitch: 0.32, x: c.x, y: c.y, z: c.z };
    this.rig.home.set(c.x, c.y, c.z);
    this.rig.target.set(seed.x, seed.y, seed.z);
    this.rig.dist = this.introFrom.dist;
    this.rig.yaw = this.introFrom.yaw;
    this.rig.pitch = this.introFrom.pitch;
    this.rig.snap();
    this.introT = 0;
    this.introStart = performance.now();
    this.introState = "playing";
    this.dirty = true;
  }

  private stepIntro(dt: number, now: number) {
    if (this.introState === "waiting") {
      // Drift slowly through the empty space while the layout and badges get ready.
      this.rig.yaw += dt * 0.06;
      this.rig.snap();
      this.dirty = true;
      if (!this.initialLayoutPending && this.introAssetsReady) { this.startIntro(); this.introStart = now; }
      return;
    }
    if (this.introState !== "playing") return;
    this.introT = (now - this.introStart) / 1000;
    const T = this.introT;
    const pop = 0.42;
    let all = true;
    for (let i = 0; i < this.ids.length; i++) {
      const u = Math.min(1, Math.max(0, (T - this.introAt[i]) / pop));
      if (u < 1) all = false;
      // Ease-out-back: a small overshoot, so badges arrive like something alive.
      const c1 = 1.9, c3 = c1 + 1;
      this.introS[i] = u <= 0 ? 0 : 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    const k = Math.min(1, T / this.introDur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease-in-out cubic
    const f = this.introFrom, t = this.introTo;
    this.rig.dist = Math.exp(Math.log(f.dist) + (Math.log(t.dist) - Math.log(f.dist)) * e);
    this.rig.yaw = f.yaw + (t.yaw - f.yaw) * e;
    this.rig.pitch = f.pitch + (t.pitch - f.pitch) * e;
    this.rig.target.set(f.x + (t.x - f.x) * e, f.y + (t.y - f.y) * e, f.z + (t.z - f.z) * e);
    // The curve above is the only easing: the camera follows it exactly, with no
    // second soft-follow layered on top.
    this.rig.snap();
    if (all && k >= 1) { this.introState = "off"; this.introS.fill(1); this.driftResumeAt = 0; }
    this.dirty = true;
  }

  /**
   * After the entrance the camera keeps turning slowly around the map, about one
   * turn every 3.5 minutes. Any input stops it at once; it eases back in after 15s
   * of quiet. It stays still while an account or line is selected or hovered,
   * while the tab is hidden, with reduced motion, or when paused.
   */
  private stepDrift(dt: number, now: number) {
    const v = this.view;
    const allowed = this.driftOn && !this.rig.reducedMotion && this.introState === "off" && !this.initialLayoutPending
      && !v.selectedNode && !v.selectedEdge && !this.hoverNode && !this.hoverEdge && !document.hidden
      && now >= this.driftResumeAt && this.keys.size === 0;
    const goal = allowed ? 1 : 0;
    // Ease in over a few seconds; ease out quickly (input already zeroes it).
    const tau = goal > this.driftLevel ? 2.2 : 0.35;
    this.driftLevel += (goal - this.driftLevel) * (1 - Math.exp(-dt / tau));
    if (!goal && this.driftLevel < 0.001) { this.driftLevel = 0; return; }
    // A breathing orbit: the slow turn, plus moving in and out, rising and sinking,
    // and the orbit centre wandering a little, each on its own long cycle so the
    // path never visibly repeats. Applied as small per-frame changes (derivatives of
    // the waves), so it always continues from wherever you left the camera.
    const dτ = dt * this.driftLevel;
    const t = this.driftT;
    this.driftT += dτ;
    const w = (period: number) => (Math.PI * 2) / period;
    // Turn: one revolution about every 3.5 minutes.
    this.rig.yaw += dτ * w(210);
    // In and out: about ×0.68 … ×1.47 of the distance over ~61s, heading in first.
    const wd = w(61);
    this.rig.dist = this.rig.clampDist(this.rig.dist * Math.exp(0.38 * wd * Math.cos(wd * t + Math.PI) * dτ));
    // Rise and sink: about ±16° over ~83s.
    const wp = w(83);
    this.rig.pitch = Math.max(-1.2, Math.min(1.2, this.rig.pitch + 0.28 * wp * Math.cos(wp * t + 1.3) * dτ));

    // Every so often, a deep dive into one cluster.
    if (!this.dive && this.driftT >= this.nextDiveAt && this.driftLevel > 0.95) this.startDive();
    if (this.dive) {
      const d = this.dive;
      const s = this.driftT - d.start;
      // In over 9s, circle close for 7s, back out over 10s.
      const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
      const e = s < 9 ? ease(s / 9) : s < 16 ? 1 : s < 26 ? 1 - ease((s - 16) / 10) : 0;
      this.rig.target.set(d.fx + (d.x - d.fx) * e, d.fy + (d.y - d.fy) * e, d.fz + (d.z - d.fz) * e);
      this.rig.dist = Math.exp(Math.log(d.fdist) + (Math.log(d.close) - Math.log(d.fdist)) * e);
      // A little extra turn while close, so near badges sweep past far ones.
      this.rig.yaw += dτ * w(210) * 2.5 * e;
      if (s >= 26) { this.dive = null; this.nextDiveAt = this.driftT + 110 + 30 * Math.random(); }
      return;
    }
    // Orbit centre wanders up to ~18% of the map's size.
    const a = this.extentR * 0.18;
    const wx = w(97), wy = w(131), wz = w(113);
    this.rig.target.x += a * wx * Math.cos(wx * t + 0.4) * dτ;
    this.rig.target.y += a * 0.6 * wy * Math.cos(wy * t + 2.1) * dτ;
    this.rig.target.z += a * wz * Math.cos(wz * t + 4.0) * dτ;
  }

  /** Pick a well-connected cluster in front of the camera (not the last one) and head for it. */
  private startDive() {
    const cam = this.camera.position;
    const fwd = this.rig.forward();
    const ranked = this.ids.map((id, i) => ({ id, i })).sort((a, b) => this.deg[b.i] - this.deg[a.i]).slice(0, 30);
    const cands = ranked.filter(({ id }) => {
      if (id === this.lastDiveId) return false;
      const p = this.layout.get(id)!;
      return (p.x - cam.x) * fwd.x + (p.y - cam.y) * fwd.y + (p.z - cam.z) * fwd.z > 0;
    });
    const pickFrom = cands.length ? cands : ranked;
    const pick = pickFrom[Math.floor(Math.random() * Math.min(pickFrom.length, 12))];
    if (!pick) { this.nextDiveAt = this.driftT + 60; return; }
    const p = this.layout.get(pick.id)!;
    const t = this.rig.target;
    this.lastDiveId = pick.id;
    // Close enough to pass between badges in the cluster.
    this.dive = { start: this.driftT, fx: t.x, fy: t.y, fz: t.z, fdist: this.rig.dist, x: p.x, y: p.y, z: p.z, close: Math.max(this.rig.minDist * 4, this.extentR * 0.09) };
  }

  /** Called on any direct input: stop drifting now, resume after a quiet spell. */
  private noteInput() {
    // Abandon a dive where it is; the user now has the camera.
    if (this.dive) { this.dive = null; this.nextDiveAt = this.driftT + 60; }
    this.driftLevel = 0;
    this.driftResumeAt = performance.now() + 15000;
  }

  setDrift(on: boolean) {
    this.driftOn = on;
    if (on) this.driftResumeAt = 0;
    this.dirty = true;
  }

  /** How far an edge has inked in: 0…1, growing from the endpoint that appeared first. */
  private edgeInk(ia: number, ib: number) {
    if (this.introState === "off") return 1;
    if (this.introState === "waiting") return 0;
    const ta = this.introAt[ia], tb = this.introAt[ib];
    const t0 = Math.min(ta, tb) + 0.18, span = Math.max(0.3, Math.abs(ta - tb) + 0.12);
    return Math.min(1, Math.max(0, (this.introT - t0) / span));
  }

  overview(instant = false) {
    this.rig.overview(this.extentC, this.extentR, instant || this.rig.reducedMotion);
    this.rig.userMoved = false;
    this.dirty = true;
  }

  focusNode(id: string) {
    const p = this.layout.get(id);
    if (!p || !this.analysis) return;
    let far = 4;
    for (const e of this.analysis.edgesByNode.get(id) ?? []) {
      const o = this.layout.get(e.source === id ? e.target : e.source);
      if (o) far = Math.max(far, Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z));
    }
    this.rig.flyTo(p, Math.min(Math.max(far * 2.4, 14), this.extentR * 1.6));
    this.rig.userMoved = true;
    this.dirty = true;
  }

  focusEdge(e: Edge) {
    const a = this.layout.get(e.source), b = this.layout.get(e.target);
    if (!a || !b) return;
    const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    this.rig.flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, Math.max(len * 2.3, 18));
    this.rig.userMoved = true;
    this.dirty = true;
  }

  setShowNames(on: boolean) { this.showNames = on; this.dirty = true; }

  zoomBy(f: number) { this.rig.zoomAt(f); this.dirty = true; }

  /** 0 = wide view, 1 = deepest. */
  get depth() {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    return 1 - (Math.log(this.rig.currentDist) - lo) / (hi - lo);
  }
  /** Depth value of the default wide view, used to name depth levels. */
  get overviewDepth() {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    return 1 - (Math.log(this.extentR * 2.35) - lo) / (hi - lo);
  }
  setDepth(t: number) {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    this.rig.setDist(Math.exp(hi - t * (hi - lo)));
    this.dirty = true;
  }

  position(id: string): Vec3 | undefined { return this.layout.get(id); }
  get cameraInfo() { return { pos: this.camera.position as Vec3, target: this.rig.currentTarget as Vec3, yaw: this.rig.currentYaw }; }
  nodeIds() { return this.ids; }
  typeOf(id: string) { const i = this.index.get(id); return i === undefined ? undefined : this.nodeType[i]; }
  visibility(id: string) { const i = this.index.get(id); return i === undefined ? 0 : this.visCur[i]; }

  // ---------- frame ----------

  private nodeSize(i: number) { return 0.45 + 0.27 * Math.sqrt(this.deg[i]); }
  private reveal(i: number) {
    const t = Math.log(1 + this.deg[i]) / Math.log(1 + this.maxDeg);
    return this.extentR * (0.9 + 2.6 * Math.pow(t, 1.5));
  }

  private loop(now: number) {
    // Always schedule the next frame first, so one bad frame can never freeze the map.
    requestAnimationFrame((t) => this.loop(t));
    try { this.frame(now); } catch (err) {
      console.error("[map] frame failed", err);
      const el = document.getElementById("toast");
      if (el) { el.hidden = false; el.textContent = `Map error: ${(err as Error)?.message ?? err}`; }
    }
  }

  private frame(now: number) {
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frameN++;

    const fwd = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    const turn = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const rise = (this.keys.has("e") || this.keys.has("pageup") ? 1 : 0) - (this.keys.has("q") || this.keys.has("pagedown") ? 1 : 0);
    if (fwd || turn || rise) this.rig.drive(fwd, turn, rise, dt);
    if (this.keys.has("=") || this.keys.has("+")) this.rig.zoomAt(Math.exp(-dt * 1.6));
    if (this.keys.has("-") || this.keys.has("_")) this.rig.zoomAt(Math.exp(dt * 1.6));

    let layoutMoving = false;
    if (!this.layout.settled && this.ids.length && !this.initialLayoutPending) {
      this.layout.tick(2);
      layoutMoving = true;
      if (this.frameN % 10 === 0 || this.layout.settled) this.updateExtent();
      if (!this.rig.userMoved && this.introState === "off") this.rig.overview(this.extentC, this.extentR);
    }
    this.fxNow = now / 1000;
    if (this.ripple && this.fxNow - this.ripple.start > 1.2) this.ripple = null;
    if (this.ripple) this.dirty = true;
    this.stepIntro(dt, now);
    this.stepDrift(dt, now);
    const camMoving = this.rig.update(dt);
    if (camMoving || layoutMoving || this.dirty || this.pickAt) {
      this.dirty = false;
      const fading = this.updateNodes(dt);
      this.updateEdges();
      if (this.introState === "off" && !this.initialLayoutPending) this.updateLabels();
      else for (const el of this.labelPool) el.style.display = "none";
      if (fading) this.dirty = true;
      if (this.pickAt) { this.hoverPick(this.pickAt.x, this.pickAt.y); this.pickAt = null; }
      const fogD = 0.3 / Math.max(this.rig.currentDist + this.extentR, this.extentR * 2.4);
      this.scene.fog.density = fogD;
      this.glow.material.uniforms.uDensity.value = fogD;
      this.snow.material.uniforms.uCam.value.copy(this.camera.position);
      this.snow.material.uniforms.uAlpha.value = Math.min(1, Math.max(0, (this.extentR * 0.9 - this.rig.currentDist) / (this.extentR * 0.5)));
      // Never show accounts at their temporary starting positions: draw them only
      // once the real layout is in.
      const placed = !this.initialLayoutPending;
      this.nodeGroup.visible = placed;
      this.glow.visible = placed;
      this.edgeGroups.forEach((g) => { g.line.visible = placed; });
      this.renderer.render(this.scene, this.camera);
      if (this.frameN % 4 === 0 || !camMoving) this.cb.onFrame({ depth: this.depth, moving: camMoving, ready: !this.initialLayoutPending });
    }
  }

  private updateExtent() {
    const ex = this.layout.extent();
    this.extentC = ex.center;
    this.extentR = ex.radius;
    this.rig.maxDist = ex.radius * 12;
    this.rig.home.set(ex.center.x, ex.center.y, ex.center.z);
  }

  private updateNodes(dt: number) {
    const v = this.view;
    const cam = this.camera.position;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const k = this.rig.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    const ga = this.glowAttr!;
    let fading = false;
    const pxToWorld = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;

    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const p = this.layout.get(id)!;
      const t = this.nodeType[i];
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      const match = v.nodeMatch(id);
      let target = 1;
      if (v.filtersActive && !match && !forced && v.hideFiltered) target = 0;
      const cur = this.visCur[i] + (target - this.visCur[i]) * k;
      if (Math.abs(target - cur) > 0.003) fading = true;
      this.visCur[i] = cur;

      const dimSel = selActive && !v.focus.has(id);
      const dimFilter = v.filtersActive && !match;
      const minWorld = d * pxToWorld * (dimFilter ? 2.6 : 3.6); // badge never smaller than a few pixels
      const size = Math.max(this.nodeSize(i) * (dimFilter ? 0.6 : 1), minWorld) * cur * (id === v.selectedNode ? 1.3 : 1) * this.introS[i]
        // During the entrance, badges right in front of the camera stay out of the shot.
        * (this.introState === "playing" ? Math.min(1, Math.max(0, (d - this.extentR * 0.1) / (this.extentR * 0.12)))
          // While diving, only badges almost touching the lens fade, so you pass between the rest.
          : this.dive ? Math.min(1, Math.max(0, (d - this.extentR * 0.015) / (this.extentR * 0.03))) : 1);
      const bump = this.rippleBump(i);
      const sp = this.sprites.get(id)!;
      sp.position.set(p.x, p.y, p.z);
      sp.scale.setScalar(Math.max(size * (1 + 0.38 * bump), 0.0001) * 2.3);
      this.dispR[i] = size * (t === "agent" ? 1.05 : 1.12);
      sp.visible = size > 0.001;
      const op = dimFilter ? 0.25 : dimSel ? 0.3 : 1;
      // Badges always sit on top of lines; among themselves they draw back to front.
      sp.material.opacity = op;
      sp.renderOrder = op > 0.9 ? 3 : 2;

      ga.pos[i * 3] = p.x; ga.pos[i * 3 + 1] = p.y; ga.pos[i * 3 + 2] = p.z;
      const isMatch = v.matches.has(id);
      const isSel = id === v.selectedNode;
      const gc = isMatch || isSel ? tmpColor.set(this.pal.select) : tmpColor.set(NODE_STYLE[t].color);
      ga.col[i * 3] = gc.r; ga.col[i * 3 + 1] = gc.g; ga.col[i * 3 + 2] = gc.b;
      const glowSize = Math.max(this.nodeSize(i), d * pxToWorld * 3.2);
      ga.size[i] = glowSize * (isSel ? 7 : 6.5);
      let alpha = 0;
      if (dimSel) alpha *= 0.3;
      if (dimFilter) alpha *= v.hideFiltered ? 0 : 0.3;
      if (isMatch) alpha = 0.35;
      if (isSel) alpha = 0.4;
      if (bump > 0) {
        // The ripple lights each neighbour briefly as it passes.
        alpha = Math.max(alpha, 0.5 * bump);
        tmpColor.set(this.pal.select);
        ga.col[i * 3] = tmpColor.r; ga.col[i * 3 + 1] = tmpColor.g; ga.col[i * 3 + 2] = tmpColor.b;
      }
      ga.alpha[i] = alpha;
    }
    const geo = this.glow.geometry;
    ["position", "color", "size", "alpha"].forEach((a) => geo.attributes[a] && (geo.attributes[a].needsUpdate = true));

    // Selection rings, facing the camera.
    const ringIds = v.selectedEdge ? (() => { const e = this.findEdge(v.selectedEdge!); return e ? [e.source, e.target] : []; })() : v.selectedNode ? [v.selectedNode] : [];
    this.rings.forEach((ring, j) => {
      const id = ringIds[j];
      const i = id !== undefined ? this.index.get(id) : undefined;
      if (i === undefined) { ring.visible = false; return; }
      const p = this.layout.get(id)!;
      ring.visible = true;
      ring.position.set(p.x, p.y, p.z);
      ring.quaternion.copy(this.camera.quaternion);
      ring.scale.setScalar(this.nodeSize(i) * 1.75);
    });
    return fading;
  }

  private findEdge(id: string) { return this.analysis?.drawnEdges.find((e) => e.id === id); }

  private edgeEnds(e: Edge, out: number[], kSeg: number, segs: number, perp: any) {
    const a = this.layout.get(e.source)!, b = this.layout.get(e.target)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-6;
    // Badges draw on top of lines, so lines only need to stop inside the badge, never short of it.
    // Half the radius stays within the badge on screen from any viewing angle, so no gap appears.
    const ra = (this.dispR[this.index.get(e.source)!] ?? 0) * 0.5, rb = (this.dispR[this.index.get(e.target)!] ?? 0) * 0.5;
    let ta = ra / len, tb = 1 - rb / len;
    if (ta >= tb) { ta = tb = 0.5; }
    if (segs === 1) {
      out[0] = a.x + (b.x - a.x) * ta; out[1] = a.y + (b.y - a.y) * ta; out[2] = a.z + (b.z - a.z) * ta;
      out[3] = a.x + (b.x - a.x) * tb; out[4] = a.y + (b.y - a.y) * tb; out[5] = a.z + (b.z - a.z) * tb;
      return;
    }
    const info = this.pairInfo.get(e.id)!;
    const off = (info.k - (info.n - 1) / 2) * Math.min(len * 0.28, 3.2);
    // Keep the curve's sideways direction consistent for the pair, whichever end is "source".
    const sign = e.source < e.target ? 1 : -1;
    const cx = (a.x + b.x) / 2 + perp.x * off * sign, cy = (a.y + b.y) / 2 + perp.y * off * sign, cz = (a.z + b.z) / 2 + perp.z * off * sign;
    const q = (t: number, p0: number, p1: number, p2: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    const t0 = ta + ((tb - ta) * kSeg) / segs, t1 = ta + ((tb - ta) * (kSeg + 1)) / segs;
    out[0] = q(t0, a.x, cx, b.x); out[1] = q(t0, a.y, cy, b.y); out[2] = q(t0, a.z, cz, b.z);
    out[3] = q(t1, a.x, cx, b.x); out[4] = q(t1, a.y, cy, b.y); out[5] = q(t1, a.z, cz, b.z);
  }

  private updateEdges() {
    const v = this.view;
    const cam = this.camera.position;
    const fwd = this.rig.forward();
    const density = this.scene.fog.density;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const ends = [0, 0, 0, 0, 0, 0];
    const perp = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.edgeStrength.clear();
    const dashScale = 160 / Math.max(this.rig.currentDist, 1); // keeps dashes ~10px on screen

    this.edgeGroups.forEach((grp, kind) => {
      const st = EDGE_STYLE[kind];
      tmpColor.set(this.pal.edge[kind] ?? st.color);
      const kr = tmpColor.r, kg = tmpColor.g, kb = tmpColor.b;
      tmpColor.set(this.pal.neutral);
      const nr = tmpColor.r, ng = tmpColor.g, nb = tmpColor.b;
      let o = 0;
      grp.edges.forEach((e, ei) => {
        const ia = this.index.get(e.source)!, ib = this.index.get(e.target)!;
        // Structural links read strongest; the many interaction paths stay lighter until selected.
        const base = kind === "interaction" ? 0.42 : kind === "cluster" ? 0.35 : 0.8;
        const reveal = this.edgeReveal(ia, ib);
        const ink = reveal.ink;
        let s = Math.min(this.visCur[ia], this.visCur[ib]) * base * Math.min(1, ink * 1.6);
        if (v.filtersActive && !v.edgeMatch(e)) s *= v.hideFiltered ? 0 : 0.06;
        // Lines are neutral grey; they take their kind colour only when you are looking at them.
        let colored = !!v.colorKinds && (!v.filtersActive || v.edgeMatch(e));
        if (selActive) {
          const incident = e.id === v.selectedEdge || (v.selectedNode && (e.source === v.selectedNode || e.target === v.selectedNode) && !v.selectedEdge);
          s = incident ? 1 : s * 0.12;
          if (incident) colored = true;
        }
        if (e.id === this.hoverEdge) { s = Math.max(s, 1); colored = true; }
        const cr = colored ? kr : nr, cg = colored ? kg : ng, cb = colored ? kb : nb;
        this.edgeStrength.set(e.id, s);
        const a = this.layout.get(e.source)!, b = this.layout.get(e.target)!;
        dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
        perp.crossVectors(dir, fwd);
        if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0); else perp.normalize();
        const n = grp.segs[ei];
        for (let j = 0; j < n; j++, o++) {
          this.edgeEnds(e, ends, j, n, perp);
          if (ink < 1 && n === 1) {
            // Draw the line out from whichever end appeared first.
            const fromA = reveal.fromA;
            const o0 = fromA ? 0 : 3, o1 = fromA ? 3 : 0;
            for (let c = 0; c < 3; c++) ends[o1 + c] = ends[o0 + c] + (ends[o1 + c] - ends[o0 + c]) * ink;
          }
          let maxF = 0;
          for (let end = 0; end < 2; end++) {
            const px = ends[end * 3] - cam.x, py = ends[end * 3 + 1] - cam.y, pz = ends[end * 3 + 2] - cam.z;
            const dd = Math.sqrt(px * px + py * py + pz * pz);
            const f = s * Math.exp(-Math.pow(density * dd, 2));
            maxF = Math.max(maxF, f);
            grp.col[o * 6 + end * 3] = bgColor.r + (cr - bgColor.r) * f;
            grp.col[o * 6 + end * 3 + 1] = bgColor.g + (cg - bgColor.g) * f;
            grp.col[o * 6 + end * 3 + 2] = bgColor.b + (cb - bgColor.b) * f;
          }
          // A line faded to the background would still paint over nodes; collapse it instead.
          if (maxF < 0.03) for (let c = 3; c < 6; c++) ends[c] = ends[c - 3];
          for (let c = 0; c < 6; c++) grp.pos[o * 6 + c] = ends[c];
        }
      });
      const geom = grp.line.geometry;
      geom.attributes.instanceStart.data.needsUpdate = true;
      geom.attributes.instanceColorStart.data.needsUpdate = true;
      geom.computeBoundingSphere();
      if (st.dashed) { grp.line.computeLineDistances(); grp.line.material.dashScale = dashScale; }
    });

    // Extra-wide underlay for the selected relationship so it stands apart from parallel edges.
    if (this.highlight) { this.scene.remove(this.highlight); this.highlight.geometry.dispose(); this.highlight = null; }
    const sel = v.selectedEdge ? this.findEdge(v.selectedEdge) : null;
    if (sel && this.index.has(sel.source) && this.index.has(sel.target)) {
      const n = (this.pairInfo.get(sel.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1;
      const a = this.layout.get(sel.source)!, b = this.layout.get(sel.target)!;
      dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
      perp.crossVectors(dir, fwd);
      if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0); else perp.normalize();
      const arr = new Float32Array(n * 6);
      for (let j = 0; j < n; j++) { this.edgeEnds(sel, ends, j, n, perp); arr.set(ends, j * 6); }
      const g = new LineSegmentsGeometry();
      g.setPositions(arr);
      const m = new LineMaterial({ color: this.pal.select, linewidth: 5, transparent: true, opacity: 0.28, depthWrite: false, worldUnits: false });
      m.resolution.set(this.width, this.height);
      this.highlight = new LineSegments2(g, m);
      this.highlight.renderOrder = 0;
      this.scene.add(this.highlight);
    }
  }

  private updateLabels() {
    const v = this.view;
    const cam = this.camera.position;
    const W = this.width, H = this.height;
    const proj = new THREE.Vector3();
    const cands: { i: number; x: number; y: number; pri: number; close: boolean }[] = [];
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const vis = this.visCur[i];
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      if (!forced && vis < 0.55) continue;
      if (this.introS[i] < 0.9) continue;
      if (v.filtersActive && !forced && !v.nodeMatch(id)) continue;
      const p = this.layout.get(id)!;
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const rv = this.reveal(i);
      const hub = (this.hubRank.get(id) ?? 99) < 8;
      if (!forced && !this.showNames) continue;
      if (!forced && !hub && d > rv * 0.75) continue;
      proj.set(p.x, p.y, p.z).project(this.camera);
      if (proj.z > 1 || proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;
      const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
      const rpx = (this.nodeSize(i) * H) / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * Math.max(d, 0.1));
      let pri = this.deg[i] * 40 - d * 3;
      if (id === v.selectedNode || id === this.hoverNode) pri = 1e9;
      else if (v.focus.has(id)) pri = 1e8 - d;
      else if (v.matches.has(id)) pri = 1e7 - d;
      cands.push({ i, x: x + Math.max(rpx * 1.15, 4) + 7, y, pri, close: id === v.selectedNode || id === this.hoverNode });
    }
    cands.sort((a, b) => b.pri - a.pri);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    let used = 0;
    for (const c of cands) {
      if (used >= 60) break;
      const node = this.analysis!.nodeById.get(this.ids[c.i])!;
      const name = node.name ?? node.handle ?? node.id;
      const w = Math.min(230, name.length * 7.8 + 22), h = c.close && node.handle ? 38 : 25;
      const box = { x0: c.x, y0: c.y - h / 2, x1: c.x + w, y1: c.y + h / 2 };
      const hit = placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
      if (hit && c.pri < 1e7) continue;
      placed.push(box);
      const el = this.labelEl(used++);
      const id = this.ids[c.i];
      el.dataset.id = id;
      el.className = `lbl t-${this.nodeType[c.i]}${id === v.selectedNode ? " sel" : v.focus.has(id) ? " focus" : v.matches.has(id) ? " match" : ""}`;
      const handle = c.close && node.handle ? `<span class="h">@${escapeHtml(node.handle)}</span>` : "";
      const html = `<span class="n">${escapeHtml(name)}</span>${handle}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.style.transform = `translate(${Math.round(box.x0)}px, ${Math.round(box.y0)}px)`;
      el.style.display = "";
    }
    for (let j = used; j < this.labelPool.length; j++) this.labelPool[j].style.display = "none";
  }

  private labelEl(i: number) {
    while (this.labelPool.length <= i) {
      const b = document.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.addEventListener("click", (ev) => { ev.stopPropagation(); const id = b.dataset.id; if (id) this.cb.onPickNode(id); });
      this.labelLayer.appendChild(b);
      this.labelPool.push(b);
    }
    return this.labelPool[i];
  }

  // ---------- input ----------

  private ndc(x: number, y: number) { return { x: (x / this.width) * 2 - 1, y: -(y / this.height) * 2 + 1 }; }

  private pick(x: number, y: number): { node?: string; edge?: string } {
    const n = this.ndc(x, y);
    this.raycaster.setFromCamera(n, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.sprites.values()), false);
    for (const h of hits) {
      const id = h.object.userData.id as string;
      if (id && this.visibility(id) > 0.2) return { node: id };
    }
    let best: { edge: string; dist: number } | null = null;
    this.edgeGroups.forEach((grp) => {
      const eh = this.raycaster.intersectObject(grp.line, false);
      for (const h of eh) {
        const e = grp.edges[grp.segToEdge[h.faceIndex]];
        if (!e || (this.edgeStrength.get(e.id) ?? 0) < 0.2) continue;
        if (!best || h.distance < best.dist) best = { edge: e.id, dist: h.distance };
      }
    });
    return best ? { edge: (best as { edge: string }).edge } : {};
  }

  private hoverPick(x: number, y: number) {
    const r = this.pick(x, y);
    const node = r.node ?? null, edge = node ? null : r.edge ?? null;
    if (node !== this.hoverNode || edge !== this.hoverEdge) {
      this.hoverNode = node;
      this.hoverEdge = edge;
      this.dirty = true;
    }
    this.canvas.style.cursor = node || edge ? "pointer" : "grab";
    if (node && this.analysis) {
      const nd = this.analysis.nodeById.get(node)!;
      this.showTip(x, y, `<b>${escapeHtml(nd.name ?? nd.id)}</b><span>${NODE_STYLE[nd.type].label}${nd.handle ? ` · @${escapeHtml(nd.handle)}` : ""} · ${this.analysis.degree.get(node) ?? 0} links</span>`);
    } else if (edge && this.analysis) {
      const e = this.findEdge(edge)!;
      const a = this.analysis.nodeById.get(e.source)!, b = this.analysis.nodeById.get(e.target)!;
      this.showTip(x, y, `<b>${EDGE_STYLE[e.kind].label}</b><span>${escapeHtml(a.name ?? a.id)} ${escapeHtml(e.label ?? "")} ${escapeHtml(b.name ?? b.id)}</span>`);
    } else this.tooltip.hidden = true;
  }

  private showTip(x: number, y: number, html: string) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const tx = Math.min(x + 14, this.width - 260);
    this.tooltip.style.transform = `translate(${tx}px, ${y + 16}px)`;
  }

  private bindInput() {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number; button: number }>();
    let downAt: { x: number; y: number } | null = null;
    let moved = 0;
    let pinch: { d: number; cx: number; cy: number } | null = null;
    const local = (e: PointerEvent | WheelEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    c.addEventListener("contextmenu", (e) => e.preventDefault());
    // Any input ends the entrance at once and hands the camera to the user.
    for (const ev of ["pointerdown", "wheel", "keydown"]) c.addEventListener(ev, () => { this.endIntro(); this.noteInput(); }, { capture: true, passive: true });
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, { ...p, button: e.button });
      downAt = p;
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
      c.style.cursor = "grabbing";
      this.tooltip.hidden = true;
    });
    c.addEventListener("pointermove", (e) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) { this.pickAt = p; this.dirty = true; return; }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      pointers.set(e.pointerId, { ...p, button: prev.button });
      if (pointers.size === 2 && pinch) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const n = this.ndc(cx, cy);
        if (d > 0 && pinch.d > 0) this.rig.zoomAt(pinch.d / d, n.x, n.y);
        this.rig.pan(cx - pinch.cx, cy - pinch.cy, this.height);
        pinch = { d, cx, cy };
      } else if (prev.button === 2 || e.shiftKey || prev.button === 1) {
        this.rig.pan(dx, dy, this.height);
      } else {
        this.rig.orbit(dx, dy);
      }
      this.dirty = true;
    });
    const end = (e: PointerEvent) => {
      const p = local(e);
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      c.style.cursor = "grab";
      if (wasSingle && downAt && moved < 6 && e.type === "pointerup") {
        const r = this.pick(p.x, p.y);
        if (r.node) this.cb.onPickNode(r.node);
        else if (r.edge) this.cb.onPickEdge(r.edge);
        else this.cb.onPickNothing();
      }
      downAt = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => { if (!pointers.size) { this.tooltip.hidden = true; this.hoverNode = null; this.hoverEdge = null; this.dirty = true; } });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-300, Math.min(300, e.deltaY * unit));
      const p = local(e);
      const n = this.ndc(p.x, p.y);
      this.rig.zoomAt(Math.exp(delta * (e.ctrlKey ? 0.006 : 0.0014)), n.x, n.y);
      this.dirty = true;
    }, { passive: false });

    const drivingKeys = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", "=", "+", "-", "_"]);
    c.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (drivingKeys.has(k)) { this.keys.add(k); e.preventDefault(); this.dirty = true; }
      else if (k === "home" || k === "0") { this.overview(); e.preventDefault(); }
      else if (k === "escape") this.cb.onEscape();
    });
    c.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    c.addEventListener("blur", () => this.keys.clear());
    c.addEventListener("focus", () => this.cb.onHint("Keyboard: W/S or ↑/↓ drive · A/D or ←/→ turn · Q/E sink/rise · +/− zoom · 0 overview · Esc clear"));
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    const scale = (this.height * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.glow.material.uniforms.uScale.value = scale;
    this.snow.material.uniforms.uScale.value = scale;
    this.edgeGroups.forEach((g) => g.line.material.resolution.set(this.width, this.height));
    this.dirty = true;
  }
}


export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
