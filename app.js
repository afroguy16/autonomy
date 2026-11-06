// src/types.ts
var NODE_TYPES = ["person", "organization", "agent"];
var EDGE_KINDS = ["interaction", "affiliation", "built", "collaboration", "shared_topic"];

// src/normalize.ts
var TYPE_ALIASES = {
  person: "person",
  human: "person",
  people: "person",
  organization: "organization",
  org: "organization",
  organisation: "organization",
  company: "organization",
  agent: "agent",
  bot: "agent"
};
function normalizeGraph(raw) {
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((s) => s && s.id && s.url).map((s) => ({
    id: String(s.id),
    url: String(s.url),
    title: s.title,
    publisher: s.publisher,
    date: s.date,
    accessed: s.accessed ?? s.retrievedAt
  })) : [];
  const byUrl = new Map(sources.map((s) => [s.url, s.id]));
  let urlN = 0;
  const sourceIdForUrl = (url) => {
    let id = byUrl.get(url);
    if (!id) {
      id = `src-url-${++urlN}`;
      while (sources.some((s) => s.id === id)) id = `src-url-${++urlN}`;
      sources.push({ id, url });
      byUrl.set(url, id);
    }
    return id;
  };
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter(Boolean).map((n) => {
    const handle = n.handle ? String(n.handle).replace(/^@/, "") : void 0;
    const id = String(n.id ?? handle ?? "").replace(/^@/, "");
    const type = TYPE_ALIASES[String(n.type ?? "").toLowerCase()] ?? "person";
    const profileUrl = typeof n.url === "string" ? n.url : null;
    const profiles = {
      x: n.profiles?.x ?? n.x ?? (profileUrl && /(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com)\//i.test(profileUrl) ? profileUrl : null),
      linkedin: n.profiles?.linkedin ?? n.linkedin ?? (profileUrl && /(?:^|\/\/)(?:www\.)?linkedin\.com\//i.test(profileUrl) ? profileUrl : null)
    };
    const rawNote = n.note && typeof n.note === "object" ? n.note.text : typeof n.note === "string" ? n.note : void 0;
    const noteSourceIds = Array.isArray(n.note?.sourceIds) ? n.note.sourceIds : Array.isArray(n.note_source_ids) ? n.note_source_ids : [];
    return {
      id,
      type,
      handle,
      name: n.name ?? n.label ?? void 0,
      profiles,
      avatarUrl: n.avatarUrl,
      summary: n.summary,
      notes: n.notes ?? rawNote ?? "",
      note_source_ids: [...new Set(noteSourceIds)],
      primary_topic: n.primary_topic,
      topics: Array.isArray(n.topics) ? n.topics : [],
      projects: Array.isArray(n.projects) ? n.projects.map((p, i) => ({ id: String(p.id ?? `${id}-project-${i}`), name: String(p.name ?? "Untitled project"), description: p.description, url: p.url, source_ids: p.source_ids ?? [] })) : [],
      claims: Array.isArray(n.claims) ? n.claims : [],
      incomplete: n.incomplete ? true : void 0,
      missing: Array.isArray(n.missing) ? n.missing : void 0
    };
  }).filter((n) => n.id);
  let edgeN = 0;
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).filter(Boolean).map((e) => {
    const evidenceUrls = Array.isArray(e.evidence) ? e.evidence : typeof e.evidence === "string" ? [e.evidence] : [];
    const source = String(e.source ?? e.from ?? "").replace(/^@/, "");
    const target = String(e.target ?? e.to ?? "").replace(/^@/, "");
    const sourceIds = e.source_ids ?? e.sourceIds ?? [];
    const rawKind = String(e.kind ?? e.type ?? "interaction");
    return {
      id: String(e.id ?? `edge-${++edgeN}-${source}-${target}`),
      source,
      target,
      kind: rawKind === "engagement" ? "interaction" : rawKind,
      label: e.label,
      detail: e.detail ?? null,
      period: e.period ?? null,
      project_id: e.project_id,
      topic_ids: e.topic_ids,
      source_ids: [.../* @__PURE__ */ new Set([...sourceIds, ...evidenceUrls.map(sourceIdForUrl)])],
      incomplete: e.incomplete ? true : void 0,
      missing: Array.isArray(e.missing) ? e.missing : void 0,
      pendingDefinition: e.pendingDefinition ? true : void 0
    };
  });
  return {
    meta: {
      name: raw.meta?.name ?? "Untitled map",
      version: raw.meta?.version ?? 1,
      updated: raw.meta?.updated ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      is_sample: raw.meta?.is_sample ?? false,
      legend: raw.meta?.legend
    },
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    sources,
    nodes,
    edges
  };
}
function mergeGraph(base, add) {
  const byId = (a, b = []) => {
    const m = new Map(a.map((x) => [x.id, x]));
    b.forEach((x) => m.set(x.id, x));
    return Array.from(m.values());
  };
  return {
    meta: { ...base.meta, ...add.meta ?? {}, updated: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) },
    topics: byId(base.topics, add.topics),
    sources: byId(base.sources, add.sources),
    nodes: byId(base.nodes, add.nodes),
    edges: byId(base.edges, add.edges)
  };
}
function profileProblem(n) {
  if (n.type === "agent" || n.type === "organization") {
    return n.profiles?.x ? null : `${n.type === "agent" ? "Agents" : "Organizations"} need a public X profile`;
  }
  return n.profiles?.x || n.profiles?.linkedin ? null : "People need a public X or LinkedIn profile";
}
function analyze(g) {
  const issues = [];
  const nodeById = /* @__PURE__ */ new Map();
  for (const n of g.nodes) {
    if (nodeById.has(n.id)) issues.push({ level: "warning", code: "dup-node", message: `Duplicate node id "${n.id}"; the later record wins.`, ids: [n.id] });
    nodeById.set(n.id, n);
  }
  const sourceById = new Map(g.sources.map((s) => [s.id, s]));
  const topicLabel = new Map(g.topics.map((t) => [t.id, t.label]));
  const ineligible = /* @__PURE__ */ new Map();
  for (const n of nodeById.values()) {
    if (n.incomplete) {
      const missingFields = n.missing?.length ? n.missing.join(", ") : "required research fields";
      ineligible.set(n.id, `Research record is incomplete: ${missingFields}`);
      issues.push({ level: "warning", code: "incomplete-node", message: `${n.name ?? n.id} is incomplete (${missingFields}); not drawn.`, ids: [n.id] });
    }
    const p = profileProblem(n);
    if (p) {
      ineligible.set(n.id, p);
      issues.push({ level: "error", code: "profile", message: `${n.name ?? n.id}: ${p}. Not drawn.`, ids: [n.id] });
    }
    const missing = [...n.note_source_ids, ...n.claims.flatMap((c) => c.source_ids), ...n.projects.flatMap((p2) => p2.source_ids)].filter((s) => !sourceById.has(s));
    if (missing.length) {
      issues.push({ level: "warning", code: "missing-source", message: `${n.name ?? n.id} cites unknown source ${missing.join(", ")}.`, ids: [n.id] });
      if (n.note_source_ids.some((id) => missing.includes(id))) ineligible.set(n.id, "Its researcher note cites a source that is missing from the source catalog");
    }
    if (!n.notes.trim()) {
      issues.push({ level: "warning", code: "no-note", message: `${n.name ?? n.id} has no researcher note.`, ids: [n.id] });
      ineligible.set(n.id, "No researcher note is recorded");
    }
    if (!n.note_source_ids.length) {
      issues.push({ level: "warning", code: "no-note-source", message: `${n.name ?? n.id} has no source attached to its researcher note.`, ids: [n.id] });
      ineligible.set(n.id, "No source is attached to its researcher note");
    }
    n.topics.filter((t) => !topicLabel.has(t)).forEach((t) => issues.push({ level: "info", code: "unknown-topic", message: `${n.name ?? n.id} uses topic "${t}", which is not in the topic list.`, ids: [n.id] }));
  }
  const drawnEdges = [];
  const incompleteEdges = [];
  const undefinedEdges = [];
  const seenEdgeIds = /* @__PURE__ */ new Set();
  for (const e of g.edges) {
    if (seenEdgeIds.has(e.id)) issues.push({ level: "warning", code: "dup-edge", message: `Duplicate edge id "${e.id}".`, ids: [e.id] });
    seenEdgeIds.add(e.id);
    if (!EDGE_KINDS.includes(e.kind)) {
      issues.push({ level: "error", code: "kind", message: `Edge ${e.id} has unknown kind "${e.kind}". Not drawn.`, ids: [e.id] });
      continue;
    }
    if (e.source === e.target) {
      issues.push({ level: "warning", code: "self", message: `Edge ${e.id} links ${e.source} to itself. Not drawn.`, ids: [e.id] });
      continue;
    }
    const missingEnd = [e.source, e.target].filter((id) => !nodeById.has(id));
    if (missingEnd.length) {
      issues.push({ level: "error", code: "dangling", message: `Edge ${e.id} points to missing account ${missingEnd.map((m) => `"${m}"`).join(" and ")}. Not drawn.`, ids: [e.id] });
      continue;
    }
    if (ineligible.has(e.source) || ineligible.has(e.target)) continue;
    const badSrc = e.source_ids.filter((s) => !sourceById.has(s));
    if (badSrc.length) issues.push({ level: "warning", code: "missing-source", message: `Edge ${e.id} cites unknown source ${badSrc.join(", ")}.`, ids: [e.id] });
    if (e.pendingDefinition || e.kind === "cluster" || e.kind === "bridge") {
      undefinedEdges.push(e);
      continue;
    }
    if (e.incomplete || (e.kind === "interaction" || e.kind === "affiliation") && (!e.source_ids.length || e.kind === "affiliation" && !e.detail?.trim())) {
      incompleteEdges.push(e);
      continue;
    }
    if (e.kind !== "shared_topic" && e.source_ids.length === 0) {
      issues.push({ level: "warning", code: "no-source", message: `Edge ${e.id} (${e.kind}) has no source and is not drawn.`, ids: [e.id] });
      continue;
    }
    drawnEdges.push(e);
  }
  const byKindAndMissing = /* @__PURE__ */ new Map();
  for (const e of incompleteEdges) {
    const key = `${e.kind}:${(e.missing ?? []).join(",") || "incomplete"}`;
    if (!byKindAndMissing.has(key)) byKindAndMissing.set(key, []);
    byKindAndMissing.get(key).push(e);
  }
  for (const [key, records] of byKindAndMissing) {
    const [kind, missing] = key.split(":");
    issues.push({ level: "warning", code: "incomplete-edge", message: `${records.length} ${kind} record${records.length === 1 ? " is" : "s are"} incomplete (${missing}); kept in data, not drawn.`, ids: records.map((e) => e.id) });
  }
  if (undefinedEdges.length) {
    const byKind = /* @__PURE__ */ new Map();
    for (const e of undefinedEdges) {
      if (!byKind.has(e.kind)) byKind.set(e.kind, []);
      byKind.get(e.kind).push(e);
    }
    for (const [kind, records] of byKind) issues.push({ level: "info", code: `undefined-${kind}`, message: `${records.length} ${kind} record${records.length === 1 ? " is" : "s are"} preserved but not drawn until its meaning is defined.`, ids: records.map((e) => e.id) });
  }
  const degree = /* @__PURE__ */ new Map();
  const edgesByNode = /* @__PURE__ */ new Map();
  for (const e of drawnEdges) {
    for (const id of [e.source, e.target]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id).push(e);
    }
  }
  const mapNodeIds = Array.from(nodeById.keys()).filter((id) => (degree.get(id) ?? 0) > 0);
  const offMap = [];
  const drawnIds = new Set(drawnEdges.map((e) => e.id));
  for (const n of nodeById.values()) {
    if (degree.get(n.id)) continue;
    const held = g.edges.filter((e) => (e.source === n.id || e.target === n.id) && !drawnIds.has(e.id));
    const heldKinds = [...new Set(held.map((e) => e.incomplete ? "incomplete connection" : "undefined connection"))];
    const heldReason = held.length ? `${held.length} ${heldKinds.join(" / ")} record${held.length === 1 ? " is" : "s are"} kept in the data but not drawn` : "No connections to other accounts on the map";
    offMap.push({ id: n.id, reason: ineligible.get(n.id) ?? heldReason });
  }
  const isolatedOnly = offMap.filter((o) => !ineligible.has(o.id));
  if (isolatedOnly.length) issues.push({ level: "info", code: "isolated", message: `${isolatedOnly.length} account${isolatedOnly.length > 1 ? "s have" : " has"} no connections. Kept in the data, not drawn on the map.`, ids: isolatedOnly.map((o) => o.id) });
  return { nodeById, sourceById, topicLabel, drawnEdges, mapNodeIds, offMap, degree, edgesByNode, issues };
}

// src/scene.ts
import * as THREE3 from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// src/badges.ts
import * as THREE from "three";

// src/theme.ts
var BG = 16514041;
var NODE_STYLE = {
  person: { color: 3900150, css: "#3B82F6", label: "Person", shape: "Circle" },
  organization: { color: 9133302, css: "#8B5CF6", label: "Organization", shape: "Rounded square" },
  agent: { color: 16347926, css: "#F97316", label: "Agent", shape: "Diamond" }
};
var EDGE_STYLE = {
  affiliation: { color: 4937059, css: "#4B5563", width: 1, dashed: false, dash: 0, gap: 0, label: "Affiliation", means: "A sourced relationship such as working at the same company or on the same project." },
  built: { color: 11817737, css: "#B45309", width: 1, dashed: false, dash: 0, gap: 0, label: "Built / operates", means: "Made or runs this agent or project \u2014 sourced." },
  collaboration: { color: 1409085, css: "#15803D", width: 1, dashed: false, dash: 0, gap: 0, label: "Collaboration", means: "Sourced joint work, such as a co-built project or paper." },
  interaction: { color: 947344, css: "#0E7490", width: 1, dashed: true, dash: 1.2, gap: 0.8, label: "Interaction", means: "A reply or quote on X that led the research to this account. It records a discovery path, not collaboration." },
  shared_topic: { color: 12458077, css: "#BE185D", width: 1, dashed: true, dash: 0.35, gap: 0.8, label: "Shared topic", means: "Both work in the same area. No direct relationship is claimed." },
  cluster: { color: 10265519, css: "#9CA3AF", width: 1, dashed: false, dash: 0, gap: 0, label: "Cluster (undefined)", means: "Kept in the data. Its meaning has not been defined, so it is not drawn." },
  bridge: { color: 10265519, css: "#9CA3AF", width: 1, dashed: true, dash: 1, gap: 1, label: "Bridge (undefined)", means: "Kept in the research data. Its meaning for this map has not been defined, so it is not drawn." }
};
var SELECT_COLOR = 6187730;
var NEUTRAL_EDGE = 10725552;

// src/badges.ts
var S = 128;
var pendingAvatars = /* @__PURE__ */ new Set();
var avatarWaiters = [];
function avatarsSettled() {
  return pendingAvatars.size ? new Promise((r) => avatarWaiters.push(r)) : Promise.resolve();
}
function initials(n) {
  const name = (n.name ?? n.handle ?? n.id).replace(/^@/, "");
  const parts = name.split(/[\s\-_.]+/).filter(Boolean);
  const chars = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}
function shapePath(ctx, type, inset) {
  ctx.beginPath();
  if (type === "person") {
    ctx.arc(S / 2, S / 2, S / 2 - inset, 0, Math.PI * 2);
  } else if (type === "organization") {
    const r = 22 - inset / 2, x = inset + 6, w = S - 2 * (inset + 6);
    ctx.moveTo(x + r, x);
    ctx.arcTo(x + w, x, x + w, x + w, r);
    ctx.arcTo(x + w, x + w, x, x + w, r);
    ctx.arcTo(x, x + w, x, x, r);
    ctx.arcTo(x, x, x + w, x, r);
  } else {
    ctx.moveTo(S / 2, inset);
    ctx.lineTo(S - inset, S / 2);
    ctx.lineTo(S / 2, S - inset);
    ctx.lineTo(inset, S / 2);
  }
  ctx.closePath();
}
function draw(ctx, n, img) {
  const style = NODE_STYLE[n.type];
  ctx.clearRect(0, 0, S, S);
  shapePath(ctx, n.type, 4);
  ctx.fillStyle = style.css;
  ctx.fill();
  shapePath(ctx, n.type, n.type === "agent" ? 19 : 16);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (img) {
    ctx.save();
    shapePath(ctx, n.type, n.type === "agent" ? 21 : 18);
    ctx.clip();
    const scale = Math.max(S / img.width, S / img.height);
    ctx.drawImage(img, (S - img.width * scale) / 2, (S - img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#2b2f36";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${n.type === "agent" ? 30 : 40}px Inter, system-ui, sans-serif`;
  ctx.fillText(initials(n), S / 2, S / 2 + 2);
}
function makeBadge(n) {
  const canvas = document.createElement("canvas");
  canvas.width = S * 2;
  canvas.height = S * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  draw(ctx, n, null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (n.avatarUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    pendingAvatars.add(img);
    const settle = () => {
      pendingAvatars.delete(img);
      if (!pendingAvatars.size) avatarWaiters.splice(0).forEach((r) => r());
    };
    img.onload = () => {
      draw(ctx, n, img);
      tex.needsUpdate = true;
      settle();
    };
    img.onerror = settle;
    img.src = n.avatarUrl;
  }
  document.fonts?.ready?.then(() => {
    if (!n.avatarUrl) {
      draw(ctx, n, null);
      tex.needsUpdate = true;
    }
  });
  return tex;
}
var badgeKey = (n) => `${n.type}|${n.name ?? ""}|${n.handle ?? ""}|${n.avatarUrl ?? ""}`;

// src/camera.ts
import * as THREE2 from "three";
var CameraRig = class {
  constructor(camera) {
    this.target = new THREE2.Vector3();
    /** Centre of the whole map; zooming out drifts back toward it. */
    this.home = new THREE2.Vector3();
    this.dist = 120;
    this.yaw = 0.7;
    this.pitch = 0.32;
    this.cTarget = new THREE2.Vector3();
    this.cDist = 120;
    this.cYaw = 0.7;
    this.cPitch = 0.32;
    this.minDist = 0.35;
    this.maxDist = 600;
    this.reducedMotion = false;
    /** Set when the user has moved the camera themselves. */
    this.userMoved = false;
    this.camera = camera;
  }
  offset(dist, yaw, pitch) {
    return new THREE2.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)).multiplyScalar(dist);
  }
  /** Position the desired state would put the camera at. */
  desiredPosition() {
    return this.target.clone().add(this.offset(this.dist, this.yaw, this.pitch));
  }
  forward() {
    return this.offset(1, this.cYaw, this.cPitch).negate();
  }
  update(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.cTarget.lerp(this.target, k);
    this.cDist = Math.exp(Math.log(this.cDist) + (Math.log(this.dist) - Math.log(this.cDist)) * k);
    let dy = this.yaw - this.cYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.cYaw += dy * k;
    this.cPitch += (this.pitch - this.cPitch) * k;
    this.camera.position.copy(this.cTarget).add(this.offset(this.cDist, this.cYaw, this.cPitch));
    this.camera.lookAt(this.cTarget);
    const moving = this.cTarget.distanceToSquared(this.target) > 1e-6 || Math.abs(this.cDist - this.dist) > 1e-4 * this.dist || Math.abs(dy) > 1e-5 || Math.abs(this.pitch - this.cPitch) > 1e-5;
    return moving;
  }
  get currentDist() {
    return this.cDist;
  }
  get currentTarget() {
    return this.cTarget;
  }
  get currentYaw() {
    return this.cYaw;
  }
  clampDist(d) {
    return Math.min(this.maxDist, Math.max(this.minDist, d));
  }
  orbit(dx, dy) {
    this.yaw -= dx * 5e-3;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 5e-3));
    this.userMoved = true;
  }
  pan(dx, dy, viewportH) {
    const scale = this.dist * 2 * Math.tan(this.camera.fov * Math.PI / 360) / viewportH;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    const right = new THREE2.Vector3().crossVectors(fwd, new THREE2.Vector3(0, 1, 0)).normalize();
    const up = new THREE2.Vector3().crossVectors(right, fwd).normalize();
    this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    this.userMoved = true;
  }
  /** factor < 1 zooms in. ndc is the cursor position in normalized device coords. */
  zoomAt(factor, ndcX = 0, ndcY = 0) {
    if (factor < 1 && this.dist * factor < this.minDist) {
      const cam2 = this.camera.clone();
      cam2.position.copy(this.desiredPosition());
      cam2.lookAt(this.target);
      cam2.updateMatrixWorld();
      const dir2 = new THREE2.Vector3(ndcX, ndcY, 0.5).unproject(cam2).sub(cam2.position).normalize();
      this.target.addScaledVector(dir2, Math.max(0.6, this.minDist * 6) * (1 - factor) * 4);
      this.dist = this.minDist;
      this.userMoved = true;
      return;
    }
    const newDist = this.clampDist(this.dist * factor);
    const f = newDist / this.dist;
    if (Math.abs(1 - f) < 1e-6) return;
    const cam = this.camera.clone();
    cam.position.copy(this.desiredPosition());
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    const dir = new THREE2.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    if (f < 1) {
      const p = cam.position.clone().addScaledVector(dir, this.dist);
      this.target.add(p.sub(this.target).multiplyScalar(1 - f));
    } else {
      const span = this.maxDist - this.dist;
      const k = span > 1e-6 ? Math.min(1, (newDist - this.dist) / span) : 1;
      this.target.lerp(this.home, k);
    }
    this.dist = newDist;
    this.userMoved = true;
  }
  setDist(d) {
    this.dist = this.clampDist(d);
    this.userMoved = true;
  }
  /** Driving: forward/back along the view, turn left/right, rise/sink. Units per second. */
  drive(forward, turn, rise, dt) {
    if (!forward && !turn && !rise) return;
    const speed = Math.max(this.dist, 3) * 0.9 * dt;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    this.target.addScaledVector(fwd, forward * speed);
    this.target.y += rise * speed;
    this.yaw -= turn * 1.4 * dt;
    this.userMoved = true;
  }
  flyTo(point, dist) {
    this.target.set(point.x, point.y, point.z);
    if (dist !== void 0) this.dist = this.clampDist(dist);
  }
  overview(center, radius, instant = false) {
    this.home.set(center.x, center.y, center.z);
    this.target.set(center.x, center.y, center.z);
    this.dist = this.clampDist(radius * 2.35);
    this.pitch = 0.32;
    if (instant) this.snap();
  }
  getState() {
    return { target: [this.target.x, this.target.y, this.target.z], dist: this.dist, yaw: this.yaw, pitch: this.pitch };
  }
  setState(v) {
    if (!v || v.target?.length !== 3 || ![v.dist, v.yaw, v.pitch, ...v.target].every(Number.isFinite)) return false;
    this.target.set(v.target[0], v.target[1], v.target[2]);
    this.dist = this.clampDist(v.dist);
    this.yaw = v.yaw;
    this.pitch = Math.max(-1.45, Math.min(1.45, v.pitch));
    this.userMoved = true;
    this.snap();
    return true;
  }
  snap() {
    this.cTarget.copy(this.target);
    this.cDist = this.dist;
    this.cYaw = this.yaw;
    this.cPitch = this.pitch;
  }
};

// src/layout.ts
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function hashPoint(id, r) {
  const h1 = hash(id), h2 = hash(id + "#"), h3 = hash(id + "*");
  const u = h1 / 4294967296 * 2 - 1;
  const t = h2 / 4294967296 * Math.PI * 2;
  const rr = r * Math.cbrt(h3 / 4294967296);
  const s = Math.sqrt(1 - u * u);
  return { x: rr * s * Math.cos(t), y: rr * u, z: rr * s * Math.sin(t) };
}
var ForceLayout = class {
  constructor() {
    this.bodies = /* @__PURE__ */ new Map();
    this.ids = [];
    this.pairs = [];
    // a, b, rest length
    this.alpha = 1;
    this.baseLength = 7;
  }
  setGraph(nodeIds, pairList) {
    const degree = /* @__PURE__ */ new Map();
    const neighbors = /* @__PURE__ */ new Map();
    for (const [a, b] of pairList) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
      (neighbors.get(a) ?? neighbors.set(a, []).get(a)).push(b);
      (neighbors.get(b) ?? neighbors.set(b, []).get(b)).push(a);
    }
    const hadBodies = this.bodies.size > 0;
    const keep = new Set(nodeIds);
    for (const id of Array.from(this.bodies.keys())) if (!keep.has(id)) this.bodies.delete(id);
    const pending = nodeIds.filter((id) => !this.bodies.has(id));
    const spread = Math.max(20, Math.cbrt(nodeIds.length) * 9);
    for (let pass = 0; pass < 4 && pending.length; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const id = pending[i];
        const placed = (neighbors.get(id) ?? []).map((n) => this.bodies.get(n)).filter(Boolean);
        if (!placed.length && hadBodies && pass < 3) continue;
        let p;
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
    this.ids.forEach((id) => {
      this.bodies.get(id).deg = degree.get(id) ?? 0;
    });
    this.pairs = pairList.filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b]) => {
      const da = degree.get(a) ?? 1, db = degree.get(b) ?? 1;
      const leaf = Math.min(da, db) === 1;
      const len = leaf ? this.baseLength * 0.32 : this.baseLength * (0.8 + 0.12 * Math.log2(da + db));
      return [index.get(a), index.get(b), len];
    });
    this.alpha = hadBodies ? Math.max(this.alpha, 0.25) : 1;
  }
  get settled() {
    return this.alpha < 4e-3;
  }
  tick(steps = 1) {
    const list = this.ids.map((id) => this.bodies.get(id));
    const n = list.length;
    for (let s = 0; s < steps && !this.settled; s++) {
      const a = this.alpha;
      for (let i = 0; i < n; i++) {
        const bi = list[i];
        const qi = bi.deg <= 1 ? 0.18 : 1 + Math.log2(bi.deg) * 0.35;
        for (let j = i + 1; j < n; j++) {
          const bj = list[j];
          const qj = bj.deg <= 1 ? 0.18 : 1 + Math.log2(bj.deg) * 0.35;
          let dx = bi.x - bj.x, dy = bi.y - bj.y, dz = bi.z - bj.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 0.1;
            dy = 0.05;
            dz = 0;
            d2 = 0.01;
          }
          if (d2 > 6400) continue;
          const f = 14 * qi * qj * a / d2;
          const d = Math.sqrt(d2);
          const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
          bi.vx += fx;
          bi.vy += fy;
          bi.vz += fz;
          bj.vx -= fx;
          bj.vy -= fy;
          bj.vz -= fz;
        }
      }
      for (const [ia, ib, len] of this.pairs) {
        const A2 = list[ia], B = list[ib];
        const dx = B.x - A2.x, dy = B.y - A2.y, dz = B.z - A2.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
        const k = 0.2 * a * (d - len) / d;
        const wa = B.deg / (A2.deg + B.deg), wb = A2.deg / (A2.deg + B.deg);
        A2.vx += dx * k * wa;
        A2.vy += dy * k * wa;
        A2.vz += dz * k * wa;
        B.vx -= dx * k * wb;
        B.vy -= dy * k * wb;
        B.vz -= dz * k * wb;
      }
      for (const b of list) {
        b.vx -= b.x * 4e-3 * a;
        b.vy -= b.y * 4e-3 * a;
        b.vz -= b.z * 4e-3 * a;
        b.vx *= 0.55;
        b.vy *= 0.55;
        b.vz *= 0.55;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (sp > 3) {
          b.vx *= 3 / sp;
          b.vy *= 3 / sp;
          b.vz *= 3 / sp;
        }
        b.x += b.vx;
        b.y += b.vy;
        b.z += b.vz;
      }
      this.alpha *= 0.985;
    }
  }
  /** Geometric center and radius of the full node cloud, so the overview can frame every account. */
  extent() {
    const list = this.ids.map((id) => this.bodies.get(id));
    if (!list.length) return { center: { x: 0, y: 0, z: 0 }, radius: 10 };
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const b of list) {
      lo.x = Math.min(lo.x, b.x);
      lo.y = Math.min(lo.y, b.y);
      lo.z = Math.min(lo.z, b.z);
      hi.x = Math.max(hi.x, b.x);
      hi.y = Math.max(hi.y, b.y);
      hi.z = Math.max(hi.z, b.z);
    }
    const center = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
    const radius = Math.max(...list.map((b) => Math.hypot(b.x - center.x, b.y - center.y, b.z - center.z)));
    return { center, radius: Math.max(8, radius) };
  }
  get(id) {
    return this.bodies.get(id);
  }
};

// src/scene.ts
var SEGS_CURVED = 8;
var tmpColor = new THREE3.Color();
var bgColor = new THREE3.Color(BG);
var vertGlow = `
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
var fragGlow = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r); a = a * a;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;
var vertSnow = `
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
var fragSnow = `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vA * 0.45;
  gl_FragColor = vec4(vec3(0.45, 0.52, 0.62), a);
}`;
var MapScene = class {
  constructor(_container, canvas, labelLayer, tooltip, cb) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.tooltip = tooltip;
    this.cb = cb;
    this.layout = new ForceLayout();
    this.raycaster = new THREE3.Raycaster();
    this.sprites = /* @__PURE__ */ new Map();
    this.nodeGroup = new THREE3.Group();
    this.glowAttr = null;
    this.edgeGroups = /* @__PURE__ */ new Map();
    this.highlight = null;
    this.rings = [];
    this.labelPool = [];
    this.analysis = null;
    this.ids = [];
    this.index = /* @__PURE__ */ new Map();
    this.nodeType = [];
    this.deg = [];
    this.visCur = new Float32Array(0);
    /** Drawn badge radius per account, so lines can stop at the badge edge. */
    this.dispR = new Float32Array(0);
    this.hubRank = /* @__PURE__ */ new Map();
    this.maxDeg = 1;
    this.pairInfo = /* @__PURE__ */ new Map();
    this.edgeStrength = /* @__PURE__ */ new Map();
    this.extentR = 40;
    this.extentC = { x: 0, y: 0, z: 0 };
    this.view = { selectedNode: null, selectedEdge: null, focus: /* @__PURE__ */ new Set(), matches: /* @__PURE__ */ new Set(), nodeMatch: () => true, edgeMatch: () => true, filtersActive: false, hideFiltered: false };
    /** Names on the map: off by default; selection, neighbours, hover and search matches are always named. */
    this.showNames = false;
    this.hoverNode = null;
    this.hoverEdge = null;
    this.dirty = true;
    this.pickAt = null;
    this.keys = /* @__PURE__ */ new Set();
    this.lastT = performance.now();
    this.frameN = 0;
    this.width = 1;
    this.height = 1;
    this.initialLayoutPending = false;
    // ---------- entrance ----------
    /** "waiting": data is in but positions are still being worked out; "playing": the network grows in. */
    this.introState = "off";
    this.introT = 0;
    /** Wall-clock start of the entrance, so a slow frame never changes its pace. */
    this.introStart = 0;
    /** Badge textures are drawn, photos are in and everything is on the GPU. */
    this.introAssetsReady = false;
    this.introAssetsPending = false;
    // ---------- ambient drift ----------
    /** The viewer's choice (pause button). */
    this.driftOn = true;
    /** 0 still … 1 full drift; eases in, drops to 0 on any input. */
    this.driftLevel = 0;
    /** Drift may (re)start after this time (ms, performance.now()). */
    this.driftResumeAt = 0;
    /** Drift's own clock: advances only while drifting, so motion picks up where it left off. */
    this.driftT = 0;
    /** A deep dive in progress: glide into one cluster, circle it close up, glide back out. */
    this.dive = null;
    /** Drift-clock time of the next dive: the first comes ~35s in, then roughly every 2 minutes. */
    this.nextDiveAt = 35;
    this.lastDiveId = null;
    /** Per account: seconds into the entrance when its badge pops in. */
    this.introAt = new Float32Array(0);
    /** Per account: 0 hidden … 1 full size (overshoots a little while popping). */
    this.introS = new Float32Array(0);
    this.introDur = 2.6;
    this.introFrom = { dist: 1, yaw: 0, pitch: 0.32, x: 0, y: 0, z: 0 };
    this.introTo = { dist: 1, yaw: 0, pitch: 0.32, x: 0, y: 0, z: 0 };
    this.renderer = new THREE3.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BG, 1);
    this.scene = new THREE3.Scene();
    this.scene.fog = new THREE3.FogExp2(BG, 0.01);
    this.camera = new THREE3.PerspectiveCamera(55, 1, 0.05, 5e3);
    this.rig = new CameraRig(this.camera);
    this.rig.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.raycaster.params.Line2 = { threshold: 7 };
    this.raycaster.camera = this.camera;
    this.scene.add(new THREE3.AmbientLight(16777215, 1.15));
    const key = new THREE3.DirectionalLight(16777215, 0.9);
    key.position.set(0.4, 0.8, 1);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.nodeGroup);
    const gm = new THREE3.ShaderMaterial({ vertexShader: vertGlow, fragmentShader: fragGlow, uniforms: { uScale: { value: 1 }, uDensity: { value: 0.01 } }, transparent: true, depthWrite: false });
    this.glow = new THREE3.Points(new THREE3.BufferGeometry(), gm);
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);
    const sn = 1400;
    const sp = new Float32Array(sn * 3);
    let s = 12345;
    const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < sp.length; i++) sp[i] = r() * 40;
    const sg = new THREE3.BufferGeometry();
    sg.setAttribute("position", new THREE3.BufferAttribute(sp, 3));
    this.snow = new THREE3.Points(sg, new THREE3.ShaderMaterial({ vertexShader: vertSnow, fragmentShader: fragSnow, uniforms: { uCam: { value: new THREE3.Vector3() }, uBox: { value: 40 }, uScale: { value: 1 }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE3.Mesh(new THREE3.RingGeometry(1, 1.09, 64), new THREE3.MeshBasicMaterial({ color: SELECT_COLOR, transparent: true, opacity: 0.95, depthTest: false, side: THREE3.DoubleSide }));
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
  setData(analysis) {
    this.analysis = analysis;
    const ids = analysis.mapNodeIds;
    this.ids = ids;
    this.index = new Map(ids.map((id, i) => [id, i]));
    this.nodeType = ids.map((id) => analysis.nodeById.get(id).type);
    this.deg = ids.map((id) => analysis.degree.get(id) ?? 0);
    this.maxDeg = Math.max(2, ...this.deg);
    const ranked = ids.slice().sort((a, b) => (analysis.degree.get(b) ?? 0) - (analysis.degree.get(a) ?? 0));
    this.hubRank = new Map(ranked.map((id, i) => [id, i]));
    const oldVis = /* @__PURE__ */ new Map();
    this.index.forEach((i, id) => oldVis.set(id, 0));
    const prev = this.visCur;
    const prevIds = this._prevIds;
    prevIds?.forEach((id, i) => oldVis.set(id, prev[i] ?? 0));
    this.visCur = new Float32Array(ids.map((id) => oldVis.get(id) ?? 0));
    this.dispR = new Float32Array(ids.length);
    this.introS = new Float32Array(ids.length).fill(this.introState === "off" ? 1 : 0);
    this._prevIds = ids;
    const pairs = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    for (const e of analysis.drawnEdges) {
      const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      pairs.set(key, [e.source, e.target]);
      (groups.get(key) ?? groups.set(key, []).get(key)).push(e);
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
    const keep = new Set(ids);
    this.sprites.forEach((sp, id) => {
      const n2 = analysis.nodeById.get(id);
      if (!keep.has(id) || !n2 || sp.userData.key !== badgeKey(n2)) {
        this.nodeGroup.remove(sp);
        sp.material.map?.dispose();
        sp.material.dispose();
        this.sprites.delete(id);
      }
    });
    for (const id of ids) {
      if (this.sprites.has(id)) continue;
      const n2 = analysis.nodeById.get(id);
      const sp = new THREE3.Sprite(new THREE3.SpriteMaterial({ map: makeBadge(n2), transparent: true, alphaTest: 0.02, depthTest: false, depthWrite: false }));
      sp.userData = { id, key: badgeKey(n2) };
      this.sprites.set(id, sp);
      this.nodeGroup.add(sp);
    }
    const n = ids.length;
    this.glowAttr = { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alpha: new Float32Array(n) };
    const g = new THREE3.BufferGeometry();
    g.setAttribute("position", new THREE3.BufferAttribute(this.glowAttr.pos, 3));
    g.setAttribute("color", new THREE3.BufferAttribute(this.glowAttr.col, 3));
    g.setAttribute("size", new THREE3.BufferAttribute(this.glowAttr.size, 1));
    g.setAttribute("alpha", new THREE3.BufferAttribute(this.glowAttr.alpha, 1));
    this.glow.geometry.dispose();
    this.glow.geometry = g;
    this.edgeGroups.forEach((grp) => {
      this.scene.remove(grp.line);
      grp.line.geometry.dispose();
      grp.line.material.dispose();
    });
    this.edgeGroups.clear();
    for (const kind of EDGE_KINDS) {
      const edges = analysis.drawnEdges.filter((e) => e.kind === kind);
      if (!edges.length) continue;
      const segs = edges.map((e) => (this.pairInfo.get(e.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1);
      const total = segs.reduce((a, b) => a + b, 0);
      const geom = new LineSegmentsGeometry();
      geom.setPositions(new Float32Array(total * 6));
      geom.setColors(new Float32Array(total * 6));
      const st2 = EDGE_STYLE[kind];
      const mat = new LineMaterial({ color: 16777215, linewidth: st2.width, vertexColors: true, dashed: st2.dashed, dashSize: st2.dash, gapSize: st2.gap, dashScale: 1, worldUnits: false });
      mat.resolution.set(this.width, this.height);
      const line = new LineSegments2(geom, mat);
      line.frustumCulled = false;
      line.renderOrder = 1;
      this.scene.add(line);
      const segToEdge = new Int32Array(total);
      let o = 0;
      segs.forEach((c, i) => {
        for (let j = 0; j < c; j++) segToEdge[o++] = i;
      });
      this.edgeGroups.set(kind, { line, edges, segs, total, pos: geom.attributes.instanceStart.data.array, col: geom.attributes.instanceColorStart.data.array, segToEdge });
    }
    this.dirty = true;
  }
  settleInitialLayout(ids, pairs) {
    this.initialLayoutPending = true;
    try {
      const worker = new Worker(new URL("./layout-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (event) => {
        worker.terminate();
        this.initialLayoutPending = false;
        const positions = event.data?.positions;
        if (positions?.length === ids.length) {
          ids.forEach((id, i) => {
            const body = this.layout.bodies.get(id);
            const position = positions[i];
            if (!body || !position?.every(Number.isFinite)) return;
            [body.x, body.y, body.z] = position;
            body.vx = 0;
            body.vy = 0;
            body.vz = 0;
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
      this.initialLayoutPending = false;
    }
  }
  setView(v) {
    this.view = v;
    this.dirty = true;
  }
  // ---------- camera helpers ----------
  extent() {
    return { center: this.extentC, radius: this.extentR };
  }
  /**
   * The entrance. While positions are being worked out the camera drifts slowly
   * through the empty space; once they are ready the network grows outward from its
   * most-connected accounts along their links, badges popping in ring by ring,
   * while the camera eases back to the wide view. Any input ends it at once.
   */
  playIntro() {
    if (this.rig.reducedMotion || !this.ids.length) {
      this.endIntro();
      return;
    }
    this.introState = "waiting";
    this.introS.fill(0);
    this.rig.target.set(this.extentC.x, this.extentC.y, this.extentC.z);
    this.rig.dist = this.extentR * 0.5;
    this.rig.snap();
    this.dirty = true;
    this.prepareIntroAssets();
  }
  /** Wait for fonts and avatar photos (at most 1.5s), then upload every badge to the GPU. */
  prepareIntroAssets() {
    if (this.introAssetsReady || this.introAssetsPending) return;
    this.introAssetsPending = true;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const timeout = new Promise((r) => setTimeout(r, 1500));
    Promise.race([Promise.all([fonts, avatarsSettled()]), timeout]).then(() => {
      setTimeout(() => {
        this.sprites.forEach((sp) => {
          try {
            this.renderer.initTexture(sp.material.map);
          } catch {
          }
        });
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
  get introPlaying() {
    return this.introState !== "off";
  }
  startIntro() {
    const n = this.ids.length;
    const adj = Array.from({ length: n }, () => []);
    for (const e of this.analysis.drawnEdges) {
      const a = this.index.get(e.source), b = this.index.get(e.target);
      if (a === void 0 || b === void 0 || a === b) continue;
      adj[a].push(b);
      adj[b].push(a);
    }
    const depth = new Int32Array(n).fill(-1);
    const byDeg = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.deg[b] - this.deg[a]);
    let maxD = 1;
    for (const seed2 of byDeg) {
      if (depth[seed2] >= 0) continue;
      depth[seed2] = 0;
      const q = [seed2];
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        for (const w of adj[u]) if (depth[w] < 0) {
          depth[w] = depth[u] + 1;
          maxD = Math.max(maxD, depth[w]);
          q.push(w);
        }
      }
    }
    const spread = 1.55;
    this.introAt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const jitter = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1;
      this.introAt[i] = 0.12 + spread * Math.pow(depth[i] / maxD, 0.85) + jitter * 0.18;
    }
    const yaw = this.rig.yaw;
    const seed = this.layout.get(this.ids[byDeg[0]]);
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
  stepIntro(dt, now) {
    if (this.introState === "waiting") {
      this.rig.yaw += dt * 0.06;
      this.rig.snap();
      this.dirty = true;
      if (!this.initialLayoutPending && this.introAssetsReady) {
        this.startIntro();
        this.introStart = now;
      }
      return;
    }
    if (this.introState !== "playing") return;
    this.introT = (now - this.introStart) / 1e3;
    const T = this.introT;
    const pop = 0.42;
    let all = true;
    for (let i = 0; i < this.ids.length; i++) {
      const u = Math.min(1, Math.max(0, (T - this.introAt[i]) / pop));
      if (u < 1) all = false;
      const c1 = 1.9, c3 = c1 + 1;
      this.introS[i] = u <= 0 ? 0 : 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    const k = Math.min(1, T / this.introDur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const f = this.introFrom, t = this.introTo;
    this.rig.dist = Math.exp(Math.log(f.dist) + (Math.log(t.dist) - Math.log(f.dist)) * e);
    this.rig.yaw = f.yaw + (t.yaw - f.yaw) * e;
    this.rig.pitch = f.pitch + (t.pitch - f.pitch) * e;
    this.rig.target.set(f.x + (t.x - f.x) * e, f.y + (t.y - f.y) * e, f.z + (t.z - f.z) * e);
    this.rig.snap();
    if (all && k >= 1) {
      this.introState = "off";
      this.introS.fill(1);
      this.driftResumeAt = 0;
    }
    this.dirty = true;
  }
  /**
   * After the entrance the camera keeps turning slowly around the map, about one
   * turn every 3.5 minutes. Any input stops it at once; it eases back in after 15s
   * of quiet. It stays still while an account or line is selected or hovered,
   * while the tab is hidden, with reduced motion, or when paused.
   */
  stepDrift(dt, now) {
    const v = this.view;
    const allowed = this.driftOn && !this.rig.reducedMotion && this.introState === "off" && !this.initialLayoutPending && !v.selectedNode && !v.selectedEdge && !this.hoverNode && !this.hoverEdge && !document.hidden && now >= this.driftResumeAt && this.keys.size === 0;
    const goal = allowed ? 1 : 0;
    const tau = goal > this.driftLevel ? 2.2 : 0.35;
    this.driftLevel += (goal - this.driftLevel) * (1 - Math.exp(-dt / tau));
    if (!goal && this.driftLevel < 1e-3) {
      this.driftLevel = 0;
      return;
    }
    const d\u03C4 = dt * this.driftLevel;
    const t = this.driftT;
    this.driftT += d\u03C4;
    const w = (period) => Math.PI * 2 / period;
    this.rig.yaw += d\u03C4 * w(210);
    const wd = w(61);
    this.rig.dist = this.rig.clampDist(this.rig.dist * Math.exp(0.38 * wd * Math.cos(wd * t + Math.PI) * d\u03C4));
    const wp = w(83);
    this.rig.pitch = Math.max(-1.2, Math.min(1.2, this.rig.pitch + 0.28 * wp * Math.cos(wp * t + 1.3) * d\u03C4));
    if (!this.dive && this.driftT >= this.nextDiveAt && this.driftLevel > 0.95) this.startDive();
    if (this.dive) {
      const d = this.dive;
      const s = this.driftT - d.start;
      const ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const e = s < 9 ? ease(s / 9) : s < 16 ? 1 : s < 26 ? 1 - ease((s - 16) / 10) : 0;
      this.rig.target.set(d.fx + (d.x - d.fx) * e, d.fy + (d.y - d.fy) * e, d.fz + (d.z - d.fz) * e);
      this.rig.dist = Math.exp(Math.log(d.fdist) + (Math.log(d.close) - Math.log(d.fdist)) * e);
      this.rig.yaw += d\u03C4 * w(210) * 2.5 * e;
      if (s >= 26) {
        this.dive = null;
        this.nextDiveAt = this.driftT + 110 + 30 * Math.random();
      }
      return;
    }
    const a = this.extentR * 0.18;
    const wx = w(97), wy = w(131), wz = w(113);
    this.rig.target.x += a * wx * Math.cos(wx * t + 0.4) * d\u03C4;
    this.rig.target.y += a * 0.6 * wy * Math.cos(wy * t + 2.1) * d\u03C4;
    this.rig.target.z += a * wz * Math.cos(wz * t + 4) * d\u03C4;
  }
  /** Pick a well-connected cluster in front of the camera (not the last one) and head for it. */
  startDive() {
    const cam = this.camera.position;
    const fwd = this.rig.forward();
    const ranked = this.ids.map((id, i) => ({ id, i })).sort((a, b) => this.deg[b.i] - this.deg[a.i]).slice(0, 30);
    const cands = ranked.filter(({ id }) => {
      if (id === this.lastDiveId) return false;
      const p2 = this.layout.get(id);
      return (p2.x - cam.x) * fwd.x + (p2.y - cam.y) * fwd.y + (p2.z - cam.z) * fwd.z > 0;
    });
    const pickFrom = cands.length ? cands : ranked;
    const pick = pickFrom[Math.floor(Math.random() * Math.min(pickFrom.length, 12))];
    if (!pick) {
      this.nextDiveAt = this.driftT + 60;
      return;
    }
    const p = this.layout.get(pick.id);
    const t = this.rig.target;
    this.lastDiveId = pick.id;
    this.dive = { start: this.driftT, fx: t.x, fy: t.y, fz: t.z, fdist: this.rig.dist, x: p.x, y: p.y, z: p.z, close: Math.max(this.rig.minDist * 4, this.extentR * 0.09) };
  }
  /** Called on any direct input: stop drifting now, resume after a quiet spell. */
  noteInput() {
    if (this.dive) {
      this.dive = null;
      this.nextDiveAt = this.driftT + 60;
    }
    this.driftLevel = 0;
    this.driftResumeAt = performance.now() + 15e3;
  }
  setDrift(on) {
    this.driftOn = on;
    if (on) this.driftResumeAt = 0;
    this.dirty = true;
  }
  /** How far an edge has inked in: 0…1, growing from the endpoint that appeared first. */
  edgeInk(ia, ib) {
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
  focusNode(id) {
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
  focusEdge(e) {
    const a = this.layout.get(e.source), b = this.layout.get(e.target);
    if (!a || !b) return;
    const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    this.rig.flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, Math.max(len * 2.3, 18));
    this.rig.userMoved = true;
    this.dirty = true;
  }
  setShowNames(on) {
    this.showNames = on;
    this.dirty = true;
  }
  zoomBy(f) {
    this.rig.zoomAt(f);
    this.dirty = true;
  }
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
  setDepth(t) {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    this.rig.setDist(Math.exp(hi - t * (hi - lo)));
    this.dirty = true;
  }
  position(id) {
    return this.layout.get(id);
  }
  get cameraInfo() {
    return { pos: this.camera.position, target: this.rig.currentTarget, yaw: this.rig.currentYaw };
  }
  nodeIds() {
    return this.ids;
  }
  typeOf(id) {
    const i = this.index.get(id);
    return i === void 0 ? void 0 : this.nodeType[i];
  }
  visibility(id) {
    const i = this.index.get(id);
    return i === void 0 ? 0 : this.visCur[i];
  }
  // ---------- frame ----------
  nodeSize(i) {
    return 0.45 + 0.27 * Math.sqrt(this.deg[i]);
  }
  reveal(i) {
    const t = Math.log(1 + this.deg[i]) / Math.log(1 + this.maxDeg);
    return this.extentR * (0.9 + 2.6 * Math.pow(t, 1.5));
  }
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    try {
      this.frame(now);
    } catch (err) {
      console.error("[map] frame failed", err);
      const el = document.getElementById("toast");
      if (el) {
        el.hidden = false;
        el.textContent = `Map error: ${err?.message ?? err}`;
      }
    }
  }
  frame(now) {
    const dt = Math.min(0.05, (now - this.lastT) / 1e3);
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
      if (this.pickAt) {
        this.hoverPick(this.pickAt.x, this.pickAt.y);
        this.pickAt = null;
      }
      const fogD = 0.3 / Math.max(this.rig.currentDist + this.extentR, this.extentR * 2.4);
      this.scene.fog.density = fogD;
      this.glow.material.uniforms.uDensity.value = fogD;
      this.snow.material.uniforms.uCam.value.copy(this.camera.position);
      this.snow.material.uniforms.uAlpha.value = Math.min(1, Math.max(0, (this.extentR * 0.9 - this.rig.currentDist) / (this.extentR * 0.5)));
      const placed = !this.initialLayoutPending;
      this.nodeGroup.visible = placed;
      this.glow.visible = placed;
      this.edgeGroups.forEach((g) => {
        g.line.visible = placed;
      });
      this.renderer.render(this.scene, this.camera);
      if (this.frameN % 4 === 0 || !camMoving) this.cb.onFrame({ depth: this.depth, moving: camMoving, ready: !this.initialLayoutPending });
    }
  }
  updateExtent() {
    const ex = this.layout.extent();
    this.extentC = ex.center;
    this.extentR = ex.radius;
    this.rig.maxDist = ex.radius * 12;
    this.rig.home.set(ex.center.x, ex.center.y, ex.center.z);
  }
  updateNodes(dt) {
    const v = this.view;
    const cam = this.camera.position;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const k = this.rig.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    const ga = this.glowAttr;
    let fading = false;
    const pxToWorld = 2 * Math.tan(this.camera.fov * Math.PI / 360) / this.height;
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const p = this.layout.get(id);
      const t = this.nodeType[i];
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      const match = v.nodeMatch(id);
      let target = 1;
      if (v.filtersActive && !match && !forced && v.hideFiltered) target = 0;
      const cur = this.visCur[i] + (target - this.visCur[i]) * k;
      if (Math.abs(target - cur) > 3e-3) fading = true;
      this.visCur[i] = cur;
      const dimSel = selActive && !v.focus.has(id);
      const dimFilter = v.filtersActive && !match;
      const minWorld = d * pxToWorld * (dimFilter ? 2.6 : 3.6);
      const size = Math.max(this.nodeSize(i) * (dimFilter ? 0.6 : 1), minWorld) * cur * (id === v.selectedNode ? 1.3 : 1) * this.introS[i] * (this.introState === "playing" ? Math.min(1, Math.max(0, (d - this.extentR * 0.1) / (this.extentR * 0.12))) : this.dive ? Math.min(1, Math.max(0, (d - this.extentR * 0.015) / (this.extentR * 0.03))) : 1);
      const sp = this.sprites.get(id);
      sp.position.set(p.x, p.y, p.z);
      sp.scale.setScalar(Math.max(size, 1e-4) * 2.3);
      this.dispR[i] = size * (t === "agent" ? 1.05 : 1.12);
      sp.visible = size > 1e-3;
      const op = dimFilter ? 0.25 : dimSel ? 0.3 : 1;
      sp.material.opacity = op;
      sp.renderOrder = op > 0.9 ? 3 : 2;
      ga.pos[i * 3] = p.x;
      ga.pos[i * 3 + 1] = p.y;
      ga.pos[i * 3 + 2] = p.z;
      const isMatch = v.matches.has(id);
      const isSel = id === v.selectedNode;
      const gc = isMatch || isSel ? tmpColor.set(SELECT_COLOR) : tmpColor.set(NODE_STYLE[t].color);
      ga.col[i * 3] = gc.r;
      ga.col[i * 3 + 1] = gc.g;
      ga.col[i * 3 + 2] = gc.b;
      const glowSize = Math.max(this.nodeSize(i), d * pxToWorld * 3.2);
      ga.size[i] = glowSize * (isSel ? 7 : 6.5);
      let alpha = 0;
      if (dimSel) alpha *= 0.3;
      if (dimFilter) alpha *= v.hideFiltered ? 0 : 0.3;
      if (isMatch) alpha = 0.35;
      if (isSel) alpha = 0.4;
      ga.alpha[i] = alpha;
    }
    const geo = this.glow.geometry;
    ["position", "color", "size", "alpha"].forEach((a) => geo.attributes[a] && (geo.attributes[a].needsUpdate = true));
    const ringIds = v.selectedEdge ? (() => {
      const e = this.findEdge(v.selectedEdge);
      return e ? [e.source, e.target] : [];
    })() : v.selectedNode ? [v.selectedNode] : [];
    this.rings.forEach((ring, j) => {
      const id = ringIds[j];
      const i = id !== void 0 ? this.index.get(id) : void 0;
      if (i === void 0) {
        ring.visible = false;
        return;
      }
      const p = this.layout.get(id);
      ring.visible = true;
      ring.position.set(p.x, p.y, p.z);
      ring.quaternion.copy(this.camera.quaternion);
      ring.scale.setScalar(this.nodeSize(i) * 1.75);
    });
    return fading;
  }
  findEdge(id) {
    return this.analysis?.drawnEdges.find((e) => e.id === id);
  }
  edgeEnds(e, out, kSeg, segs, perp) {
    const a = this.layout.get(e.source), b = this.layout.get(e.target);
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-6;
    const ra = (this.dispR[this.index.get(e.source)] ?? 0) * 0.5, rb = (this.dispR[this.index.get(e.target)] ?? 0) * 0.5;
    let ta = ra / len, tb = 1 - rb / len;
    if (ta >= tb) {
      ta = tb = 0.5;
    }
    if (segs === 1) {
      out[0] = a.x + (b.x - a.x) * ta;
      out[1] = a.y + (b.y - a.y) * ta;
      out[2] = a.z + (b.z - a.z) * ta;
      out[3] = a.x + (b.x - a.x) * tb;
      out[4] = a.y + (b.y - a.y) * tb;
      out[5] = a.z + (b.z - a.z) * tb;
      return;
    }
    const info = this.pairInfo.get(e.id);
    const off = (info.k - (info.n - 1) / 2) * Math.min(len * 0.28, 3.2);
    const sign = e.source < e.target ? 1 : -1;
    const cx = (a.x + b.x) / 2 + perp.x * off * sign, cy = (a.y + b.y) / 2 + perp.y * off * sign, cz = (a.z + b.z) / 2 + perp.z * off * sign;
    const q = (t, p0, p1, p2) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    const t0 = ta + (tb - ta) * kSeg / segs, t1 = ta + (tb - ta) * (kSeg + 1) / segs;
    out[0] = q(t0, a.x, cx, b.x);
    out[1] = q(t0, a.y, cy, b.y);
    out[2] = q(t0, a.z, cz, b.z);
    out[3] = q(t1, a.x, cx, b.x);
    out[4] = q(t1, a.y, cy, b.y);
    out[5] = q(t1, a.z, cz, b.z);
  }
  updateEdges() {
    const v = this.view;
    const cam = this.camera.position;
    const fwd = this.rig.forward();
    const density = this.scene.fog.density;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const ends = [0, 0, 0, 0, 0, 0];
    const perp = new THREE3.Vector3();
    const dir = new THREE3.Vector3();
    this.edgeStrength.clear();
    const dashScale = 160 / Math.max(this.rig.currentDist, 1);
    this.edgeGroups.forEach((grp, kind) => {
      const st2 = EDGE_STYLE[kind];
      tmpColor.set(st2.color);
      const kr = tmpColor.r, kg = tmpColor.g, kb = tmpColor.b;
      tmpColor.set(NEUTRAL_EDGE);
      const nr = tmpColor.r, ng = tmpColor.g, nb = tmpColor.b;
      let o = 0;
      grp.edges.forEach((e, ei) => {
        const ia = this.index.get(e.source), ib = this.index.get(e.target);
        const base = kind === "interaction" ? 0.42 : kind === "cluster" ? 0.35 : 0.8;
        const ink = this.edgeInk(ia, ib);
        let s = Math.min(this.visCur[ia], this.visCur[ib]) * base * Math.min(1, ink * 1.6);
        if (v.filtersActive && !v.edgeMatch(e)) s *= v.hideFiltered ? 0 : 0.06;
        let colored = !!v.colorKinds && (!v.filtersActive || v.edgeMatch(e));
        if (selActive) {
          const incident = e.id === v.selectedEdge || v.selectedNode && (e.source === v.selectedNode || e.target === v.selectedNode) && !v.selectedEdge;
          s = incident ? 1 : s * 0.12;
          if (incident) colored = true;
        }
        if (e.id === this.hoverEdge) {
          s = Math.max(s, 1);
          colored = true;
        }
        const cr = colored ? kr : nr, cg = colored ? kg : ng, cb = colored ? kb : nb;
        this.edgeStrength.set(e.id, s);
        const a = this.layout.get(e.source), b = this.layout.get(e.target);
        dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
        perp.crossVectors(dir, fwd);
        if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0);
        else perp.normalize();
        const n = grp.segs[ei];
        for (let j = 0; j < n; j++, o++) {
          this.edgeEnds(e, ends, j, n, perp);
          if (ink < 1 && n === 1) {
            const fromA = this.introAt[ia] <= this.introAt[ib];
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
          if (maxF < 0.03) for (let c = 3; c < 6; c++) ends[c] = ends[c - 3];
          for (let c = 0; c < 6; c++) grp.pos[o * 6 + c] = ends[c];
        }
      });
      const geom = grp.line.geometry;
      geom.attributes.instanceStart.data.needsUpdate = true;
      geom.attributes.instanceColorStart.data.needsUpdate = true;
      geom.computeBoundingSphere();
      if (st2.dashed) {
        grp.line.computeLineDistances();
        grp.line.material.dashScale = dashScale;
      }
    });
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
    const sel = v.selectedEdge ? this.findEdge(v.selectedEdge) : null;
    if (sel && this.index.has(sel.source) && this.index.has(sel.target)) {
      const n = (this.pairInfo.get(sel.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1;
      const a = this.layout.get(sel.source), b = this.layout.get(sel.target);
      dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
      perp.crossVectors(dir, fwd);
      if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0);
      else perp.normalize();
      const arr = new Float32Array(n * 6);
      for (let j = 0; j < n; j++) {
        this.edgeEnds(sel, ends, j, n, perp);
        arr.set(ends, j * 6);
      }
      const g = new LineSegmentsGeometry();
      g.setPositions(arr);
      const m = new LineMaterial({ color: SELECT_COLOR, linewidth: 5, transparent: true, opacity: 0.28, depthWrite: false, worldUnits: false });
      m.resolution.set(this.width, this.height);
      this.highlight = new LineSegments2(g, m);
      this.highlight.renderOrder = 0;
      this.scene.add(this.highlight);
    }
  }
  updateLabels() {
    const v = this.view;
    const cam = this.camera.position;
    const W = this.width, H = this.height;
    const proj = new THREE3.Vector3();
    const cands = [];
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const vis = this.visCur[i];
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      if (!forced && vis < 0.55) continue;
      if (this.introS[i] < 0.9) continue;
      if (v.filtersActive && !forced && !v.nodeMatch(id)) continue;
      const p = this.layout.get(id);
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const rv = this.reveal(i);
      const hub = (this.hubRank.get(id) ?? 99) < 8;
      if (!forced && !this.showNames) continue;
      if (!forced && !hub && d > rv * 0.75) continue;
      proj.set(p.x, p.y, p.z).project(this.camera);
      if (proj.z > 1 || proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;
      const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
      const rpx = this.nodeSize(i) * H / (2 * Math.tan(this.camera.fov * Math.PI / 360) * Math.max(d, 0.1));
      let pri = this.deg[i] * 40 - d * 3;
      if (id === v.selectedNode || id === this.hoverNode) pri = 1e9;
      else if (v.focus.has(id)) pri = 1e8 - d;
      else if (v.matches.has(id)) pri = 1e7 - d;
      cands.push({ i, x: x + Math.max(rpx * 1.15, 4) + 7, y, pri, close: id === v.selectedNode || id === this.hoverNode });
    }
    cands.sort((a, b) => b.pri - a.pri);
    const placed = [];
    let used = 0;
    for (const c of cands) {
      if (used >= 60) break;
      const node = this.analysis.nodeById.get(this.ids[c.i]);
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
  labelEl(i) {
    while (this.labelPool.length <= i) {
      const b = document.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = b.dataset.id;
        if (id) this.cb.onPickNode(id);
      });
      this.labelLayer.appendChild(b);
      this.labelPool.push(b);
    }
    return this.labelPool[i];
  }
  // ---------- input ----------
  ndc(x, y) {
    return { x: x / this.width * 2 - 1, y: -(y / this.height) * 2 + 1 };
  }
  pick(x, y) {
    const n = this.ndc(x, y);
    this.raycaster.setFromCamera(n, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.sprites.values()), false);
    for (const h of hits) {
      const id = h.object.userData.id;
      if (id && this.visibility(id) > 0.2) return { node: id };
    }
    let best = null;
    this.edgeGroups.forEach((grp) => {
      const eh = this.raycaster.intersectObject(grp.line, false);
      for (const h of eh) {
        const e = grp.edges[grp.segToEdge[h.faceIndex]];
        if (!e || (this.edgeStrength.get(e.id) ?? 0) < 0.2) continue;
        if (!best || h.distance < best.dist) best = { edge: e.id, dist: h.distance };
      }
    });
    return best ? { edge: best.edge } : {};
  }
  hoverPick(x, y) {
    const r = this.pick(x, y);
    const node = r.node ?? null, edge = node ? null : r.edge ?? null;
    if (node !== this.hoverNode || edge !== this.hoverEdge) {
      this.hoverNode = node;
      this.hoverEdge = edge;
      this.dirty = true;
    }
    this.canvas.style.cursor = node || edge ? "pointer" : "grab";
    if (node && this.analysis) {
      const nd = this.analysis.nodeById.get(node);
      this.showTip(x, y, `<b>${escapeHtml(nd.name ?? nd.id)}</b><span>${NODE_STYLE[nd.type].label}${nd.handle ? ` \xB7 @${escapeHtml(nd.handle)}` : ""} \xB7 ${this.analysis.degree.get(node) ?? 0} links</span>`);
    } else if (edge && this.analysis) {
      const e = this.findEdge(edge);
      const a = this.analysis.nodeById.get(e.source), b = this.analysis.nodeById.get(e.target);
      this.showTip(x, y, `<b>${EDGE_STYLE[e.kind].label}</b><span>${escapeHtml(a.name ?? a.id)} ${escapeHtml(e.label ?? "")} ${escapeHtml(b.name ?? b.id)}</span>`);
    } else this.tooltip.hidden = true;
  }
  showTip(x, y, html) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const tx = Math.min(x + 14, this.width - 260);
    this.tooltip.style.transform = `translate(${tx}px, ${y + 16}px)`;
  }
  bindInput() {
    const c = this.canvas;
    const pointers = /* @__PURE__ */ new Map();
    let downAt = null;
    let moved = 0;
    let pinch = null;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    for (const ev of ["pointerdown", "wheel", "keydown"]) c.addEventListener(ev, () => {
      this.endIntro();
      this.noteInput();
    }, { capture: true, passive: true });
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
      if (!prev) {
        this.pickAt = p;
        this.dirty = true;
        return;
      }
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
    const end = (e) => {
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
    c.addEventListener("pointerleave", () => {
      if (!pointers.size) {
        this.tooltip.hidden = true;
        this.hoverNode = null;
        this.hoverEdge = null;
        this.dirty = true;
      }
    });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-300, Math.min(300, e.deltaY * unit));
      const p = local(e);
      const n = this.ndc(p.x, p.y);
      this.rig.zoomAt(Math.exp(delta * (e.ctrlKey ? 6e-3 : 14e-4)), n.x, n.y);
      this.dirty = true;
    }, { passive: false });
    const drivingKeys = /* @__PURE__ */ new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", "=", "+", "-", "_"]);
    c.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (drivingKeys.has(k)) {
        this.keys.add(k);
        e.preventDefault();
        this.dirty = true;
      } else if (k === "home" || k === "0") {
        this.overview();
        e.preventDefault();
      } else if (k === "escape") this.cb.onEscape();
    });
    c.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    c.addEventListener("blur", () => this.keys.clear());
    c.addEventListener("focus", () => this.cb.onHint("Keyboard: W/S or \u2191/\u2193 drive \xB7 A/D or \u2190/\u2192 turn \xB7 Q/E sink/rise \xB7 +/\u2212 zoom \xB7 0 overview \xB7 Esc clear"));
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    const scale = this.height * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.glow.material.uniforms.uScale.value = scale;
    this.snow.material.uniforms.uScale.value = scale;
    this.edgeGroups.forEach((g) => g.line.material.resolution.set(this.width, this.height));
    this.dirty = true;
  }
};
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// src/main.ts
var $ = (id) => document.getElementById(id);
var initialGraph = await window.__AUTONOMY_GRAPH_LOAD__;
var graph = normalizeGraph(initialGraph);
var A = analyze(graph);
var onMap = new Set(A.mapNodeIds);
var st = {
  selectedNode: null,
  selectedEdge: null,
  edgeFromNode: null,
  query: "",
  types: /* @__PURE__ */ new Set(),
  kinds: new Set(EDGE_KINDS),
  topics: /* @__PURE__ */ new Set(),
  hideFiltered: false,
  sort: "links",
  resultIdx: 0
};
var scene = new MapScene($("stage"), $("map"), $("labels"), $("tooltip"), {
  onPickNode: (id) => selectNode(id, { fly: true }),
  onPickEdge: (id) => selectEdge(id, { fly: false }),
  onPickNothing: () => clearSelection(),
  onEscape: () => clearSelection(),
  onFrame: (info) => {
    frameUi(info.depth, info.moving);
    if (info.ready) window.finishMapBoot?.();
  },
  onHint: (t) => {
    $("hint").textContent = t;
  }
});
var nodeName = (id) => {
  const n = A.nodeById.get(id);
  return n?.name ?? n?.handle ?? id;
};
var filtersActive = () => st.types.size > 0 || st.topics.size > 0 || st.kinds.size < EDGE_KINDS.length;
function nodeMatch(id) {
  const n = A.nodeById.get(id);
  if (!n) return false;
  if (st.types.size && !st.types.has(n.type)) return false;
  if (st.topics.size && !n.topics.some((t) => st.topics.has(t))) return false;
  return true;
}
function edgeMatch(e) {
  if (!st.kinds.has(e.kind)) return false;
  return nodeMatch(e.source) && nodeMatch(e.target);
}
function focusSet() {
  const s = /* @__PURE__ */ new Set();
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) {
      s.add(e.source);
      s.add(e.target);
    }
  } else if (st.selectedNode && onMap.has(st.selectedNode)) {
    s.add(st.selectedNode);
    for (const e of A.edgesByNode.get(st.selectedNode) ?? []) {
      s.add(e.source);
      s.add(e.target);
    }
  }
  return s;
}
function search(qRaw) {
  const q = qRaw.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const hits = [];
  for (const n of A.nodeById.values()) {
    const fields = [
      ["name", n.name ?? "", 100],
      ["handle", n.handle ?? n.id, 100],
      ["notes", n.notes ?? "", 45],
      ["summary", n.summary ?? "", 35],
      ["project", n.projects.map((p) => p.name).join(" \xB7 "), 40],
      ["topic", n.topics.map((t) => A.topicLabel.get(t) ?? t).join(" \xB7 "), 20]
    ];
    let best = null;
    for (const [field, text, w] of fields) {
      const i = text.toLowerCase().indexOf(q);
      if (i < 0) continue;
      const wordStart = i === 0 || /[\s@_\-·]/.test(text[i - 1]);
      const score = w * (i === 0 ? 1.6 : wordStart ? 1.25 : 1);
      if (!best || score > best.score) best = { id: n.id, score, field, snippet: highlight(text, i, q.length) };
    }
    if (best) {
      best.score += Math.min(10, A.degree.get(n.id) ?? 0) * 0.5 - (onMap.has(n.id) ? 0 : 5);
      hits.push(best);
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}
function highlight(text, i, len) {
  const s = Math.max(0, i - 28), e = Math.min(text.length, i + len + 40);
  return `${s > 0 ? "\u2026" : ""}${escapeHtml(text.slice(s, i))}<mark>${escapeHtml(text.slice(i, i + len))}</mark>${escapeHtml(text.slice(i + len, e))}${e < text.length ? "\u2026" : ""}`;
}
var lastHits = [];
function pushView() {
  const view = {
    selectedNode: st.selectedNode && onMap.has(st.selectedNode) ? st.selectedNode : null,
    selectedEdge: st.selectedEdge,
    focus: focusSet(),
    matches: new Set(lastHits.filter((h) => onMap.has(h.id)).slice(0, 40).map((h) => h.id)),
    nodeMatch,
    edgeMatch,
    filtersActive: filtersActive(),
    hideFiltered: st.hideFiltered,
    colorKinds: st.kinds.size < EDGE_KINDS.length
  };
  scene.setView(view);
  saveView();
}
function announce(t) {
  $("live").textContent = t;
}
function selectNode(id, opts) {
  if (!A.nodeById.has(id)) return;
  st.selectedNode = id;
  st.selectedEdge = null;
  st.edgeFromNode = null;
  if (opts.fly && onMap.has(id)) scene.focusNode(id);
  renderDetails();
  renderList();
  pushView();
  const links = A.degree.get(id) ?? 0;
  announce(onMap.has(id) ? `${nodeName(id)} selected, ${links} connection${links === 1 ? "" : "s"}.` : `${nodeName(id)} is not on the map: it has no connections.`);
}
function selectEdge(id, opts) {
  const e = A.drawnEdges.find((x) => x.id === id);
  if (!e) return;
  st.edgeFromNode = st.selectedNode && (e.source === st.selectedNode || e.target === st.selectedNode) ? st.selectedNode : st.edgeFromNode;
  st.selectedEdge = id;
  if (opts.fly) scene.focusEdge(e);
  renderDetails();
  pushView();
  announce(`${EDGE_STYLE[e.kind].label}: ${nodeName(e.source)} ${e.label ?? ""} ${nodeName(e.target)}.`);
}
function clearSelection() {
  if (!st.selectedNode && !st.selectedEdge) return;
  st.selectedNode = null;
  st.selectedEdge = null;
  st.edgeFromNode = null;
  renderDetails();
  renderList();
  pushView();
  announce("Selection cleared.");
}
var shape = (t) => `<span class="shape ${t}" aria-hidden="true"></span>`;
function edgeSwatch(kind, w = 30) {
  const s = EDGE_STYLE[kind];
  const dash = kind === "interaction" ? 'stroke-dasharray="5 3"' : kind === "shared_topic" || kind === "bridge" ? 'stroke-dasharray="1.5 3.5" stroke-linecap="round"' : "";
  return `<svg class="edge-swatch" width="${w}" height="8" viewBox="0 0 ${w} 8" aria-hidden="true"><line x1="1" y1="4" x2="${w - 1}" y2="4" stroke="${s.css}" stroke-width="${Math.max(1.2, s.width)}" ${dash}/></svg>`;
}
function renderDetails() {
  const panel = $("details");
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) {
      panel.hidden = false;
      $("detailsBody").innerHTML = edgeHtml(e);
      return;
    }
  }
  const n = st.selectedNode ? A.nodeById.get(st.selectedNode) : null;
  if (!n) {
    panel.hidden = true;
    $("detailsBody").innerHTML = "";
    return;
  }
  panel.hidden = false;
  $("detailsBody").innerHTML = nodeHtml(n);
}
var ICON = {
  close: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  locate: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  ext: `<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};
var prop = (label, value) => value ? `<dt>${label}</dt><dd>${value}</dd>` : "";
function timeline(ids) {
  const seen = /* @__PURE__ */ new Map();
  ids.forEach(({ id, why }) => {
    if (!seen.has(id)) seen.set(id, []);
    if (!seen.get(id).includes(why)) seen.get(id).push(why);
  });
  const rows = Array.from(seen.entries()).map(([id, why]) => ({ id, why, src: A.sourceById.get(id) }));
  rows.sort((a, b) => (b.src?.date ?? "").localeCompare(a.src?.date ?? ""));
  if (!rows.length) return `<p class="muted small">No sources on record.</p>`;
  return `<ol class="timeline">${rows.map((r) => r.src ? `<li>${r.src.date ? `<span class="t-date">${escapeHtml(r.src.date)}</span>` : ""}<a href="${escapeHtml(r.src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.src.title ?? r.src.url)}</a><span class="t-meta">${escapeHtml([r.src.publisher, `supports ${r.why.join(", ")}`].filter(Boolean).join(" \xB7 "))}</span></li>` : `<li class="missing"><span class="t-date">\u2014</span>Missing source record \u201C${escapeHtml(r.id)}\u201D<span class="t-meta">supports ${escapeHtml(r.why.join(", "))}</span></li>`).join("")}</ol>`;
}
function nodeHtml(n) {
  const style = NODE_STYLE[n.type];
  const off = A.offMap.find((o) => o.id === n.id);
  const x = n.profiles.x, li = n.profiles.linkedin;
  const handle = n.handle ?? n.id;
  const edges = A.edgesByNode.get(n.id) ?? [];
  const heldEdges = graph.edges.filter((e) => (e.source === n.id || e.target === n.id) && !A.drawnEdges.some((drawn) => drawn.id === e.id));
  const groups = EDGE_KINDS.map((k) => ({ k, list: edges.filter((e) => e.kind === k) })).filter((g) => g.list.length);
  const conns = groups.map((g) => `
    <div class="conn-group">
      <div class="gh">${edgeSwatch(g.k, 18)}${EDGE_STYLE[g.k].label}<span class="count">${g.list.length}</span></div>
      ${g.list.map((e) => {
    const other = e.source === n.id ? e.target : e.source;
    const o = A.nodeById.get(other);
    const phrase = e.source === n.id ? `${escapeHtml(e.label ?? g.k)} ${escapeHtml(nodeName(other))}` : `${escapeHtml(nodeName(other))} ${escapeHtml(e.label ?? g.k)} this account`;
    const dim = filtersActive() && !edgeMatch(e) ? " dim" : "";
    return `<div class="conn${dim}">
          <button type="button" class="main" data-act="edge" data-id="${escapeHtml(e.id)}" aria-label="Inspect relationship: ${phrase}">${shape(o.type)}<span class="t"><b>${escapeHtml(nodeName(other))}</b><span class="s">${phrase}</span></span></button>
          <button type="button" class="icon-btn sm" data-act="go" data-id="${escapeHtml(other)}" aria-label="Go to ${escapeHtml(nodeName(other))}" title="Go to ${escapeHtml(nodeName(other))}">\u2192</button>
        </div>`;
  }).join("")}
    </div>`).join("");
  const noteSources = n.note_source_ids.map((id) => ({ id, why: "research note" }));
  const profiles = [
    x ? `<a href="${escapeHtml(x)}" target="_blank" rel="noopener noreferrer">X ${ICON.ext}</a>` : "",
    li ? `<a href="${escapeHtml(li)}" target="_blank" rel="noopener noreferrer">LinkedIn ${ICON.ext}</a>` : ""
  ].filter(Boolean).join('<span class="sep">\xB7</span>');
  const topics = n.topics.length ? `<span class="chips">${n.topics.map((t) => `<button type="button" data-act="topic" data-id="${escapeHtml(t)}" aria-pressed="${st.topics.has(t)}">${escapeHtml(A.topicLabel.get(t) ?? t)}</button>`).join("")}</span>` : "";
  return `
  <div class="d-head">
    <div class="d-top">
      <span class="crumb">${shape(n.type)}${style.label}${graph.meta.is_sample ? ` <span class="sample">Sample</span>` : ""}</span>
      <span class="d-actions">${st.selectedNode && onMap.has(n.id) ? `<button type="button" class="icon-btn sm" data-act="locate" aria-label="Center on map" title="Center on map">${ICON.locate}</button>` : ""}<button type="button" class="icon-btn sm" data-act="close" aria-label="Close details" title="Close (Esc)">${ICON.close}</button></span>
    </div>
    <h2 class="d-name">${escapeHtml(n.name ?? handle)}</h2>
    ${n.summary ? `<p class="d-summary">${escapeHtml(n.summary)}</p>` : ""}
  </div>
  <div class="d-body">
    ${off ? `<div class="offmap"><b>Not on the map.</b> ${escapeHtml(off.reason)}. The record is kept in the data; no connection has been invented for it.</div>` : ""}
    <dl class="props">
      ${prop("Handle", `<span class="handle">@${escapeHtml(handle)}</span><button type="button" class="icon-btn xs" data-act="copy" data-id="@${escapeHtml(handle)}" aria-label="Copy handle" title="Copy handle">${ICON.copy}</button>`)}
      ${prop("Profile", profiles || `<span class="warn-text">No public profile on record</span>`)}
      ${prop("Type", `${shape(n.type)}${style.label}`)}
      ${prop("Topics", topics)}
      ${prop("Connections on map", String(edges.length))}
      ${heldEdges.length ? prop("Connections held back", String(heldEdges.length)) : ""}
    </dl>
    ${n.notes ? `<section class="d-sec"><h3>Research note</h3><div class="notes">${escapeHtml(n.notes)}${noteSources.length ? `<div class="note-citations">${noteSources.map(({ id }) => {
    const src = A.sourceById.get(id);
    return src ? `<div class="note-citation"><span class="small muted">Supporting source</span><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title ?? src.url)} ${ICON.ext}</a></div>` : `<div class="note-citation missing">Missing source record \u201C${escapeHtml(id)}\u201D</div>`;
  }).join("")}</div>` : `<div class="note-citations muted small">No source is attached to this note.</div>`}</div></section>` : ""}
    ${n.projects.length ? `<section class="d-sec"><h3>Projects</h3><ul class="plain">${n.projects.map((p) => `<li>${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)} ${ICON.ext}</a>` : `<b>${escapeHtml(p.name)}</b>`}<span class="m">${escapeHtml(p.description ?? "")}</span></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Connections</h3>${conns || `<p class="muted small">No complete, defined connections to show.</p>`}${heldEdges.length ? `<p class="muted small">${heldEdges.length} other connection record${heldEdges.length === 1 ? " is" : "s are"} kept in the data but not drawn because a source, relationship detail, or definition is missing.</p>` : ""}</section>
  </div>`;
}
function edgeHtml(e) {
  const s = EDGE_STYLE[e.kind];
  const a = A.nodeById.get(e.source), b = A.nodeById.get(e.target);
  const pairOthers = A.drawnEdges.filter((x) => x.id !== e.id && (x.source === e.source && x.target === e.target || x.source === e.target && x.target === e.source));
  const project = e.project_id ? [a, b].flatMap((n) => n.projects).find((p) => p.id === e.project_id) : void 0;
  const explain = e.kind === "interaction" ? `<div class="callout interaction"><b>Discovery path, not collaboration.</b> A reply or quote on X led the research from one account to the other. On its own it does not mean they work together.</div>` : e.kind === "shared_topic" ? `<div class="callout"><b>Same area of work.</b> Both are linked to the same topic. No direct relationship between them is claimed.</div>` : e.kind === "cluster" ? `<div class="callout"><b>Legacy link.</b> Kept from older data. What a cluster link means has not been defined, so read nothing into it yet.</div>` : "";
  const period = e.period && (e.period.start || e.period.end) ? `${e.period.start ?? "?"} \u2013 ${e.period.end ?? "present"}` : "";
  const who = (n) => `<button type="button" class="link-btn" data-act="select" data-id="${escapeHtml(n.id)}">${shape(n.type)}${escapeHtml(nodeName(n.id))}</button>`;
  return `
  <div class="d-head">
    <div class="d-top">
      <span class="crumb">${st.edgeFromNode ? `<button type="button" class="link-btn" data-act="back">${ICON.back}${escapeHtml(nodeName(st.edgeFromNode))}</button><span class="sep">/</span>` : ""}Connection${graph.meta.is_sample ? ` <span class="sample">Sample</span>` : ""}</span>
      <span class="d-actions"><button type="button" class="icon-btn sm" data-act="close" aria-label="Close details" title="Close (Esc)">${ICON.close}</button></span>
    </div>
    <h2 class="d-name sm">${escapeHtml(nodeName(a.id))} <span class="verb">${escapeHtml(e.label ?? e.kind)}</span> ${escapeHtml(nodeName(b.id))}</h2>
  </div>
  <div class="d-body">
    ${explain}
    <dl class="props">
      ${prop("Kind", `${edgeSwatch(e.kind, 18)}${s.label}`)}
      ${prop("From", who(a))}
      ${prop("To", who(b))}
      ${prop("Detail", e.detail ? escapeHtml(e.detail) : "")}
      ${prop("Period", escapeHtml(period))}
      ${prop("Project", project ? escapeHtml(project.name) : "")}
      ${prop("Topic", e.topic_ids?.length ? `<span class="chips">${e.topic_ids.map((t) => `<button type="button" data-act="topic" data-id="${escapeHtml(t)}">${escapeHtml(A.topicLabel.get(t) ?? t)}</button>`).join("")}</span>` : "")}
    </dl>
    <section class="d-sec"><h3>${e.kind === "interaction" ? "Source post" : e.kind === "affiliation" ? "Affiliation source" : "Source"}</h3>${e.source_ids.length ? timeline(e.source_ids.map((id) => ({ id, why: e.kind === "interaction" ? "reply or quote discovery path" : e.kind === "affiliation" ? `affiliation: ${e.detail ?? ""}` : "this connection" }))) : `<p class="muted small">No source link is recorded for this connection.</p>`}</section>
    ${pairOthers.length ? `<section class="d-sec"><h3>Also between these two</h3>${pairOthers.map((x) => `<div class="conn"><button type="button" class="main" data-act="edge" data-id="${escapeHtml(x.id)}">${edgeSwatch(x.kind, 18)}<span class="t"><b>${EDGE_STYLE[x.kind].label}</b><span class="s">${escapeHtml(nodeName(x.source))} ${escapeHtml(x.label ?? x.kind)} ${escapeHtml(nodeName(x.target))}</span></span></button></div>`).join("")}<p class="small muted">Each is a separate record with its own source and its own line on the map.</p></section>` : ""}
  </div>`;
}
$("details").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.dataset.id ?? "";
  switch (btn.dataset.act) {
    case "close":
      clearSelection();
      break;
    case "go":
      selectNode(id, { fly: true });
      break;
    case "select":
      selectNode(id, { fly: true });
      break;
    case "edge":
      selectEdge(id, { fly: true });
      break;
    case "back":
      if (st.edgeFromNode) selectNode(st.edgeFromNode, { fly: true });
      break;
    case "locate":
      if (st.selectedNode) scene.focusNode(st.selectedNode);
      break;
    case "topic":
      toggleSet(st.topics, id);
      syncFilterInputs();
      onFiltersChanged();
      renderDetails();
      break;
    case "copy":
      navigator.clipboard?.writeText(id).then(() => toast(`Copied ${id}`), () => toast("Copy failed"));
      break;
  }
});
var palette = $("palette");
var pq = $("pq");
var plist = $("plist");
var pItems = [];
var pIdx = 0;
var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$("kbdHint").textContent = isMac ? "\u2318K" : "Ctrl K";
function commands() {
  const power = document.body.classList.contains("power");
  const setTypes = (t) => () => {
    st.types = /* @__PURE__ */ new Set([t]);
    syncFilterInputs();
    onFiltersChanged();
  };
  return [
    { group: "View", label: "Go to wide view", keys: "0", run: () => scene.overview() },
    { group: "View", label: scene.driftOn ? "Pause motion" : "Resume motion", run: () => setDrift(!scene.driftOn) },
    { group: "View", label: "Reset view (wide view, clear selection and filters)", run: () => resetView() },
    { group: "View", label: power ? "Exit power view" : "Power view: just the map", keys: "P", run: () => setPower(!power) },
    { group: "View", label: scene.showNames ? "Hide names on the map" : "Show names on the map", run: () => toggleNames() },
    { group: "View", label: $("minimapWrap").hidden ? "Show minimap" : "Hide minimap", run: () => toggleMinimap() },
    { group: "View", label: "Show legend", keys: "?", run: () => toggleLegend(true) },
    { group: "Filter", label: "Show only people", run: setTypes("person") },
    { group: "Filter", label: "Show only organizations", run: setTypes("organization") },
    { group: "Filter", label: "Show only agents", run: setTypes("agent") },
    { group: "Filter", label: "Hide interaction lines (discovery paths)", run: () => {
      st.kinds.delete("interaction");
      syncFilterInputs();
      onFiltersChanged();
    } },
    { group: "Filter", label: "Clear filters", run: clearFilters },
    { group: "Open", label: "Open filters", run: () => openDrawer("filters") },
    { group: "Open", label: "Open account list", run: () => openDrawer("list") },
    { group: "Open", label: "Open data report", run: () => {
      renderReport();
      $("report").showModal();
    } },
    { group: "Data", label: "Load a JSON file\u2026", run: () => $("fileIn").click() }
  ];
}
function renderPalette() {
  const query = pq.value.trim();
  st.query = query;
  lastHits = search(query);
  const accounts = query.length >= 2 ? [...lastHits.filter((h) => onMap.has(h.id)), ...lastHits.filter((h) => !onMap.has(h.id))].slice(0, 8) : [];
  const ql = query.toLowerCase();
  const cmds = commands().filter((c) => !ql || c.label.toLowerCase().includes(ql) || c.group.toLowerCase().includes(ql));
  pItems = [...accounts.map((hit) => ({ kind: "account", hit })), ...cmds.map((cmd) => ({ kind: "cmd", cmd }))];
  pIdx = Math.min(pIdx, Math.max(0, pItems.length - 1));
  const fieldLabel = { notes: "notes", summary: "summary", project: "project", topic: "topic" };
  let html = "";
  let lastGroup = "";
  pItems.forEach((it, i) => {
    const group = it.kind === "account" ? onMap.has(it.hit.id) ? "Accounts" : "Not on the map" : it.cmd.group;
    if (group !== lastGroup) {
      html += `<div class="p-group">${escapeHtml(group)}</div>`;
      lastGroup = group;
    }
    if (it.kind === "account") {
      const n = A.nodeById.get(it.hit.id);
      const extra = fieldLabel[it.hit.field] ? `<span class="p-meta">in ${fieldLabel[it.hit.field]}: ${it.hit.snippet}</span>` : `<span class="p-meta">@${escapeHtml(n.handle ?? n.id)}</span>`;
      html += `<div class="p-item" role="option" id="p-${i}" data-i="${i}" aria-selected="${i === pIdx}">${shape(n.type)}<span class="p-label">${escapeHtml(n.name ?? n.id)}</span>${extra}<span class="p-type">${NODE_STYLE[n.type].label}</span></div>`;
    } else {
      html += `<div class="p-item" role="option" id="p-${i}" data-i="${i}" aria-selected="${i === pIdx}"><span class="p-cmd-icon" aria-hidden="true">\u203A</span><span class="p-label">${escapeHtml(it.cmd.label)}</span>${it.cmd.keys ? `<kbd>${escapeHtml(it.cmd.keys)}</kbd>` : ""}</div>`;
    }
  });
  plist.innerHTML = html || `<div class="p-empty">Nothing matches \u201C${escapeHtml(query)}\u201D.</div>`;
  pq.setAttribute("aria-activedescendant", pItems.length ? `p-${pIdx}` : "");
  plist.querySelector(`#p-${pIdx}`)?.scrollIntoView({ block: "nearest" });
  pushView();
  renderList();
}
function openPalette(prefill = "") {
  palette.hidden = false;
  pq.value = prefill;
  pIdx = 0;
  renderPalette();
  pq.focus();
}
function closePalette() {
  if (palette.hidden) return;
  palette.hidden = true;
  st.query = "";
  lastHits = [];
  pushView();
  renderList();
  $("map").focus();
}
function runItem(i) {
  const it = pItems[i];
  if (!it) return;
  closePalette();
  if (it.kind === "account") selectNode(it.hit.id, { fly: true });
  else it.cmd.run();
}
pq.addEventListener("input", () => {
  pIdx = 0;
  renderPalette();
});
pq.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    pIdx = Math.min(pItems.length - 1, pIdx + 1);
    renderPalette();
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    pIdx = Math.max(0, pIdx - 1);
    renderPalette();
    e.preventDefault();
  } else if (e.key === "Enter") {
    runItem(pIdx);
    e.preventDefault();
  } else if (e.key === "Escape") {
    closePalette();
    e.preventDefault();
  }
});
plist.addEventListener("mousemove", (e) => {
  const el = e.target.closest(".p-item");
  if (el && Number(el.dataset.i) !== pIdx) {
    pIdx = Number(el.dataset.i);
    plist.querySelectorAll(".p-item").forEach((x) => x.setAttribute("aria-selected", String(x === el)));
  }
});
plist.addEventListener("click", (e) => {
  const el = e.target.closest(".p-item");
  if (el) runItem(Number(el.dataset.i));
});
palette.addEventListener("mousedown", (e) => {
  if (e.target === palette) closePalette();
});
$("openPalette").addEventListener("click", () => openPalette());
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  const typing = tag === "input" || tag === "select" || tag === "textarea";
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (palette.hidden) openPalette();
    else closePalette();
    return;
  }
  if (typing) return;
  if (e.key === "/") {
    e.preventDefault();
    openPalette();
  } else if (e.key === "?") {
    e.preventDefault();
    toggleLegend();
  }
});
function toggleSet(s, v) {
  if (s.has(v)) s.delete(v);
  else s.add(v);
}
function buildFilters() {
  const typeCount = (t) => A.mapNodeIds.filter((id) => A.nodeById.get(id).type === t).length;
  $("fTypes").innerHTML = NODE_TYPES.map((t) => `<label class="row"><input type="checkbox" data-f="type" value="${t}">${shape(t)}${NODE_STYLE[t].label}<span class="count">${typeCount(t)}</span></label>`).join("");
  $("fKinds").innerHTML = EDGE_KINDS.map((k) => `<label class="row"><input type="checkbox" data-f="kind" value="${k}">${edgeSwatch(k, 26)}${EDGE_STYLE[k].label}<span class="count">${A.drawnEdges.filter((e) => e.kind === k).length}</span></label>`).join("");
  const topicCount = (t) => A.mapNodeIds.filter((id) => A.nodeById.get(id).topics.includes(t)).length;
  $("fTopics").innerHTML = graph.topics.map((t) => `<label class="row" title="${escapeHtml(t.description ?? "")}"><input type="checkbox" data-f="topic" value="${escapeHtml(t.id)}">${escapeHtml(t.label)}<span class="count">${topicCount(t.id)}</span></label>`).join("");
  syncFilterInputs();
}
function syncFilterInputs() {
  document.querySelectorAll("#filters input[data-f]").forEach((i) => {
    const v = i.value;
    i.checked = i.dataset.f === "type" ? st.types.has(v) : i.dataset.f === "kind" ? st.kinds.has(v) : st.topics.has(v);
  });
  $("fHide").checked = st.hideFiltered;
}
$("filters").addEventListener("change", (e) => {
  const i = e.target;
  if (i.dataset.f === "type") toggleSet(st.types, i.value);
  else if (i.dataset.f === "kind") toggleSet(st.kinds, i.value);
  else if (i.dataset.f === "topic") toggleSet(st.topics, i.value);
  else if (i.id === "fHide") st.hideFiltered = i.checked;
  onFiltersChanged();
});
function clearFilters() {
  st.types.clear();
  st.topics.clear();
  st.kinds = new Set(EDGE_KINDS);
  st.hideFiltered = false;
  syncFilterInputs();
  onFiltersChanged();
}
$("clearFilters").addEventListener("click", clearFilters);
function onFiltersChanged() {
  const active = filtersActive();
  const n = st.types.size + st.topics.size + (EDGE_KINDS.length - st.kinds.size);
  $("filterBadge").hidden = !active;
  $("filterBadge").textContent = String(n);
  const bar = $("filterBar");
  const matching = A.mapNodeIds.filter(nodeMatch).length;
  bar.hidden = !active;
  bar.innerHTML = active ? `<span><b>${matching}</b> of ${A.mapNodeIds.length} accounts match</span><button type="button" class="link" id="barClear">Clear filters</button>` : "";
  if (active) $("barClear").addEventListener("click", clearFilters);
  pushView();
  renderList();
  if (st.selectedNode) renderDetails();
  announce(active ? `${matching} accounts match the filters.` : "Filters cleared.");
}
function renderList() {
  if ($("list").hidden) return;
  const query = st.query.trim().length >= 2 ? new Set(lastHits.map((h) => h.id)) : null;
  let ids = A.mapNodeIds.filter((id) => (!query || query.has(id)) && (!filtersActive() || nodeMatch(id)));
  const nm = (id) => nodeName(id).toLowerCase();
  ids.sort(st.sort === "name" ? (a, b) => nm(a).localeCompare(nm(b)) : st.sort === "type" ? (a, b) => A.nodeById.get(a).type.localeCompare(A.nodeById.get(b).type) || nm(a).localeCompare(nm(b)) : (a, b) => (A.degree.get(b) ?? 0) - (A.degree.get(a) ?? 0));
  const off = A.offMap.filter((o) => (!query || query.has(o.id)) && (!filtersActive() || nodeMatch(o.id)));
  const row = (id, offMap = false) => {
    const n = A.nodeById.get(id);
    const d = A.degree.get(id) ?? 0;
    const sub = offMap ? `${NODE_STYLE[n.type].label} \xB7 not on the map` : `${NODE_STYLE[n.type].label} \xB7 @${escapeHtml(n.handle ?? n.id)} \xB7 ${d} connection${d === 1 ? "" : "s"}`;
    return `<li><button type="button" data-id="${escapeHtml(id)}" aria-current="${st.selectedNode === id}"${offMap ? ' class="dim"' : ""}>${shape(n.type)}<span><span>${escapeHtml(nodeName(id))}</span><span class="sub">${sub}</span></span></button></li>`;
  };
  $("listItems").innerHTML = ids.map((id) => row(id)).join("") + (off.length ? `<li class="sec">Not on the map \xB7 ${off.length}</li>${off.map((o) => row(o.id, true)).join("")}` : "");
  $("listCount").textContent = `${ids.length} on the map${query ? " match the search" : ""}`;
}
$("listItems").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) selectNode(b.dataset.id, { fly: true });
});
$("sort").addEventListener("change", (e) => {
  st.sort = e.target.value;
  renderList();
});
function openDrawer(which) {
  if ($(which).hidden) toggleDrawer(which);
}
function toggleDrawer(which) {
  const el = $(which), other = $(which === "filters" ? "list" : "filters");
  const open = el.hidden;
  el.hidden = !open;
  if (open) other.hidden = true;
  $("btnFilters").setAttribute("aria-expanded", String(!$("filters").hidden));
  $("btnList").setAttribute("aria-expanded", String(!$("list").hidden));
  if (which === "list" && open) renderList();
  if (open) el.querySelector("input,select,button")?.focus();
}
$("btnFilters").addEventListener("click", () => toggleDrawer("filters"));
$("btnList").addEventListener("click", () => toggleDrawer("list"));
$("closeList").addEventListener("click", () => toggleDrawer("list"));
function renderLegend() {
  $("legendNodes").innerHTML = NODE_TYPES.map((t) => `<li>${shape(t)}${NODE_STYLE[t].label} <span class="small muted">(${NODE_STYLE[t].shape.toLowerCase()})</span></li>`).join("");
  const present = new Set(A.drawnEdges.map((e) => e.kind));
  $("legendEdges").innerHTML = EDGE_KINDS.filter((k) => present.has(k)).map((k) => `<li title="${escapeHtml(EDGE_STYLE[k].means)}">${edgeSwatch(k)}<span>${EDGE_STYLE[k].label}${k === "interaction" ? ' <span class="muted">\u2014 reply/quote path, not collaboration</span>' : k === "shared_topic" ? ' <span class="muted">\u2014 no direct link</span>' : ""}</span></li>`).join("");
}
function setPower(on) {
  document.body.classList.toggle("power", on);
  $("exitPower").hidden = !on;
  $("resetPower").hidden = !on;
  $("driftPower").hidden = !on;
  $("btnPower").setAttribute("aria-pressed", String(on));
  if (on) {
    closePalette();
    $("filters").hidden = true;
    $("list").hidden = true;
  }
  saveView();
  announce(on ? "Power view: only the map is shown. Press P to show the controls." : "Controls shown.");
  $(on ? "map" : "btnPower").focus();
}
function resetView() {
  closePalette();
  clearSelection();
  clearFilters();
  toggleNames(false);
  toggleMinimap(false);
  toggleLegend(false);
  $("filters").hidden = true;
  $("list").hidden = true;
  $("btnFilters").setAttribute("aria-expanded", "false");
  $("btnList").setAttribute("aria-expanded", "false");
  scene.overview();
  scene.playIntro();
  try {
    localStorage.removeItem(VIEW_KEY);
  } catch {
  }
  saveView();
  toast("View reset");
  announce("View reset: wide view, nothing selected, no filters.");
}
$("btnReset").addEventListener("click", resetView);
var PAUSE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5v14M15.5 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
var PLAY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>`;
function setDrift(on) {
  scene.setDrift(on);
  document.querySelectorAll(".drift-btn").forEach((b) => {
    const label = on ? "Pause motion" : "Resume motion";
    b.innerHTML = on ? PAUSE_ICON : PLAY_ICON;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.setAttribute("aria-pressed", String(!on));
  });
  saveView();
}
$("driftPower").addEventListener("click", () => setDrift(!scene.driftOn));
$("driftBtn").addEventListener("click", () => setDrift(!scene.driftOn));
$("resetPower").addEventListener("click", resetView);
$("btnPower").addEventListener("click", () => setPower(true));
$("exitPower").addEventListener("click", () => setPower(false));
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "input" && tag !== "select" && tag !== "textarea") {
    setPower(!document.body.classList.contains("power"));
  }
});
function toggleNames(force) {
  const on = force ?? !scene.showNames;
  scene.setShowNames(on);
  $("namesBtn").setAttribute("aria-pressed", String(on));
  $("namesBtn").setAttribute("aria-label", on ? "Hide names on the map" : "Show names on the map");
  announce(on ? "Names shown on the map." : "Names hidden; hover or select an account to see its name.");
  saveView();
}
function toggleLegend(force) {
  const open = force ?? $("legend").hidden;
  $("legend").hidden = !open;
  $("legendBtn").setAttribute("aria-expanded", String(open));
}
function toggleMinimap(force) {
  const show = force ?? $("minimapWrap").hidden;
  $("minimapWrap").hidden = !show;
  $("miniBtn").setAttribute("aria-pressed", String(show));
  $("miniBtn").setAttribute("aria-label", show ? "Hide minimap" : "Show minimap");
  if (show) drawMinimap();
  saveView();
}
$("namesBtn").addEventListener("click", () => toggleNames());
$("miniBtn").addEventListener("click", () => toggleMinimap());
$("legendBtn").addEventListener("click", () => toggleLegend());
$("legendClose").addEventListener("click", () => toggleLegend(false));
function renderCounts() {
  $("counts").textContent = `${A.mapNodeIds.length} accounts \xB7 ${A.drawnEdges.length} connections`;
  $("sampleFlag").hidden = !graph.meta.is_sample;
  const errs = A.issues.filter((i) => i.level !== "info").length;
  $("issueBadge").hidden = errs === 0;
  $("issueBadge").textContent = String(errs);
}
function renderReport() {
  const lvls = [["error", "Errors"], ["warning", "Warnings"], ["info", "Notes"]];
  const interactionsNeedingSources = graph.edges.filter((e) => e.kind === "interaction" && e.incomplete).length;
  const affiliationsNeedingDetails = graph.edges.filter((e) => e.kind === "affiliation" && e.incomplete && e.missing?.includes("detail")).length;
  const affiliationsNeedingSources = graph.edges.filter((e) => e.kind === "affiliation" && e.incomplete && e.missing?.includes("source")).length;
  const clusters = graph.edges.filter((e) => e.kind === "cluster").length;
  const bridges = graph.edges.filter((e) => e.kind === "bridge").length;
  const rationaleNotes = graph.nodes.filter((n) => n.notes.includes("[selection rationale needed]")).length;
  $("reportBody").innerHTML = `
    <div class="stats">
      <div><b>${graph.nodes.length}</b><span class="small muted">records in the data</span></div>
      <div><b>${A.mapNodeIds.length}</b><span class="small muted">accounts on the map</span></div>
      <div><b>${A.offMap.length}</b><span class="small muted">kept, not drawn</span></div>
      <div><b>${A.drawnEdges.length}</b><span class="small muted">connections drawn</span></div>
    </div>
    <h3>Not drawn on the map</h3>
    <p class="small muted">Every account on the map links to at least one other. These records stay in the data; no edges were invented for them.</p>
    <ul>${A.offMap.map((o) => `<li><button type="button" class="link" data-open="${escapeHtml(o.id)}">${escapeHtml(nodeName(o.id))}</button> \u2014 ${escapeHtml(o.reason)}</li>`).join("") || "<li>None</li>"}</ul>
    <h3>Research gaps and retained links</h3>
    <ul>
      <li>${rationaleNotes} researcher notes are tagged <code>[selection rationale needed]</code>.</li>
      <li>${interactionsNeedingSources} interactions need a reply or quote source.</li>
      <li>${affiliationsNeedingDetails} affiliations need a specific relationship detail; ${affiliationsNeedingSources} need a source.</li>
      <li>${clusters} cluster and ${bridges} bridge records are preserved in the data and not drawn until their meaning is defined.</li>
    </ul>
    ${lvls.map(([l, label]) => {
    const list = A.issues.filter((i) => i.level === l);
    return list.length ? `<h3>${label}</h3><ul>${list.map((i) => `<li><span class="lvl-${l}">${l}</span> ${escapeHtml(i.message)}</li>`).join("")}</ul>` : "";
  }).join("")}
    <h3>Data shape</h3>
    <p class="small">Data version ${escapeHtml(String(graph.meta.version))}, updated ${escapeHtml(graph.meta.updated)}. Positions are worked out from the connections each time, so adding records re-settles the map instead of needing hand placement.</p>`;
}
$("btnReport").addEventListener("click", () => {
  renderReport();
  $("report").showModal();
});
$("closeReport").addEventListener("click", () => $("report").close());
$("reportBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) {
    $("report").close();
    selectNode(b.dataset.open, { fly: false });
  }
});
$("zoomIn").addEventListener("click", () => scene.zoomBy(0.6));
$("zoomOut").addEventListener("click", () => scene.zoomBy(1 / 0.6));
$("home").addEventListener("click", () => scene.overview());
var mini = $("minimap");
var mctx = mini.getContext("2d");
var lastMini = 0;
var lastCamSave = 0;
function frameUi(_d, moving = false) {
  const t = performance.now();
  if (!moving && t - lastCamSave > 400) {
    lastCamSave = t;
    saveView();
  }
  if ($("minimapWrap").hidden) return;
  const now = performance.now();
  if (now - lastMini > 120) {
    lastMini = now;
    drawMinimap();
  }
}
function miniTransform() {
  const ex = scene.extent();
  const s = (mini.width / 2 - 10) / (ex.radius * 1.35);
  return { ex, s, cx: mini.width / 2, cy: mini.height / 2 };
}
function drawMinimap() {
  const { ex, s, cx, cy } = miniTransform();
  mctx.clearRect(0, 0, mini.width, mini.height);
  const sel = st.selectedNode;
  for (const id of scene.nodeIds()) {
    const p = scene.position(id);
    const t = scene.typeOf(id);
    const x = cx + (p.x - ex.center.x) * s, y = cy + (p.z - ex.center.z) * s;
    mctx.globalAlpha = filtersActive() && !nodeMatch(id) ? 0.15 : 0.35 + 0.65 * scene.visibility(id);
    mctx.fillStyle = NODE_STYLE[t].css;
    mctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    if (id === sel) {
      mctx.globalAlpha = 1;
      mctx.strokeStyle = "#5E6AD2";
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.arc(x, y, 5, 0, Math.PI * 2);
      mctx.stroke();
    }
  }
  mctx.globalAlpha = 1;
  const c = scene.cameraInfo;
  const px = cx + (c.pos.x - ex.center.x) * s, py = cy + (c.pos.z - ex.center.z) * s;
  const tx = cx + (c.target.x - ex.center.x) * s, ty = cy + (c.target.z - ex.center.z) * s;
  mctx.strokeStyle = "rgba(22,24,29,.7)";
  mctx.lineWidth = 1.2;
  mctx.setLineDash([3, 3]);
  mctx.beginPath();
  mctx.moveTo(px, py);
  mctx.lineTo(tx, ty);
  mctx.stroke();
  mctx.setLineDash([]);
  mctx.fillStyle = "#5E6AD2";
  mctx.beginPath();
  mctx.arc(Math.max(4, Math.min(mini.width - 4, px)), Math.max(4, Math.min(mini.height - 4, py)), 4, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = "#5E6AD2";
  mctx.beginPath();
  mctx.arc(tx, ty, 6, 0, Math.PI * 2);
  mctx.stroke();
}
mini.addEventListener("click", (e) => {
  const r = mini.getBoundingClientRect();
  const { ex, s, cx, cy } = miniTransform();
  const x = (e.clientX - r.left - cx) / s + ex.center.x, z = (e.clientY - r.top - cy) / s + ex.center.z;
  scene.rig.flyTo({ x, y: scene.rig.target.y, z });
  scene.rig.userMoved = true;
  scene.zoomBy(1);
});
var toastTimer = 0;
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.hidden = true, 3200);
}
function refresh(msg) {
  A = analyze(graph);
  onMap = new Set(A.mapNodeIds);
  if (st.selectedNode && !A.nodeById.has(st.selectedNode)) st.selectedNode = null;
  if (st.selectedEdge && !A.drawnEdges.some((e) => e.id === st.selectedEdge)) st.selectedEdge = null;
  scene.setData(A);
  buildFilters();
  renderLegend();
  renderCounts();
  renderDetails();
  if (!palette.hidden) renderPalette();
  else renderList();
  onFiltersChanged();
  if (msg) toast(msg);
}
function addData(input, mode = "merge") {
  const incoming = normalizeGraph(input);
  const before = new Set(A.mapNodeIds);
  const rawMeta = input?.meta;
  graph = mode === "replace" ? incoming : mergeGraph(graph, { ...incoming, meta: rawMeta ?? {} });
  refresh();
  const added = A.mapNodeIds.filter((id) => !before.has(id)).length;
  toast(mode === "replace" ? `Loaded ${A.mapNodeIds.length} accounts; the map is settling.` : `${added} new account${added === 1 ? "" : "s"} placed; the map is settling.`);
  if (mode === "replace") scene.overview();
}
var pendingJson = null;
async function loadFile(f) {
  try {
    pendingJson = JSON.parse(await f.text());
    const n = Array.isArray(pendingJson.nodes) ? pendingJson.nodes.length : 0;
    const e = Array.isArray(pendingJson.edges) ? pendingJson.edges.length : 0;
    $("loadBody").textContent = `${f.name}: ${n} accounts and ${e} connections. Merging keeps the current map and places new accounts next to the ones they link to. Records with an existing id are updated.`;
    $("loadDlg").showModal();
  } catch (err) {
    toast(`Could not read ${f.name}: ${err.message}`);
  }
}
$("loadMerge").addEventListener("click", () => {
  $("loadDlg").close();
  if (pendingJson) addData(pendingJson, "merge");
  pendingJson = null;
});
$("loadReplace").addEventListener("click", () => {
  $("loadDlg").close();
  if (pendingJson) addData(pendingJson, "replace");
  pendingJson = null;
});
$("loadCancel").addEventListener("click", () => {
  $("loadDlg").close();
  pendingJson = null;
});
$("fileIn").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
  e.target.value = "";
});
$("stage").addEventListener("dragover", (e) => e.preventDefault());
$("stage").addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
window.agentMap = {
  addData: (json) => addData(json, "merge"),
  replaceData: (json) => addData(json, "replace"),
  getData: () => graph,
  report: () => ({ offMap: A.offMap, issues: A.issues }),
  camera: () => ({ dist: scene.rig.dist, current: scene.rig.currentDist, min: scene.rig.minDist, max: scene.rig.maxDist, depth: scene.depth, yaw: scene.rig.currentYaw })
};
var VIEW_KEY = "autonomy.view.v1";
var restoring = true;
var saveTimer = 0;
function saveView() {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const v = {
      power: document.body.classList.contains("power"),
      names: scene.showNames,
      drift: scene.driftOn,
      minimap: !$("minimapWrap").hidden,
      camera: scene.rig.getState(),
      selectedNode: st.selectedNode,
      selectedEdge: st.selectedEdge,
      edgeFromNode: st.edgeFromNode,
      types: [...st.types],
      kinds: [...st.kinds],
      topics: [...st.topics],
      hideFiltered: st.hideFiltered
    };
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
    }
  }, 150);
}
function readView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function restoreView() {
  const v = readView();
  setPower(v?.power ?? true);
  setDrift(v?.drift !== false);
  if (v) {
    if (Array.isArray(v.types)) st.types = new Set(v.types.filter((t) => NODE_TYPES.includes(t)));
    if (Array.isArray(v.kinds)) st.kinds = new Set(v.kinds.filter((k) => EDGE_KINDS.includes(k)));
    if (Array.isArray(v.topics)) st.topics = new Set(v.topics.filter((t) => A.topicLabel.has(t)));
    st.hideFiltered = !!v.hideFiltered;
    syncFilterInputs();
    onFiltersChanged();
    if (v.names) toggleNames(true);
    if (v.minimap) toggleMinimap(true);
    if (v.selectedEdge && A.drawnEdges.some((e) => e.id === v.selectedEdge)) {
      if (v.edgeFromNode && A.nodeById.has(v.edgeFromNode)) st.selectedNode = v.edgeFromNode;
      selectEdge(v.selectedEdge, { fly: false });
    } else if (v.selectedNode && A.nodeById.has(v.selectedNode)) {
      selectNode(v.selectedNode, { fly: false });
    }
    if (v.camera && (st.selectedNode || st.selectedEdge)) scene.rig.setState(v.camera);
  }
  restoring = false;
  saveView();
}
refresh();
scene.overview(true);
restoreView();
window.setBootCounts?.(A.mapNodeIds.length, A.drawnEdges.length);
if (!st.selectedNode && !st.selectedEdge) scene.playIntro();
