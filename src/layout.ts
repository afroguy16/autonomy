// 3D force layout driven only by the edges in the data.
// - Each linked pair pulls together once, however many edge records it has.
// - Accounts with a single link sit close to their one neighbor, so leaves
//   nest inside larger structures and only show up when you get near.
// - Positions persist across data updates (warm start); new accounts are
//   placed next to their existing neighbors, then the layout settles.

export type Vec3 = { x: number; y: number; z: number };
type Body = Vec3 & { vx: number; vy: number; vz: number; deg: number; fixed?: boolean };

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hashPoint(id: string, r: number): Vec3 {
  const h1 = hash(id), h2 = hash(id + "#"), h3 = hash(id + "*");
  const u = (h1 / 4294967296) * 2 - 1;
  const t = (h2 / 4294967296) * Math.PI * 2;
  const rr = r * Math.cbrt(h3 / 4294967296);
  const s = Math.sqrt(1 - u * u);
  return { x: rr * s * Math.cos(t), y: rr * u, z: rr * s * Math.sin(t) };
}

export class ForceLayout {
  bodies = new Map<string, Body>();
  private ids: string[] = [];
  private pairs: [number, number, number][] = []; // a, b, rest length
  alpha = 1;
  readonly baseLength = 7;

  setGraph(nodeIds: string[], pairList: [string, string][]) {
    const degree = new Map<string, number>();
    const neighbors = new Map<string, string[]>();
    for (const [a, b] of pairList) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
      (neighbors.get(a) ?? neighbors.set(a, []).get(a)!).push(b);
      (neighbors.get(b) ?? neighbors.set(b, []).get(b)!).push(a);
    }
    const hadBodies = this.bodies.size > 0;
    const keep = new Set(nodeIds);
    for (const id of Array.from(this.bodies.keys())) if (!keep.has(id)) this.bodies.delete(id);

    // Place new nodes: near already-placed neighbors when possible (repeat so chains of new nodes work).
    const pending = nodeIds.filter((id) => !this.bodies.has(id));
    const spread = Math.max(20, Math.cbrt(nodeIds.length) * 9);
    for (let pass = 0; pass < 4 && pending.length; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const id = pending[i];
        const placed = (neighbors.get(id) ?? []).map((n) => this.bodies.get(n)).filter(Boolean) as Body[];
        if (!placed.length && hadBodies && pass < 3) continue;
        let p: Vec3;
        if (placed.length) {
          const c = placed.reduce((acc, b) => ({ x: acc.x + b.x / placed.length, y: acc.y + b.y / placed.length, z: acc.z + b.z / placed.length }), { x: 0, y: 0, z: 0 });
          const j = hashPoint(id, 3);
          p = { x: c.x + j.x, y: c.y + j.y, z: c.z + j.z };
        } else {
          p = hashPoint(id, spread);
        }
        this.bodies.set(id, { ...p, vx: 0, vy: 0, vz: 0, deg: 0 });
        pending.splice(i, 1);
      }
    }

    this.ids = nodeIds.slice();
    const index = new Map(this.ids.map((id, i) => [id, i]));
    this.ids.forEach((id) => { this.bodies.get(id)!.deg = degree.get(id) ?? 0; });
    this.pairs = pairList
      .filter(([a, b]) => index.has(a) && index.has(b))
      .map(([a, b]) => {
        const da = degree.get(a) ?? 1, db = degree.get(b) ?? 1;
        const leaf = Math.min(da, db) === 1;
        const len = leaf ? this.baseLength * 0.32 : this.baseLength * (0.8 + 0.12 * Math.log2(da + db));
        return [index.get(a)!, index.get(b)!, len];
      });
    this.alpha = hadBodies ? Math.max(this.alpha, 0.25) : 1;
  }

  get settled() { return this.alpha < 0.004; }

  tick(steps = 1) {
    const list = this.ids.map((id) => this.bodies.get(id)!);
    const n = list.length;
    for (let s = 0; s < steps && !this.settled; s++) {
      const a = this.alpha;
      // Repulsion (O(n²) – fine for a few thousand nodes in a prototype).
      for (let i = 0; i < n; i++) {
        const bi = list[i];
        const qi = bi.deg <= 1 ? 0.18 : 1 + Math.log2(bi.deg) * 0.35;
        for (let j = i + 1; j < n; j++) {
          const bj = list[j];
          const qj = bj.deg <= 1 ? 0.18 : 1 + Math.log2(bj.deg) * 0.35;
          let dx = bi.x - bj.x, dy = bi.y - bj.y, dz = bi.z - bj.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) { dx = (Math.random() - 0.5) * 0.1; dy = 0.05; dz = 0; d2 = 0.01; }
          if (d2 > 6400) continue;
          const f = (14 * qi * qj * a) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
          bi.vx += fx; bi.vy += fy; bi.vz += fz;
          bj.vx -= fx; bj.vy -= fy; bj.vz -= fz;
        }
      }
      // Springs, one per linked pair.
      for (const [ia, ib, len] of this.pairs) {
        const A = list[ia], B = list[ib];
        const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const k = 0.2 * a * (d - len) / d;
        const wa = B.deg / (A.deg + B.deg), wb = A.deg / (A.deg + B.deg); // leaves move more than hubs
        A.vx += dx * k * wa; A.vy += dy * k * wa; A.vz += dz * k * wa;
        B.vx -= dx * k * wb; B.vy -= dy * k * wb; B.vz -= dz * k * wb;
      }
      // Gentle pull to the center so separate components don't drift away.
      for (const b of list) {
        b.vx -= b.x * 0.004 * a; b.vy -= b.y * 0.004 * a; b.vz -= b.z * 0.004 * a;
        b.vx *= 0.55; b.vy *= 0.55; b.vz *= 0.55;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (sp > 3) { b.vx *= 3 / sp; b.vy *= 3 / sp; b.vz *= 3 / sp; }
        b.x += b.vx; b.y += b.vy; b.z += b.vz;
      }
      this.alpha *= 0.985;
    }
  }

  /** Radius containing ~95% of nodes, measured from the centroid. */
  extent(): { center: Vec3; radius: number } {
    const list = this.ids.map((id) => this.bodies.get(id)!);
    if (!list.length) return { center: { x: 0, y: 0, z: 0 }, radius: 10 };
    const c = { x: 0, y: 0, z: 0 };
    list.forEach((b) => { c.x += b.x / list.length; c.y += b.y / list.length; c.z += b.z / list.length; });
    const ds = list.map((b) => Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z)).sort((p, q) => p - q);
    return { center: c, radius: Math.max(8, ds[Math.floor(ds.length * 0.95)] ?? 10) };
  }

  get(id: string): Vec3 | undefined { return this.bodies.get(id); }
}
